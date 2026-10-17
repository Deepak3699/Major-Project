"""
Tier 3: Teamtailor ATS HTML scraper.

Fetches https://{company}.teamtailor.com/jobs and parses job links from HTML.
The public API requires auth, so we use HTML scraping with BeautifulSoup.
If bs4 is unavailable, gracefully returns empty results.
"""

import json
import re
import asyncio
import aiohttp
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role
from .utils.ats_corpus import corpus_for

logger = logging.getLogger(__name__)

BS4_AVAILABLE = True
try:
    from bs4 import BeautifulSoup
except ImportError:
    BS4_AVAILABLE = False



class TeamtailorScraper(BaseScraper):
    source_name = "teamtailor"
    tier = 3
    rate_limit_seconds = 1.0

    API_URL_TEMPLATE = "https://{company}.teamtailor.com/jobs"

    def __init__(self, redis_client=None, db=None, companies: list[str] | None = None):
        super().__init__(redis_client, db)
        self._companies = companies or corpus_for("teamtailor")

    async def scrape(self) -> list[dict[str, Any]]:
        if not BS4_AVAILABLE:
            self._logger.warning("Teamtailor: BeautifulSoup not available, skipping")
            return []

        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, self._companies, self._scrape_company)
        self._logger.info(f"Teamtailor: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_company(self, session, company):
        url = self.API_URL_TEMPLATE.format(company=company)
        async with session.get(
            url,
            headers={"User-Agent": self._get_user_agent()},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as resp:
            if resp.status != 200:
                self._logger.debug(f"Teamtailor: {company} returned {resp.status}")
                return []
            html = await resp.text()

        soup = BeautifulSoup(html, "html.parser")

        leads: list[dict[str, Any]] = []
        for link in soup.find_all("a", href=re.compile(r"/jobs/")):
            job_title = link.get_text(strip=True)
            if not job_title or len(job_title) < 3:
                continue
            if job_title.lower() in ("jobs", "all jobs", "view all", "see all jobs"):
                continue

            href = link.get("href", "")
            job_url = href if href.startswith("http") else f"https://{company}.teamtailor.com{href}"

            is_fresher = is_fresher_role(job_title, "", "")
            experience_required = "fresher/0-1 years" if is_fresher else ""

            # Try to extract location from parent/sibling
            location = ""
            parent = link.find_parent("div") or link.find_parent("li")
            if parent:
                loc_el = parent.find(class_=re.compile(r"location|address|place", re.I))
                if loc_el:
                    location = loc_el.get_text(strip=True)

            lead = {
                "company_name": company,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": job_title,
                "about_job": "",
                "experience_required": experience_required,
                "location": location,
                "salary_range": "",
                "job_url": job_url,
                "source_site": f"teamtailor.com/{company}",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {"title": job_title, "url": job_url, "company": company},
            }
            leads.append(lead)
        return leads

    def _extract_hr_info(self, job: dict[str, Any]) -> dict[str, str]:
        """Extract HR name/contact — limited data available from HTML."""
        result: dict[str, str] = {}
        for field in ["recruiter_name", "posted_by", "contact_name"]:
            val = job.get(field, "")
            if val:
                result["name"] = str(val)
                break
        for field in ["recruiter_email", "contact_email", "email"]:
            val = job.get(field, "")
            if val:
                result["email"] = str(val)
                break
        return result

    def _extract_experience(self, job: dict[str, Any]) -> str:
        """Extract experience requirements from text."""
        text_fields = [
            job.get("description", ""),
            job.get("about_job", ""),
            json.dumps(job),
        ]
        combined = " ".join(str(f) for f in text_fields if f).lower()

        for pattern in [
            r"\b(\d+[\.\d]*)-(\d+[\.\d]*) years? of experience",
            r"\b(\d+[\.\d]*)-(\d+[\.\d]*) years? experience",
            r"\b(\d+) years? of relevant experience",
        ]:
            match = re.search(pattern, combined)
            if match:
                if match.lastindex and match.lastindex >= 2:
                    return f"{match.group(1)}-{match.group(2)} years"
                return f"{match.group(1)}+ years"

        if is_fresher_role("", "", combined):
            return "fresher/0-1 years"

        return ""
