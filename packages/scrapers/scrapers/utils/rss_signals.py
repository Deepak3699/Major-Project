"""
RSS hiring-signal corroboration (Agent-Reach channel integration, stdlib-only).

Reads a company's own press/blog/news feeds and surfaces hiring-signal items
(hiring announcements, campus drives, walk-ins, fresher programs). Signals
only — this tier NEVER produces contacts, emails, or names; it corroborates
that the company is actively hiring, which grounds outreach drafts and feeds
the enrichment provenance log.

- No new dependencies (xml.etree only; cf. Agent-Reach's feedparser).
- No copied code (patterns only; MIT-compat by construction).
- robots.txt honoured per feed via the repo's RobotsChecker.
- Never raises: any failure returns an empty signal list (cascade convention).
"""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from typing import Any

import aiohttp

logger = logging.getLogger(__name__)

UA = {"User-Agent": "HireGen-LeadGen/1.0"}

# Conventional feed paths, cheapest first. Homepage link-tag discovery runs
# before these (a declared feed beats a guessed path).
FEED_PATHS = [
    "/blog/feed", "/blog/rss", "/blog/rss.xml",
    "/press/feed", "/news/feed", "/news/rss",
    "/feed", "/rss", "/rss.xml",
]

HIRING_KEYWORDS = [
    "we're hiring", "we are hiring", "now hiring",
    "job opening", "open roles", "open positions",
    "campus", "walk-in", "walk in", "recruitment drive",
    "fresher", "freshers", "graduate trainee", "apprentice",
    "join our team", "careers", "hiring drive", "off campus",
]

MAX_FEEDS = 2
MAX_ITEMS = 5
MAX_AGE_DAYS = 90


def _item_text(item: ET.Element, tag: str) -> str:
    el = item.find(tag)
    if el is not None and el.text:
        return el.text.strip()
    # namespaced variants (<dc:date>, <content:encoded>)
    for child in item:
        if child.tag.endswith("}" + tag) and child.text:
            return child.text.strip()
    return ""


def _parse_date(raw: str) -> datetime | None:
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z", "%a, %d %b %Y %H:%M:%S %Z",
        "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            dt = datetime.strptime(raw.strip(), fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            continue
    return None


def parse_feed_items(body: str) -> list[dict[str, str]]:
    """Parse RSS/Atom items (pure function — unit-testable offline)."""
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return []
    out: list[dict[str, str]] = []
    for item in list(root.iter("item")) + list(root.iter("{http://www.w3.org/2005/Atom}entry")):
        title = _item_text(item, "title")
        link = _item_text(item, "link")
        if not title:
            continue
        if not link:
            for child in item:
                if child.tag.endswith("}link") and child.attrib.get("href"):
                    link = child.attrib["href"]
                    break
        out.append({
            "title": title,
            "url": link,
            "published": _item_text(item, "pubDate") or _item_text(item, "published") or _item_text(item, "updated"),
        })
    return out


def match_hiring_signals(items: list[dict[str, str]], now: datetime | None = None) -> list[dict[str, Any]]:
    """Keep items matching hiring vocabulary and younger than MAX_AGE_DAYS."""
    ref = now or datetime.now(timezone.utc)
    cutoff = ref - timedelta(days=MAX_AGE_DAYS)
    signals: list[dict[str, Any]] = []
    for it in items:
        text = f"{it.get('title', '')}".lower()
        matched = [kw for kw in HIRING_KEYWORDS if kw in text]
        if not matched:
            continue
        dt = _parse_date(it.get("published", ""))
        if dt is not None and dt < cutoff:
            continue
        signals.append({
            "title": it["title"][:200],
            "url": it.get("url", "")[:500],
            "published": it.get("published", ""),
            "matched": matched[:3],
        })
        if len(signals) >= MAX_ITEMS:
            break
    return signals


async def _fetch_text(session: aiohttp.ClientSession, url: str) -> str | None:
    try:
        async with session.get(url, headers=UA, timeout=aiohttp.ClientTimeout(total=12)) as resp:
            if resp.status != 200:
                return None
            ctype = resp.headers.get("Content-Type", "")
            if "html" not in ctype and "xml" not in ctype and "rss" not in ctype and "text" not in ctype:
                return None
            text = await resp.text()
            return text if len(text) < 2_000_000 else None
    except Exception:  # noqa: BLE001
        return None


async def _discover_feeds(session: aiohttp.ClientSession, domain: str) -> list[str]:
    """Homepage <link rel=alternate> feed discovery, then conventional paths."""
    found: list[str] = []
    for scheme_host in (f"https://{domain}", f"https://www.{domain}"):
        body = await _fetch_text(session, scheme_host)
        if not body:
            continue
        for m in re.finditer(
            r'<link[^>]+rel=["\']alternate["\'][^>]*>', body, re.IGNORECASE
        ):
            tag = m.group(0)
            if "rss" in tag or "atom" in tag or "xml" in tag:
                href = re.search(r'href=["\']([^"\']+)["\']', tag)
                if href:
                    url = href.group(1)
                    if url.startswith("/"):
                        url = scheme_host + url
                    if url.startswith("http"):
                        found.append(url)
        if found:
            break
    for scheme_host in (f"https://{domain}", f"https://www.{domain}"):
        for path in FEED_PATHS:
            found.append(scheme_host + path)
    # dedupe, preserve order
    return list(dict.fromkeys(found))


async def fetch_company_hiring_signals(
    company_name: str, domain: str
) -> dict[str, Any]:
    """Fetch hiring signals from a company's own feeds. Never raises."""
    out: dict[str, Any] = {"signals": [], "feeds_checked": 0}
    domain = (domain or "").strip().lower()
    if not domain or "." not in domain:
        return out
    try:
        from .robots_checker import RobotsChecker
        robots = RobotsChecker()
        async with aiohttp.ClientSession() as session:
            feeds = await _discover_feeds(session, domain)
            checked = 0
            for feed_url in feeds:
                if checked >= MAX_FEEDS:
                    break
                try:
                    if not await robots.is_allowed(feed_url):
                        logger.debug(f"RSS: robots disallows {feed_url}")
                        continue
                except Exception:  # noqa: BLE001
                    pass
                body = await _fetch_text(session, feed_url)
                checked += 1
                if not body or ("<item" not in body and "<entry" not in body):
                    continue
                items = parse_feed_items(body)
                matched = match_hiring_signals(items)
                if matched:
                    out["signals"].extend(matched)
                    break  # one productive feed is enough; stay polite
            out["feeds_checked"] = checked
    except Exception as e:  # noqa: BLE001
        logger.debug(f"RSS signals failed for {company_name}@{domain}: {e}")
    out["signals"] = out["signals"][:MAX_ITEMS]
    return out
