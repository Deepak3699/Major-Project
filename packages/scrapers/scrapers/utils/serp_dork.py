"""
Multi-engine SERP email-exposure dorking (free, keyless).

Huge numbers of public pages print a real `person@company.com` in plain text —
rocketreach/signalhire/contactout listing pages, PDF resumes, GitHub gists,
company "team"/"about"/"press" pages, IGDA/journal bylines, conference agendas.
Search engines have already indexed and rendered those snippets, so a handful of
targeted dorks across a few keyless engines recovers published contact emails
that a single-engine scrape misses.

Design: engines are independent and each degrades to [] on any error, so a
blocked engine never sinks the tier. Results are re-filtered locally: an email is
accepted only if the *snippet that mentions it* also mentions the target person's
name (corroboration), matching the handbook's "no unverified fabrication" rule —
a bare domain email found next to an unrelated name is returned at low confidence
so it can never overwrite a verified contact (guarded in SQL upstream).
"""

from __future__ import annotations

import re
import asyncio
import logging
from urllib.parse import quote_plus
from typing import Any

logger = logging.getLogger(__name__)

EMAIL_IN_TEXT = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_NAME_TOKEN = re.compile(r"[a-z]+")

_ENGINES = {
    "ddg": "https://html.duckduckgo.com/html/?q={q}",
    "bing": "https://www.bing.com/search?q={q}&count=20",
    "brave": "https://search.brave.com/search?q={q}",
}


def _parse_html(engine: str, html: str) -> list[str]:
    """Return the list of result-snippet texts (plus hrefs) for an engine."""
    try:
        from bs4 import BeautifulSoup
    except Exception:
        return []
    soup = BeautifulSoup(html, "lxml" if _has_lxml() else "html.parser")
    chunks: list[str] = []
    if engine == "ddg":
        nodes = soup.select(".result__snippet, .result__body, article")
    elif engine == "bing":
        nodes = soup.select("li.b_algo")
    else:  # brave
        nodes = soup.select("[data-type='web'] .snippet, .snippet")
    for n in nodes:
        chunks.append(n.get_text(" ", strip=True))
    return chunks


def _has_lxml() -> bool:
    try:
        import lxml  # noqa: F401
        return True
    except Exception:
        return False


async def _fetch_snippets(query: str) -> list[str]:
    """Fan out one query across engines concurrently; concatenate available text."""
    import httpx
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}

    async def one(client, engine, url):
        try:
            r = await client.get(url, headers=headers, timeout=10.0,
                                 follow_redirects=True)
            if r.status_code in (200, 202):
                return _parse_html(engine, r.text)
        except Exception as e:  # noqa: BLE001
            logger.debug(f"serp {engine} failed: {e}")
        return []

    urls = {e: t.format(q=quote_plus(query)) for e, t in _ENGINES.items()}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            results = await asyncio.gather(*(one(client, e, u) for e, u in urls.items()))
    except Exception:
        return []
    return [s for group in results for s in group]


def _google_cse_configured() -> bool:
    """Google Custom Search is key-gated (GOOGLE_CSE_KEY + GOOGLE_CSE_CX):
    tried only when the operator configured it, after the free engines."""
    import os
    return bool(os.environ.get("GOOGLE_CSE_KEY") and os.environ.get("GOOGLE_CSE_CX"))


async def _fetch_snippets_cse(query: str) -> list[str]:
    """Google CSE snippets (key-gated). Returns [] when unconfigured or on
    any error — the free tier above is the default path, never this."""
    import os
    key, cx = os.environ.get("GOOGLE_CSE_KEY"), os.environ.get("GOOGLE_CSE_CX")
    if not key or not cx:
        return []
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                "https://www.googleapis.com/customsearch/v1",
                params={"key": key, "cx": cx, "q": query, "num": 10},
            )
            if r.status_code != 200:
                return []
            items = (r.json().get("items") or [])
            return [f"{it.get('title', '')} {it.get('snippet', '')}" for it in items]
    except Exception as e:  # noqa: BLE001
        logger.debug(f"serp google-cse failed: {e}")
        return []


def _name_in_text(name: str, text: str) -> bool:
    toks = [t for t in _NAME_TOKEN.findall((name or "").lower()) if len(t) > 1]
    if not toks:
        return True
    low = text.lower()
    return all(t in low for t in toks[:2])  # first + last name both present


# generic/role mailboxes — never a person's *personal* address
_ROLE_LOCAL = re.compile(
    r"^(info|support|sales|admin|hr|careers|jobs|contact|hello|hi|team|press|"
    r"media|office|ceo|cto|cfo|founder|owner|recruit|talent|staff|general|enquiry|"
    r"inquiries|mail|email|webmaster|noreply|no-reply|postmaster)[0-9]*$"
)


def _email_relates_to_name(email: str, name: str) -> bool:
    """True if the local-part plausibly belongs to `name` (shares a name token,
    or an initial+token, or a token+initial). Stops role/generic boxes leaking in.
    """
    local = email.split("@")[0].lower()
    if _ROLE_LOCAL.match(local):
        return False
    toks = [t for t in _NAME_TOKEN.findall((name or "").lower()) if len(t) > 1]
    if not toks:
        return not _ROLE_LOCAL.match(local)
    # full name token must actually appear in the local-part (no single-letter
    # false-positives like dave@x.com matching "John Doe")
    for t in toks:
        if t in local:
            return True
    # explicit first-initial + last-name (jdoe for John Doe) is the one allowed
    # abbreviation; requires the full surname present.
    parts = _NAME_TOKEN.findall((name or "").lower())
    if len(parts) >= 2 and local.startswith(parts[0][0]) and parts[-1] in local:
        return True
    return False


async def dork_find_email(name: str, company: str, domain: str) -> dict[str, Any]:
    """Find a *published* email for `name` at `domain` via multi-engine dorks.
    Returns {email, confidence, method, evidence} or {}. {}-safe.
    """
    if not domain or not (name or "").split():
        return {}
    domain_local = domain.split("@")[-1].lower()
    queries = [
        f'"{name}" "{domain_local}"',
        f'"{name}" "{company}" email',
        f'"@{domain_local}" "{name.split()[0]}"',
        f'site:rocketreach.co "{name}" "{company}"',
        f'site:signalhire.com "{name}"',
    ]
    # de-dup, keep cheap order
    seen_q: set[str] = set()
    queries = [q for q in queries if not (q in seen_q or seen_q.add(q))]

    try:
        import httpx  # noqa: F401
    except Exception:
        return {}

    best: dict[str, Any] = {}
    for q in queries:
        try:
            snippets = await _fetch_snippets(q)
            # Key-gated Google CSE runs LAST, only when configured — same
            # corroboration rules apply to its snippets.
            if _google_cse_configured():
                try:
                    snippets = snippets + await _fetch_snippets_cse(q)
                except Exception:
                    pass
        except Exception:
            continue
        for sn in snippets:
            for email in EMAIL_IN_TEXT.findall(sn):
                el = email.lower()
                if not el.endswith(f"@{domain_local}"):
                    continue
                local = el.split("@")[0]
                if _ROLE_LOCAL.match(local):
                    continue
                related = _email_relates_to_name(el, name)
                # personal hit = local-part relates to the name AND the snippet
                # actually names the person: this is the strongest public signal.
                if related and _name_in_text(name, sn):
                    return {"email": el, "confidence": 0.82, "method": "serp_dork_personal",
                            "evidence": q}
                # weaker: a plausible (name-related but unconfirmed) address
                if related and not best:
                    best = {"email": el, "confidence": 0.5, "method": "serp_dork_unrelated_snippet",
                            "evidence": q}
    return best

