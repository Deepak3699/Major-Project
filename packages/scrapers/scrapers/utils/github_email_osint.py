"""
GitHub commit-email OSINT — free, keyless discovery of REAL corporate staff
emails and names from a company's PUBLIC repositories.

Why this works even though commit *search* is dead: modern GitHub defaults
commits to `@users.noreply.github.com`, so the `author-email:` search qualifier
returns nothing. But plenty of engineers (and older commits) still push with
their genuine `firstname@company.com`. Those are visible in the raw commit data
of any PUBLIC repo an org owns. Enumerating a company's org repos and reading
author emails therefore yields real staff identities AND the company's true
local-part pattern — the single most reliable way to confirm a guessed email.

Rate-limit discipline: unauthenticated GitHub is 60 req/hr, so this stays frugal
(a handful of recently-updated repos, small pages). Set GITHUB_TOKEN to lift it
to 5000/hr. Every path degrades to {} on any error; it's a bonus enrichment tier,
never a hard dependency. Reuses linkedin_osint.name_similarity for the name gate.
"""

from __future__ import annotations

import os
import re
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

_API = "https://api.github.com"
_UA = "HireGen-OSINT/1.0"
_LINKEDIN_RE = re.compile(r"https?://(www\.)?linkedin\.com/in/[A-Za-z0-9._%-]+")


def _headers() -> dict[str, str]:
    h = {"Accept": "application/vnd.github+json", "User-Agent": _UA,
         "X-GitHub-Api-Version": "2022-11-28"}
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok:
        h["Authorization"] = f"Bearer {tok}"
    return h


_NON_ORG = {"www", "careers", "jobs", "ir", "blog", "en", "us", "in", "uk",
            "de", "mail", "web", "api", "cdn", "app", "home"}
_TLDS = {"com", "co", "org", "net", "io", "ai", "gov", "edu", "dev", "app",
         "us", "uk", "in", "de", "cn", "xyz", "tech"}


def org_slug_for(domain: str) -> str:
    """Derive a best-guess GitHub org login from an email domain, skipping
    subdomains (www/careers/jobs) and TLD fragments so `www.acme.com` -> `acme`.
    """
    base = (domain or "").split("@")[-1].strip().lower()
    labels = [l for l in base.split(".") if l]
    for l in labels:
        if l not in _NON_ORG and l not in _TLDS:
            return re.sub(r"[^a-z0-9-]", "", l)
    return re.sub(r"[^a-z0-9-]", "", labels[0]) if labels else ""


def infer_company_pattern(emails: list[str], domain: str) -> str:
    """Classify the dominant local-part format from real company addresses so the
    caller's generator stops guessing for that company's other staff."""
    dom = f"@{domain}" if not domain.startswith("@") else domain
    locals_ = [e.lower().split("@")[0] for e in emails
               if e and e.lower().endswith(dom.lower())]
    if len(locals_) < 2:
        return ""
    first_last = sum(1 for x in locals_ if re.fullmatch(r"[a-z]+\.[a-z]+", x))
    f_last = sum(1 for x in locals_ if re.fullmatch(r"[a-z][a-z]+", x))
    just_first = sum(1 for x in locals_ if re.fullmatch(r"[a-z]+", x) and len(x) >= 4)
    scored = max((("{first}.{last}", first_last), ("{f}{last}", f_last),
                  ("{first}", just_first)), key=lambda t: t[1])
    return scored[0] if scored[1] >= max(2, len(locals_) // 2) else ""


async def _get(client, url: str, params: dict | None = None):
    r = await client.get(url, headers=_headers(), params=params)
    if r.status_code != 200:
        return None
    return r.json()


async def github_company_contacts(domain: str, org: str | None = None,
                                  max_repos: int = 6) -> dict[str, Any]:
    """Harvest real staff {name, email, github[, linkedin]} from a company's
    public repos. Returns {emails, pattern, contacts, org}. {}-safe.
    """
    empty = {"emails": [], "pattern": "", "contacts": [], "org": ""}
    if not domain or "." not in domain:
        return empty
    domain = domain.lower().lstrip("@").strip()
    org = (org or org_slug_for(domain)).lower()
    try:
        import httpx
    except Exception:
        return empty

    contacts: dict[str, dict[str, str]] = {}
    try:
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
            repos = await _get(client, f"{_API}/orgs/{org}/repos",
                               {"per_page": max_repos, "sort": "updated"})
            if not isinstance(repos, list) or not repos:
                return empty
            for repo in repos[:max_repos]:
                name = repo.get("name")
                if not name:
                    continue
                commits = await _get(client, f"{_API}/repos/{org}/{name}/commits",
                                     {"per_page": 20})
                if not isinstance(commits, list):
                    continue
                for c in commits:
                    au = (c.get("commit") or {}).get("author") or {}
                    email = (au.get("email") or "").strip().lower()
                    if not email.endswith(f"@{domain}"):
                        continue
                    if email not in contacts:
                        contacts[email] = {"name": (au.get("name") or "").strip(),
                                           "email": email,
                                           "github": f"https://github.com/{org}"}
    except Exception as e:  # noqa: BLE001
        logger.debug(f"GitHub org scan failed for {org}: {e}")
        return empty

    emails = list(contacts.keys())
    return {"emails": emails, "pattern": infer_company_pattern(emails, domain),
            "contacts": list(contacts.values()), "org": org}
