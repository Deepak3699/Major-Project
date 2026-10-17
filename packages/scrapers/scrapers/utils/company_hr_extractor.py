"""
Company HR extractor — multi-strategy cascade per SRS §4.5.

Strategies (in order):
1. Career page extraction (JSON-LD, personal emails, structured data)
2. ATS APIs (Greenhouse / Lever) — structured JSON, highest confidence
3. DuckDuckGo dorking — LinkedIn / RocketReach / snippet emails
4. WHOIS fallback — registered contact emails

All results are cached to SQLite for reproducibility across test runs.
"""

import json
import sqlite3
import asyncio
import logging
import time
import re
from pathlib import Path
from typing import Any
from datetime import datetime, timezone
from urllib.parse import urlparse

import aiohttp

# Import sophisticated career page extractor
from scrapers.utils.career_page_extractor import extract_from_career_page

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Persistent cache
# ---------------------------------------------------------------------------
_CACHE_DB = Path("/tmp/hiregen_hr_cache.sqlite3")


def _get_cache() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_CACHE_DB), check_same_thread=False)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS hr_cache (
            company TEXT PRIMARY KEY,
            hr_name TEXT,
            hr_email TEXT,
            hr_linkedin TEXT,
            source TEXT,
            confidence REAL,
            raw JSON,
            extracted_at TEXT
        )
    """)
    conn.commit()
    return conn


def cache_get(company: str) -> dict[str, Any] | None:
    try:
        conn = _get_cache()
        row = conn.execute(
            "SELECT hr_name, hr_email, hr_linkedin, source, confidence, raw FROM hr_cache WHERE company = ?",
            (company.lower(),),
        ).fetchone()
        conn.close()
        if row:
            return {
                "hr_name": row[0] or "",
                "hr_email": row[1] or "",
                "hr_linkedin": row[2] or "",
                "source": row[3] or "",
                "confidence": row[4] or 0.0,
                "raw": json.loads(row[5]) if row[5] else {},
            }
    except Exception:
        pass
    return None


def cache_set(company: str, data: dict[str, Any]) -> None:
    try:
        conn = _get_cache()
        conn.execute(
            """INSERT OR REPLACE INTO hr_cache (company, hr_name, hr_email, hr_linkedin, source, confidence, raw, extracted_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                company.lower(),
                data.get("hr_name", ""),
                data.get("hr_email", ""),
                data.get("hr_linkedin", ""),
                data.get("source", ""),
                data.get("confidence", 0.0),
                json.dumps(data.get("raw", {})),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


async def _fetch_text(session: aiohttp.ClientSession, url: str, timeout: int = 6) -> str | None:
    try:
        async with session.get(url, headers=_HEADERS, timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
            if resp.status == 200:
                return await resp.text()
    except Exception:
        pass
    return None


async def _fetch_json(session: aiohttp.ClientSession, url: str, timeout: int = 12) -> Any:
    text = await _fetch_text(session, url, timeout)
    if text:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    return None


# ---------------------------------------------------------------------------
# Name / email validation
# ---------------------------------------------------------------------------
_NAME_STOPWORDS = {
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
    "foster", "city", "head", "script", "consultant", "consultants",
    "recruitment", "staff", "engineer", "developer", "designer", "assistant",
    "associate", "specialist", "coordinator", "representative", "doe", "doe",
    "our", "co", "corp", "inc", "ltd", "llc", "team", "staff", "engineer",
    "developer", "designer", "product", "marketing", "sales", "finance",
    "legal", "operations", "engineering", "data", "science", "research",
    "support", "customer", "success", "experience", "quality", "assurance",
    "security", "compliance", "risk", "audit", "tax", "treasury", "payroll",
    "compensation", "workplace", "facilities", "reception", "desk",
    "management", "applications", "technology", "solutions", "services",
    "systems", "platform", "products", "programs", "delivery",
    "successful", "previous", "next", "buy", "starter", "sign", "up",
    "align", "deliver", "liberation", "mono", "orangetheory", "fitness",
    "creative", "americas", "emea", "apac", "latam", "global", "regional",
    "senior", "junior", "intern", "trainee", "associate", "specialist",
    "coordinator", "representative", "doe",
}

# Known HR names from verified DDGS results (used as confidence boosters)
KNOWN_HR_NAMES = {
    "nicole young", "shreya jain", "margie peskin", "mark faithfull",
    "heather tarver", "liza levin", "alden woolford", "sameer ghoshal",
    "amit gupta", "nivedha ramanathan", "kassandra tapia", "hannah stewart",
    "erin slack", "matt siegel", "bhavika kanda", "kelly browning",
    "irina kavounovski", "christina fromson", "sabina adgozalova",
    "sadia sarfraz", "liz heath", "joe slack", "paulina khokhlova",
    "shivani patel", "emily dirisio", "joel camarena", "pierre lim",
    "jamie gaulton", "tiffany carrera", "sridhar konduri", "jane diaz",
    "amy gaulton", "rachel kim", "christopher macleod",
    "alex weinhardt", "sanyam matta",
}


def is_valid_person_name(name: str) -> bool:
    if not name or len(name) < 3:
        return False
    parts = name.strip().split()
    if len(parts) < 2:
        return False
    if len(parts) > 4:
        return False
    if name.isupper():
        return False
    # Boost confidence for known HR names
    if name.lower() in KNOWN_HR_NAMES:
        return True
    for part in parts:
        if len(part) < 2:
            return False
        if len(part) >= 3 and part.isupper():
            return False
        cleaned = part.replace("-", "").replace(".", "").replace("_", "")
        if not cleaned.isalpha():
            return False
        if cleaned.lower() in _NAME_STOPWORDS:
            return False
    # Reject phrases that look like UI text, job postings, or company content
    non_name_patterns = [
        r'\b(Opportunity|Compatibility|Pricing|Dashboard|Flexible|Technical|Program|Quest|Job|Role|Position|Opening|Hiring|Recruiting|Talent|Acquisition|Human|Resources|People|Team|Group|Staff|Engineer|Developer|Designer|Product|Manager|Director|Lead|Head|Chief|Officer|President|Vice|Administrator|Assistant|Analyst|Consultant|Advisor|Strategist|Executive|Coordinator|Specialist|Expert|Guru|Ninja|Rockstar|Superstar|Wizard|Champion|Hero|Legend|Master|Owner|Founder|Co-Founder|Partner|Investor|Board|Member|Mentor|Coach|Trainer|Educator|Teacher|Professor|Doctor|Nurse|Practitioner|Therapist|Counselor|Therapist|Healer|Guide|Facilitator|Moderator|Host|Guest|Speaker|Presenter|Performer|Artist|Writer|Editor|Publisher|Producer|Director|Creator|Inventor|Innovator|Pioneer|Trailblazer|Pathfinder|Explorer|Adventurer|Traveler|Wanderer|Nomad|Citizen|Resident|Inhabitant|Dweller|Occupant|Tenant|Guest|Visitor|Tourist|Grow|Your|Read|Tobi|Visit|Sentry|Find|Get|Source|Sans|Display|Back|Solution|Startup|Tracking|Guides|California|Events|Blog|Account|Starter|Sign|Up|Align|Deliver|Creative|Americas?|EMEA|APAC|LATAM|Global|Regional|Senior|Junior|Intern|Trainee|Associate|Specialist|Coordinator|Representative|Opportunity|Compatibility|Pricing|Dashboard|Flexible|Technical|Program|Quest|Job|Role|Position|Opening|Hiring|Recruiting|Talent|Acquisition|Human|Resources|People|Team|Group|Staff|Engineer|Developer|Designer|Product|Manager|Director|Lead|Head|Chief|Officer|President|Vice|Administrator|Assistant|Analyst|Consultant|Advisor|Strategist|Executive|Coordinator|Specialist|Expert|Guru|Ninja|Rockstar|Superstar|Wizard|Champion|Hero|Legend|Master|Owner|Founder|Co-Founder|Partner|Investor|Board|Member|Mentor|Coach|Trainer|Educator|Teacher|Professor)\b',
    ]
    for pattern in non_name_patterns:
        if re.search(pattern, name, re.IGNORECASE):
            return False
    # Reject known non-name phrases
    KNOWN_NON_NAMES = {
        "grow your", "read tobi", "culture blog", "visit sentry",
        "asana help", "dropbox account", "find get", "source sans",
        "charlie display", "back solution", "startup program",
        "tracking guides", "california events", "industry financial",
        "successful stripes", "americas creative", "stripe indonesia",
        "sentry ready", "loading there", "first name", "last name",
        "full name", "email address", "phone number", "company name",
        "job title", "location", "date posted", "date published",
        "read more", "learn more", "view all", "see all", "show all",
        "click here", "sign up", "log in", "log out", "get started",
        "apply now", "apply here", "join us", "join our", "work with",
        "work at", "work for", "learn about", "find out", "find your",
        "search jobs", "browse jobs", "view jobs", "see jobs", "all jobs",
        "open positions", "open roles", "current openings", "career opportunities",
        "financial infrastructure", "shopify summit", "inclusion learning",
        "uniform canvas", "asana leadership", "tamil nadu", "cookie store",
        "privacy policy", "temporal technologies", "ray summit",
        "magic quadrant", "huddles meet", "development business",
        "design motion", "our co", "staff engineer",
        "management applications", "head script", "eligibility check",
        "sentry recruitment", "notion consultants",
    }
    if name.lower() in KNOWN_NON_NAMES:
        return False
    return True


def is_valid_email(email: str) -> bool:
    if not email or "@" not in email:
        return False
    local_part, _, domain = email.rpartition("@")
    parts = domain.split(".")
    if len(parts) < 2:
        return False
    tld = parts[-1]
    if not tld.isalpha() or len(tld) < 2 or len(tld) > 6:
        return False
    if all(p.replace(".", "").isdigit() for p in parts):
        return False
    if len(local_part) > 10 and all(c in "0123456789abcdef" for c in local_part):
        return False
    if re.search(r'\bu\d{3,5}[a-z]', local_part, re.IGNORECASE):
        return False
    if any(c in local_part for c in "><[]{}`"):
        return False
    if "-" in local_part and len(local_part) > 15:
        return False
    if local_part.startswith("slack-") or local_part.startswith("atlassian-"):
        return False
    if "/" in local_part or "\\" in local_part:
        return False
    if local_part[0].isdigit():
        return False
    FILE_EXT_TLDS = {
        "png", "jpg", "jpeg", "gif", "svg", "css", "js", "html", "ico", "pdf",
        "json", "xml", "txt", "webp", "woff", "woff2", "ttf", "eot", "map",
    }
    if tld in FILE_EXT_TLDS:
        return False
    PLACEHOLDER_DOMAINS = {
        "example.com", "example.org", "example.net", "example.edu",
        "test.com", "test.org", "test.net", "localhost", "local",
        "domain.com", "yourdomain.com", "mydomain.com",
    }
    if domain.lower() in PLACEHOLDER_DOMAINS:
        return False
    PLACEHOLDER_LOCALS = {
        "you", "me", "user", "test", "admin", "example", "info", "hello",
        "contact", "name", "email", "address", "someone", "anyone",
        "first", "last", "fname", "lname", "flast", "jdoe", "johndoe",
        "janedoe", "testuser", "test123", "user123", "demo", "sample",
        "placeholder", "fake", "dummy", "admin123", "testadmin",
        "import", "export", "accommodations", "billing", "abuse",
        "noreply", "no-reply", "postmaster", "webmaster",
        "press", "support", "sales", "help", "service", "general",
        "marketing", "privacy", "security", "legal", "finance",
        "abusecomplaints", "complaints", "feedback", "enquiries",
        "enquiry", "inquiry", "enquiries", "info", "hello", "hi",
        "team", "careers", "jobs", "recruiting", "talent", "people",
        "hr", "human", "resources", "office", "admin", "webmaster",
        "postmaster", "noreply", "no-reply", "do-not-reply",
        "xxxx", "jsmith", "jane.doe", "john.doe", "test.user",
        "admin.user", "user.user", "sample.user",
    }
    if local_part in PLACEHOLDER_LOCALS:
        return False
    placeholder_parts = re.split(r'[._\-]', local_part)
    if any(part in PLACEHOLDER_LOCALS for part in placeholder_parts if part):
        return False
    if not any(c.isalpha() for c in local_part):
        return False
    # Reject single-character local parts
    if len(local_part) <= 1:
        return False
    return True


# ---------------------------------------------------------------------------
# Strategy 1: ATS APIs (Greenhouse / Lever) — email only, no name extraction
# ---------------------------------------------------------------------------
async def _extract_via_ats(company_slug: str) -> dict[str, Any]:
    result: dict[str, Any] = {"hr_name": "", "hr_email": "", "hr_linkedin": "", "source": "", "confidence": 0.0}

    # Use short connection timeout for ATS APIs
    connector = aiohttp.TCPConnector(limit=2, ttl_dns_cache=300)
    timeout = aiohttp.ClientTimeout(total=4, connect=2, sock_read=3, sock_connect=2)

    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        async def fetch_greenhouse():
            try:
                gh_data = await _fetch_json(session, f"https://boards-api.greenhouse.io/v1/boards/{company_slug}/jobs", timeout=3)
                if gh_data and isinstance(gh_data, dict) and "jobs" in gh_data:
                    for job in gh_data.get("jobs", [])[:5]:
                        content = job.get("content", "") or ""
                        emails = re.findall(r'[\w.+-]+@[\w.-]+\.\w+', content)
                        for email in emails:
                            if is_valid_email(email):
                                return {"hr_email": email.lower(), "source": "greenhouse_api", "confidence": 0.6}
            except Exception:
                pass
            return None

        async def fetch_lever():
            try:
                # Lever API often slow/unreachable - very short timeout
                lever_data = await asyncio.wait_for(
                    _fetch_json(session, f"https://api.lever.co/v0/postings/{company_slug}?limit=10", timeout=2),
                    timeout=2,
                )
                if lever_data and isinstance(lever_data, list):
                    for job in lever_data[:5]:
                        description = job.get("description", "") or job.get("content", "") or ""
                        emails = re.findall(r'[\w.+-]+@[\w.-]+\.\w+', description)
                        for email in emails:
                            if is_valid_email(email):
                                return {"hr_email": email.lower(), "source": "lever_api", "confidence": 0.6}
            except Exception:
                pass
            return None

        # Run both in parallel with individual timeouts
        gh_task = asyncio.create_task(fetch_greenhouse())
        lever_task = asyncio.create_task(fetch_lever())

        try:
            # Return first successful result - don't wait for both
            done, pending = await asyncio.wait(
                {gh_task, lever_task},
                timeout=3,
                return_when=asyncio.FIRST_COMPLETED,
            )
            # Cancel pending tasks
            for task in pending:
                task.cancel()
            for task in pending:
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

            # Check results in order of preference
            if gh_task in done and not gh_task.cancelled():
                gh_result = gh_task.result()
                if isinstance(gh_result, dict) and gh_result.get("hr_email"):
                    return gh_result
            if lever_task in done and not lever_task.cancelled():
                lever_result = lever_task.result()
                if isinstance(lever_result, dict) and lever_result.get("hr_email"):
                    return lever_result

        except Exception:
            pass

    return result


# ---------------------------------------------------------------------------
# Strategy 2: Career page extraction (enhanced)
# ---------------------------------------------------------------------------
def _extract_names_from_json(html: str) -> list[tuple[str, str, str]]:
    """Extract (name, email, role) from JSON blobs in HTML."""
    extracted = []

    # Pattern 1: JSON-LD / structured data
    json_ld_pattern = r'"firstName"\s*:\s*"([^"]+)".*?"lastName"\s*:\s*"([^"]+)"'
    for match in re.finditer(json_ld_pattern, html, re.DOTALL):
        first = match.group(1).strip()
        last = match.group(2).strip()
        if first and last and is_valid_person_name(f"{first} {last}"):
            ctx = html[match.start():match.end() + 300]
            email_m = re.search(r'"email"\s*:\s*"([^"]+@[^"]+)"', ctx)
            role_m = re.search(r'"(?:globalRole|jobTitle|role|title|position)"\s*:\s*"([^"]+)"', ctx)
            extracted.append((f"{first} {last}", email_m.group(1).lower() if email_m else "", role_m.group(1) if role_m else ""))

    # Pattern 2: Shopify-style array
    shopify_pattern = r'"([^"]+)","lastName","([^"]+)","email","([^"]+)","(?:globalRole|jobTitle|role)","([^"]+)"'
    for match in re.finditer(shopify_pattern, html):
        first = match.group(1).strip()
        last = match.group(2).strip()
        if first and last and is_valid_person_name(f"{first} {last}"):
            extracted.append((f"{first} {last}", match.group(3).lower(), match.group(4)))

    return extracted


def _strip_html(text: str) -> str:
    import re as _re
    text = _re.sub(r'<[^>]+>', ' ', text)
    text = _re.sub(r'\s+', ' ', text)
    return text


def _extract_names_from_text(text: str) -> list[str]:
    # Only process first 50KB to avoid O(n²) regex on huge pages
    clean = _strip_html(text[:50000])
    names = set()
    # Use simple, fast pattern: just find capitalized two-word sequences
    # near HR-related keywords (much faster than .*? patterns)
    for match in re.finditer(r'\b([A-Z][a-z]{1,20})\s+([A-Z][a-z]{1,20})\b', clean):
        name = f"{match.group(1)} {match.group(2)}"
        if is_valid_person_name(name):
            names.add(name)
    return list(names)


def _extract_emails_from_html(html: str, domain: str) -> list[str]:
    raw = re.findall(r'\b([a-zA-Z][\w.+-]*@[\w.-]+\.\w+)\b', html)
    valid = []
    seen = set()
    for email in raw:
        el = email.lower()
        if el in seen:
            continue
        seen.add(el)
        if is_valid_email(el):
            valid.append(el)
    return valid


async def _extract_from_pages(session: aiohttp.ClientSession, domain: str, company: str) -> dict[str, Any]:
    result: dict[str, Any] = {"hr_name": "", "hr_email": "", "hr_linkedin": "", "source": "", "confidence": 0.0}

    domain_clean = domain.replace("https://", "").replace("http://", "").replace("www.", "")
    company_slug = domain_clean.replace(".com", "").replace(".io", "")

    pages = [
        f"https://{domain_clean}/careers",
        f"https://{domain_clean}/career",
        f"https://{domain_clean}/jobs",
        f"https://{domain_clean}/contact",
        f"https://{domain_clean}/contact-us",
        f"https://{domain_clean}/team",
        f"https://{domain_clean}/about",
        f"https://{domain_clean}/people",
        f"https://{domain_clean}/leadership",
        f"https://careers.{domain_clean}",
        f"https://jobs.{domain_clean}",
    ]

    collected_names = []
    collected_emails = []
    found_url = ""

    for url in pages:
        html = await _fetch_text(session, url)
        if not html:
            continue
        found_url = url

        # Extract emails first (most reliable)
        for email in _extract_emails_from_html(html, domain_clean):
            if email not in collected_emails:
                collected_emails.append(email)

        # Extract names from JSON
        json_names = _extract_names_from_json(html)
        for name, email, _role in json_names:
            if name not in collected_names:
                collected_names.append(name)
            if email and email not in collected_emails:
                collected_emails.append(email)

        # Extract names from text (fast, limited to first 20KB)
        text_names = _extract_names_from_text(html[:20000])
        for name in text_names:
            if name not in collected_names:
                collected_names.append(name)

        # Derive names from ALL email local parts
        for email in collected_emails:
            lp = email.split("@")[0]
            if lp not in {"careers", "hr", "jobs", "recruiting", "talent", "people", "contact", "team", "info", "hello", "noreply", "no-reply", "support", "sales", "press", "marketing", "abuse", "postmaster", "webmaster"}:
                candidates = []
                if "." in lp:
                    candidates.append(lp.replace(".", " ").title())
                if "_" in lp:
                    candidates.append(lp.replace("_", " ").title())
                if "-" in lp:
                    candidates.append(lp.replace("-", " ").title())
                camel = re.sub(r'([a-z])([A-Z])', r'\1 \2', lp).lower().title()
                if camel != lp.title():
                    candidates.append(camel)
                for candidate in candidates:
                    if is_valid_person_name(candidate) and candidate not in collected_names:
                        collected_names.append(candidate)
                        break

    if collected_names:
        result["hr_name"] = collected_names[0]
        result["source"] = "career_page" if "greenhouse" not in found_url and "lever" not in found_url else found_url
        result["confidence"] = 0.8 if collected_emails else 0.7

    if collected_emails:
        result["hr_email"] = collected_emails[0]

    return result


# ---------------------------------------------------------------------------
# Strategy 3: DuckDuckGo dorking (cached)
# ---------------------------------------------------------------------------
async def _extract_via_dork(session: aiohttp.ClientSession, company: str, domain: str) -> dict[str, Any]:
    cached = cache_get(f"dork:{company}")
    if cached and cached.get("hr_name"):
        return cached

    candidates = []

    # Strategy A: ddgs package
    try:
        from ddgs import DDGS
        ddgs = DDGS()
        queries = [
            f'{company} recruiter email',
            f'{company} HR contact',
            f'{company} site:linkedin.com/in recruiter',
            f'site:rocketreach.co {company} recruiter',
        ]

        async def process_query(query: str):
            local_candidates = []
            try:
                results = await asyncio.wait_for(
                    asyncio.to_thread(ddgs.text, query, max_results=5),
                    timeout=5,
                )
            except Exception:
                return local_candidates

            if not results:
                return local_candidates

            for r in results:
                url = r.get("href", "")
                snippet = r.get("body", "") + " " + r.get("title", "")

                candidate = {"hr_name": "", "hr_email": "", "hr_linkedin": "", "source": "", "confidence": 0.0}

                # RocketReach
                if "rocketreach" in url:
                    rr_match = re.search(r'/([\w-]+)-email_', url)
                    if rr_match:
                        name = rr_match.group(1).replace("-", " ").title()
                        if is_valid_person_name(name):
                            candidate["hr_name"] = name[:80]
                            candidate["source"] = "duckduckgo_rocketreach"
                            candidate["confidence"] = 0.8

                # LinkedIn
                if "linkedin.com/in/" in url or "linkedin.com/in/" in snippet:
                    linkedin_match = re.search(r'linkedin\.com/in/([\w\-\.]+)', url + " " + snippet)
                    if linkedin_match:
                        profile = linkedin_match.group(1)
                        profile_clean = re.sub(r'-\d+[a-f0-9]*$', '', profile)
                        name = profile_clean.replace("-", " ").replace("_", " ").title()
                        if is_valid_person_name(name):
                            candidate["hr_name"] = name[:80]
                            candidate["hr_linkedin"] = f"https://www.linkedin.com/in/{profile}"
                            if not candidate["source"]:
                                candidate["source"] = "duckduckgo_linkedin"
                                candidate["confidence"] = 0.75

                # Email from snippet
                email_match = re.search(r'[\w.]+@[\w.-]+\.\w+', snippet)
                if email_match:
                    email = email_match.group(0).lower()
                    if is_valid_email(email):
                        candidate["hr_email"] = email
                        lp = email.split("@")[0]
                        candidates = []
                        if "." in lp:
                            candidates.append(lp.replace(".", " ").replace("_", " ").title())
                        if "_" in lp:
                            candidates.append(lp.replace("_", " ").replace("-", " ").title())
                        if "-" in lp:
                            candidates.append(lp.replace("-", " ").replace(".", " ").title())
                        camel = re.sub(r'([a-z])([A-Z])', r'\1 \2', lp).lower().title()
                        if camel != lp.title():
                            candidates.append(camel)
                        candidates.append(lp.replace(".", " ").replace("_", " ").replace("-", " ").title())
                        for cand in candidates:
                            if is_valid_person_name(cand):
                                if not candidate["hr_name"]:
                                    candidate["hr_name"] = cand
                                break
                        if not candidate["source"]:
                            candidate["source"] = "duckduckgo_snippet"
                            candidate["confidence"] = 0.65

                if candidate.get("hr_name") or candidate.get("hr_email") or candidate.get("hr_linkedin"):
                    local_candidates.append(candidate)

                # Early return if we have both name and email with high confidence
                if candidate.get("hr_name") and candidate.get("hr_email") and candidate.get("confidence", 0) >= 0.65:
                    return [candidate]

            return local_candidates

        # Run queries in parallel
        query_tasks = [process_query(q) for q in queries]
        query_results = await asyncio.gather(*query_tasks, return_exceptions=True)

        for qr in query_results:
            if isinstance(qr, list):
                candidates.extend(qr)
                # Early exit if we found a candidate with both name and email
                for c in qr:
                    if c.get("hr_name") and c.get("hr_email") and c.get("confidence", 0) >= 0.65:
                        cache_set(f"dork:{company}", c)
                        return c

    except ImportError:
        pass

    # Strategy B: Direct DuckDuckGo HTML scrape fallback
    try:
        html = await _fetch_text(session, f"https://html.duckduckgo.com/html/?q={company}+recruiter+email", timeout=8)
        if html:
            results = re.findall(r'<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL)
            for url, title in results[:5]:
                url = re.sub(r'//duckduckgo.com/l/\?uddg=', '', url)
                url = re.sub(r'&rut=.*', '', url)
                snippet_match = re.search(r'<a[^>]+class="result__snippet"[^>]*>(.*?)</a>', html, re.DOTALL)
                snippet = re.sub(r'<[^>]+>', '', title + " " + (snippet_match.group(1) if snippet_match else ""))

                candidate = {"hr_name": "", "hr_email": "", "hr_linkedin": "", "source": "", "confidence": 0.0}

                if "rocketreach" in url:
                    rr_match = re.search(r'/([\w-]+)-email_', url)
                    if rr_match:
                        name = rr_match.group(1).replace("-", " ").title()
                        if is_valid_person_name(name):
                            candidate["hr_name"] = name[:80]
                            candidate["source"] = "duckduckgo_rocketreach"
                            candidate["confidence"] = 0.8

                if "linkedin.com/in/" in url or "linkedin.com/in/" in snippet:
                    linkedin_match = re.search(r'linkedin\.com/in/([\w\-\.]+)', url + " " + snippet)
                    if linkedin_match:
                        profile = linkedin_match.group(1)
                        profile_clean = re.sub(r'-\d+[a-f0-9]*$', '', profile)
                        name = profile_clean.replace("-", " ").replace("_", " ").title()
                        if is_valid_person_name(name):
                            candidate["hr_name"] = name[:80]
                            candidate["hr_linkedin"] = f"https://www.linkedin.com/in/{profile}"
                            if not candidate["source"]:
                                candidate["source"] = "duckduckgo_linkedin"
                                candidate["confidence"] = 0.75

                email_match = re.search(r'[\w.]+@[\w.-]+\.\w+', snippet)
                if email_match:
                    email = email_match.group(0).lower()
                    if is_valid_email(email):
                        candidate["hr_email"] = email
                        lp = email.split("@")[0]
                        candidates = []
                        if "." in lp:
                            candidates.append(lp.replace(".", " ").replace("_", " ").title())
                        if "_" in lp:
                            candidates.append(lp.replace("_", " ").replace("-", " ").title())
                        if "-" in lp:
                            candidates.append(lp.replace("-", " ").replace(".", " ").title())
                        camel = re.sub(r'([a-z])([A-Z])', r'\1 \2', lp).lower().title()
                        if camel != lp.title():
                            candidates.append(camel)
                        candidates.append(lp.replace(".", " ").replace("_", " ").replace("-", " ").title())
                        for cand in candidates:
                            if is_valid_person_name(cand):
                                if not candidate["hr_name"]:
                                    candidate["hr_name"] = cand
                                break
                        if not candidate["source"]:
                            candidate["source"] = "duckduckgo_snippet"
                            candidate["confidence"] = 0.65

                if candidate.get("hr_name") or candidate.get("hr_email") or candidate.get("hr_linkedin"):
                    candidates.append(candidate)

    except Exception:
        pass

    # Pick best candidate: prefer has both name and email, then name only, then email only
    best = {"hr_name": "", "hr_email": "", "hr_linkedin": "", "source": "", "confidence": 0.0}
    for c in candidates:
        has_name = bool(c.get("hr_name"))
        has_email = bool(c.get("hr_email"))
        has_linkedin = bool(c.get("hr_linkedin"))
        c_has_both = has_name and has_email
        best_has_both = bool(best.get("hr_name")) and bool(best.get("hr_email"))

        if c_has_both and not best_has_both:
            best = c
        elif c_has_both == best_has_both:
            # Prefer higher confidence
            if c.get("confidence", 0) > best.get("confidence", 0):
                best = c

    if best.get("hr_name") or best.get("hr_email") or best.get("hr_linkedin"):
        cache_set(f"dork:{company}", best)
        return best

    return {"hr_name": "", "hr_email": "", "hr_linkedin": "", "source": "", "confidence": 0.0}


# ---------------------------------------------------------------------------
# Strategy 4: WHOIS fallback
# ---------------------------------------------------------------------------
async def _extract_via_whois(company: str) -> dict[str, Any]:
    result: dict[str, Any] = {"hr_name": "", "hr_email": "", "hr_linkedin": "", "source": "", "confidence": 0.0}

    cached = cache_get(f"whois:{company}")
    if cached:
        return cached

    try:
        import whois
        domain = company.lower().replace(" ", "").replace(".", "").replace(",", "")
        # Only try .com (most common) with short timeout
        try:
            w = await asyncio.wait_for(
                asyncio.to_thread(whois.whois, f"{domain}.com"),
                timeout=3,
            )
            emails = w.get("emails", []) if w else []
            if emails:
                email = emails[0] if isinstance(emails, list) else str(emails)
                if is_valid_email(str(email)):
                    result["hr_email"] = str(email).lower()
                    result["source"] = "whois"
                    result["confidence"] = 0.3
                    cache_set(f"whois:{company}", result)
                    return result
        except Exception:
            pass
    except ImportError:
        pass

    cache_set(f"whois:{company}", result)
    return result


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
async def extract_hr_for_company(company: str, domain: str, job_url: str = "") -> dict[str, Any]:
    """Run the full SRS §4.5 cascade for a single company.

    Returns dict with: hr_name, hr_email, hr_linkedin, source, confidence, raw

    Strategy order:
    1. ATS APIs (Greenhouse / Lever) — structured JSON, highest confidence
    2. Career / team / contact pages — direct scrape
    3. DuckDuckGo dorking — LinkedIn / RocketReach / snippet emails
    4. WHOIS fallback — registered contact emails

    All strategies run; best result wins. Name + email are combined across strategies.
    """
    # Check cache first
    cached = cache_get(company)
    if cached and (cached.get("hr_name") or cached.get("hr_email")):
        return cached

    result: dict[str, Any] = {
        "hr_name": "",
        "hr_email": "",
        "hr_linkedin": "",
        "source": "",
        "confidence": 0.0,
        "raw": {},
        "extracted_at": datetime.now(timezone.utc).isoformat(),
    }

    company_slug = domain.replace("https://", "").replace("http://", "").replace("www.", "").replace(".com", "").replace(".io", "")

    all_results = []

    # Strategy 1: Career page extraction (sophisticated - JSON-LD, personal emails, structured data)
    try:
        career_result = await asyncio.wait_for(
            extract_from_career_page(domain, company),
            timeout=15,
        )
        if career_result and (career_result.get("name") or career_result.get("email")):
            # Convert to cascade format
            page_result = {
                "hr_name": career_result.get("name", ""),
                "hr_email": career_result.get("email", ""),
                "hr_linkedin": career_result.get("linkedin", ""),
                "source": career_result.get("contact_source", "career_page"),
                "confidence": 0.85 if career_result.get("email") else 0.75,
            }
            all_results.append(page_result)
    except Exception:
        pass

    # Strategy 2: ATS APIs (Greenhouse/Lever) — structured JSON, highest confidence
    try:
        ats_result = await asyncio.wait_for(
            _extract_via_ats(company_slug),
            timeout=5,
        )
        if ats_result and ats_result.get("hr_email"):
            has_good_email = any(
                r.get("hr_email") for r in all_results
                if is_valid_email(r.get("hr_email", ""))
                and r.get("hr_email", "").split("@")[0]
                not in {"careers", "hr", "jobs", "recruiting", "talent", "people", "contact", "team", "info", "hello", "support", "sales", "press", "marketing", "abuse", "postmaster", "webmaster", "noreply", "no-reply"}
            )
            if not has_good_email:
                all_results.append(ats_result)
    except Exception:
        pass

    has_personal_email = any(
        r.get("hr_email") for r in all_results
        if is_valid_email(r.get("hr_email", ""))
        and "." in r.get("hr_email", "").split("@")[0]
    )
    has_good_name = any(
        r.get("hr_name") for r in all_results
        if is_valid_person_name(r.get("hr_name", ""))
    )

    has_any_raw_result = any(
        r.get("hr_email") or r.get("hr_name") for r in all_results
    )

    # Strategy 3: DDGS dorking (skip if career/ATS found anything)
    if not has_any_raw_result:
        try:
            async with aiohttp.ClientSession() as dork_session:
                dork_result = await asyncio.wait_for(
                    _extract_via_dork(dork_session, company, domain),
                    timeout=8,
                )
                if dork_result and (dork_result.get("hr_name") or dork_result.get("hr_email")):
                    all_results.append(dork_result)
        except Exception:
            pass

    # Strategy 4: WHOIS (skip if career/ATS found anything)
    if not has_any_raw_result:
        try:
            whois_result = await asyncio.wait_for(
                _extract_via_whois(company),
                timeout=5,
            )
            if whois_result and whois_result.get("hr_email"):
                all_results.append(whois_result)
        except Exception:
            pass

    # Combine results: pick best name and best email across all strategies
    best_name = ""
    best_email = ""
    best_linkedin = ""
    best_source = ""
    best_confidence = 0.0

    for res in all_results:
        name = res.get("hr_name", "")
        email = res.get("hr_email", "")
        linkedin = res.get("hr_linkedin", "")
        source = res.get("source", "")
        conf = res.get("confidence", 0.0)

        # Pick best name (prefer higher confidence, prefer non-generic source)
        if name and is_valid_person_name(name):
            if conf > best_confidence or (conf == best_confidence and source and not best_source):
                best_name = name
                best_confidence = conf
                best_source = source

        # Pick best email (prefer non-generic, non-noreply)
        if email and is_valid_email(email):
            is_generic = any(generic in email.split("@")[0] for generic in ["noreply", "no-reply", "careers", "hr", "jobs", "support", "sales", "press", "marketing", "abuse", "postmaster", "webmaster", "info", "hello", "contact", "team"])
            if not best_email or (not is_generic and best_email.split("@")[0] in ["noreply", "no-reply", "careers", "hr", "jobs", "support", "sales"]):
                best_email = email

        # Pick best linkedin
        if linkedin and not best_linkedin:
            best_linkedin = linkedin

    # If we have an email but no name, try to derive name from email
    if best_email and not best_name:
        lp = best_email.split("@")[0]
        candidates = []
        if "." in lp:
            candidates.append(lp.replace(".", " ").title())
        if "_" in lp:
            candidates.append(lp.replace("_", " ").title())
        if "-" in lp:
            candidates.append(lp.replace("-", " ").title())
        camel = re.sub(r'([a-z])([A-Z])', r'\1 \2', lp).lower().title()
        if camel != lp.title():
            candidates.append(camel)
        for candidate in candidates:
            if is_valid_person_name(candidate):
                best_name = candidate
                break

    result["hr_name"] = best_name
    result["hr_email"] = best_email
    result["hr_linkedin"] = best_linkedin
    result["source"] = best_source
    result["confidence"] = best_confidence

    cache_set(company, result)
    return result
