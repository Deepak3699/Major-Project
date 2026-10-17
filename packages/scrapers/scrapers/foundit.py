"""
Tier 2: Foundit (formerly Monster India) scrapers.

Uses Playwright browser automation (SRS §3.3) — Foundit is JS-rendered.

Extracts per SRS §4.4 schema.
"""

import json
import re
import asyncio
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

BS4_AVAILABLE = True
try:
    from bs4 import BeautifulSoup
except ImportError:
    BS4_AVAILABLE = False


class FounditScraper(BaseScraper):
    source_name = "foundit"
    tier = 2
    rate_limit_seconds = 3.0

    API_URL = "https://www.foundit.in/s/feed/fresher"

    async def _scrape_with_playwright(self, url: str) -> str:
        """Render a JS-heavy page via the shared escalating HTTP layer.

        Prefers Playwright+stealth (now proxy-aware + best-effort CAPTCHA solve);
        if no browser is installed or it is blocked, degrades to curl_cffi TLS
        impersonation instead of aborting the whole source (SRS §3.3 / §9.4).
        """
        from .utils.http_client import fetch
        try:
            resp = await fetch(url, timeout=45, min_engine="playwright", max_engine="playwright")
            if len(resp.text) > 500:
                return resp.text
        except Exception as e:  # noqa: BLE001
            logger.debug(f"Playwright render failed for {url}: {e}; falling back to curl_cffi")
        try:
            resp = await fetch(url, timeout=25, min_engine="curl", max_engine="curl")
            return resp.text
        except Exception as e:  # noqa: BLE001
            logger.warning(f"All render engines failed for {url}: {e}")
            return ""

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []

        html = await self._scrape_with_playwright(self.API_URL)

        if not BS4_AVAILABLE:
            raise ScraperError("beautifulsoup4 required for Foundit parsing")

        soup = BeautifulSoup(html, "html.parser")

        job_cards = soup.find_all("div", class_=re.compile(r"jobCard|job-card|search-result"))
        if not job_cards:
            job_cards = soup.find_all("a", href=re.compile(r"/s/feed/job/"))

        for card in job_cards[:100]:
            title_elem = card.find(attrs={"class": re.compile(r"title|jobTitle|role")})
            if not title_elem:
                title_elem = card
            job_title = title_elem.get_text(strip=True)[:120]
            if not job_title:
                continue

            company_elem = card.find(attrs={"class": re.compile(r"company|organization")})
            company_name = company_elem.get_text(strip=True)[:80] if company_elem else ""

            link_elem = card.find("a", href=True)
            job_url = link_elem["href"] if link_elem and link_elem.get("href") else ""
            if job_url and not job_url.startswith("http"):
                job_url = f"https://www.foundit.in{job_url}"

            location_elem = card.find(attrs={"class": re.compile(r"location|loc")})
            location = location_elem.get_text(strip=True)[:80] if location_elem else ""

            experience_text = job_title + " " + (company_name or "") + " " + location
            is_fresher = is_fresher_role(job_title, "", experience_text.lower())

            lead = {
                "company_name": company_name,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": job_title,
                "about_job": job_title,
                "experience_required": "",
                "location": location,
                "salary_range": "",
                "job_url": job_url,
                "source_site": "foundit.in",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {"title": job_title, "url": job_url},
            }
            leads.append(lead)

        self._logger.info(f"Foundit: scraped {len(leads)} raw leads")
        return leads
