"""
Tier 2: Off-campus drive aggregator scraper (WordPress boards).

Covers freshershunt.in, offcampusjobs4u.com, job4freshers.co.in, jobbinge.in
through ONE sitemap-driven flow (all pre-flight verified 2026-09-14):

  sitemap_index.xml -> recent post sitemaps -> post URLs with lastmod < 48h
  -> post page (title + og:description + employer apply link) -> lead

Terms notes (checked per site, enforced at runtime via RobotsChecker):
- freshershunt.in disallows /feed/ but allows posts + sitemap: this flow
  never touches /feed/ (sitemap + article URLs only).
- offcampusjobs4u / job4freshers / jobbinge: feeds + posts allowed (admin
  paths disallowed); sitemap flow stays inside allowed paths regardless.

Caps: 2 post-sitemaps/site, 15 posts/site, 48h freshness window. The normalizer
re-gates fresher/India downstream; this stage only passes recent drive posts.
"""

import re
import asyncio
import aiohttp
import logging
import xml.etree.ElementTree as ET
from html import unescape as _unescape
from datetime import datetime, timezone, timedelta
from typing import Any
from urllib.parse import urlparse

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

UA = {"User-Agent": "HireGen-LeadGen/1.0"}

SITES = [
    {"key": "freshershunt", "sitemap": "https://freshershunt.in/sitemap_index.xml",
     "source_site": "freshershunt.in"},
    {"key": "offcampusjobs4u", "sitemap": "https://offcampusjobs4u.com/sitemap_index.xml",
     "source_site": "offcampusjobs4u.com"},
    # Evaluated and CUT 2026-09-14: job4freshers.co.in is dormant (newest
    # posts July 2026) and jobbinge.in serves hollow sitemaps (0 post URLs
    # across sampled sitemaps). Dead boards burn fetch budget for zero leads.
    # Re-add only with a live sitemap proof (see docs/SOURCE_EVALUATION.md).
]

MAX_SITEMAPS_PER_SITE = 2
MAX_POSTS_PER_SITE = 15
FRESHNESS_HOURS = 48

# "Acme Off Campus Drive 2026 | Role" -> company | role-ish remainder
_COMPANY_SPLIT_RE = re.compile(
    r"\s+(?:off[\s-]*campus|recruitment|hiring|walk[\s-]*in|drive|freshers?)\b",
    re.I,
)
# Sitemap taxonomy/archive URLs are not drive posts (category, tag, author,
# pagination, batch-year indexes). Skipped before fetching.
_NON_POST_RE = re.compile(
    r"/(category|tag|author|page|jobs-by-|batch-year|career-advice)/|/page/\d|/\?(s|search|author)=",
    re.I,
)
_TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S | re.I)
_OG_DESC_RE = re.compile(
    r'<meta\s+property="og:description"\s+content="(.*?)"', re.S | re.I
)
_HREF_RE = re.compile(r'href="(https?://[^"]+)"', re.I)
_APPLY_HINT_RE = re.compile(r"career|apply|jobs?/|recruit|vacanc|opening", re.I)


def parse_sitemap_locs(body: str) -> list[tuple[str, str]]:
    """(loc, lastmod) pairs from a sitemap index or urlset. Pure/offline."""
    try:
        root = ET.fromstring(body)
    except ET.ParseError:
        return []
    out: list[tuple[str, str]] = []
    for tag in ("sitemap", "url"):
        for el in root.iter():
            if not el.tag.endswith("}" + tag) and el.tag != tag:
                continue
            loc, lastmod = "", ""
            for child in el:
                t = child.tag.split("}")[-1]
                if t == "loc":
                    loc = (child.text or "").strip()
                elif t == "lastmod":
                    lastmod = (child.text or "").strip()
            if loc:
                out.append((loc, lastmod))
    return out


def _parse_dt(raw: str) -> datetime | None:
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw.strip()[:25], fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except (ValueError, AttributeError):
            continue
    return None


def split_company_role(title: str) -> tuple[str, str]:
    """Heuristic split; raw title always kept in raw_payload."""
    clean = re.sub(r"\s+", " ", (title or "").split("|")[0]).strip()
    parts = _COMPANY_SPLIT_RE.split(clean, maxsplit=1)
    company = parts[0].strip(" -–—:|")
    role = parts[1].strip(" -–—:|") if len(parts) > 1 else ""
    company = re.sub(r"\s*20\d\d\s*$", "", company).strip(" -–—:|")
    return company, role


