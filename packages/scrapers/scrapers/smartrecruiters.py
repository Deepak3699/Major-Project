"""
Tier 3: SmartRecruiters public API scraper.

SRS §4.3 lists SmartRecruiters as a Tier-3 ATS source.
API endpoint: api.smartrecruiters.com/v1/companies/{company}/postings
"""

import json
import asyncio
import aiohttp
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role
from .utils.ats_corpus import corpus_for

logger = logging.getLogger(__name__)



class SmartRecruitersScraper(BaseScraper):
    source_name = "smartrecruiters"
    tier = 3
    rate_limit_seconds = 0.5

    API_URL_TEMPLATE = "https://api.smartrecruiters.com/v1/companies/{company}/postings"

    def __init__(self, redis_client=None, db=None, companies: list[str] | None = None):
        super().__init__(redis_client, db)
        self._companies = companies or corpus_for("smartrecruiters")

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, self._companies, self._scrape_company)
        self._logger.info(f"SmartRecruiters: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_company(self, session, company):
        url = self.API_URL_TEMPLATE.format(company=company)
        status, data = await self._get_json(session, url)
        if status != 200 or data is None:
            self._logger.debug(f"SmartRecruiters: {company} returned {status}")
            return []

        if isinstance(data, dict) and "content" in data:
            jobs = data["content"]
        elif isinstance(data, list):
            jobs = data
        else:
            jobs = []

        leads: list[dict[str, Any]] = []
        for job in jobs:
            if not isinstance(job, dict):
                continue

            job_title = self._as_text(job.get("title") or job.get("name"))
            if not job_title:
                continue

            # experienceLevel / country / ref are objects in some SR API versions
            # and plain strings in others -> always flatten through _as_text so a
            # dict never reaches a TEXT column (asyncpg DataError) or a str method.
            exp_level = self._as_text(
                (job.get("experienceLevel") or {}).get("label")
                if isinstance(job.get("experienceLevel"), dict)
                else job.get("experienceLevel", "")
            )
            is_fresher = is_fresher_role(
                job_title, exp_level, json.dumps(job).lower()
            )

            lead = {
                "company_name": self._as_text(job.get("company")) or company.capitalize(),
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": job_title,
                "about_job": self._as_text(job.get("jobDescription") or job.get("description") or ""),
                "experience_required": exp_level,
                "location": self._extract_location(job),
                "salary_range": "",
                "job_url": self._job_url(job),
                "source_site": f"smartrecruiters.com/{company}",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": job,
            }
            leads.append(lead)
        return leads

    def _job_url(self, job: dict) -> str:
        """Canonical URL; `ref` is a string in the list API but an {uri} object in
        some versions. Fall back to applyUrl/url. Always returns a str.
        """
        ref = job.get("ref")
        ref_url = self._as_text(ref.get("uri") if isinstance(ref, dict) else ref)
        return ref_url or self._as_text(job.get("applyUrl") or job.get("url") or "")

    def _extract_location(self, job: dict) -> str:
        """Build a location string from SmartRecruiters posting.location, which may
        be a dict (city/region/country, each possibly a {code,name} object) or a
        plain string. Flattens everything through _as_text (str-safe).
        """
        loc = job.get("location")
        if isinstance(loc, dict):
            parts = [self._as_text(loc.get(k)) for k in ("city", "region")]
            country = loc.get("country")
            # country is a 2-letter code string in the list API; keep as-is,
            # but if an object, _as_text picks its name.
            parts.append(self._as_text(country) if isinstance(country, dict) else (country or ""))
            return ", ".join(p for p in parts if p)
        return self._as_text(loc)
