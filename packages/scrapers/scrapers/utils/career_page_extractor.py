"""
Career page contact extraction utility.

SRS §4.5 Direct extraction: extracts HR contact information directly
from company career pages, contact pages, and job posting pages.

A contact is considered 'directly-found' if it is discovered from the
company's own web pages (career pages, contact pages, job posting pages)
via live scraping — not from enrichment providers and not from pattern
generation.

Per SRS §16.3, 'directly-found non-enriched contact' requires:
  - source: career page / contact page / job posting page
  - URL/origin: the page where the contact was found
  - extraction method: the specific technique used
  - timestamp: when it was extracted
  - evidence: the actual HTML content or context where the contact appears
"""

import re
import logging
import asyncio
from typing import Any
from urllib.parse import urlparse
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Regex for email extraction
EMAIL_REGEX = re.compile(r'\b([a-zA-Z][\w.+-]*@[\w.-]+\.\w+)\b')

# Regex for phone extraction
PHONE_REGEX = re.compile(r'\b(\+?\d[\d\s\-\(\)]{7,}\d)\b')

# Only check the most likely pages to keep extraction fast
CAREER_PAGE_PATTERNS = [
    '{domain}/careers',
    '{domain}/career',
    '{domain}/jobs',
]

CONTACT_PAGE_PATTERNS = [
    '{domain}/contact',
    '{domain}/contact-us',
]

# Additional pages that may contain HR/team info
TEAM_PAGE_PATTERNS = [
    '{domain}/team',
    '{domain}/about',
    '{domain}/people',
    '{domain}/leadership',
]

# Subdomain variants (e.g., careers.shopify.com)
CAREER_SUBDOMAIN_PATTERNS = [
    'https://careers.{domain}',
    'https://jobs.{domain}',
    'https://talent.{domain}',
]

# ATS-specific patterns (Greenhouse, Lever, etc.)
ATS_PATTERNS = [
    'https://boards.greenhouse.io/{company}',
    'https://jobs.lever.co/{company}',
]

# Generic role emails that do NOT count as direct HR contacts
GENERIC_LOCAL_PARTS = {
    'careers', 'hr', 'jobs', 'recruiting', 'talent', 'people',
    'contact', 'team', 'info', 'hello', 'support', 'admin',
    'press', 'media', 'abuse', 'postmaster', 'noreply', 'no-reply',
    'service', 'help', 'sales', 'general',
}


async def fetch_page(url: str, session=None, timeout: int = 15) -> str | None:
    """Fetch a web page and return its HTML content."""
    import aiohttp

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    client_timeout = aiohttp.ClientTimeout(total=timeout)

    if session is None:
        try:
            async with aiohttp.ClientSession(timeout=client_timeout) as s:
                async with s.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        return await resp.text()
                    return None
        except asyncio.TimeoutError:
            return None
        except Exception:
            return None
    else:
        try:
            async with session.get(url, headers=headers, timeout=client_timeout) as resp:
                if resp.status == 200:
                    return await resp.text()
                return None
        except asyncio.TimeoutError:
            return None
        except Exception:
            return None


def is_generic_email(email: str) -> bool:
    """Check if an email is a generic role account, NOT a direct HR contact."""
    local_part = email.lower().split('@')[0]
    return local_part in GENERIC_LOCAL_PARTS


def normalize_mobile_e164(raw: str) -> str:
    """Normalize an Indian mobile number to E.164 (+91XXXXXXXXXX).

    India-first product + WhatsApp/Meta Cloud API require a country-coded E.164
    number, yet scraped mobiles arrive as '98765 43210', '09876543210',
    '0091-98765-43210', '+91 98765 43210', or a bare 10-digit. Returns E.164 or
    '' if the input is not a plausible 10-digit Indian mobile (never fabricates,
    never accepts landlines/too-short as if they were reachable).

    Indian mobile rule (stdlib, no phonenumbers dep): local part is 10 digits
    starting 6-9; a leading 0 / 00 / 0091 / +91 / 91 prefix is stripped/normalized.
    """
    if not raw:
        return ""
    s = raw.strip()
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    # reduce to the 10-digit national number by peeling known prefixes
    if digits.startswith("00"):        # international access code 00 -> +
        digits = digits[2:]
    if digits.startswith("91") and len(digits) > 10:   # country code
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 11:   # leading trunk zero
        digits = digits[1:]
    if len(digits) == 10 and digits[0] in "6789":
        return f"+91{digits}"
    return ""                            # not a valid Indian mobile


