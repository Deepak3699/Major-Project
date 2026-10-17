"""
Tier 3: Breezy HR JSON API scraper.

Endpoint: https://{company}.breezy.hr/json
Returns a JSON list of job postings for companies using Breezy.
Companies not on Breezy return 404 — skipped gracefully.
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



class BreezyScraper(BaseScraper):
    source_name = "breezy"
    tier = 3
    rate_limit_seconds = 0.5

    API_URL_TEMPLATE = "https://{company}.breezy.hr/json"

    def __init__(self, redis_client=None, db=None, companies: list[str] | None = None):
        super().__init__(redis_client, db)
        self._companies = companies or corpus_for("breezy")

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, self._companies, self._scrape_company)
        self._logger.info(f"Breezy: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_company(self, session, company):
        url = self.API_URL_TEMPLATE.format(company=company)
        status, data = await self._get_json(session, url)
        if status != 200 or data is None:
            self._logger.debug(f"Breezy: {company} returned {status}")
            return []

        jobs = data if isinstance(data, list) else []

        leads: list[dict[str, Any]] = []
        for job in jobs:
            if not isinstance(job, dict):
                continue

            job_title = job.get("name", "") or job.get("title", "")
            if not job_title:
                continue

            is_fresher = is_fresher_role(job_title, "", json.dumps(job).lower())
            hr_info = self._extract_hr_info(job)
            experience_required = self._extract_experience(job)

            location = self._as_text(job.get("location"))
            if not location and job.get("remote", False):
                location = "Remote"

            job_url = job.get("url", "") or job.get("hosted_url", "")
            if job_url and not job_url.startswith("http"):
                job_url = f"https://{company}.breezy.hr{job_url}"

            lead = {
                "company_name": self._as_text(job.get("company")) or company,
                "about_company": "",
                "hr_name": hr_info.get("name", ""),
                "hr_email": hr_info.get("email", ""),
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": hr_info.get("linkedin", ""),
                "job_title": job_title,
                "about_job": "",
                "experience_required": experience_required,
                "location": location,
                "salary_range": "",
                "job_url": job_url,
                "source_site": f"breezy.hr/{company}",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": job,
            }
            leads.append(lead)
        return leads

    def _extract_hr_info(self, job: dict[str, Any]) -> dict[str, str]:
        """Extract HR name/contact from job posting metadata."""
        result: dict[str, str] = {}

        for field in ["recruiter_name", "posted_by", "hiring_manager", "contact_name"]:
            val = job.get(field, "")
            if val:
                result["name"] = str(val)
                break

        for field in ["recruiter_email", "contact_email", "email"]:
            val = job.get(field, "")
            if val:
                result["email"] = str(val)
                break

        for field in ["recruiter_linkedin", "contact_linkedin"]:
            val = job.get(field, "")
            if val:
                result["linkedin"] = str(val)
                break

        return result

    def _extract_experience(self, job: dict[str, Any]) -> str:
        """Extract experience requirements."""
        text_fields = [
            job.get("description", ""),
            job.get("requirements", ""),
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
