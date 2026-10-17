"""
LinkedIn OSINT — the strongest keyless, free identity-resolution stack for
discovering and verifying an HR/recruiter's public LinkedIn profile
(SRS §4.5 OSINT, §6.2 confidence, never-fabricate golden rule).

Why this design is the "best" for LinkedIn specifically:

  * LinkedIn blocks naive HTML scraping and login-walls most data. The one
    reliable, FREE, keyless way to *read* a public profile's text is the Jina
    AI reader proxy (r.jina.ai/<url>), which renders the public page and
    returns clean markdown — no headless browser, no API key, no cookies.
  * We do NOT trust a single hit. First we DORK search engines (DuckDuckGo,
    already installed) for candidate profile URLs; then we RESOLVE each
    candidate's profile text and only accept it when the profile's own name
    matches the person we are looking for (difflib similarity gate) AND the
    profile mentions the target company. This kills the #1 failure mode of
    cheap OSINT tools: attaching a same-named stranger's profile.

Confidence tiers returned:
  0.90  company corroborated in snippet AND a real search hit for this name
  0.85  company corroborated in the (Jina-rendered) profile text
  0.45  a real profile whose name matches, but no company tie (needs outreach-
        side confirmation; deliberately LOW so unverified same-named strangers
        never outrank company-verified contacts)

Every network tier degrades gracefully; if all fail we return {} rather than a
fabricated URL. The caller keeps its §6.3 "don't overwrite better data" guard.
"""

from __future__ import annotations

import asyncio
import difflib
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

_IN_URL_RE = re.compile(r"linkedin\.com/in/([A-Za-z0-9._%-]+)")
_GENERIC_SLUG = {"in", "pub", "profile", "jobs", "company", "school", "login", "signup"}


# ── pure helpers (offline-testable, no network) ────────────────────────────────
def slug_to_name(slug: str) -> str:
    """Turn a linkedin.com/in/<slug> into a display name, stripping LinkedIn's
    trailing numeric/ID suffixes (e.g. priya-sharma-2a9b1c14 -> 'Priya Sharma')."""
    slug = slug.strip("/").split("?")[0]
    parts = re.split(r"[-_]+", slug)
    keep: list[str] = []
    for p in parts:
        if not p or p in _GENERIC_SLUG:
            continue
        # LinkedIn appends a numeric or hex ID token; drop it and stop.
        if re.fullmatch(r"\d{2,}", p) or re.fullmatch(r"[0-9a-f]{6,}", p):
            break
        if not p.isascii():
            break
        keep.append(p)
        if len(keep) >= 4:  # first[-middle[-last]] is all we name-match on
            break
    return " ".join(w.capitalize() for w in keep).strip()


def name_similarity(a: str, b: str) -> float:
    """0..1 token-set similarity between two names, order-insensitive.

    Compares sorted alphabetic token lists so 'Priya Sharma' ~ 'Sharma Priya'
    and middle names don't destroy the match. difflib (stdlib), no deps.
    """
    ta = [re.sub(r"[^a-z]", "", w.lower()) for w in re.split(r"\s+", a or "") if w]
    tb = [re.sub(r"[^a-z]", "", w.lower()) for w in re.split(r"\s+", b or "") if w]
    ta = [t for t in ta if t]
    tb = [t for t in tb if t]
    if not ta or not tb:
        return 0.0
    return difflib.SequenceMatcher(None, sorted(ta), sorted(tb)).ratio()


def company_in_text(company_name: str, text: str) -> bool:
    """True if the company name (or its distinctive token) appears in text."""
    if not company_name or not text:
        return False
    tl = text.lower()
    cn = re.sub(r"\b(pvt|private|ltd|limited|inc|technologies|tech|solutions|india)\b",
                "", company_name.lower())
    cn = cn.strip(" .,-")
    if len(cn) >= 3 and cn in tl:
        return True
    # fall back to the most distinctive token
    for tok in re.findall(r"[a-z]{4,}", company_name.lower()):
        if tok in tl:
            return True
    return False


# ── network tiers (each best-effort, never raises) ────────────────────────────
async def _ddg_find_profiles(query: str, max_results: int = 8) -> list[dict[str, str]]:
    """Tier 1: dork DuckDuckGo for candidate linkedin.com/in URLs.

    Returns [{url, title, snippet}] — the title/snippet of a *public* LinkedIn
    result is SEO-formatted as "Name — Role, Company | LinkedIn", which is the
    reliable keyless verification signal (LinkedIn blocks unauthenticated page
    rendering, but not search snippets).
    """
    hits: list[dict[str, str]] = []
    try:
        from ddgs import DDGS
    except Exception:
        try:
            from duckduckgo_search import DDGS  # older package name
        except Exception:
            return hits
    try:
        rows = await asyncio.to_thread(
            DDGS().text, f"{query} site:linkedin.com/in", max_results=max_results
        )
        for r in rows or []:
            if not isinstance(r, dict):
                continue
            m = _IN_URL_RE.search(r.get("href", ""))
            if not m or m.group(1).lower() in _GENERIC_SLUG:
                continue
            hits.append({
                "url": f"https://www.linkedin.com/in/{m.group(1)}",
                "title": (r.get("title", "") or "")[:200],
                "snippet": (r.get("body", "") or "")[:400],
            })
    except Exception as e:  # noqa: BLE001
        logger.debug(f"DDG LinkedIn dork failed for '{query}': {e}")
    return hits


