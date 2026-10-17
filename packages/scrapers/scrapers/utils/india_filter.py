"""
Central India geo-gate (HireGen product correction: fresher jobs / leads from
INDIA ONLY, not worldwide).

This is a post-scrape filter analogous to the experience-level re-validation in
SRS §4.2(b): it is the one place a record may legitimately be *discarded*
because it is out-of-scope (not a fresher role, or not an India role). This is
distinct from SRS §9.7 "never silently drop scraped data" — which governs
*incomplete-but-in-scope* records. An out-of-scope (non-India) record is not a
data-quality problem, it is a wrong-target problem, exactly like a senior role.

Multiple fallbacks, in order:
  1. If the source is India-native by construction (naukri, shine, internshala,
     ...), it passes unless its explicit location field is *strongly foreign*.
  2. Otherwise a positive India signal in location → pass.
  3. If location is blank, fall back to scanning the job description /
     about_job text for an India signal.
  4. If still ambiguous: for global sources we REJECT (cannot confirm India),
     for India-native sources we PASS (already scoped to India).

The function never mutates the record; the caller decides to discard.
"""

import re

# Sources that publish ONLY India-region postings by their nature.
# For these, a blank/absent location field still counts as India.
INDIA_NATIVE_SOURCES = {
    "naukri", "shine", "internshala", "freshersworld", "instahyre",
    "cutshort", "foundit", "adzuna", "jooble", "indeed", "workday",
    "unstop", "jobinsider", "iimjobs", "timesjobs",
    "apna", "workindia", "hirist", "classicjobs", "hackerearth",
    "ambitionbox",
    "freshershunt", "offcampusjobs4u", "job4freshers", "jobbinge",
    "hasjob", "amazon",
}

# Strong positive India location signals.
_INDIA_POSITIVE = [
    "india", "भारत",
    "bengaluru", "bangalore", "mumbai", "delhi", "new delhi", "ncr",
    "gurgaon", "gurugram", "noida", "hyderabad", "chennai", "pune",
    "kolkata", "ahmedabad", "surat", "jaipur", "kochi", "cochin",
    "chandigarh", "bhubaneswar", "indore", "nagpur", "vadodara",
    "visakhapatnam", "mysore", "mysuru", "thiruvananthapuram",
    "trivandrum", "coimbatore", "lucknow", "kanpur", "patna",
    "bhopal", "rajkot", "goa", "manali", "dehradun",
    "remote - india", "remote/india", "remote (india)", "work from india",
    "wfo india", "wfh india", "+91", "west bengal", "tamil nadu",
    "karnataka", "maharashtra", "telangana", "andhra", "gujarat",
    "rajasthan", "uttar pradesh", "madhya pradesh", "kerala",
    "harayana", "haryana", "punjab india", "bihar", "odisha",
    "assam", "jharkhand", "chhattisgarh", "uttarakhand", "himachal",
    "arunachal", "meghalaya", "mizoram", "nagaland", "tripura",
    "sikkim", "manipur", "jammu", "kashmir", "ladakh",
    "andaman", "nicobar", "puducherry", "pondicherry",
    "dadra", "nagar haveli", "daman", "diu", "lakshadweep",
    "vijayawada", "guwahati", "ranchi", "raipur", "madurai",
    "srinagar", "shimla", "gangtok", "imphal",
    "shillong", "aizawl", "kohima", "agartala", "itanagar",
    "delhi ncr",
]

# Strong foreign (non-India) location signals.
_FOREIGN = [
    "united states", "usa", "u.s.a", " u.s.", "us only", "us-based",
    "us based", "california", "new york", "texas", "washington dc",
    "seattle", "san francisco", "austin", "boston", "chicago",
    "united kingdom", "uk only", "u.k.", " london", "england",
    "germany", "berlin", "munich", "france", "paris", "netherlands",
    "amsterdam", "spain", "madrid", "barcelona", "italy", "rome",
    "poland", "warsaw", "portugal", "lisbon", "ireland", "dublin",
    "canada", "toronto", "vancouver", "montreal", "australia",
    "sydney", "melbourne", "brazil", "sao paulo", "mexico",
    "singapore", "japan", "tokyo", "china", "beijing", "shanghai",
    "south korea", "seoul", "dubai", "uae", "saudi", "qatar",
    "israel", "tel aviv", "turkey", "istanbul", "nigeria", "lagos",
    "kenya", "nairobi", "south africa", "johannesburg", "cape town",
    "europe", "emea", "apac", "north america", "latam", "worldwide",
    "global", "anywhere", "remote - us", "remote - europe",
    "remote - uk", "remote - canada",
]

# Compile word-boundary regexes once. Pre-pad single-token entries with a
# boundary; multi-word entries use plain substring after normalization.
_INDIA_RE = re.compile(
    r"\b(" + "|".join(re.escape(t.strip()) for t in _INDIA_POSITIVE if t.strip()) + r")\b"
)
_FOREIGN_RE = re.compile(
    r"\b(" + "|".join(re.escape(t.strip()) for t in _FOREIGN if t.strip()) + r")\b"
)


def _norm(text: str) -> str:
    return f" {(text or '').lower()} "


