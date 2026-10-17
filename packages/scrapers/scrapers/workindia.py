"""
Tier 2: WorkIndia.in scraper — India frescher/entry-level + blue/white-collar jobs.

WorkIndia is a large India portal with a strong fresher/entry-level segment. It is
a Next.js app; listing data is largely client-rendered, so this adapter uses the
shared escalating http layer (curl_cffi TLS-impersonation → Playwright+stealth)
and parses job cards heuristically. When the page is JS-only it degrades to zero
leads (circuit breaker counts it as a soft miss) rather than crashing.

Extracts per SRS §4.4 schema. Best-effort: selectors are heuristic and the
normalizer + India geo-gate re-validate every record.
"""

import re
import logging
from typing import Any

from .base import BaseScraper, now_iso

logger = logging.getLogger(__name__)

BS4_AVAILABLE = True
try:
    from bs4 import BeautifulSoup
except ImportError:
    BS4_AVAILABLE = False


class WorkIndiaScraper(BaseScraper):
    source_name = "workindia"
    tier = 2
    rate_limit_seconds = 3.0

    BASE = "https://workindia.in"
    # WorkIndia's public fresher/entry-level search listing.
    LIST_URLS = [
        "https://workindia.in/jobs/fresher-jobs",
        "https://workindia.in/job-search?searchWord=entry+level",
    ]

    async def _render(self, url: str) -> str:
        from .utils.http_client import fetch
        try:
            resp = await fetch(url, timeout=45, min_engine="playwright", max_engine="playwright")
            if len(resp.text) > 500:
                return resp.text
        except Exception as e:  # noqa: BLE001
            logger.debug(f"Playwright render failed for {url}: {e}; falling back to curl_cffi")
        try:
            return (await fetch(url, timeout=25, min_engine="curl", max_engine="curl")).text
        except Exception as e:  # noqa: BLE001
            logger.warning(f"All render engines failed for {url}: {e}")
            return ""

    async def scrape(self) -> list[dict[str, Any]]:
        if not BS4_AVAILABLE:
            self._logger.warning("beautifulsoup4 unavailable; WorkIndia skipped")
            return []

        from .utils.fresher_classifier import is_fresher_role
        leads: list[dict[str, Any]] = []
        seen: set[str] = set()

        for url in self.LIST_URLS:
            soup = BeautifulSoup(await self._render(url), "html.parser")
            cards = soup.find_all("div", class_=re.compile(r"jobCard|job-card|JobCard|listingCard"))
            if not cards:
                cards = soup.find_all("a", href=re.compile(r"/job[-/]|/job-detail/"))

            for card in cards[:120]:
                link = card if card.name == "a" else card.find("a", href=True)
                href = (link or {}).get("href", "") if link else ""
                job_url = href if href.startswith("http") else (self.BASE + href if href.startswith("/") else "")
                if not job_url or job_url in seen:
                    continue

                title = ""
                t = card.find(attrs={"class": re.compile(r"title|jobTitle|role|designation")})
                if t:
                    title = t.get_text(strip=True)
                if not title and link:
                    title = link.get_text(strip=True)
                title = title[:120]
                if not title or len(title) < 3:
                    continue
                seen.add(job_url)

                comp = card.find(attrs={"class": re.compile(r"company|organi[sz]ation|employer")})
                company_name = comp.get_text(strip=True)[:80] if comp else ""
                loc = card.find(attrs={"class": re.compile(r"location|city|place")})
                location = loc.get_text(strip=True)[:80] if loc else ""

                leads.append({
                    "company_name": company_name, "about_company": "", "hr_name": "",
                    "hr_email": "", "company_email": "", "hr_mobile": "",
                    "company_mobile": "", "hr_linkedin_url": "",
                    "job_title": title, "about_job": title, "experience_required": "0-1 years",
                    "location": location, "salary_range": "", "job_url": job_url,
                    "source_site": "workindia.in", "scraped_at": now_iso(),
                    "is_fresher": is_fresher_role(title, "", location.lower() + " fresher entry"),
                    "raw_payload": {"title": title, "url": job_url, "company": company_name},
                })

        self._logger.info(f"WorkIndia: scraped {len(leads)} raw leads")
        return leads