def is_valid_email_format(email: str) -> bool:
    """Reject garbage emails that match the regex but aren't real email addresses.

    Filters out:
    - Version-number domains (e.g., alpinejs@3.13.7)
    - File-extension TLDs (e.g., logo@2x.png)
    - Base64 hash local parts (too long, all hex)
    - CSS class-like local parts
    - Unicode escape artifacts
    """
    if not email or "@" not in email:
        return False

    local_part, _, domain = email.rpartition("@")

    # Domain must look like a real domain: at least one dot, TLD must be alphabetic 2-6 chars
    parts = domain.split(".")
    if len(parts) < 2:
        return False

    tld = parts[-1]
    if not tld.isalpha() or len(tld) < 2 or len(tld) > 6:
        return False

    # Reject version-number domains (e.g., 3.13.7)
    if all(p.replace(".", "").isdigit() for p in parts):
        return False

    # Reject known placeholder/example domains
    PLACEHOLDER_DOMAINS = {
        "example.com", "example.org", "example.net", "example.edu",
        "test.com", "test.org", "test.net", "localhost", "local",
        "domain.com", "yourdomain.com", "mydomain.com",
    }
    if domain.lower() in PLACEHOLDER_DOMAINS:
        return False

    # Reject placeholder local parts
    PLACEHOLDER_LOCAL_PARTS = {
        "you", "me", "user", "test", "admin", "example", "info", "hello",
        "contact", "name", "email", "address", "someone", "anyone",
    }
    if local_part in PLACEHOLDER_LOCAL_PARTS:
        return False

    # Reject hex-only local parts longer than 10 chars (base64 hashes)
    if len(local_part) > 10 and all(c in "0123456789abcdef" for c in local_part):
        return False

    # Reject local parts containing JSON unicode-escape artifacts (e.g., u003eaccount)
    if re.search(r'\bu\d{3,5}[a-z]', local_part, re.IGNORECASE):
        return False

    # Reject local parts containing ">" or other HTML artifacts
    if any(c in local_part for c in "><[]{}`"):
        return False

    # Reject local parts that look like CSS class names or file paths
    if "-" in local_part and len(local_part) > 15:
        return False

    # Reject common non-email patterns found in HTML
    if local_part.startswith("slack-") or local_part.startswith("atlassian-"):
        return False

    # Reject local parts that look like file paths or CSS selectors
    if "/" in local_part or "\\" in local_part:
        return False

    # Reject local parts starting with numbers
    if local_part[0].isdigit():
        return False

    # Reject common test/placeholder email local parts
    TEST_EMAIL_LOCALS = {
        "jdoe", "johndoe", "janedoe", "testuser", "test123", "user123",
        "demo", "sample", "example", "placeholder", "fake", "dummy",
        "admin123", "testadmin", "test@test", "info@test",
    }
    if local_part in TEST_EMAIL_LOCALS:
        return False

    # Reject file-extension TLDs (e.g., 2x.png where png is not a real domain TLD)
    FILE_EXTENSION_TLDS = {
        "png", "jpg", "jpeg", "gif", "svg", "css", "js", "html", "ico", "pdf",
        "json", "xml", "txt", "webp", "woff", "woff2", "ttf", "eot", "map",
    }
    if tld in FILE_EXTENSION_TLDS:
        return False

    # Local part must contain at least one letter
    if not any(c.isalpha() for c in local_part):
        return False

    return True


def is_personal_email(email: str, company_domain: str) -> bool:
    """Check if an email is a personal address on the company domain."""
    email_lower = email.lower()
    company_domain = company_domain.replace("www.", "")
    return email_lower.endswith(f"@{company_domain}") and not is_generic_email(email_lower)