def is_india_relevant(normalized: dict) -> bool:
    """Return True if the lead should be kept (India-relevant)."""
    source_site = (normalized.get("source_site") or "").lower()
    location = _norm(normalized.get("location", ""))
    about_job = _norm(normalized.get("about_job", ""))

    # Layered signals. location is authoritative when present; description is
    # the fallback used only to break ties / confirm ambiguous cases.
    loc_has_india = bool(_INDIA_RE.search(location))
    loc_has_foreign = bool(_FOREIGN_RE.search(location))
    desc_has_india = bool(_INDIA_RE.search(about_job))

    # 1. Explicit foreign location on the posting → reject, even if the
    #    description happens to mention India. Location wins over description.
    if loc_has_foreign and not loc_has_india:
        return False

    # 2. Explicit India location signal → accept.
    if loc_has_india:
        return True

    # 3. Location blank/ambiguous → check description, then source nativeness.
    if desc_has_india:
        return True

    # 4. India-native source with no contradicting foreign signal → accept.
    if any(s in source_site for s in INDIA_NATIVE_SOURCES):
        return True

    # 5. Global source, no positive India evidence → reject (fail closed).
    return False


# ── Employer-domain derivation ────────────────────────────────────────────────
# A job URL on an aggregator (apna.co, naukri.com, …) does NOT identify the
# hiring employer: the host is the board. Using it as the company domain routes
# every email/OSINT lookup to the job board instead of the real company — the
# exact wrong answer for "find the HR who posted this". Only a company's own
# site (ATS board, career page) yields a trustworthy employer domain.

_JOB_BOARD_HOSTS = {
    "naukri.com", "shine.com", "internshala.com", "freshersworld.com",
    "instahyre.com", "cutshort.io", "foundit.in", "adzuna.com", "jooble.org",
    "indeed.com", "indeed.co.in", "apna.co", "workindia.in", "hirist.in",
    "hirist.tech", "classicjobs.in", "unstop.com", "iimjobs.com",
    "jobinsider.in", "timesjobs.com", "glassdoor.co.in", "glassdoor.com",
    "wellfound.com", "angel.co", "linkedin.com", "akunamatata.live",
    "monster.com", "quikr.com", "jobs.quikr.com", "olx.in", "dice.com",
    "ziprecruiter.com", "careerbuilder.com", "simplyhired.com",
    # ATS board hosts (the board is never the employer)
    "greenhouse.io", "boards.greenhouse.io", "lever.co", "ashbyhq.com",
    "myworkdayjobs.com", "smartrecruiters.com", "recruitee.com", "breezy.hr",
    "bamboohr.com", "personio.com", "jobs.personio.com", "teamtailor.com",
    "workable.com", "jobhai.com", "youth4work.com", "ambitionbox.com",
    "hasjob.co", "amazon.jobs",
}
_KNOWN_SUFFIXES = (
    "co.in", "com", "in", "net", "org", "co", "io", "ai", "co.uk",
    "tech", "info", "biz", "me", "app", "dev",
)


def registrable_domain(host: str) -> str:
    """best-effort eTLD+1 from a hostname (no PSL dependency)."""
    host = (host or "").lower().strip(".").replace("www.", "")
    parts = host.split(".")
    if len(parts) < 2:
        return host
    for n in (3, 2):
        if len(parts) > n and ".".join(parts[-n:]) in _KNOWN_SUFFIXES:
            if len(parts) > n + 1:
                return ".".join(parts[-(n + 1):])
            return host
    return ".".join(parts[-2:])


def derive_company_domain(company_name: str, job_url: str) -> str:
    """Resolve the employer domain for enrichment, never the job-board host."""
    host = ""
    if job_url:
        try:
            from urllib.parse import urlparse
            host = (urlparse(job_url).hostname or "").lower()
        except Exception:
            host = ""
    if host:
        reg = registrable_domain(host)
        if reg and reg not in _JOB_BOARD_HOSTS:
            return reg          # company's own site / ATS board → trustworthy
    # Aggregator host or none → slug the company name (original heuristic,
    # incl. dropping the Indian corporate suffixes pvt/ltd/llp/...).
    name = (company_name or "").lower()
    for suffix in (
        " private limited", " pvt ltd", " pvt. ltd.", " pvt", " ltd",
        " limited", " llp", " inc", " corp",
    ):
        name = name.replace(suffix, "")
    slug = re.sub(r"[^a-z0-9]", "", name)
    return f"{slug}.com" if slug else ""


# Corporate trailing tokens stripped for canonical comparison ("Adani Group"
# vs "Adani"). Lookup-only: display names keep their original form.
_CANONICAL_STRIP = (
    " private limited", " pvt ltd", " pvt. ltd.", " pvt", " ltd",
    " limited", " llp", " inc", " corp", " corporation",
    " group", " india", " technologies", " technology",
    " solutions", " services", " systems", " labs", " digital",
    " consulting", " associates", " enterprises", " industries",
)


def canonical_company_key(name: str) -> str:
    """Lowercased alphanumeric core of a company name for dedup lookup."""
    core = (name or "").lower()
    changed = True
    while changed:
        changed = False
        for suffix in _CANONICAL_STRIP:
            if core.endswith(suffix):
                core = core[: -len(suffix)]
                changed = True
    core = re.sub(r"[^a-z0-9]", "", core)
    return core
