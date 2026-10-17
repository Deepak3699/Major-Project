"""
Tier 2: Naukri.com job listings scraper.

Naukri.com is one of India's largest job portals. The main site is JS-heavy
and behind anti-bot protection, so this scraper uses Playwright browser automation
per SRS §3.3. Falls back to static HTML parsing if Playwright is unavailable.

Extracts per SRS §4.4 schema.
"""

import json
import re
import asyncio
import aiohttp
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


class NaukriScraper(BaseScraper):
    source_name = "naukri"
    tier = 2
    rate_limit_seconds = 3.0

    API_URL = "https://www.naukri.com/fresher-jobs"

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
        headers = {"User-Agent": self._get_user_agent()}

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.API_URL, headers=headers,
                                       timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        self._logger.warning(f"Naukri: HTTP {resp.status}, trying Playwright")
                        html = await self._scrape_with_playwright(self.API_URL)
                    else:
                        html = await resp.text()
        except aiohttp.ClientError:
            html = await self._scrape_with_playwright(self.API_URL)

        if not BS4_AVAILABLE:
            raise ScraperError("beautifulsoup4 required for Naukri parsing")

        soup = BeautifulSoup(html, "html.parser")

        job_cards = soup.find_all("div", class_=re.compile(r"jobCard|srpTuple"))
        if not job_cards:
            job_cards = soup.find_all("a", href=re.compile(r"/job/"))

        for card in job_cards[:100]:
            title_elem = card.find(attrs={"class": re.compile(r"title|jobTitle")}) or card
            job_title = title_elem.get_text(strip=True)[:120]
            if not job_title or "Page" in job_title:
                continue

            link_elem = card.find("a", href=True) if card.name != "a" else card
            job_url = link_elem["href"] if link_elem and link_elem.get("href") else ""
            if job_url and not job_url.startswith("http"):
                job_url = f"https://www.naukri.com{job_url}"

            company_elem = card.find(attrs={"class": re.compile(r"company|orgName|eCo")})
            company_name = company_elem.get_text(strip=True)[:80] if company_elem else ""

            experience_text = job_title + " " + (company_name or "")
            is_fresher = is_fresher_role(job_title, "", experience_text.lower())

            location_elem = card.find(attrs={"class": re.compile(r"location|loc")})
            location = location_elem.get_text(strip=True)[:80] if location_elem else ""

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
                "source_site": "naukri.com",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {"title": job_title, "url": job_url},
            }
            leads.append(lead)

        self._logger.info(f"Naukri: scraped {len(leads)} raw leads")
        return leads