def extract_names_from_json(html: str) -> list[tuple[str, str, str]]:
    """Extract HR/recruiter names, emails, and roles from structured JSON data.
    
    Handles multiple JSON formats found on career pages:
    1. Standard JSON-LD: {"firstName": "John", "lastName": "Smith", ...}
    2. Shopify-style: {"firstName":"Margie","lastName":"Peskin","email":"margie.peskin@shopify.com","globalRole":"Elevated Access",...}
    
    Returns list of (name, email, role) tuples.
    """
    extracted = []

    # Pattern 1: Standard JSON-LD format — {"firstName": "John", "lastName": "Smith"}
    # Also handles compact format: {"firstName":"John","lastName":"Smith"}
    json_ld_pattern = r'"firstName"\s*:\s*"([^"]+)".*?"lastName"\s*:\s*"([^"]+)"'
    for match in re.finditer(json_ld_pattern, html, re.DOTALL):
        first = match.group(1).strip()
        last = match.group(2).strip()
        if first and last and _is_valid_person_name(f"{first} {last}"):
            email_match = re.search(
                r'"email"\s*:\s*"([^"]+@[^"]+)"',
                html[match.start():match.end() + 200],
            )
            role_match = re.search(
                r'"(?:globalRole|jobTitle|role|title)"\s*:\s*"([^"]+)"',
                html[match.start():match.end() + 200],
            )
            extracted.append((
                f"{first} {last}",
                email_match.group(1).lower() if email_match else "",
                role_match.group(1) if role_match else "",
            ))

    # Pattern 2: Shopify-style array format
    # ["Margie","lastName","Peskin","email","margie.peskin@shopify.com","globalRole","Elevated Access"]
    shopify_pattern = r'"([^"]+)","lastName","([^"]+)","email","([^"]+)","(?:globalRole|jobTitle|role)","([^"]+)"'
    for match in re.finditer(shopify_pattern, html):
        first = match.group(1).strip()
        last = match.group(2).strip()
        email = match.group(3).strip()
        role = match.group(4).strip()
        if first and last and _is_valid_person_name(f"{first} {last}"):
            extracted.append((f"{first} {last}", email.lower(), role))

    return extracted


_NAME_STOPWORDS = {
    "the", "and", "team", "will", "contact", "contacting", "other", "tasks",
    "screen", "virtual", "interview", "interviewing", "class", "span", "div",
    "icon", "logo", "white", "blue", "color", "onecolor", "import", "about",
    "more", "career", "careers", "hiring", "recruiting", "human", "resources",
    "company", "people", "talent", "acquisition", "manager", "lead", "group",
    "screen", "form", "page", "section", "header", "footer", "nav", "menu",
    "click", "here", "learn", "view", "join", "apply", "explore",
    "eligibility", "check", "benefits", "administrator", "san", "francisco",
    "tokyo", "london", "paris", "berlin", "dublin", "amsterdam", "singapore",
    "sydney", "remote", "office", "location", "site", "hub", "center", "campus",
    "eligibility check", "benefits administrator", "san francisco", "new york",
    "boston", "austin", "seattle", "chicago", "denver", "atlanta", "miami",
    "portland", "raleigh", "durham", "research triangle", "palo alto",
    "mountain view", "sunnyvale", "cupertino", "redwood city", "foster city",
    "head", "script", "eligibility", "check",
}


def _is_valid_person_name(name: str) -> bool:
    """Validate that a string looks like a real person's name."""
    if not name or len(name) < 3:
        return False
    parts = name.split()
    if len(parts) < 2:
        return False
    for part in parts:
        # Reject all-uppercase parts (acronyms like "EMEA", "GTM", "NYC")
        if len(part) >= 3 and part.isupper():
            return False
        if not part[0].isupper():
            return False
        cleaned = part.replace("-", "").replace(".", "").replace("_", "")
        if not cleaned.isalpha():
            return False
        for word in cleaned.lower().split():
            if word in _NAME_STOPWORDS:
                return False
    return True


def _strip_html_tags(text: str) -> str:
    """Remove HTML tags from text, preserving text content."""
    import re as _re
    text = _re.sub(r'<[^>]+>', ' ', text)
    text = _re.sub(r'\s+', ' ', text)
    return text