async def _read_profile_text(url: str, timeout: float = 6.0) -> str:
    """Optional bonus: try the Jina AI reader to get the full public-profile text.
    Best-effort only — LinkedIn frequently blocks unauthenticated rendering, so a
    timeout/empty here is normal and never fatal (the snippet path still works)."""
    try:
        import httpx
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as c:
            r = await c.get(
                f"https://r.jina.ai/{url}",
                headers={"User-Agent": _UA, "Accept": "text/plain"},
            )
            if r.status_code == 200 and len(r.text) > 120:
                return r.text
    except Exception as e:  # noqa: BLE001
        logger.debug(f"Jina reader unavailable for {url}: {e}")
    return ""


# ── the public entrypoint ─────────────────────────────────────────────────────
async def resolve_linkedin_profile(
    person_name: str,
    company_name: str,
    min_name_sim: float = 0.72,
) -> dict[str, Any]:
    """Find and VERIFY the public LinkedIn profile of `person_name` at
    `company_name`. Returns {linkedin, name, headline, confidence, source,
    method}; empty dict when nothing survives the name-match gate.

    Never fabricates: a candidate URL is accepted only if the profile's own
    displayed name (from the reader text, else from the slug) is similar enough
    to `person_name`, with company presence as corroboration for higher tiers.
    """
    if not person_name or not company_name:
        return {}

    # candidate slugs from independent search evidence + a name-seeded guess.
    candidates: list[str] = []
    seed_slug = re.sub(r"[^a-z0-9]+", "-", person_name.lower()).strip("-")
    if seed_slug:
        candidates.append(f"https://www.linkedin.com/in/{seed_slug}")
    hits = await _ddg_find_profiles(f"{person_name} {company_name}")
    snippet_by_url: dict[str, str] = {}
    hit_urls = {h["url"] for h in hits}
    for h in hits:
        if h["url"] not in candidates:
            candidates.append(h["url"])
        snippet_by_url[h["url"]] = f"{h['title']} {h['snippet']}"

    best: dict[str, Any] = {}
    best_conf = 0.0

    for url in candidates[:6]:  # bounded fan-out; keeps cost/latency sane
        m = _IN_URL_RE.search(url)
        slug_name = slug_to_name(m.group(1)) if m else ""
        # Primary verification text = search snippet (reliable, keyless). Only pay
        # for the Jina render when the snippet alone doesn't already confirm.
        text = snippet_by_url.get(url, "")
        if not text or not (company_in_text(company_name, text) or name_similarity(person_name, text) >= min_name_sim):
            full = await _read_profile_text(url)
            if full:
                text = (full[:400] + " " + text).strip()

        # displayed name: prefer a name that appears in the snippet, else slug.
        display_name = slug_name
        headline = ""
        if text:
            hm = re.search(r"(?i)headline[:\s]+(.+)", text)
            if hm:
                headline = hm.group(1).strip()[:120]
            # LinkedIn public titles look like "Jane Doe - VP, Acme | LinkedIn"
            tm = re.match(r"\s*([A-Za-z][A-Za-z .'-]{2,40}?)\s*[-–|]", text)
            if tm and name_similarity(person_name, tm.group(1)) >= min_name_sim:
                display_name = tm.group(1).strip()
        sim = max(name_similarity(person_name, display_name),
                  name_similarity(person_name, slug_name))

        if sim < min_name_sim:
            continue  # name gate: reject strangers no matter what

        comp_ok = company_in_text(company_name, text)
        in_hits = url in hit_urls  # independent third-party evidence (not our guess)

        # NEVER return self-fulfilling evidence: a seed slug that merely echoes the
        # queried name, with no search hit and no company corroboration, is a guess.
        if not (comp_ok or in_hits):
            continue

        if comp_ok and in_hits:
            conf, source = 0.90, "dork_snippet_verified"
        elif comp_ok:
            conf, source = 0.85, "snippet_company_verified"
        else:  # in_hits, name matched, company NOT corroborated
            conf, source = 0.45, "dork_hit_name_match"

        if conf > best_conf:
            best_conf = conf
            best = {
                "linkedin": url,
                "name": display_name[:80],
                "headline": headline,
                "confidence": conf,
                "source": source,
                "method": "linkedin_osint_dork_reader",
            }
        if best_conf >= 0.9:
            break  # can't do better; stop early

    return best
