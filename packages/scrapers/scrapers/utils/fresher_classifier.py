"""Shared utility for fresher role classification (SRS §4.2b)."""
import re

FRESHER_KEYWORDS = [
    "fresher", "0-1 years", "0-1yr", "0-2 years", "0-2yr", "0-3 years", "0-3yr",
    "no experience", "no-experience", "entry level", "entry-level",
    "graduate trainee", "graduate engineer trainee", "campus hire", "0 years",
    "management trainee", "trainee",
    "intern", "internship", "new grad", "new-grad",
    "early career", "early careers",
    "walk-in", "walk in", "walk-in drive",
    "off-campus", "off campus",
    "apprentice", "apprenticeship",
    "any graduate", "final year",
    "passout", "pass-out",
    # India fresher-hiring idiom: "junior"/"graduate" (e.g. "BE graduate",
    # "Junior Developer") denote entry level within this product's fresher scope.
    "junior", "graduate", "undergraduate", "freshers",
]

# Year-cohort phrases ("2026 graduate", "class of 2025") — keyword list can't
# enumerate every year, so one anchored regex covers them.
FRESHER_REGEXES = [
    r"\b20\d\d\s+graduates?\b",
    r"\bclass of 20\d\d\b",
]


def is_fresher_role(title: str, experience: str = "", full_text: str = "") -> bool:
    """NLP keyword classifier with word-boundary matching per SRS §4.2b.

    Uses regex word boundaries to avoid false positives (e.g., 'internally'
    matching 'intern'). A normalisation pass collapses the pluralised forms
    ATS feeds emit — '0-2 year(s)' -> '0-2 years', 'fresher(s)' -> 'fresher' —
    so the keyword list stays readable instead of enumerating every variant.
    """
    combined = f"{title} {experience} {full_text}".lower()
    combined = re.sub(r"\((?:es|s)\)", lambda m: m.group(0)[1:-1], combined)  # year(s)->years
    combined = re.sub(r"\b(\d+)\s*to\s*(\d+)\b", r"\1-\2", combined)  # '0 to 2 years'->'0-2 years'
    for kw in FRESHER_KEYWORDS:
        pattern = rf'\b{re.escape(kw)}\b'
        if re.search(pattern, combined):
            return True
    for rx in FRESHER_REGEXES:
        if re.search(rx, combined):
            return True
    return False