def extract_names_from_text(text: str) -> list[str]:
    """Extract potential HR/recruiter names from text.

    Strips HTML tags first, then applies name patterns with strict validation.
    """
    clean_text = _strip_html_tags(text[:20000])
    names = set()

    patterns = [
        r'\b([A-Z][a-z]+ [A-Z][a-z]+)\b.*?(?:\bRecruiter\b|\bTalent Acquisition\b|\bHiring Manager\b|\bHR Contact\b|\bPeople Team\b)',
        r'(?:\bRecruiter\b|\bTalent Acquisition\b|\bHiring Manager\b|\bHR Contact\b).*?\b([A-Z][a-z]+ [A-Z][a-z]+)\b',
        r'\b([A-Z][a-z]+ [A-Z][a-z]+),\s*(?:Recruiter|Talent|Hiring|HR|People)\b',
    ]

    for pattern in patterns:
        for match in re.finditer(pattern, clean_text, re.IGNORECASE):
            name = match.group(1).strip()
            if _is_valid_person_name(name):
                names.add(name)

    return list(names)


async def extract_from_career_page(
    company_domain: str,
    company_name: str,
    session=None
) -> dict[str, Any]:
    """Extract direct HR contact info from company career/contact pages.
    
    This is SRS §4.5 'Direct extraction' — finding contacts directly on
    the company's own website (career pages, contact pages).
    
    Returns:
        dict with: name, email, mobile, linkedin, contact_source, extraction_method,
                   contact_url, timestamp, evidence
    """
    result = {
        "name": "",
        "email": "",
        "mobile": "",
        "linkedin": "",
        "contact_source": "",
        "extraction_method": "",
        "contact_url": "",
        "timestamp": "",
        "evidence": "",
    }
    
    if not company_domain:
        return result
    
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    domain_clean = company_domain.replace("https://", "").replace("http://", "").replace("www.", "")
    
    # Build candidate URLs — prioritize career pages, then contact pages, then team pages
    pages_to_check = []
    for pattern in CAREER_PAGE_PATTERNS + CONTACT_PAGE_PATTERNS + TEAM_PAGE_PATTERNS:
        pages_to_check.append(f"https://{domain_clean}{pattern.format(domain='')}")
    for pattern in CAREER_SUBDOMAIN_PATTERNS:
        pages_to_check.append(pattern.format(domain=domain_clean))
    for pattern in ATS_PATTERNS:
        pages_to_check.append(pattern.format(domain=domain_clean, company=domain_clean.replace(".com", "")))
    
    collected_emails = []
    collected_phones = []
    collected_names = []
    found_url = ""
    
    # Fetch pages in parallel with individual timeouts, process results as they complete
    async def fetch_and_extract(url: str):
        try:
            html = await asyncio.wait_for(
                fetch_page(url, session, timeout=8),
                timeout=10
            )
            return url, html
        except Exception:
            return url, None

    # Fetch up to 6 pages in parallel (reduced from 8 for speed)
    tasks = [fetch_and_extract(url) for url in pages_to_check[:6]]
    try:
        page_results = await asyncio.wait_for(asyncio.gather(*tasks), timeout=8)
    except asyncio.TimeoutError:
        page_results = []
    
    for page_result in page_results:
        if isinstance(page_result, Exception):
            continue
        url, html = page_result
        if not html:
            continue
            
        found_url = url

        # Extract names from JSON data first (most reliable)
        json_names = extract_names_from_json(html)
        if json_names:
            for name, email, role in json_names:
                collected_names.append(name)
                if email and is_valid_email_format(email) and email not in collected_emails:
                    collected_emails.append(email)

        # Only fall back to text extraction if no JSON names found
        if not collected_names:
            text_names = extract_names_from_text(html)
            for name in text_names:
                if _is_valid_person_name(name) and name not in collected_names:
                    collected_names.append(name)

        # Extract emails
        emails = EMAIL_REGEX.findall(html)
        for email in emails:
            email_lower = email.lower()
            if not is_valid_email_format(email_lower):
                continue
            if email_lower not in collected_emails:
                if is_personal_email(email_lower, domain_clean):
                    collected_emails.append(email_lower)
                elif not is_generic_email(email_lower):
                    collected_emails.append(email_lower)

        # Extract phones
        phones = PHONE_REGEX.findall(html)
        collected_phones.extend(phones)

        # If we found emails, we can stop (but we already fetched in parallel)
        if collected_emails:
            break
    
    # Deduplicate emails
    seen_emails = set()
    unique_emails = []
    for email in collected_emails:
        if email.lower() not in seen_emails:
            seen_emails.add(email.lower())
            unique_emails.append(email)

    # Filter to only valid personal emails
    valid_personal = [e for e in unique_emails if is_personal_email(e.lower(), domain_clean) and is_valid_email_format(e)]
    valid_role = [e for e in unique_emails if e not in valid_personal and not is_generic_email(e)]

    if valid_personal:
        result["email"] = valid_personal[0]
        result["contact_source"] = "direct_career_page"
        result["extraction_method"] = "regex_from_career_page_html"
        result["contact_url"] = found_url
    elif valid_role:
        result["email"] = valid_role[0]
        result["contact_source"] = "direct_career_page"
        result["extraction_method"] = "regex_from_career_page_html"
        result["contact_url"] = found_url

    # Also extract name from email local part if no name found
    if not collected_names and result["email"]:
        local_part = result["email"].split('@')[0]
        if '.' in local_part and local_part not in GENERIC_LOCAL_PARTS:
            name_from_email = local_part.replace('.', ' ').replace('_', ' ').title()
            if _is_valid_person_name(name_from_email):
                collected_names = [name_from_email]

    # Deduplicate names, prioritizing valid person names
    valid_names = [n for n in collected_names if n and _is_valid_person_name(n)]
    if valid_names:
        result["name"] = valid_names[0]

    return result


