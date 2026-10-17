"""
Shared ATS company corpus — the seed that turns 4 tiny static slug lists into a
broad, one-place-to-grow board army.

Every ATS (Greenhouse/Lever/Ashby/SmartRecruiters/...) exposes public JSON for
*every* customer company that uses it, keyed by a slug. Coverage is therefore
purely a function of how many slugs we probe, and a wrong slug is a cheap 404
that we skip. So the whole game is a big, deduped, India-heavy slug corpus.

This module holds that corpus (curated, ~130 companies, weighted toward Indian
startups that hire freshers — Zoho/Swiggy/Groww/Razorpay/BrowserStack/Postman/…).
`corpus_for(source)` merges the shared list with a source's own known-good slugs
(capped so a daily run stays bounded). A DB flywheel helper is included so the
corpus can auto-grow from companies we've already ingested.
"""

from __future__ import annotations

import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# Companies known / likely to run a public ATS job board (India-first, then global).
# Slugs are lowercased; wrong ones are skipped at runtime via 404.
SHARED_CORPUS: list[str] = [
    # ---- India: product startups & ATS-heavy employers that hire freshers ----
    "zoho", "freshworks", "browserstack", "postman", "groww", "zerodha",
    "razorpay", "phonepe", "cred", "swiggy", "zomato", "blinkit", "zepto",
    "meesho", "flipkart", "myntra", "cleartax", "hasura", "setu", "jupiter",
    "nium", "spinny", "attune", "slice", "coinbase-india", "unacademy",
    "byjuis", "vedantu", "physicswallah", "pluto", "internshala", "topmate",
    "superhuman", "chargebee", "mongodb-india", "yellow.ai", "haptik",
    "glide", "navi", "policybazaar", "dream11", "mpost", "rebel", "jar",
    "aiven-india", "zetaglobal", "lTIMindtree", "cognizant", "wipro",
    "infosys", "hcltech", "tcs", "accenture-india", "capgemini-india",
    "publicissap", "epifi", "zycus", "yubi", "one97", "pepperfry", "nykaa",
    "lenskart", "boat", "noise", "erev", "dunzo", "ruralhouse", "waya",
    "whalespider", "invideo", "cutshort", "instahyre", "angelone", "foundit",
    # ---- Global tech that hire juniors and run public ATS boards ----
    "stripe", "datadog", "cloudflare", "gitlab", "hashicorp", "twilio",
    "mongodb", "elastic", "grafana", "sentry", "vercel", "supabase",
    "notion", "figma", "linear", "airtable", "discord", "roblox", "asana",
    "dropbox", "shopify", "atlassian", "retool", "front", "clickup",
    "ramp", "plaid", "brex", "mercari", "databricks", "snowflake", "anthropic",
    "cohere", "scale", "ripple", "circle",
    "coinbase", "kraken", "gemini", "binance", "opensea", "polygon", "deel", "remote",
    "chainalysis", "consensys", "alchemy", "quicknode", "thegraph",
    "mongodb", "redis", "confluent", "temporal", "launchdarkly", "circleci",
    "codeship", "netlify", "render", "fly", "heroku", "auth0", "okta",
    "zapier", "webflow", "framer", "v0", "windsurf", "sourcegraph",
    "cursor", "perplexity", "mistral", "together", "modal", "weights",
]

# Per-source extra known-good slugs discovered by pre-flight testing.
SOURCE_EXTRAS: dict[str, list[str]] = {
    "greenhouse": ["stripe", "gitlab", "discord", "roblox", "databricks", "coinbase"],
    "lever": ["spotify", "plaid", "visa", "palantir", "nubank"],
    "smartrecruiters": ["bosch", "adecco", "norvesta", "decathlon"],
    "ashby": ["ramp", "plaid", "openai", "linear", "supabase", "retool", "vanta"],
    # verified public recruiters' boards (200 OK in pre-flight)
    "recruitee": ["gong", "personio", "teamleader", "mews", "travelperk", "hotjar", "booksy"],
    "breezy": ["breezy", "remotemigration", "wethecollective", "growbots", "applitools"],
    "teamtailor": ["deezer", "productmarketing", "testworks", "blueground"],
    # verified public boards (200 OK in pre-flight, 2026-09-14)
    "bamboohr": ["freshworks"],
    "personio": ["personio"],
}

MAX_BOARDS = 40  # bounded: fits the per-source scrape budget even before concurrency


def corpus_for(source: str) -> list[str]:
    """Return a deduped, capped slug list to sweep for one ATS source."""
    seen: set[str] = set()
    out: list[str] = []
    for slug in (SOURCE_EXTRAS.get(source, []) + SHARED_CORPUS):
        s = (slug or "").strip().lower()
        if s and "." not in s and s not in seen:
            seen.add(s)
            out.append(s)
        if len(out) >= MAX_BOARDS:
            break
    return out


# Flywheel: learn new ATS boards from job URLs we've already ingested
# (e.g. a boards.greenhouse.io/<slug> posting for a company we never probe).
# Suggestions only — the operator promotes them to SOURCE_EXTRAS after the
# board verifies (standing rule: no unverified patterns).
_ATS_URL_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("greenhouse", re.compile(r"boards\.greenhouse\.io/([a-z0-9][a-z0-9\-_]*)", re.I)),
    ("lever", re.compile(r"jobs\.lever\.co/([a-z0-9][a-z0-9\-_]*)", re.I)),
    ("bamboohr", re.compile(r"([a-z0-9][a-z0-9\-_]*)\.bamboohr\.com/careers", re.I)),
    ("personio", re.compile(r"([a-z0-9][a-z0-9\-_]*)\.jobs\.personio\.com", re.I)),
    ("ashby", re.compile(r"jobs\.ashbyhq\.com/([a-z0-9][a-z0-9\-_]*)", re.I)),
    ("workday", re.compile(r"([a-z0-9]+\.[a-z]+\.myworkdayjobs\.com)", re.I)),
]


def suggest_new_slugs(job_urls: list[str]) -> dict[str, list[str]]:
    """Extract (ats, slug) pairs from ingested job URLs, minus slugs already
    in that ATS's corpus. Pure function — the caller decides what to promote."""
    known: dict[str, set[str]] = {
        ats: {s.lower() for s in (SOURCE_EXTRAS.get(ats, []) + SHARED_CORPUS)}
        for ats, _ in _ATS_URL_PATTERNS
    }
    found: dict[str, set[str]] = {}
    for url in job_urls or []:
        for ats, rx in _ATS_URL_PATTERNS:
            m = rx.search(url or "")
            if not m:
                continue
            slug = m.group(1).lower()
            if slug and slug not in known.get(ats, set()):
                found.setdefault(ats, set()).add(slug)
    return {ats: sorted(slugs) for ats, slugs in found.items() if slugs}
