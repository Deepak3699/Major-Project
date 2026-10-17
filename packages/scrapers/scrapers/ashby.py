"""
Tier 3: Ashby ATS JSON API scraper.

Endpoint: https://api.ashbyhq.com/posting-api/job-board/{company}
Returns structured JSON for companies using Ashby as their ATS.
Companies not on Ashby return 404 — skipped gracefully.
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



class AshbyScraper(BaseScraper):
    source_name = "ashby"
    tier = 3
    rate_limit_seconds = 0.5

    API_URL_TEMPLATE = "https://api.ashbyhq.com/posting-api/job-board/{company}"

    def __init__(self, redis_client=None, db=None, companies: list[str] | None = None):
        super().__init__(redis_client, db)
        self._companies = companies or corpus_for("ashby")

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, self._companies, self._scrape_company)
        self._logger.info(f"Ashby: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_company(self, session, company):
        url = self.API_URL_TEMPLATE.format(company=company)
        status, data = await self._get_json(session, url)
        if status != 200 or data is None:
            self._logger.debug(f"Ashby: {company} returned {status}")
            return []

        jobs = data.get("jobs", []) if isinstance(data, dict) else []

        leads: list[dict[str, Any]] = []
        for job in jobs:
            if not isinstance(job, dict):
                continue

            job_title = job.get("title", "")
            if not job_title:
                continue

            is_fresher = is_fresher_role(job_title, "", json.dumps(job).lower())
            hr_info = self._extract_hr_info(job)
            experience_required = self._extract_experience(job)

            lead = {
                "company_name": company,
                "about_company": "",
                "hr_name": hr_info.get("name", ""),
                "hr_email": hr_info.get("email", ""),
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": hr_info.get("linkedin", ""),
                "job_title": job_title,
                "about_job": job.get("descriptionHtml", "") or job.get("jobDescriptionHtml", ""),
                "experience_required": experience_required,
                "location": self._as_text(job.get("location") or job.get("secondaryLocation") or ""),
                "salary_range": self._as_text(job.get("compensation", {}).get("compensationTierSummary", "") if isinstance(job.get("compensation"), dict) else ""),
                "job_url": job.get("applyUrl", "") or job.get("jobUrl", "") or job.get("url", ""),
                "source_site": f"ashbyhq.com/{company}",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": job,
            }
            leads.append(lead)
        return leads

    def _extract_hr_info(self, job: dict[str, Any]) -> dict[str, str]:
        """Extract HR name/contact from job posting metadata."""
        result: dict[str, str] = {}

        for field in ["recruiterName", "postedByName", "hiringManagerName"]:
            val = job.get(field, "")
            if val:
                result["name"] = str(val)
                break

        for field in ["recruiterEmail", "contactEmail", "email"]:
            val = job.get(field, "")
            if val:
                result["email"] = str(val)
                break

        for field in ["recruiterLinkedin", "contactLinkedin"]:
            val = job.get(field, "")
            if val:
                result["linkedin"] = str(val)
                break

        return result

    def _extract_experience(self, job: dict[str, Any]) -> str:
        """Extract experience requirements."""
        text_fields = [
            job.get("descriptionHtml", ""),
            job.get("jobDescriptionHtml", ""),
            str(job.get("experience", "")),
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