async def extract_from_job_posting_page(
    job_url: str,
    session=None
) -> dict[str, Any]:
    """Extract HR contact info directly from a job posting page.
    
    Many job posting pages list the recruiter/HR person directly.
    This is the strongest form of 'Direct extraction' per SRS §4.5.1.
    """
    result = {
        "name": "",
        "email": "",
        "mobile": "",
        "linkedin": "",
        "contact_source": "",
        "extraction_method": "",
        "contact_url": "",
        "timestamp": "",
        "evidence": "",
    }
    
    result["timestamp"] = datetime.now(timezone.utc).isoformat()
    
    try:
        html = await asyncio.wait_for(
            fetch_page(job_url, session, timeout=10),
            timeout=12
        )
        if not html:
            return result
        
        result["contact_url"] = job_url
        
        # Extract names from JSON data
        json_names = extract_names_from_json(html)
        if json_names:
            result["name"] = json_names[0][0]  # tuple is (name, email, role)
            if json_names[0][1]:  # email from JSON
                result["email"] = json_names[0][1]
                result["contact_source"] = "direct_job_posting"
                result["extraction_method"] = "json_l_d_extraction"
            else:
                result["contact_source"] = "direct_job_posting"
                result["extraction_method"] = "json_l_d_extraction"

        # Look for "Posted by" or "Recruiter" patterns in text
        if not result["name"]:
            text_names = extract_names_from_text(html)
            if text_names:
                result["name"] = text_names[0]
                result["contact_source"] = "direct_job_posting"
                result["extraction_method"] = "text_heuristic"

        # Extract LinkedIn profile URLs
        linkedin_matches = re.findall(
            r'linkedin\.com/in/([\w\-\.]+)', html
        )
        if linkedin_matches and not result["linkedin"]:
            result["linkedin"] = f"https://www.linkedin.com/in/{linkedin_matches[0]}"

        # Extract emails — filter through validation
        emails = EMAIL_REGEX.findall(html)
        domain = urlparse(job_url).hostname or ""
        domain_clean = domain.replace("www.", "")
        for email in emails:
            email_lower = email.lower()
            if not is_valid_email_format(email_lower):
                continue
            if not is_generic_email(email_lower):
                if is_personal_email(email_lower, domain_clean):
                    result["email"] = email_lower
                    result["contact_source"] = "direct_job_posting"
                    result["extraction_method"] = "regex_from_job_page"
                    break
        
        # Extract phones
        phones = PHONE_REGEX.findall(html)
        if phones and not result["mobile"]:
            result["mobile"] = phones[0]
        
    except asyncio.TimeoutError:
        logger.debug(f"Job posting fetch timed out: {job_url}")
    except Exception as e:
        logger.debug(f"Failed to extract from job posting {job_url}: {e}")
    
    return result
