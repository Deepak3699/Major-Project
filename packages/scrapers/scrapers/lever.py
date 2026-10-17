"""
Tier 3: Lever ATS JSON API scraper.

Pre-flight verified: https://api.lever.co/v0/postings/{company}?mode=json
Returns structured JSON for companies using Lever.
Tested live: Vevo → returns full job data with descriptions.

Companies that DON'T use Lever return {"ok":false,"error":"Document not found"}.
This is expected behavior — we iterate known Lever company slugs.
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





class LeverScraper(BaseScraper):
    source_name = "lever"
    tier = 3
    rate_limit_seconds = 0.5

    API_URL_TEMPLATE = "https://api.lever.co/v0/postings/{company}?mode=json&include=description"

    def __init__(self, redis_client=None, db=None, companies: list[str] | None = None):
        super().__init__(redis_client, db)
        self._companies = companies or corpus_for("lever")

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, self._companies, self._scrape_company)
        self._logger.info(f"Lever: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_company(self, session, company):
        url = self.API_URL_TEMPLATE.format(company=company)
        status, data = await self._get_json(session, url)
        if status != 200 or data is None:
            self._logger.debug(f"Lever: {company} returned {status}")
            return []

        # Lever returns {"ok":false,"error":"Document not found"} for non-Lever companies
        if isinstance(data, dict) and data.get("ok") is False:
            self._logger.debug(f"Lever: {company} does not use Lever")
            return []

        if isinstance(data, dict) and "jobs" in data:
            jobs = data["jobs"]
        elif isinstance(data, list):
            jobs = data
        elif isinstance(data, dict) and "postings" in data:
            jobs = data["postings"]
        else:
            jobs = [data] if isinstance(data, dict) else []

        leads: list[dict[str, Any]] = []
        for job in jobs:
            if not isinstance(job, dict):
                continue

            job_title = job.get("title", "") or job.get("text", "") or job.get("openingPlain", "")
            if not job_title:
                continue

            is_fresher = is_fresher_role(job_title, "", json.dumps(job).lower())
            experience_required = self._extract_experience(job)
            hr_info = self._extract_hr_info(job)

            lead = {
                "company_name": company.capitalize(),
                "about_company": job.get("company", ""),
                "hr_name": hr_info.get("name", ""),
                "hr_email": hr_info.get("email", ""),
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": hr_info.get("linkedin", ""),
                "job_title": job_title,
                "about_job": job.get("descriptionPlain", "") or job.get("descriptionBodyPlain", ""),
                "experience_required": experience_required,
                "location": (job.get("categories") or {}).get("location", "") if isinstance(job.get("categories"), dict) else "",
                "salary_range": self._as_text(job.get("salaryRange") or job.get("salaryDescription") or ""),
                "job_url": job.get("applyUrl", "") or job.get("hostedUrl", ""),
                "source_site": f"lever.co/{company}",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": job,
            }
            leads.append(lead)
        return leads

    def _extract_experience(self, job: dict[str, Any]) -> str:
        text = json.dumps(job).lower()
        for pattern in [
            r"\b(\d+[\.\d]*)-(\d+[\.\d]*) years? of experience",
            r"\b(\d+[\.\d]*)-(\d+[\.\d]*) years? experience",
        ]:
            match = re.search(pattern, text)
            if match:
                return f"{match.group(1)}-{match.group(2)} years"
        if is_fresher_role("", "", text):
            return "fresher/0-1 years"
        return ""

    def _extract_hr_info(self, job: dict[str, Any]) -> dict[str, str]:
        result = {}
        for field in ["recruiter_name", "poster_name", "contact_name", "hiring_manager"]:
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