def pick_apply_url(html: str, post_host: str, post_url: str) -> str:
    """First EXTERNAL link hinting at careers/apply; else the drive post URL
    itself (honest: points at the verified drive announcement)."""
    for m in _HREF_RE.finditer(html):
        url = m.group(1)
        host = (urlparse(url).hostname or "").lower()
        if not host or host == post_host or post_host.endswith(host) or host.endswith(post_host):
            continue
        if _APPLY_HINT_RE.search(url):
            return url
    return post_url


class OffCampusAggregatorsScraper(BaseScraper):
    source_name = "offcampus"
    tier = 2
    rate_limit_seconds = 2.0

    async def _get(self, session, url: str, max_bytes: int = 1_000_000) -> str | None:
        try:
            async with session.get(url, headers=UA, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    return None
                body = await resp.text()
                return body if len(body) < max_bytes else None
        except Exception:  # noqa: BLE001
            return None

    async def _allowed(self, url: str) -> bool:
        try:
            from .utils.robots_checker import RobotsChecker
            return await RobotsChecker().is_allowed(url)
        except Exception:  # noqa: BLE001
            return True

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, SITES, self._scrape_site)
        self._logger.info(f"OffCampus: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_site(self, session, site) -> list[dict[str, Any]]:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=FRESHNESS_HOURS)
        index = await self._get(session, site["sitemap"], max_bytes=300_000)
        if not index:
            return []

        def _sitemap_dt(lastmod: str) -> datetime:
            return _parse_dt(lastmod) or datetime.min.replace(tzinfo=timezone.utc)

        # Newest sitemaps first: archives paginate oldest-first, and today's
        # posts live in the LAST sitemap, not the first.
        candidates = parse_sitemap_locs(index)
        candidates.sort(key=lambda pair: _sitemap_dt(pair[1]), reverse=True)
        child_sitemaps = [
            loc for loc, _ in candidates
            if "post" in loc or "sitemap" in loc
        ][:MAX_SITEMAPS_PER_SITE]
        if not child_sitemaps and candidates:
            child_sitemaps = [candidates[0][0]]

        post_urls: list[str] = []
        for sm in child_sitemaps:
            body = await self._get(session, sm, max_bytes=500_000)
            if not body:
                continue
            for loc, lastmod in parse_sitemap_locs(body):
                if _NON_POST_RE.search(loc):
                    continue
                dt = _parse_dt(lastmod) if lastmod else None
                if dt is None or dt >= cutoff:
                    post_urls.append(loc)
                if len(post_urls) >= MAX_POSTS_PER_SITE:
                    break
            if len(post_urls) >= MAX_POSTS_PER_SITE:
                break

        leads: list[dict[str, Any]] = []
        host = urlparse("https://" + site["source_site"]).hostname or ""
        for post_url in post_urls:
            if not await self._allowed(post_url):
                continue
            html = await self._get(session, post_url)
            if not html:
                continue
            title_m = _TITLE_RE.search(html)
            title = _unescape(re.sub(r"\s+", " ", (title_m.group(1) if title_m else "")).strip())
            if not title:
                continue
            desc_m = _OG_DESC_RE.search(html)
            desc = _unescape(desc_m.group(1) if desc_m else "")[:2000]
            company, role = split_company_role(title)
            if not role or re.fullmatch(r"20\d\d", role):
                role = title[:150]  # year-only remainder is junk; keep full title
            # Aggregator self-reference (a taxonomy page that slipped the URL
            # filter) must never become a company row.
            blob_domain = site["source_site"].split(".")[0]
            if not company or blob_domain in company.lower().replace(" ", ""):
                continue
            blob = f"{title} {desc}".lower()
            leads.append({
                "company_name": company or site["key"],
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": role or title[:150],
                "about_job": desc,
                "experience_required": "",
                "location": "",
                "salary_range": "",
                "job_url": pick_apply_url(html, host, post_url),
                "source_site": site["source_site"],
                "scraped_at": now_iso(),
                "is_fresher": is_fresher_role(title, "", blob),
                "raw_payload": {"post_url": post_url, "title": title[:300]},
            })
        return leads
