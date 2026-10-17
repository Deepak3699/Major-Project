"""
Tier 2: Hasjob (HasGeek tech board) Atom feed scraper.

Pre-flight verified: https://hasjob.co/feed returns 200 application/atom+xml
with entries carrying title, id (= job URL), published, location, and HTML
content whose first <strong><a> names the company. robots.txt disallows only
edit/confirm/withdraw/admin paths — the feed and listings are allowed.

Company identity comes from the entry id path (hasjob.co/<companydomain>/<code>),
corroborated by the content header link. Single fetch per run.
"""

import re
import asyncio
import aiohttp
import logging
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urlparse

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

ATOM_NS = "{http://www.w3.org/2005/Atom}"
FEED_URL = "https://hasjob.co/feed"
_COMPANY_LINK_RE = re.compile(
    r"<strong>\s*<a[^>]*>([^<]{2,80})</a>\s*</strong>", re.I
)


def _text(entry: ET.Element, tag: str) -> str:
    el = entry.find(ATOM_NS + tag)
    return (el.text or "").strip() if el is not None and el.text else ""


def parse_entry(entry: ET.Element) -> dict[str, str] | None:
    """Map one Atom entry to raw lead fields. Pure/offline-testable."""
    title = _text(entry, "title")
    job_url = _text(entry, "id")
    if not title or not job_url.startswith("http"):
        return None
    host = (urlparse(job_url).hostname or "").lower()
    if host != "hasjob.co":
        return None
    company = ""
    m = re.match(r"https://hasjob\.co/([^/]+)/", job_url)
    if m:
        # Slug is usually the company domain (nexailabs.com) but can be a
        # bare name; either way it identifies the employer for enrichment.
        company = m.group(1)
    content = _text(entry, "content")
    cm = _COMPANY_LINK_RE.search(content)
    content_company = cm.group(1).strip() if cm else ""
    return {
        "title": title,
        "job_url": job_url,
        "company": company,
        "content_company": content_company,
        "location": _text(entry, "location"),
        "published": _text(entry, "published"),
        "content": content[:2000],
    }


class HasjobScraper(BaseScraper):
    source_name = "hasjob"
    tier = 2
    rate_limit_seconds = 2.0

    async def scrape(self) -> list[dict[str, Any]]:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    FEED_URL,
                    headers={"User-Agent": "HireGen-LeadGen/1.0"},
                    timeout=aiohttp.ClientTimeout(total=20),
                ) as resp:
                    if resp.status != 200:
                        return []
                    body = await resp.text()
        except Exception as e:  # noqa: BLE001
            raise ScraperError(f"hasjob fetch failed: {e}")
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            return []

        leads: list[dict[str, Any]] = []
        for entry in root.iter(ATOM_NS + "entry"):
            parsed = parse_entry(entry)
            if not parsed:
                continue
            blob = f"{parsed['title']} {parsed['content']}".lower()
            company = parsed["company"] or parsed["content_company"]
            leads.append({
                "company_name": company,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": parsed["title"],
                "about_job": re.sub(r"<[^>]+>", " ", parsed["content"])[:1500],
                "experience_required": "",
                "location": parsed["location"],
                "salary_range": "",
                "job_url": parsed["job_url"],
                "source_site": "hasjob.co",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher_role(parsed["title"], "", blob),
                "raw_payload": parsed,
            })
        self._logger.info(f"Hasjob: scraped {len(leads)} raw leads")
        return leads
