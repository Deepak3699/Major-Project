"""
Key-free OSINT contact-intelligence modules: crt.sh, Gravatar, Wayback Machine.

Complement the existing osint.py (pattern-gen + MX + SMTP) by discovering real
email addresses from certificate-transparency logs, archived pages, and Gravatar
profiles. All degrade to empty results on error; never fabricate.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_TIMEOUT = 20.0
_CRTSH_TIMEOUT = 15.0  # crt.sh is slow; short timeout + retry across query forms

# Local-parts that indicate HR/recruiter/mailroom (used by company_mails_from_crt).
_HR_LOCAL = re.compile(
    r"^(hr|human.?resources|recruit(ing|er|ment)?|talent|careers?|jobs?|"
    r"hiring|people|staffing|onboard(ing)?|workforce|employment)[._\-]?"
    r"[a-z0-9._\-]*$",
    re.IGNORECASE,
)


# ── crt.sh ───────────────────────────────────────────────────────────────────

async def crtsh_emails(domain: str) -> list[str]:
    """Query crt.sh certificate-transparency logs for emails in cert subject/CN.

    Many orgs embed an admin/IT email in their TLS certificates. Returns deduped
    list of email addresses found. Key-free, public API.
    """
    if not domain or "." not in domain:
        return []
    import httpx

    domain_suffix = f"@{domain}"
    # crt.sh is notoriously flaky (502/404/timeouts under load) and the '%.domain'
    # wildcard form fails more often than the bare domain. Try multiple query forms
    # with a short per-request timeout and one retry pass; accept first 200 + emails.
    query_forms = [domain, f".{domain}", f"%.{domain}"]
    try:
        async with httpx.AsyncClient(timeout=_CRTSH_TIMEOUT, follow_redirects=True) as client:
            for q in query_forms:
                try:
                    r = await client.get(
                        "https://crt.sh/",
                        params={"q": q, "output": "json"},
                        headers={"User-Agent": "Mozilla/5.0 (HireGen-OSINT/1.0)"},
                    )
                except Exception:  # noqa: BLE001
                    continue
                if r.status_code != 200:
                    continue
                emails = set(_EMAIL_RE.findall(r.text))
                hits = [e.lower() for e in emails if e.lower().endswith(domain_suffix)]
                if hits:
                    return sorted(set(hits))
            return []
    except Exception as e:  # noqa: BLE001
        logger.debug(f"crtsh_emails failed for {domain}: {e}")
        return []


# ── Gravatar ─────────────────────────────────────────────────────────────────

def gravatar_lookup(email: str) -> dict[str, Any]:
    """Look up a Gravatar profile for an email address (synchronous).

    Gravatar profiles are created by the email owner — if a profile exists, the
    email is real (they registered it). Returns:
        {"hr_name": display_name, "gravatar_photo": url, "verified_email": True}
    or {} if no profile / error.
    """
    if not email or "@" not in email:
        return {}
    import httpx

    email_hash = hashlib.md5(email.strip().lower().encode()).hexdigest()
    url = f"https://www.gravatar.com/{email_hash}.json"

    try:
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            r = client.get(url)
            if r.status_code != 200:
                return {}
            data = r.json()
            entries = data.get("entry") or []
            if not entries:
                return {}
            entry = entries[0]
            profile = entry.get("profileUrl", "")
            photo_url = entry.get("thumbnailUrl", "")
            name = (entry.get("displayName") or entry.get("name")
                    or entry.get("preferredUsername") or "").strip()
            if not name:
                return {}
            return {
                "hr_name": name,
                "gravatar_photo": photo_url,
                "gravatar_profile": profile,
                "verified_email": True,
            }
    except Exception as e:  # noqa: BLE001
        logger.debug(f"gravatar_lookup failed for {email}: {e}")
        return {}


# ── Wayback Machine ─────────────────────────────────────────────────────────

async def wayback_emails(careers_url: str) -> list[str]:
    """Fetch archived snapshots of a careers/jobs page via the Wayback CDX API,
    then extract emails from the most recent snapshot HTML.

    Useful when careers pages are rotated/down but Google still indexes old
    versions or the Wayback Machine preserved them. Key-free.
    """
    if not careers_url or "://" not in careers_url:
        return []
    import httpx

    cdx_url = "https://web.archive.org/cdx/search/cdx"
    params = {
        "url": careers_url,
        "output": "json",
        "limit": 5,
        "filter": "statuscode:200",
        "from": "2020",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            # CDX is occasionally 503 ("temporarily offline"); short retry pass.
            r = None
            for attempt in range(3):
                try:
                    r = await client.get(cdx_url, params=params)
                    if r.status_code == 200:
                        break
                except Exception:  # noqa: BLE001
                    pass
                await asyncio.sleep(2 * (attempt + 1))
            if r is None or r.status_code != 200:
                return []
            rows = r.json()
            if not isinstance(rows, list) or len(rows) < 2:
                return []
            # rows[0] is header; take the most recent snapshot
            snapshot = rows[-1]
            # CDX columns: urlkey timestamp original mimetype statuscode digest length
            ts = snapshot[1]
            original = snapshot[2]
            wayback_url = f"https://web.archive.org/web/{ts}id_/{original}"

            page_r = await client.get(wayback_url)
            if page_r.status_code != 200:
                return []
            emails = set(_EMAIL_RE.findall(page_r.text))
            return sorted(emails)
    except Exception as e:  # noqa: BLE001
        logger.debug(f"wayback_emails failed for {careers_url}: {e}")
        return []


# ── convenience: crt.sh → HR-filtered dict ──────────────────────────────────

async def company_mails_from_crt(domain: str) -> dict[str, Any]:
    """Run crt.sh for a domain, filter for HR/recruiter-ish local-parts, and
    return the standard enrichment dict (first HR email as hr_email, all as
    company_emails list). {}-safe.
    """
    all_emails = await crtsh_emails(domain)
    if not all_emails:
        return {}

    hr_emails = [e for e in all_emails if _HR_LOCAL.match(e.split("@")[0])]

    result: dict[str, Any] = {
        "source": "crtsh",
        "confidence": 40,
        "company_emails": all_emails,
    }
    if hr_emails:
        result["hr_email"] = hr_emails[0]
        result["confidence"] = 50  # a real cert-embedded HR addr beats a guess
    return result
