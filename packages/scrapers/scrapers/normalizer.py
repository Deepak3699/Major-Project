"""Normalize discovered jobs and persist candidate-safe source snapshots.

The default path stores job listings without recruiter enrichment or B2B leads.
The former contact-discovery and outreach flow is available only when
ENABLE_LEGACY_OUTREACH_PIPELINE=1.
"""

import json
import os
import asyncio
import logging
import hashlib
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import redis.asyncio as redis
import asyncpg
from tenacity import retry, stop_after_attempt, wait_exponential

# Immutable-raw-snapshot versioning (Track 3): bump when normalize_lead's
# output contract changes so reprocessing can tell stale snapshots apart.
PARSER_VERSION = "5"


def content_hash_of(raw_payload: Any) -> str:
    """Deterministic sha256 over the canonical raw payload (change detection)."""
    canonical = json.dumps(raw_payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()
from .utils.fresher_classifier import is_fresher_role as classify_fresher
from .utils.india_filter import is_india_relevant, derive_company_domain
from .queue import chain_lead, requeue_or_dlq, reliable_brpop, ack
from .utils.career_page_extractor import (
    extract_from_career_page,
    extract_from_job_posting_page,
    is_valid_email_format,
    is_generic_email,
    normalize_mobile_e164,
)

from .utils.redact import redact_email

logger = logging.getLogger(__name__)


def legacy_outreach_enabled() -> bool:
    """Keep the original recruiter/outreach pipeline behind an explicit opt-in."""
    return os.environ.get("ENABLE_LEGACY_OUTREACH_PIPELINE", "0").strip().lower() in {"1", "true", "yes", "on"}


class NormalizationError(Exception):
    pass


def _candidate_job_quality(job: dict[str, Any]) -> tuple[int, str, list[dict[str, Any]]]:
    """Score public job-listing evidence with the same 100-point policy as the API."""
    source = str(job.get("source_site") or "").lower()
    company_domain = str(job.get("company_domain") or "").lower().removeprefix("www.").strip("./")
    apply_url = str(job.get("apply_url") or job.get("job_url") or "")
    try:
        host = (urlparse(apply_url).hostname or "").lower().removeprefix("www.")
    except ValueError:
        host = ""
    official = bool(re.search(r"greenhouse|lever|workday|ashby|smartrecruiters|bamboohr|teamtailor|recruitee|breezy|company career|official", source)) or bool(company_domain and host == company_domain)
    domain_matches = bool(company_domain and host and (host == company_domain or host.endswith("." + company_domain)))
    secure_url = urlparse(apply_url).scheme.lower() == "https"
    evidence = [
        {"signal": "Official source", "points": 30 if official else 0, "detail": "Company career domain or recognized ATS source" if official else f"Collected from {source or 'an external source'}"},
        {"signal": "Company verification", "points": 20 if domain_matches else (10 if company_domain else 0), "detail": "Application link matches the company domain" if domain_matches else ("A company domain is available but the application host does not match" if company_domain else "Company domain is not available")},
        {"signal": "Application URL", "points": 15 if secure_url else 0, "detail": "A secure HTTPS listing or application link is available" if secure_url else "A secure application link could not be confirmed"},
    ]
    posted_at = job.get("posted_at") or job.get("first_seen_at")
    age_days = float("inf")
    if posted_at:
        try:
            posted = posted_at if isinstance(posted_at, datetime) else datetime.fromisoformat(str(posted_at).replace("Z", "+00:00"))
            if posted.tzinfo is None:
                posted = posted.replace(tzinfo=timezone.utc)
            age_days = max(0.0, (datetime.now(timezone.utc) - posted.astimezone(timezone.utc)).total_seconds() / 86400)
        except (TypeError, ValueError):
            pass
    freshness = 10 if age_days <= 7 else (5 if age_days <= 30 else 0)
    evidence.append({"signal": "Freshness", "points": freshness, "detail": f"Seen {int(age_days)} day(s) ago" if age_days != float("inf") else "Posting date is not available"})
    raw = job.get("raw_payload") or {}
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    contact_verified = bool(job.get("contact_verified") or raw.get("contact_verified") or raw.get("email_verified"))
    evidence.append({"signal": "Contact validation", "points": 10 if contact_verified else 0, "detail": "Source metadata reports a validated company contact" if contact_verified else "A verified hiring contact is not available"})
    source_count = max(int(job.get("source_count") or raw.get("source_count") or 0), len(raw.get("sources", [])) if isinstance(raw.get("sources"), list) else 0)
    evidence.append({"signal": "Cross-source match", "points": 10 if source_count > 1 else 0, "detail": f"Matching listing appears in {source_count} sources" if source_count > 1 else "No independent cross-source confirmation is stored"})
    description = str(job.get("description") or job.get("about_job") or "")
    complete = bool(job.get("title") and job.get("company_name") and len(description) >= 180 and apply_url)
    evidence.append({"signal": "Content consistency", "points": 5 if complete else 0, "detail": "Listing includes company, title, description and application link" if complete else "Some job details are missing or brief"})
    score = min(100, sum(item["points"] for item in evidence))
    band = "very_high" if score >= 94 else "high" if score >= 80 else "review" if score >= 60 else "low"
    return score, band, evidence


async def _refresh_candidate_job_quality(sql: asyncpg.Connection, job_id: str) -> None:
    row = await sql.fetchrow(
        """SELECT jp.id,jp.title,jp.description,jp.about_job,jp.source_site,jp.apply_url,jp.job_url,
                  jp.posted_at,jp.first_seen_at,jp.raw_payload,jp.review_status,c.name AS company_name,
                  c.domain AS company_domain,
                  COALESCE((SELECT COUNT(DISTINCT js.source_site) FROM job_sources js WHERE js.job_posting_id=jp.id),1)::int AS source_count
             FROM job_postings jp JOIN companies c ON c.id=jp.company_id WHERE jp.id=$1""",
        job_id,
    )
    if not row:
        return
    score, band, evidence = _candidate_job_quality(dict(row))
    current_status = row["review_status"]
    next_status = "published" if current_status == "pending" and score > 70 else current_status
    await sql.execute("UPDATE job_postings SET trust_score=$2,trust_band=$3,review_status=$4 WHERE id=$1", job_id, score, band, next_status)
    if next_status == "published" and current_status == "pending":
        await sql.execute(
            """INSERT INTO job_verifications (job_posting_id,verifier_id,trust_score,trust_band,evidence,review_status)
               VALUES ($1,NULL,$2,$3,$4::jsonb,'published')""",
            job_id, score, band, json.dumps(evidence),
        )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def generate_fingerprint(company_name: str, job_title: str, job_url: str) -> str:
    """Compute dedup fingerprint per SRS §4.6: hash(normalized company_name + job_title + job_url_domain)."""
    domain = ""
    if job_url:
        try:
            domain = urlparse(job_url).hostname or ""
        except Exception:
            domain = ""
    normalized_company = re.sub(r'[^a-z0-9]', "", (company_name or "").lower())
    normalized_title = re.sub(r'[^a-z0-9]', "", (job_title or "").lower())
    raw = f"{normalized_company}|{normalized_title}|{domain}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def extract_hr_name_fallback(raw: dict[str, Any], company_name: str) -> tuple[str, dict[str, Any]]:
    """SRS §4.5.1: Direct extraction of HR name from job posting data.

    Checks raw scraped fields for recruiter/HR person names.

    Returns (hr_name, provenance) where provenance tracks the extraction method.
    """
    provenance = {
        "method": "",
        "source": "",
        "confidence": 0.0,
        "timestamp": now_iso(),
        "attempted": True,
        "successful": False,
        "failed": False,
    }

    # Tier 1: Direct extraction from raw fields (SRS §4.5.1)
    for field in ("hr_name", "recruiter_name", "posted_by", "hiring_manager", "contact_name"):
        val = (raw.get(field) or "").strip()
        if val and not _is_generic_name(val):
            provenance["method"] = "direct_field_extraction"
            provenance["source"] = field
            provenance["confidence"] = 0.9
            provenance["successful"] = True
            return val, provenance

    # Tier 2: Look in raw_payload for recruiter info
    raw_payload = raw.get("raw_payload", {})
    if raw_payload and isinstance(raw_payload, dict):
        for field in ("recruiter_name", "posted_by", "hiring_manager", "contact_name", "recruiter", "poster"):
            val = str(raw_payload.get(field, "")).strip()
            if val and not _is_generic_name(val):
                provenance["method"] = "direct_payload_extraction"
                provenance["source"] = field
                provenance["confidence"] = 0.85
                provenance["successful"] = True
                return val, provenance

    # Tier 3: Try job title/description for "Posted by" patterns
    text = json.dumps(raw_payload).lower() if raw_payload else ""
    posted_patterns = [
        r'posted by[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+))',
        r'recruiter[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+))',
    ]
    for pattern in posted_patterns:
        match = re.search(pattern, text)
        if match:
            name = match.group(1).strip()
            if not _is_generic_name(name):
                provenance["method"] = "direct_regex_from_description"
                provenance["source"] = "job_description"
                provenance["confidence"] = 0.7
                provenance["successful"] = True
                return name, provenance

    provenance["failed"] = True
    provenance["method"] = "no_hr_name_found"
    return "", provenance


def _is_generic_name(name: str) -> bool:
    """Check if a name is a generic placeholder, not a real person's name."""
    generic = [
        "hr team", "recruitment team", "talent acquisition",
        "hiring manager", "hr", "recruiter", "talent team",
        "people team", "human resources", "careers team",
        "the hr team", "the recruitment team",
    ]
    name_lower = name.lower().strip()
    return name_lower in generic


def _is_valid_person_name(name: str) -> bool:
    """Validate that a string looks like a real person's name.

    Each part must be alphabetic, start with uppercase, and be 2+ chars.
    Rejects single letters (e.g. 'N', 'I'), numbers, and stopwords.
    """
    if not name or len(name) < 3:
        return False
    parts = name.strip().split()
    if len(parts) < 2:
        return False
    stopwords = {
        "the", "and", "or", "of", "to", "in", "on", "at", "for", "team", "will", "group",
        "contact", "contacting", "other", "tasks", "screen", "virtual", "interview",
        "class", "span", "div", "icon", "logo", "white", "blue", "color", "onecolor",
        "import", "about", "more", "career", "careers", "hiring", "recruiting",
        "human", "resources", "company", "people", "talent", "acquisition",
        "manager", "lead", "form", "page", "section", "header", "footer",
        "nav", "menu", "click", "here", "learn", "view", "join", "apply", "explore",
        "san", "francisco", "tokyo", "london", "paris", "berlin", "dublin",
        "amsterdam", "singapore", "sydney", "remote", "office", "location",
        "site", "hub", "center", "campus", "eligibility", "check", "benefits",
        "administrator", "new", "york", "boston", "austin", "chicago", "denver",
        "atlanta", "miami", "portland", "raleigh", "durham", "palo", "alto",
        "mountain", "view", "sunnyvale", "cupertino", "redwood", "city",
        "foster", "city",
        "head", "script",
    }
    for part in parts:
        if len(part) < 2:
            return False
        # Reject all-uppercase parts (acronyms like "EMEA", "NYC")
        if len(part) >= 3 and part.isupper():
            return False
        cleaned = part.replace("-", "").replace(".", "").replace("_", "")
        if not cleaned.isalpha():
            return False
        if not part[0].isupper():
            return False
        if cleaned.lower() in stopwords:
            return False
    return True


def extract_hr_contact_fallback(raw: dict[str, Any], company_name: str) -> dict[str, str]:
    """SRS §4.5.1: Direct extraction of HR contact from job posting data.

    Returns dict with email and mobile. Does NOT generate placeholder values.
    Only returns real, directly-found contact information from the scraped data.
    """
    result: dict[str, str] = {"email": "", "mobile": ""}

    # Tier 1: Direct extraction from raw fields
    email = (raw.get("hr_email") or raw.get("company_email") or "").strip()
    mobile = (raw.get("hr_mobile") or raw.get("company_mobile") or "").strip()
    if email:
        result["email"] = email
    if mobile:
        # E.164-normalize (India-first + WhatsApp Cloud API need +91...); drop
        # numbers that aren't a valid Indian mobile so we never outreach garbage.
        norm = normalize_mobile_e164(mobile)
        if norm:
            result["mobile"] = norm

    return result


async def search_linkedin_profile(hr_name: str, company_name: str) -> str | None:
    """SRS §4.5.2: LinkedIn cross-reference for HR profile URL.

    Search `site:linkedin.com/in "<HR name>" "<Company>"` via DuckDuckGo
    to resolve LinkedIn profile URL.
    """
    try:
        from ddgs import DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS
        except ImportError:
            logger.warning("ddgs not available for LinkedIn search")
            return None

    query = f'site:linkedin.com/in "{hr_name}" "{company_name}"'
    try:
        results = DDGS().text(query, max_results=3)
        for result in results:
            url = result.get("href", "")
            if "linkedin.com/in/" in url:
                logger.info(f"Found LinkedIn profile for {hr_name} at {company_name}: {url}")
                return url
    except Exception as e:
        logger.warning(f"LinkedIn search failed for {hr_name}@{company_name}: {e}")
    return None


async def discover_hr_via_dork(company_name: str, company_domain: str) -> dict[str, str]:
    """SRS §4.5.5: OSINT dorking to discover HR/recruiter identity.

    Uses DuckDuckGo to find:
    - LinkedIn profile URLs of recruiters/HR at the company
    - Names extracted from search snippets (e.g., rocketreach.co results)
    - Contact emails discovered via search

    This is the SRS-approved fallback when direct extraction is unavailable.
    Includes retry logic for flaky DDGS connections.
    """
    result = {"name": "", "email": "", "linkedin": "", "source": "", "source_url": "", "confidence": 0.0}
    try:
        from ddgs import DDGS
    except ImportError:
        return result

    # Fast queries for HR/recruiter identity discovery
    queries = [
        f'{company_name} recruiter email',
        f'{company_name} HR contact',
        f'{company_name} linkedin recruiter',
    ]

    ddgs = DDGS()

    for query in queries:
        try:
            results = await asyncio.wait_for(
                asyncio.to_thread(ddgs.text, query, max_results=5),
                timeout=10,
            )
        except asyncio.TimeoutError:
            logger.debug(f"DDGS timeout for '{query}'")
            continue
        except Exception as e:
            logger.debug(f"DDGS error for '{query}': {e}")
            continue

        if not results:
            continue

        for r in results:
            url = r.get("href", "")
            snippet = r.get("body", "") + " " + r.get("title", "")

            # Extract recruiters from rocketreach.co URLs — highest quality source
            if "rocketreach" in url:
                rr_match = re.search(r'/([\w-]+)-email_', url)
                if rr_match:
                    name = rr_match.group(1).replace("-", " ").title()
                    if _is_valid_person_name(name) and not _is_generic_name(name):
                        result["name"] = name[:80]
                        result["source"] = "duckduckgo_rocketreach"
                        result["source_url"] = url
                        result["confidence"] = 0.8
                        logger.info(f"Dork found HR name from rocketreach for {company_name}: {name}")
                        return result

            # Extract LinkedIn profile URLs and names
            if "linkedin.com/in/" in url or "linkedin.com/in/" in snippet:
                linkedin_match = re.search(r'linkedin\.com/in/([\w\-\.]+)', url + " " + snippet)
                if linkedin_match:
                    profile = linkedin_match.group(1)
                    profile_clean = re.sub(r'-\d+[a-f0-9]*$', '', profile)
                    name = profile_clean.replace("-", " ").replace("_", " ").title()
                    if _is_valid_person_name(name) and not _is_generic_name(name):
                        result["name"] = name[:80]
                        result["linkedin"] = f"https://www.linkedin.com/in/{profile}"
                        result["source"] = "duckduckgo_linkedin"
                        result["source_url"] = url
                        result["confidence"] = 0.75
                        logger.info(f"Dork found LinkedIn HR for {company_name}: {name} -> {result['linkedin']}")
                        return result

            # Extract email from snippet — only direct contacts, not generic
            email_match = re.search(r'[\w.]+@[\w.-]+\.\w+', snippet)
            if email_match:
                email = email_match.group(0).lower()
                if is_valid_email_format(email) and not is_generic_email(email):
                    local_part = email.split('@')[0]
                    result["email"] = email
                    if not result["name"]:
                        name_from_email = local_part.replace('.', ' ').replace('_', ' ').title()
                        if _is_valid_person_name(name_from_email):
                            result["name"] = name_from_email
                    result["source"] = result.get("source") or "duckduckgo_snippet"
                    result["source_url"] = url
                    result["confidence"] = result.get("confidence") or 0.65
                    logger.info(f"Dork found email for {company_name}: {redact_email(email)}")
                    return result

    return result


async def fallback_hr_cascade(
    sql: asyncpg.Connection | asyncpg.Pool,
    company_name: str,
    source_site: str
) -> dict[str, Any]:
    """SRS §4.5.3: Fallback cascade if HR name is not found at all.

    1. Query company's other open postings for recruiter identity (DB cache)
    2. OSINT dorking to discover HR identity
    3. Direct extraction from company career page
    4. WHOIS/company registry lookup (last resort)

    Returns dict with name, email, mobile, linkedin, plus provenance metadata.
    Every stage records: attempted, successful, failed, source, confidence, method, timestamp.
    """
    result = {
        "name": "", "email": "", "mobile": "", "linkedin": "",
        "email_validated": False,
        "name_source": "", "name_confidence": 0.0, "name_method": "",
        "email_source": "", "email_confidence": 0.0, "email_method": "",
        "stages_run": [],
    }

    conn = sql
    if isinstance(sql, asyncpg.Pool):
        conn = await sql.acquire()

    try:
        # Tier 1: Other HR in same company from other postings (DB cache)
        stage_result = {"stage": "db_cache_lookup", "attempted": True, "successful": False, "failed": False,
                       "source": "", "confidence": 0.0, "method": "db_query"}
        other_hr = await conn.fetchrow("""
            SELECT hc.full_name, hc.linkedin_url, hc.personal_email, hc.personal_mobile
            FROM hr_contacts hc
            JOIN companies c ON hc.current_company_id = c.id
            WHERE c.name = $1
            AND hc.full_name IS NOT NULL
            LIMIT 1
        """, company_name)

        if other_hr:
            result["name"] = other_hr["full_name"] or ""
            result["linkedin"] = other_hr["linkedin_url"] or ""
            result["email"] = other_hr["personal_email"] or ""
            result["mobile"] = other_hr["personal_mobile"] or ""
            result["name_source"] = "db_cache"
            result["name_confidence"] = 0.9
            result["name_method"] = "db_cache_lookup"
            if result["email"]:
                result["email_source"] = "db_cache"
                result["email_confidence"] = 0.9
                result["email_method"] = "db_cache_lookup"
            stage_result["successful"] = True
            stage_result["source"] = "hr_contacts_table"
            stage_result["confidence"] = 0.9
            stage_result["result"] = {"name": result["name"]}
            logger.info(f"Fallback: Found HR {result['name']} from other postings at {company_name}")
        else:
            stage_result["failed"] = True

        result["stages_run"].append(stage_result)

        if result["name"]:
            return result

    finally:
        if isinstance(sql, asyncpg.Pool):
            await sql.release(conn)

    # Tier 2: OSINT dorking (SRS §4.5.5)
    stage_result = {"stage": "osint_dorking", "attempted": True, "successful": False, "failed": False,
                   "source": "", "confidence": 0.0, "method": "duckduckgo_dork"}
    dork_result = await discover_hr_via_dork(company_name, company_name.lower())
    if dork_result.get("name"):
        result["name"] = dork_result["name"]
        result["name_source"] = dork_result.get("source", "osint_dork")
        result["name_confidence"] = dork_result.get("confidence", 0.7)
        result["name_method"] = "osint_dorking"
        stage_result["successful"] = True
        stage_result["source"] = dork_result.get("source", "")
        stage_result["confidence"] = dork_result.get("confidence", 0.7)
        stage_result["result"] = {"name": result["name"], "linkedin": dork_result.get("linkedin", "")}
        logger.info(f"OSINT dork found HR {result['name']} at {company_name}")

        if dork_result.get("linkedin") and not result["linkedin"]:
            result["linkedin"] = dork_result["linkedin"]
        if dork_result.get("email") and not result["email"]:
            result["email"] = dork_result["email"]
            result["email_source"] = dork_result.get("source", "osint_dork")
            result["email_confidence"] = dork_result.get("confidence", 0.65)
            result["email_method"] = "osint_dorking"

        result["stages_run"].append(stage_result)
        return result
    else:
        stage_result["failed"] = True
        result["stages_run"].append(stage_result)

    # Tier 3: Direct extraction from company career/contact page (SRS §4.5.3)
    stage_result = {"stage": "career_page_extraction", "attempted": True, "successful": False, "failed": False,
                   "source": "", "confidence": 0.0, "method": "career_page_scraping"}
    company_domain = company_name.lower().replace(" ", "").replace(".", "").replace(",", "")
    career_info = await extract_from_career_page(f"{company_domain}.com", company_name)
    if career_info.get("name") and not result["name"]:
        result["name"] = career_info["name"]
        result["name_source"] = "career_page"
        result["name_confidence"] = 0.7
        result["name_method"] = "career_page_text_extraction"
        stage_result["successful"] = True
        stage_result["source"] = "company_career_page"
        stage_result["confidence"] = 0.7
        stage_result["result"] = {"name": career_info["name"]}
        if career_info.get("contact_url"):
            stage_result["result"]["url"] = career_info["contact_url"]
        logger.info(f"Career page found HR name for {company_name}: {career_info['name']}")

        if career_info.get("email") and not result["email"]:
            result["email"] = career_info["email"]
            result["email_source"] = "career_page"
            result["email_confidence"] = 0.8
            result["email_method"] = "career_page_regex"
            stage_result["result"]["email"] = career_info["email"]

        result["stages_run"].append(stage_result)
        # Continue to check for email even if we found a name
    elif career_info.get("email"):
        result["email"] = career_info["email"]
        result["email_source"] = "career_page"
        result["email_confidence"] = 0.8
        result["email_method"] = "career_page_regex"
        stage_result["successful"] = True
        stage_result["source"] = "company_career_page"
        stage_result["confidence"] = 0.8
        stage_result["result"] = {"email": career_info["email"]}
        if career_info.get("contact_url"):
            stage_result["result"]["url"] = career_info["contact_url"]
        logger.info(f"Career page found email for {company_name}: {redact_email(career_info['email'])}")
    else:
        stage_result["failed"] = True

    result["stages_run"].append(stage_result)

    # Tier 4: WHOIS lookup (SRS §4.5.4) — last resort for contact discovery
    stage_result = {"stage": "whois_lookup", "attempted": True, "successful": False, "failed": False,
                   "source": "", "confidence": 0.0, "method": "domain_whois"}
    whois_email, whois_meta = await run_whois_lookup(company_name)
    if whois_email:
        if not result["email"]:
            result["email"] = whois_email
            result["email_source"] = "whois"
            result["email_confidence"] = 0.4
            result["email_method"] = "domain_whois"
        stage_result["successful"] = True
        stage_result["source"] = "whois_registry"
        stage_result["confidence"] = 0.4
        stage_result["result"] = {"email": whois_email, "registrar": whois_meta.get("registrar")}
        logger.info(f"WHOIS found email for {company_name}: {redact_email(whois_email)}")
    else:
        stage_result["failed"] = True
        stage_result["result"] = {"error": whois_meta.get("error", "no match")}

    result["stages_run"].append(stage_result)

    return result


_whois_cache: dict[str, tuple[str | None, dict[str, Any]]] = {}


async def run_whois_lookup(company_name: str) -> tuple[str | None, dict[str, Any]]:
    """SRS §4.5.4: WHOIS lookup to discover company registrant email.

    Uses caching to avoid duplicate lookups per session (SRS §4.5.4 performance).

    Returns (email, metadata) where metadata includes registrar, error, etc.
    """
    if company_name in _whois_cache:
        return _whois_cache[company_name]

    meta: dict[str, Any] = {"registrar": "", "error": ""}

    try:
        import whois
        domain = company_name.lower().replace(" ", "").replace(".", "").replace(",", "")
        for tld in [".com", ".co.in", ".io", ".in"]:
            try:
                w = await asyncio.wait_for(
                    asyncio.to_thread(whois.whois, f"{domain}{tld}"),
                    timeout=10,
                )
                meta["registrar"] = getattr(w, "registrar", "") or ""
                if w and w.get("registrar"):
                    emails = w.get("emails", [])
                    if emails:
                        email = emails[0] if isinstance(emails, list) else emails
                        # Only return emails that look like real contact addresses
                        # (not abuse@, postmaster@, etc.)
                        if "@" in str(email) and not str(email).startswith(("abuse@", "postmaster@", "admin@")):
                            _whois_cache[company_name] = (str(email), meta)
                            return str(email), meta
            except asyncio.TimeoutError:
                logger.debug(f"WHOIS timeout for {company_name}{tld}")
            except Exception as e:
                logger.debug(f"WHOIS query error for {company_name}{tld}: {e}")
                continue
    except ImportError:
        logger.warning("python-whois not installed")
        meta["error"] = "python-whois not installed"
    except Exception as e:
        logger.debug(f"WHOIS lookup failed for {company_name}: {e}")
        meta["error"] = str(e)

    _whois_cache[company_name] = (None, meta)
    return None, meta


async def run_holehe_check(email: str) -> dict[str, Any]:
    """SRS §4.5.4: OSINT personal-contact augmentation with holehe.
    
    Checks which platforms an email is registered on — validity signal.
    Returns dict with platforms where email is registered.
    """
    try:
        # holehe is a CLI tool, run via subprocess
        cmd = ["holehe", email, "--json"]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()
        
        if proc.returncode == 0 and stdout:
            try:
                result = json.loads(stdout.decode())
                platforms = [k for k, v in result.items() if v]
                logger.info(f"holehe: {redact_email(email)} registered on {len(platforms)} platforms")
                return {"valid": len(platforms) > 0, "platforms": platforms}
            except json.JSONDecodeError:
                pass
    except FileNotFoundError:
        logger.warning("holehe not installed, skipping OSINT check")
    except Exception as e:
        logger.warning(f"holehe check failed for {redact_email(email)}: {e}")
    
    return {"valid": False, "platforms": []}


def normalize_lead(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize a raw job record; legacy contact fields are read only by opt-in."""
    company_name = (raw.get("company_name") or raw.get("company") or "").strip()
    job_title = (raw.get("job_title") or raw.get("title") or "").strip()
    job_url = (raw.get("job_url") or raw.get("url") or "").strip()

    experience_required = raw.get("experience_required") or raw.get("experience", "")
    about_job = raw.get("about_job") or raw.get("description", "")

    # Capture location from whichever field the source populated. Do not infer
    # a location from experience_required; it holds years of experience.
    location = (raw.get("location") or raw.get("job_location")
                or raw.get("city") or "").strip()
    apply_url = (raw.get("apply_url") or raw.get("applyUrl") or raw.get("application_url")
                 or raw.get("applicationUrl") or job_url).strip()
    posted_raw = (raw.get("posted_at") or raw.get("date_posted") or raw.get("posted_date")
                  or raw.get("postedOn") or raw.get("published_at"))
    posted_at = None
    if isinstance(posted_raw, (int, float)) and not isinstance(posted_raw, bool):
        try:
            timestamp = float(posted_raw) / (1000 if float(posted_raw) > 10_000_000_000 else 1)
            posted_at = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            posted_at = None
    elif isinstance(posted_raw, str) and posted_raw.strip():
        try:
            posted_at = datetime.fromisoformat(posted_raw.strip().replace("Z", "+00:00"))
            if posted_at.tzinfo is None:
                posted_at = posted_at.replace(tzinfo=timezone.utc)
        except ValueError:
            posted_at = None
    location_type_raw = str(raw.get("location_type") or raw.get("workplace_type")
                            or raw.get("workplaceType") or "").strip().lower().replace("-", "_")
    location_type_aliases = {"work_from_home": "remote", "wfh": "remote", "remote": "remote",
                             "hybrid": "hybrid", "onsite": "onsite", "on_site": "onsite",
                             "office": "onsite", "field": "field"}
    location_type = location_type_aliases.get(location_type_raw)
    employment_raw = str(raw.get("employment_type") or raw.get("employmentType")
                         or raw.get("job_type") or "").strip().lower().replace("-", "_").replace(" ", "_")
    employment_aliases = {"fulltime": "full_time", "full_time": "full_time", "parttime": "part_time",
                          "part_time": "part_time", "intern": "internship", "internship": "internship",
                          "contractor": "contract", "contract": "contract", "apprentice": "apprenticeship",
                          "apprenticeship": "apprenticeship", "freelance": "freelance", "temporary": "temporary"}
    employment_type = employment_aliases.get(employment_raw)
    raw_skills = raw.get("skills") or raw.get("required_skills") or raw.get("technologies") or []
    if isinstance(raw_skills, str):
        raw_skills = re.split(r"[,;|]", raw_skills)
    skills = list(dict.fromkeys(str(skill).strip() for skill in raw_skills if str(skill).strip())) if isinstance(raw_skills, (list, tuple, set)) else []

    def numeric_salary(value: Any) -> float | None:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return float(value)
        if isinstance(value, str) and re.fullmatch(r"\s*\d+(?:,\d{3})*(?:\.\d+)?\s*", value):
            try:
                return float(value.replace(",", "").strip())
            except ValueError:
                return None
        return None

    salary_min = numeric_salary(raw.get("salary_min") or raw.get("min_salary") or raw.get("minSalary"))
    salary_max = numeric_salary(raw.get("salary_max") or raw.get("max_salary") or raw.get("maxSalary"))
    if salary_min is not None and salary_max is not None and salary_min > salary_max:
        salary_min, salary_max = None, None
    salary_currency = str(raw.get("salary_currency") or raw.get("salaryCurrency") or "").upper()
    if salary_currency not in {"INR", "USD", "EUR", "GBP"}:
        salary_currency = None
    salary_period = str(raw.get("salary_period") or raw.get("salaryPeriod") or "").lower()
    if salary_period not in {"year", "month", "week", "day", "hour"}:
        salary_period = None

    legacy_pipeline = legacy_outreach_enabled()
    is_fresher = classify_fresher(job_title, str(experience_required), str(about_job)) if legacy_pipeline else True

    if legacy_pipeline:
        hr_name, hr_name_provenance = extract_hr_name_fallback(raw, company_name)
        hr_contact = extract_hr_contact_fallback(raw, company_name)
        hr_email = hr_contact["email"]
        hr_mobile = hr_contact["mobile"]
        hr_linkedin = raw.get("hr_linkedin_url", "")
    else:
        hr_name = hr_email = hr_mobile = hr_linkedin = ""
        hr_name_provenance = {}
    source_site = raw.get("source_site", "")
    scraped_at = raw.get("scraped_at", now_iso())
    raw_payload = raw.get("raw_payload", raw)

    data_quality = "complete"
    if not hr_name:
        data_quality = "incomplete"
    if not hr_email and not hr_mobile and not hr_linkedin:
        data_quality = "incomplete"

    fingerprint = generate_fingerprint(company_name, job_title, job_url)

    # Preserve incoming hr_extraction_provenance if supplied (SRS §10)
    incoming_provenance = raw.get("hr_extraction_provenance") if legacy_pipeline else None
    if isinstance(incoming_provenance, dict):
        hr_extraction_provenance = incoming_provenance
    else:
        # Seed provenance with the name-extraction stage computed above
        # so that normalize_lead() → insert_lead() (without enrichment) still
        # carries an audit trail.  enrich_hr_data() will extend, not overwrite.
        hr_extraction_provenance = {
            "stages": [hr_name_provenance] if hr_name_provenance else [],
        }

    return {
        "company_name": company_name,
        "about_company": raw.get("about_company", ""),
        "hr_name": hr_name,
        "hr_email": hr_email,
        "company_email": raw.get("company_email", "") if legacy_pipeline else "",
        "hr_mobile": hr_mobile,
        "company_mobile": raw.get("company_mobile", "") if legacy_pipeline else "",
        "hr_linkedin_url": hr_linkedin,
        "job_title": job_title,
        "about_job": about_job,
        "experience_required": experience_required,
        "location": location,
        "apply_url": apply_url,
        "posted_at": posted_at,
        "location_type": location_type,
        "employment_type": employment_type,
        "skills": skills,
        "salary_min": salary_min,
        "salary_max": salary_max,
        "salary_currency": salary_currency,
        "salary_period": salary_period,
        "salary_range": raw.get("salary_range", ""),
        "job_url": job_url,
        "source_site": source_site,
        "scraped_at": scraped_at,
        "fingerprint": fingerprint,
        "data_quality": data_quality,
        "is_fresher": is_fresher,
        "is_india": is_india_relevant({"location": location, "about_job": about_job,
                                       "source_site": source_site}) if legacy_pipeline else True,
        "raw_payload": raw_payload,
        "hr_extraction_provenance": hr_extraction_provenance,
        # Who triggered the scrape, so downstream auto-chaining publishes SSE to
        # the right user channel and the browser updates live (not just on poll).
        "requested_by": raw.get("requested_by") or "system",
    }


async def enrich_hr_data(
    normalized: dict[str, Any],
    db_pool: asyncpg.Pool
) -> dict[str, Any]:
    """Enrich HR data using the full SRS §4.5 cascade.

    Cascade order:
    1. Direct extraction from job posting page (§4.5.1)
    2. LinkedIn cross-reference (§4.5.2)
    3. Fallback cascade: DB cache → OSINT dorking → career page → WHOIS (§4.5.3, §4.5.4, §4.5.5)
    4. OSINT personal-contact augmentation (§4.5.5)

    Every stage records: attempted, successful, failed, source, confidence, method, timestamp.
    """
    hr_name = normalized.get("hr_name", "")
    company_name = normalized.get("company_name", "")
    hr_linkedin = normalized.get("hr_linkedin_url", "")
    hr_email = normalized.get("hr_email", "")
    hr_mobile = normalized.get("hr_mobile", "")
    job_url = normalized.get("job_url", "")

    # Extend existing provenance tracking (don't overwrite — normalize_lead seeds it)
    if not isinstance(normalized.get("hr_extraction_provenance"), dict):
        normalized["hr_extraction_provenance"] = {"stages": []}
    existing_stages = normalized["hr_extraction_provenance"].get("stages", [])
    if not isinstance(existing_stages, list):
        existing_stages = []
    normalized["hr_extraction_provenance"]["stages"] = existing_stages

    def record_stage(stage: str, attempted: bool, successful: bool, failed: bool,
                     source: str = "", confidence: float = 0.0, method: str = "",
                     result_detail: dict = None):
        entry = {
            "stage": stage,
            "attempted": attempted,
            "successful": successful,
            "failed": failed,
            "source": source,
            "confidence": confidence,
            "method": method,
            "timestamp": now_iso(),
        }
        if result_detail:
            entry["result"] = result_detail
        normalized["hr_extraction_provenance"]["stages"].append(entry)

    # Step 1: Direct extraction from job posting page (SRS §4.5.1)
    # If we have a job URL, try to scrape the page for HR contact info
    if job_url:
        direct_info = await extract_from_job_posting_page(job_url)
        if direct_info.get("name") and not hr_name:
            hr_name = direct_info["name"]
            normalized["hr_name"] = hr_name
            record_stage("direct_extraction_job_page", True, True, False,
                        source="job_posting_page",
                        confidence=0.9, method="posted_by_heuristic",
                        result_detail={"name": hr_name, "url": job_url})
        elif direct_info.get("name"):
            record_stage("direct_extraction_job_page", True, True, False,
                        source="job_posting_page",
                        confidence=0.9, method="posted_by_heuristic",
                        result_detail={"name": direct_info["name"]})
        else:
            record_stage("direct_extraction_job_page", True, False, True,
                        source="job_posting_page",
                        confidence=0.0, method="posted_by_heuristic")
        
        # Extract direct contact from job posting page
        if direct_info.get("email") and not hr_email:
            hr_email = direct_info["email"]
            normalized["hr_email"] = hr_email
            normalized["hr_email_source"] = "direct_job_posting"
            record_stage("direct_contact_extraction", True, True, False,
                        source="job_posting_page",
                        confidence=0.9, method="regex_from_job_page",
                        result_detail={"email": hr_email, "url": job_url})
        elif direct_info.get("linkedin"):
            # Even if no email, save the LinkedIn URL
            if not hr_linkedin:
                normalized["hr_linkedin_url"] = direct_info["linkedin"]

    # Step 2: LinkedIn cross-reference (SRS §4.5.2)
    # If HR name found but no LinkedIn, search for LinkedIn profile
    if hr_name and not hr_linkedin:
        linkedin_url = await search_linkedin_profile(hr_name, company_name)
        if linkedin_url:
            normalized["hr_linkedin_url"] = linkedin_url
            hr_linkedin = linkedin_url
            record_stage("linkedin_cross_reference", True, True, False,
                        source="duckduckgo_search",
                        confidence=0.85, method="site_search",
                        result_detail={"linkedin_url": linkedin_url})
        else:
            record_stage("linkedin_cross_reference", True, False, True,
                        source="duckduckgo_search",
                        confidence=0.0, method="site_search")

    # Step 3: Fallback cascade (SRS §4.5.3)
    # If still no HR name, try: DB cache → OSINT dorking → career page → WHOIS
    if not hr_name:
        fallback_result = await fallback_hr_cascade(db_pool, company_name, normalized.get("source_site", ""))

        # Record each stage from fallback_hr_cascade
        for stage_info in fallback_result.get("stages_run", []):
            record_stage(stage_info["stage"], stage_info["attempted"],
                        stage_info["successful"], stage_info["failed"],
                        stage_info.get("source", ""), stage_info.get("confidence", 0.0),
                        stage_info.get("method", ""), stage_info.get("result"))

        if fallback_result.get("name"):
            hr_name = fallback_result["name"]
            normalized["hr_name"] = hr_name
            record_stage("fallback_cascade", True, True, False,
                        source=fallback_result.get("name_source", ""),
                        confidence=fallback_result.get("name_confidence", 0.5),
                        method=fallback_result.get("name_method", "fallback"),
                        result_detail={"name": hr_name})
        else:
            record_stage("fallback_cascade", True, False, True,
                        source="all_tiers", confidence=0.0, method="cascade")

        # Use fallback contact info if found
        if fallback_result.get("email") and not hr_email:
            hr_email = fallback_result["email"]
            normalized["hr_email"] = hr_email
            normalized["hr_email_source"] = fallback_result.get("email_source", "fallback")
            record_stage("fallback_contact", True, True, False,
                        source=fallback_result.get("email_source", "fallback"),
                        confidence=fallback_result.get("email_confidence", 0.3),
                        method=fallback_result.get("email_method", "fallback"))
        elif fallback_result.get("email"):
            record_stage("fallback_contact", True, False, True, source="all_tiers")

    # Step 4: WHOIS lookup as direct contact discovery (SRS §4.5.4)
    # Only if we still have no email
    if not hr_email and company_name:
        whois_email, whois_meta = await run_whois_lookup(company_name)
        if whois_email:
            hr_email = whois_email
            normalized["hr_email"] = hr_email
            normalized["hr_email_source"] = "whois"
            record_stage("whois_lookup", True, True, False,
                        source="whois_registry",
                        confidence=0.4, method="domain_whois",
                        result_detail={"email": whois_email, "registrar": whois_meta.get("registrar")})
        else:
            record_stage("whois_lookup", True, False, True,
                        source="whois_registry", confidence=0.0, method="domain_whois",
                        result_detail={"error": whois_meta.get("error", "no email found")})

    # Step 5: Direct contact extraction from career pages (SRS §4.5.3 fallback)
    # Try to get direct contact from company's own career/contact pages
    if not hr_email and not hr_mobile and company_name:
        # Derive the *employer* domain (never the aggregator host) for career-page
        # contact extraction.
        domain = derive_company_domain(company_name, job_url)

        career_info = await extract_from_career_page(domain, company_name)
        if career_info.get("email") and not hr_email:
            hr_email = career_info["email"]
            normalized["hr_email"] = hr_email
            normalized["hr_email_source"] = "direct_career_page"
            record_stage("career_page_extraction", True, True, False,
                        source="company_career_page",
                        confidence=0.8, method="regex_from_career_page_html",
                        result_detail={"email": hr_email, "url": career_info.get("contact_url", "")})
        elif career_info.get("name") and not hr_name:
            hr_name = career_info["name"]
            normalized["hr_name"] = hr_name
            record_stage("career_page_name_extraction", True, True, False,
                        source="company_career_page",
                        confidence=0.7, method="text_extraction",
                        result_detail={"name": hr_name, "url": career_info.get("contact_url", "")})
        else:
            record_stage("career_page_extraction", True, False, True,
                        source="company_career_page", confidence=0.0)

    # Step 6: OSINT augmentation with holehe for email validation (§4.5.5)
    if hr_email and not hr_email.startswith("careers@") and not hr_email.startswith("hr@"):
        holehe_result = await run_holehe_check(hr_email)
        if holehe_result.get("valid"):
            normalized["hr_email_holehe_validated"] = True
            normalized["hr_email_platforms"] = holehe_result.get("platforms", [])
            record_stage("osint_holehe_validation", True, True, False,
                        source="holehe",
                        confidence=0.6, method="email_platform_check",
                        result_detail={"platforms": holehe_result.get("platforms", [])})
        else:
            normalized["hr_email_holehe_validated"] = False
            record_stage("osint_holehe_validation", True, False, True,
                        source="holehe", confidence=0.0)

    return normalized


async def enrich_public_job_contact(
    normalized: dict[str, Any],
    db_pool: asyncpg.Pool,
    allow_search: bool = False,
) -> dict[str, Any]:
    """Find public professional contacts from listing/careers pages and, when
    explicitly requested by an admin, public search snippets. This path never
    guesses email addresses, searches private accounts, or starts outreach.
    """
    job_url = str(normalized.get("job_url") or "").strip()
    if not job_url or urlparse(job_url).scheme.lower() != "https":
        return normalized
    fingerprint = normalized.get("fingerprint")
    if fingerprint:
        async with db_pool.acquire() as conn:
            existing = await conn.fetchval("SELECT hr_contact_id FROM job_postings WHERE fingerprint=$1 LIMIT 1", fingerprint)
            if existing:
                return normalized
    try:
        direct = await extract_from_job_posting_page(job_url)
    except Exception as exc:  # noqa: BLE001
        logger.debug("Direct public HR extraction failed for %s: %s", job_url, exc)
        return normalized
    if not isinstance(direct, dict):
        direct = {}
    name = str(direct.get("name") or "").strip()
    email = str(direct.get("email") or "").strip().lower()
    linkedin = str(direct.get("linkedin") or "").strip()
    source_url = str(direct.get("contact_url") or job_url).strip()
    method = "public_job_listing"
    source = "direct_extracted"
    confidence = 90

    def valid_public_source(value: str, expected_domain: str = "") -> bool:
        try:
            parsed_url = urlparse(value)
            host = (parsed_url.hostname or "").lower().removeprefix("www.")
            base = expected_domain.lower().removeprefix("www.").strip(".")
            return parsed_url.scheme.lower() == "https" and bool(host) and (not base or host == base or host.endswith("." + base))
        except ValueError:
            return False

    def validate_fields() -> tuple[str, str, str]:
        clean_name = name
        clean_email = email
        clean_linkedin = linkedin
        if clean_name and (_is_generic_name(clean_name) or not _is_valid_person_name(clean_name)):
            clean_name = ""
        if clean_email and (not is_valid_email_format(clean_email) or is_generic_email(clean_email)):
            clean_email = ""
        if clean_linkedin:
            try:
                parsed_linkedin = urlparse(clean_linkedin)
                if parsed_linkedin.scheme.lower() != "https" or (parsed_linkedin.hostname or "").lower().removeprefix("www.") != "linkedin.com" or not re.search(r"^/(?:in|company)/", parsed_linkedin.path, re.IGNORECASE):
                    clean_linkedin = ""
            except ValueError:
                clean_linkedin = ""
        return clean_name, clean_email, clean_linkedin

    name, email, linkedin = validate_fields()
    credible = bool((email or linkedin) and (name or linkedin) and valid_public_source(source_url))

    # Many ATS feeds expose no recruiter details on the posting itself. Check
    # only the employer's own careers/contact pages next; never infer a person
    # from a generated mailbox or expose guessed addresses to candidates.
    domain = derive_company_domain(str(normalized.get("company_name") or ""), job_url)
    if not credible and domain and allow_search:
        try:
            career = await extract_from_career_page(domain, str(normalized.get("company_name") or ""))
            name = str(career.get("name") or "").strip()
            email = str(career.get("email") or "").strip().lower()
            linkedin = str(career.get("linkedin") or "").strip()
            source_url = str(career.get("contact_url") or "").strip()
            name, email, linkedin = validate_fields()
            credible = bool((email or linkedin) and (name or linkedin) and valid_public_source(source_url, domain))
            if credible:
                method = "company_career_page"
                confidence = 88 if name and email else 85
        except Exception as exc:  # noqa: BLE001
            logger.debug("Official career-page HR extraction failed for %s: %s", domain, exc)

    # A manually requested scan can also check public search results for
    # professional profiles. These remain search_discovered/low-confidence and
    # are never shown in candidate job cards until verified by a human/source.
    if not credible and allow_search:
        try:
            dork = await asyncio.wait_for(
                discover_hr_via_dork(str(normalized.get("company_name") or ""), domain or ""),
                timeout=14,
            )
            name = str(dork.get("name") or "").strip()
            email = str(dork.get("email") or "").strip().lower()
            linkedin = str(dork.get("linkedin") or "").strip()
            source_url = str(dork.get("source_url") or "").strip()
            name, email, linkedin = validate_fields()
            credible = bool(name and (email or linkedin) and valid_public_source(source_url))
            if credible:
                method = "public_search_result"
                source = "search_discovered"
                confidence = min(74, max(60, int(float(dork.get("confidence") or 0.65) * 100)))
        except Exception as exc:  # noqa: BLE001
            logger.debug("Public HR search fallback failed for %s: %s", normalized.get("company_name"), exc)

    # A contact should identify a person or a public professional profile; a
    # bare generic mailbox is handled as company contact information elsewhere.
    if not credible:
        return normalized
    normalized["hr_name"] = name
    normalized["hr_email"] = email
    normalized["hr_linkedin_url"] = linkedin
    normalized["_public_hr_discovery"] = True
    normalized["_contact_source"] = source
    normalized["_contact_method"] = method
    normalized["_contact_confidence"] = confidence
    normalized["hr_public_contact_url"] = source_url
    normalized["hr_extraction_provenance"] = {
        "stages": [{"stage": "public_hr_contact_discovery", "attempted": True, "successful": True,
                    "failed": False, "source": source_url, "confidence": confidence / 100,
                    "method": method, "timestamp": now_iso(),
                    "result": {"url": source_url, "fields": [field for field, value in (("name", name), ("email", email), ("linkedin", linkedin)) if value]}}]
    }
    return normalized


async def save_public_hr_contact(sql: asyncpg.Connection, normalized: dict[str, Any], company_id: str) -> str | None:
    """Persist direct public listing contacts and scope deduplication by employer."""
    if not normalized.get("_public_hr_discovery"):
        return None
    name = normalized.get("hr_name") or None
    email = normalized.get("hr_email") or None
    linkedin = normalized.get("hr_linkedin_url") or None
    contact_source = normalized.get("_contact_source") or "direct_extracted"
    contact_method = normalized.get("_contact_method") or "public_job_listing"
    confidence = int(normalized.get("_contact_confidence") or 90)
    if not (email or linkedin) or not (name or linkedin):
        return None
    existing_id = await sql.fetchval(
        """SELECT id FROM hr_contacts WHERE current_company_id=$1 AND
             ((NULLIF($2,'') IS NOT NULL AND personal_email=$2) OR
              (NULLIF($3,'') IS NOT NULL AND linkedin_url=$3)) LIMIT 1""",
        company_id, email or "", linkedin or "",
    )
    if existing_id:
        await sql.execute(
            """UPDATE hr_contacts SET full_name=COALESCE(full_name,$1),
                 personal_email=COALESCE(personal_email,NULLIF($2,'')),
                 linkedin_url=COALESCE(linkedin_url,NULLIF($3,'')),
                 contact_source=CASE WHEN $7>=confidence_score THEN $4 ELSE contact_source END,
                 contact_method=CASE WHEN $7>=confidence_score THEN $5 ELSE contact_method END,
                 contact_url=CASE WHEN $7>=confidence_score THEN $6 ELSE contact_url END,
                 confidence_score=GREATEST(confidence_score,$7),
                 extraction_provenance=COALESCE(extraction_provenance,'{}'::jsonb) || $8::jsonb,
                 updated_at=NOW() WHERE id=$9""",
            name, email or "", linkedin or "", contact_source, contact_method,
            normalized["hr_public_contact_url"], confidence,
            json.dumps(normalized["hr_extraction_provenance"]), existing_id,
        )
        return str(existing_id)
    return str(await sql.fetchval(
        """INSERT INTO hr_contacts
             (full_name,personal_email,linkedin_url,current_company_id,contact_source,
              contact_method,contact_url,confidence_score,extraction_provenance)
           VALUES ($1,NULLIF($2,''),NULLIF($3,''),$4,$5,$6,$7,$8,$9::jsonb) RETURNING id""",
        name, email or "", linkedin or "", company_id, contact_source, contact_method,
        normalized["hr_public_contact_url"], confidence,
        json.dumps(normalized["hr_extraction_provenance"]),
    ))


def _levenshtein(a: str, b: str) -> int:
    """Compute Levenshtein edit distance between two strings."""
    if len(a) < len(b):
        a, b = b, a
    if len(b) == 0:
        return len(a)
    prev_row = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        current_row = [i + 1]
        for j, cb in enumerate(b):
            insertions = prev_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = prev_row[j] + (ca != cb)
            current_row.append(min(insertions, deletions, substitutions))
        prev_row = current_row
    return prev_row[-1]


def _similarity(a: str, b: str) -> float:
    """Compute normalized similarity (0-1) between two strings."""
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 1.0
    return 1.0 - _levenshtein(a, b) / max_len


def _extract_domain(url: str) -> str:
    """Extract hostname from job URL."""
    if not url:
        return ""
    try:
        return urlparse(url).hostname or ""
    except Exception:
        return ""


def _build_candidate_string(company_name: str, job_title: str, job_url: str) -> str:
    """Build normalized composite candidate string from company_name + job_title + job_url_domain."""
    domain = _extract_domain(job_url)
    normalized_company = re.sub(r'[^a-z0-9]', ' ', (company_name or "").lower()).strip()
    normalized_title = re.sub(r'[^a-z0-9]', ' ', (job_title or "").lower()).strip()
    return f"{normalized_company} {normalized_title} {domain}".strip()


def _calculate_candidate_similarity(
    company1: str, title1: str, url1: str,
    company2: str, title2: str, url2: str
) -> float:
    """Calculate similarity score between candidate lead pairs using normalized company_name + job_title + job_url_domain."""
    d1 = _extract_domain(url1)
    d2 = _extract_domain(url2)
    s1 = _build_candidate_string(company1, title1, url1)
    s2 = _build_candidate_string(company2, title2, url2)
    sim = _similarity(s1, s2)
    if d1 and d2 and d1 != d2:
        return min(sim, 0.5)
    return sim


async def _find_fuzzy_duplicate(sql: asyncpg.Connection, normalized: dict[str, Any]) -> str | None:
    """SRS §4.6: Fuzzy match (Levenshtein on company+title+domain, threshold 0.85).

    Returns the ID of a possible duplicate lead if one is found, otherwise None.
    """
    company = normalized.get("company_name", "")
    title = normalized.get("job_title", "")
    url = normalized.get("job_url", "")
    if not company or not title:
        return None

    candidates = await sql.fetch(
        "SELECT l.id, c.name as company_name, jp.title, jp.job_url "
        "FROM leads l "
        "LEFT JOIN companies c ON l.company_id = c.id "
        "JOIN job_postings jp ON l.job_posting_id = jp.id "
        "WHERE l.created_at > NOW() - INTERVAL '30 days' "
        "ORDER BY l.created_at DESC LIMIT 200",
    )

    for row in candidates:
        cand_company = row["company_name"] or ""
        cand_title = row["title"] or ""
        cand_url = row["job_url"] or ""
        sim = _calculate_candidate_similarity(
            company, title, url,
            cand_company, cand_title, cand_url
        )
        if sim >= 0.85:
            return str(row["id"])

    return None


async def _find_canonical_job(sql: asyncpg.Connection, normalized: dict[str, Any], company_id: str) -> str | None:
    """Find a high-confidence cross-source match before creating another job."""
    company = (normalized.get("company_name") or "").strip()
    title = (normalized.get("job_title") or "").strip()
    location = (normalized.get("location") or "").strip() or None
    description = (normalized.get("about_job") or "").strip()
    apply_url = (normalized.get("apply_url") or normalized.get("job_url") or "").strip()
    if not company or not title:
        return None
    return await sql.fetchval(
        """
        SELECT jp.id
          FROM job_postings jp
          JOIN companies c ON c.id = jp.company_id
         WHERE jp.is_active = TRUE
           AND jp.first_seen_at > NOW() - INTERVAL '14 days'
           AND (jp.company_id = $1 OR similarity(lower(c.name), lower($2)) >= 0.88)
           AND similarity(regexp_replace(lower(jp.title), '[^a-z0-9]+', '', 'g'),
                          regexp_replace(lower($3), '[^a-z0-9]+', '', 'g')) >= 0.86
           AND (jp.location IS NULL OR $4::text IS NULL OR
                similarity(regexp_replace(lower(jp.location), '[^a-z0-9]+', '', 'g'),
                           regexp_replace(lower($4), '[^a-z0-9]+', '', 'g')) >= 0.80)
           AND ((NULLIF(jp.apply_url, '') IS NOT NULL AND jp.apply_url = NULLIF($5, ''))
                OR (length($6) >= 240 AND length(COALESCE(jp.description, '')) >= 240
                    AND similarity(left(jp.description, 12000), left($6, 12000)) >= 0.62
                    AND jp.location IS NOT NULL AND $4::text IS NOT NULL))
         ORDER BY similarity(left(COALESCE(jp.description, ''), 12000), left($6, 12000)) DESC,
                  jp.first_seen_at DESC
         LIMIT 1
        """,
        company_id, company, title, location, apply_url, description,
    )


async def _record_job_source(sql: asyncpg.Connection, job_id: str, normalized: dict[str, Any]) -> None:
    raw = normalized.get("raw_payload") or {}
    source_job_id = ""
    if isinstance(raw, dict):
        source_job_id = str(raw.get("source_job_id") or raw.get("job_id") or raw.get("id") or "")
    await sql.execute(
        """
        INSERT INTO job_sources (job_posting_id, source_site, source_job_id, source_url, raw_payload)
        VALUES ($1, $2, NULLIF($3, ''), $4, $5::jsonb)
        ON CONFLICT (job_posting_id, source_site, source_url)
        DO UPDATE SET last_seen_at = NOW(), raw_payload = EXCLUDED.raw_payload,
                      source_job_id = COALESCE(job_sources.source_job_id, EXCLUDED.source_job_id)
        """,
        job_id, normalized.get("source_site") or "unknown", source_job_id,
        normalized.get("job_url") or "", json.dumps(raw),
    )


def _candidate_safe_payload(value: Any) -> Any:
    """Remove direct recruiter/contact fields before persisting candidate data."""
    private_keys = {
        "email", "hr_email", "personal_email", "recruiter_email", "phone", "mobile",
        "hr_mobile", "personal_mobile", "recruiter_phone", "linkedin_url",
        "hr_linkedin_url", "hr_name", "contact_name", "recruiter_name", "posted_by",
        "hiring_manager", "contact_person", "contact", "recruiter", "poster",
    }
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            normalized_key = re.sub(r"[^a-z0-9]+", "_", str(key).strip().lower()).strip("_")
            if normalized_key in private_keys or re.search(r"(^|_)(email|phone|mobile|linkedin_url|contact_name|recruiter_name|hiring_manager)(_|$)", normalized_key):
                continue
            cleaned[key] = _candidate_safe_payload(item)
        return cleaned
    if isinstance(value, list):
        return [_candidate_safe_payload(item) for item in value]
    return value


async def insert_job_posting(sql: asyncpg.Connection, normalized: dict[str, Any]) -> str | None:
    """Candidate-mode ingestion: persist jobs/sources without HR enrichment or leads."""
    fp = normalized["fingerprint"]
    safe = dict(normalized)
    safe["raw_payload"] = _candidate_safe_payload(normalized.get("raw_payload") or {})

    recent = await sql.fetchval(
        "SELECT id FROM job_postings WHERE fingerprint=$1 AND first_seen_at>NOW()-INTERVAL '30 days' LIMIT 1", fp
    )
    if recent:
        existing_contact = await sql.fetchval("SELECT hr_contact_id FROM job_postings WHERE id=$1", recent)
        contact_id = existing_contact or await save_public_hr_contact(sql, safe, await sql.fetchval("SELECT company_id FROM job_postings WHERE id=$1", recent))
        await sql.execute(
            """UPDATE job_postings jp SET last_seen_at=NOW(),
                 raw_payload=CASE WHEN EXISTS (SELECT 1 FROM leads l WHERE l.job_posting_id=jp.id) THEN jp.raw_payload ELSE $1::jsonb END,
                 content_hash=CASE WHEN EXISTS (SELECT 1 FROM leads l WHERE l.job_posting_id=jp.id) THEN jp.content_hash ELSE $2 END,
                 hr_contact_id=COALESCE(jp.hr_contact_id,$4)
               WHERE jp.id=$3""",
            json.dumps(safe["raw_payload"]), content_hash_of(safe["raw_payload"]), recent, contact_id,
        )
        await _record_job_source(sql, str(recent), safe)
        await _refresh_candidate_job_quality(sql, str(recent))
        return None

    job_id = await sql.fetchval("SELECT id FROM job_postings WHERE fingerprint=$1 LIMIT 1", fp)
    if job_id:
        existing_contact = await sql.fetchval("SELECT hr_contact_id FROM job_postings WHERE id=$1", job_id)
        contact_company = await sql.fetchval("SELECT company_id FROM job_postings WHERE id=$1", job_id)
        contact_id = existing_contact or await save_public_hr_contact(sql, safe, contact_company)
        await sql.execute(
            """UPDATE job_postings jp SET first_seen_at=NOW(),last_seen_at=NOW(),
                 raw_payload=CASE WHEN EXISTS (SELECT 1 FROM leads l WHERE l.job_posting_id=jp.id) THEN jp.raw_payload ELSE $1::jsonb END,
                 content_hash=CASE WHEN EXISTS (SELECT 1 FROM leads l WHERE l.job_posting_id=jp.id) THEN jp.content_hash ELSE $2 END,
                 hr_contact_id=COALESCE(jp.hr_contact_id,$4)
               WHERE jp.id=$3""",
            json.dumps(safe["raw_payload"]), content_hash_of(safe["raw_payload"]), job_id, contact_id,
        )
        await _record_job_source(sql, str(job_id), safe)
        await _refresh_candidate_job_quality(sql, str(job_id))
        return None

    employer_domain = derive_company_domain(normalized["company_name"], normalized["job_url"])
    company = await sql.fetchrow(
        "SELECT id FROM companies WHERE name=$1 OR domain=$2 LIMIT 1",
        normalized["company_name"], employer_domain or (urlparse(normalized["job_url"]).hostname if normalized["job_url"] else None),
    )
    company_id = company["id"] if company else None
    if not company_id:
        from .utils.india_filter import canonical_company_key
        wanted = canonical_company_key(normalized["company_name"])
        if wanted:
            rows = await sql.fetch("SELECT id,name FROM companies")
            for row in rows:
                if canonical_company_key(row["name"]) == wanted:
                    company_id = row["id"]
                    break
    if not company_id:
        company_id = await sql.fetchval(
            "INSERT INTO companies (name,domain,about) VALUES ($1,$2,$3) RETURNING id",
            normalized["company_name"], employer_domain or (urlparse(normalized["job_url"]).hostname if normalized["job_url"] else None),
            (normalized.get("about_company") or "")[:500] or None,
        )

    if not job_id and company_id:
        job_id = await _find_canonical_job(sql, normalized, str(company_id))
    if job_id:
        contact_id = await save_public_hr_contact(sql, safe, str(company_id))
        if contact_id:
            await sql.execute("UPDATE job_postings SET hr_contact_id=$2 WHERE id=$1 AND hr_contact_id IS NULL", job_id, contact_id)
        await sql.execute("UPDATE job_postings SET last_seen_at=NOW() WHERE id=$1", job_id)
        await _record_job_source(sql, str(job_id), safe)
        await _refresh_candidate_job_quality(sql, str(job_id))
        return None
    else:
        contact_id = await save_public_hr_contact(sql, safe, str(company_id))
        job_id = await sql.fetchval(
            """INSERT INTO job_postings
               (company_id,hr_contact_id,title,description,experience_level,salary_range,job_url,source_site,
                fingerprint,raw_payload,parser_version,content_hash,location,location_type,
                employment_type,apply_url,posted_at,skills,salary_min,salary_max,salary_currency,salary_period,review_status)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,NULLIF($13,''),$14,$15,
                       NULLIF($16,''),$17,$18,$19,$20,$21,$22,'pending')
               ON CONFLICT (fingerprint) DO NOTHING RETURNING id""",
            company_id, contact_id, normalized["job_title"], normalized["about_job"], normalized["experience_required"],
            normalized["salary_range"], normalized["job_url"], normalized["source_site"], fp,
            json.dumps(safe["raw_payload"]), PARSER_VERSION, content_hash_of(safe["raw_payload"]),
            normalized.get("location") or "", normalized.get("location_type"), normalized.get("employment_type"),
            normalized.get("apply_url") or "", normalized.get("posted_at"), normalized.get("skills") or [],
            normalized.get("salary_min"), normalized.get("salary_max"), normalized.get("salary_currency"), normalized.get("salary_period"),
        )
    if not job_id:
        duplicate_id = await sql.fetchval("SELECT id FROM job_postings WHERE fingerprint=$1 LIMIT 1", fp)
        if not duplicate_id:
            return None
        await sql.execute("UPDATE job_postings SET last_seen_at=NOW() WHERE id=$1", duplicate_id)
        await _record_job_source(sql, str(duplicate_id), safe)
        await _refresh_candidate_job_quality(sql, str(duplicate_id))
        return None
    await _record_job_source(sql, str(job_id), safe)
    await _refresh_candidate_job_quality(sql, str(job_id))
    return str(job_id)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10), reraise=True)
async def insert_lead(sql: asyncpg.Connection, normalized: dict[str, Any]) -> str | None:
    """Insert a normalized lead into PostgreSQL with dedup logic per SRS §4.6.

    Returns the lead ID if inserted, None if deduped.
    """
    fp = normalized["fingerprint"]

    # SRS §4.6: Exact fingerprint match within 30-day window = duplicate → dedup
    existing = await sql.fetchval(
        "SELECT id FROM job_postings WHERE fingerprint = $1 AND first_seen_at > NOW() - INTERVAL '30 days' LIMIT 1",
        fp,
    )
    if existing:
        await sql.execute(
            "UPDATE job_postings SET last_seen_at = NOW(), raw_payload = $1, content_hash = $2 WHERE id = $3",
            json.dumps(normalized["raw_payload"]),
            content_hash_of(normalized["raw_payload"]),
            existing,
        )
        await _record_job_source(sql, str(existing), normalized)
        logger.info(f"Lead deduped (fingerprint match): {fp}")
        return None

    # SRS §4.6: Fingerprint exists but older than 30 days → reset window, reuse job_posting
    old_existing = await sql.fetchval(
        "SELECT id FROM job_postings WHERE fingerprint = $1 LIMIT 1",
        fp,
    )
    if old_existing:
        await sql.execute(
            "UPDATE job_postings SET first_seen_at = NOW(), last_seen_at = NOW(), raw_payload = $1, content_hash = $2 WHERE id = $3",
            json.dumps(normalized["raw_payload"]),
            content_hash_of(normalized["raw_payload"]),
            old_existing,
        )
        job_id = old_existing
    else:
        job_id = None

    # SRS §4.6: Fuzzy match (Levenshtein on company+title, threshold 0.85) → possible_duplicate_of
    possible_dup_id = await _find_fuzzy_duplicate(sql, normalized)
    if possible_dup_id:
        logger.info(f"Lead flagged as fuzzy duplicate of {possible_dup_id}: {fp}")

    # Find or create company — using the *employer* domain, never the job-board
    # host (apna.co/naukri.com would misroute every email/OSINT lookup).
    employer_domain = derive_company_domain(normalized["company_name"], normalized["job_url"])
    company = await sql.fetchrow(
        "SELECT id FROM companies WHERE name = $1 OR domain = $2 LIMIT 1",
        normalized["company_name"],
        employer_domain or (urlparse(normalized["job_url"]).hostname if normalized["job_url"] else None),
    )
    company_id = company["id"] if company else None
    if not company_id:
        # Suffix-insensitive fallback ("Adani Group" vs "Adani"): only on an
        # exact/domain miss, so the hot path stays indexed. Display names keep
        # their original form — this only prevents duplicate company rows.
        from .utils.india_filter import canonical_company_key
        want = canonical_company_key(normalized["company_name"])
        if want:
            rows = await sql.fetch("SELECT id, name FROM companies")
            for r in rows:
                if canonical_company_key(r["name"]) == want:
                    company_id = r["id"]
                    logger.info(
                        f"Company matched canonically: {normalized['company_name']} -> {r['name']}"
                    )
                    break
    if not company_id:
        company_id = await sql.fetchval(
            "INSERT INTO companies (name, domain, about) VALUES ($1, $2, $3) RETURNING id",
            normalized["company_name"],
            employer_domain or (urlparse(normalized["job_url"]).hostname if normalized["job_url"] else None),
            normalized["about_company"][:500] if normalized["about_company"] else None,
        )

    if not old_existing and not job_id and company_id:
        job_id = await _find_canonical_job(sql, normalized, str(company_id))
        if job_id:
            await sql.execute("UPDATE job_postings SET last_seen_at = NOW() WHERE id = $1", job_id)
            logger.info(f"Cross-source job matched canonical posting {job_id}: {fp}")

    # Find or create HR contact.
    #
    # A contact is a person AT ONE EMPLOYER, so reuse must be scoped to that
    # employer and must key on a value we actually extracted. Two bugs lived here:
    #
    #  1. `linkedin_url = $1 OR personal_email = $2` with both arguments '' matched
    #     every stored contact whose column was also '' (empty string, not NULL),
    #     because '' = '' is true in SQL. One such row got attached to ~137 leads
    #     across 76 unrelated companies.
    #  2. Even a genuine hit was matched globally, ignoring company: a recruiter
    #     who moves employers, or a search result that surfaces the same popular
    #     profile for many queries, silently became everyone's HR contact.
    #
    # So: only look up non-empty values, and only within this lead's own company.
    hr_lookup_linkedin = (normalized["hr_linkedin_url"] or "").strip()
    hr_lookup_email = (normalized["hr_email"] or "").strip()
    hr_id = None
    if hr_lookup_linkedin or hr_lookup_email:
        hr = await sql.fetchrow(
            """SELECT id FROM hr_contacts
                WHERE current_company_id = $1
                  AND ((linkedin_url IS NOT NULL AND linkedin_url <> ''
                        AND linkedin_url = $2)
                    OR (personal_email IS NOT NULL AND personal_email <> ''
                        AND personal_email = $3))
                LIMIT 1""",
            company_id,
            hr_lookup_linkedin,
            hr_lookup_email,
        )
        hr_id = hr["id"] if hr else None
    # Derive contact_source, contact_method, contact_url from provenance
    provenance = normalized.get("hr_extraction_provenance") or {}
    stages = provenance.get("stages", []) if isinstance(provenance, dict) else []
    first_stage = stages[0] if stages else {}
    contact_source = first_stage.get("source", "") or normalized.get("hr_email_source", "")
    contact_method = first_stage.get("method", "") or normalized.get("hr_email_source", "")
    # Extract URL from provenance stages (search for the first stage with a result URL)
    contact_url = ""
    for stage in stages:
        result = stage.get("result")
        if isinstance(result, dict) and result.get("url"):
            contact_url = result["url"]
            break
    confidence = int(float(first_stage.get("confidence", 0)) * 100) if first_stage else 0
    # A contact row must carry at least one real way to reach the person; a name
    # alone is not contactable and would pollute the table (and the outreach
    # pipeline reads email/mobile/linkedin off this row).
    if normalized["hr_name"] and (hr_lookup_email or hr_lookup_linkedin) and not hr_id:
        hr_id = await sql.fetchval(
            "INSERT INTO hr_contacts (full_name, linkedin_url, personal_email, personal_mobile, "
            "current_company_id, contact_source, contact_method, contact_url, confidence_score, "
            "extraction_provenance) "
            "VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, NULLIF($8, ''), $9, $10) RETURNING id",
            normalized["hr_name"],
            normalized["hr_linkedin_url"],
            normalized["hr_email"],
            normalized["hr_mobile"],
            company_id,
            contact_source,
            contact_method,
            contact_url,
            confidence,
            json.dumps(provenance),
        )
    elif hr_id and normalized.get("hr_extraction_provenance"):
        # Update existing HR contact with provenance
        await sql.execute(
            "UPDATE hr_contacts SET extraction_provenance = $1 WHERE id = $2",
            json.dumps(normalized.get("hr_extraction_provenance", {})),
            hr_id,
        )

    # Insert new job_posting if fingerprint is new
    if not old_existing and not job_id:
        job_id = await sql.fetchval(
            """INSERT INTO job_postings
               (company_id, hr_contact_id, title, description, experience_level,
                salary_range, job_url, source_site, fingerprint, raw_payload,
                parser_version, content_hash, location, location_type, employment_type,
                apply_url, posted_at, skills, salary_min, salary_max, salary_currency, salary_period)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                       NULLIF($13, ''), $14, $15, NULLIF($16, ''), $17, $18, $19, $20, $21, $22)
               RETURNING id""",
            company_id,
            hr_id,
            normalized["job_title"],
            normalized["about_job"],
            normalized["experience_required"],
            normalized["salary_range"],
            normalized["job_url"],
            normalized["source_site"],
            normalized["fingerprint"],
            json.dumps(normalized["raw_payload"]),
            PARSER_VERSION,
            content_hash_of(normalized["raw_payload"]),
            normalized.get("location") or "",
            normalized.get("location_type"),
            normalized.get("employment_type"),
            normalized.get("apply_url") or "",
            normalized.get("posted_at"),
            normalized.get("skills") or [],
            normalized.get("salary_min"),
            normalized.get("salary_max"),
            normalized.get("salary_currency"),
            normalized.get("salary_period"),
        )

    if job_id:
        await _record_job_source(sql, str(job_id), normalized)
        existing_lead = await sql.fetchval("SELECT id FROM leads WHERE job_posting_id = $1 LIMIT 1", job_id)
        if existing_lead:
            return None

    # Insert lead (legal_basis/purpose default at DB level: legitimate-interest B2B outreach)
    lead_id = await sql.fetchval(
        """INSERT INTO leads (job_posting_id, company_id, hr_contact_id, data_quality,
           possible_duplicate_of, hr_extraction_provenance, legal_basis, processing_purpose, provenance)
           VALUES ($1, $2, $3, $4, $5, $6, 'legitimate_interest_b2b', 'b2b_recruitment_outreach',
                   jsonb_build_object('source_site', $7::text, 'discovered_at', now()::text))
           RETURNING id""",
          job_id,
          company_id,
          hr_id,
          normalized["data_quality"],
          possible_dup_id,
          json.dumps(normalized.get("hr_extraction_provenance", {})),
          normalized.get("source_site"),
      )

    return lead_id


async def run_normalizer(
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool,
    concurrency: int | None = None,
) -> int:
    """Consume raw_leads_queue and normalize + persist leads.

    Runs N concurrent consumers. The per-lead HR-discovery cascade is network-bound
    (~5s/lead: LinkedIn/whois/career-page), so a single consumer can't drain a
    2000+ lead army backlog in reasonable time. Concurrency is bounded well under
    the DB pool (max_size=10) so all stages keep working; the pool naturally
    throttles it. Returns only after a worker errors (the loop is otherwise
    infinite). Set NORMALIZER_CONCURRENCY to tune.
    """
    n = concurrency or int(os.environ.get("NORMALIZER_CONCURRENCY", "5"))
    n = max(1, min(n, 8))
    await asyncio.gather(*[_normalize_worker(redis_client, db_pool) for _ in range(n)])
    return 0


async def _normalize_worker(
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool,
) -> int:
    """One normalizer consumer. Multiple run concurrently (see run_normalizer)."""
    inserted = 0
    processed = 0
    legacy_pipeline = legacy_outreach_enabled()

    while True:
        raw_data: Any = None
        raw_msg: Any = None
        try:
            got = await reliable_brpop(redis_client, "raw_leads_queue:requests", timeout=5)
            if got is None:
                continue
            raw_msg, raw_data = got
            processed += 1

            normalized = normalize_lead(raw_data)

            if legacy_pipeline and not normalized["is_fresher"]:
                logger.info(f"Skipping non-fresher job: {normalized['job_title']}")
                await ack(redis_client, "raw_leads_queue:requests", raw_msg)
                continue

            # The legacy India-only filter remains opt-in with the B2B workflow.
            if legacy_pipeline and not normalized.get("is_india", True):
                logger.info(
                    f"Skipping non-India job: {normalized['job_title']} "
                    f"[{normalized.get('source_site')}] loc='{normalized.get('location')}'"
                )
                await ack(redis_client, "raw_leads_queue:requests", raw_msg)
                continue

            if legacy_pipeline:
                # The original recruiter workflow is retained for operators who explicitly opt in.
                normalized = await enrich_hr_data(normalized, db_pool)
            else:
                # Candidate discovery keeps the safe job pipeline, but still
                # checks the job's public listing page for directly published
                # HR contact details. It never runs the legacy OSINT cascade.
                normalized = await enrich_public_job_contact(normalized, db_pool)

            async with db_pool.acquire() as conn:
                record_id = await (insert_lead(conn, normalized) if legacy_pipeline else insert_job_posting(conn, normalized))
                if record_id and legacy_pipeline:
                    inserted += 1
                    await chain_lead(redis_client, "enrichment_queue:requests", record_id, provider="auto", requested_by=normalized.get("requested_by", "system"))
                elif record_id:
                    inserted += 1
                await ack(redis_client, "raw_leads_queue:requests", raw_msg)

        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error in normalizer: {e}")
            if raw_msg is not None:
                await ack(redis_client, "raw_leads_queue:requests", raw_msg)
        except asyncpg.PostgresError as e:
            logger.error(f"PostgreSQL error in normalizer: {e}")
            try:
                if raw_msg is not None:
                    await ack(redis_client, "raw_leads_queue:requests", raw_msg)
                await requeue_or_dlq(redis_client, "raw_leads_queue:requests", raw_data)
            except Exception:  # noqa: BLE001
                pass
        except Exception as e:
            logger.error(f"Unexpected error in normalizer: {e}")
            try:
                if raw_msg is not None:
                    await ack(redis_client, "raw_leads_queue:requests", raw_msg)
                await requeue_or_dlq(redis_client, "raw_leads_queue:requests", raw_data)
            except Exception:  # noqa: BLE001
                pass

    return inserted


async def process_batch(redis_client: redis.Redis, db_pool: asyncpg.Pool, max_items: int = 100) -> dict[str, int]:
    """Process up to max_items from the queue (for batch/cron mode)."""
    inserted = 0
    deduped = 0
    skipped = 0
    errors = 0
    legacy_pipeline = legacy_outreach_enabled()

    for _ in range(max_items):
        try:
            raw_msg = await redis_client.brpop("raw_leads_queue:requests", timeout=2)
            if raw_msg is None:
                break

            raw_data = json.loads(raw_msg[1])
            normalized = normalize_lead(raw_data)

            if legacy_pipeline and not normalized["is_fresher"]:
                skipped += 1
                continue

            if legacy_pipeline and not normalized.get("is_india", True):
                skipped += 1
                continue

            if legacy_pipeline:
                normalized = await enrich_hr_data(normalized, db_pool)
            else:
                normalized = await enrich_public_job_contact(normalized, db_pool)

            async with db_pool.acquire() as conn:
                record_id = await (insert_lead(conn, normalized) if legacy_pipeline else insert_job_posting(conn, normalized))
                if record_id and legacy_pipeline:
                    inserted += 1
                    await chain_lead(redis_client, "enrichment_queue:requests", record_id, provider="auto", requested_by=normalized.get("requested_by", "system"))
                elif record_id:
                    inserted += 1
                else:
                    deduped += 1

        except json.JSONDecodeError:
            errors += 1
            logger.error("JSON decode error in batch normalizer")
        except asyncpg.PostgresError as e:
            errors += 1
            logger.error(f"PostgreSQL error: {e}")
        except Exception as e:
            errors += 1
            logger.error(f"Unexpected error: {e}")

    return {"inserted": inserted, "deduped": deduped, "skipped": skipped, "errors": errors}
