"""
Normalizer worker: consumes raw_leads_queue, normalizes to SRS §4.4 schema,
applies NLP experience re-validation (§4.2b), computes dedup fingerprint (§4.6),
and inserts into PostgreSQL.

Runs as a separate Redis-queue consumer per SRS §9.1 (queue-based stage isolation).

Implements full HR extraction cascade per SRS §4.5:
1. Direct extraction from job postings (§4.5.1)
2. LinkedIn cross-reference for HR profile URL (§4.5.2)
3. Fallback cascade: other HR in same company, generic contacts, WHOIS (§4.5.3)
4. OSINT personal-contact augmentation with holehe (§4.5.4/§4.5.5)

Every stage records provenance: attempted, successful, failed, source,
confidence, method, timestamp.
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
PARSER_VERSION = "3"


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


class NormalizationError(Exception):
    pass


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
    result = {"name": "", "email": "", "linkedin": "", "source": "", "confidence": 0.0}
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
    """Normalize a raw scraped lead to the SRS §4.4 extraction schema.

    Per SRS §9.7: if fields can't be confidently extracted, they are still
    persisted with data_quality='incomplete' — never silently dropped.
    """
    company_name = (raw.get("company_name") or raw.get("company") or "").strip()
    job_title = (raw.get("job_title") or raw.get("title") or "").strip()
    job_url = (raw.get("job_url") or raw.get("url") or "").strip()

    experience_required = raw.get("experience_required") or raw.get("experience", "")
    about_job = raw.get("about_job") or raw.get("description", "")

    # Product correction: India-only scoping. Capture location from whichever
    # field the source populated so the central geo-gate can evaluate it.
    # NOTE: do NOT fall back to experience_required — that field holds years of
    # experience, not a location (fixed in issue #7).
    location = (raw.get("location") or raw.get("job_location")
                or raw.get("city") or "").strip()

    # NLP re-validation per SRS §4.2b: always re-classify using word-boundary matching
    is_fresher = classify_fresher(job_title, str(experience_required), str(about_job))

    # HR Name extraction with fallback cascade per SRS §4.5
    hr_name, hr_name_provenance = extract_hr_name_fallback(raw, company_name)
    hr_contact = extract_hr_contact_fallback(raw, company_name)
    hr_email = hr_contact["email"]
    hr_mobile = hr_contact["mobile"]

    hr_linkedin = raw.get("hr_linkedin_url", "")
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
    incoming_provenance = raw.get("hr_extraction_provenance")
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
        "company_email": raw.get("company_email", ""),
        "hr_mobile": hr_mobile,
        "company_mobile": raw.get("company_mobile", ""),
        "hr_linkedin_url": hr_linkedin,
        "job_title": job_title,
        "about_job": about_job,
        "experience_required": experience_required,
        "location": location,
        "salary_range": raw.get("salary_range", ""),
        "job_url": job_url,
        "source_site": source_site,
        "scraped_at": scraped_at,
        "fingerprint": fingerprint,
        "data_quality": data_quality,
        "is_fresher": is_fresher,
        "is_india": is_india_relevant({"location": location, "about_job": about_job,
                                       "source_site": source_site}),
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
    if not old_existing:
        job_id = await sql.fetchval(
            """INSERT INTO job_postings
               (company_id, hr_contact_id, title, description, experience_level,
                salary_range, job_url, source_site, fingerprint, raw_payload,
                parser_version, content_hash)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        )

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

            if not normalized["is_fresher"]:
                logger.info(f"Skipping non-fresher job: {normalized['job_title']}")
                await ack(redis_client, "raw_leads_queue:requests", raw_msg)
                continue

            # Product correction: India-only. Discard out-of-scope (non-India)
            # records at the filter stage, analogous to the experience filter.
            if not normalized.get("is_india", True):
                logger.info(
                    f"Skipping non-India job: {normalized['job_title']} "
                    f"[{normalized.get('source_site')}] loc='{normalized.get('location')}'"
                )
                await ack(redis_client, "raw_leads_queue:requests", raw_msg)
                continue

            # Enrich HR data with LinkedIn cross-reference and OSINT per SRS §4.5
            normalized = await enrich_hr_data(normalized, db_pool)

            async with db_pool.acquire() as conn:
                lead_id = await insert_lead(conn, normalized)
                if lead_id:
                    inserted += 1
                    await chain_lead(redis_client, "enrichment_queue:requests", lead_id, provider="auto", requested_by=normalized.get("requested_by", "system"))
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

    for _ in range(max_items):
        try:
            raw_msg = await redis_client.brpop("raw_leads_queue:requests", timeout=2)
            if raw_msg is None:
                break

            raw_data = json.loads(raw_msg[1])
            normalized = normalize_lead(raw_data)

            if not normalized["is_fresher"]:
                skipped += 1
                continue

            if not normalized.get("is_india", True):
                skipped += 1
                continue

            # Enrich HR data with LinkedIn cross-reference and OSINT per SRS §4.5
            normalized = await enrich_hr_data(normalized, db_pool)

            async with db_pool.acquire() as conn:
                lead_id = await insert_lead(conn, normalized)
                if lead_id:
                    inserted += 1
                    await chain_lead(redis_client, "enrichment_queue:requests", lead_id, provider="auto", requested_by=normalized.get("requested_by", "system"))
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
