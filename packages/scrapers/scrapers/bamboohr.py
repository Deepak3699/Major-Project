"""
Tier 3: BambooHR public JSON API scraper.

Pre-flight verified: https://freshworks.bamboohr.com/careers/list
Returns {"meta": ..., "result": [{id, jobOpeningName, departmentLabel,
location: {city, state}, employmentStatusLabel, isRemote, ...}]}.
Posting pages live at https://{company}.bamboohr.com/careers/{id} (200 OK).
A non-BambooHR slug 302-redirects to a login page -> skipped by _sweep.
List items carry no description; about_job stays empty (honest partial data).
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


class BambooHRScraper(BaseScraper):
    source_name = "bamboohr"
    tier = 3
    rate_limit_seconds = 0.5

    API_URL_TEMPLATE = "https://{company}.bamboohr.com/careers/list"
    POST_URL_TEMPLATE = "https://{company}.bamboohr.com/careers/{id}"

    def __init__(self, redis_client=None, db=None, companies: list[str] | None = None):
        super().__init__(redis_client, db)
        self._companies = companies or corpus_for("bamboohr")

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, self._companies, self._scrape_company)
        self._logger.info(f"BambooHR: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_company(self, session, company):
        url = self.API_URL_TEMPLATE.format(company=company)
        status, data = await self._get_json(session, url)
        if status != 200 or not isinstance(data, dict):
            return []
        jobs = data.get("result") or []
        if not isinstance(jobs, list):
            return []

        leads: list[dict[str, Any]] = []
        for job in jobs:
            if not isinstance(job, dict):
                continue
            title = str(job.get("jobOpeningName", "") or "")
            if not title:
                continue
            loc = job.get("location") or {}
            city = str(loc.get("city", "") or "")
            state = str(loc.get("state", "") or "")
            location = ", ".join(p for p in (city, state) if p)
            dept = str(job.get("departmentLabel", "") or "")
            blob = json.dumps(job).lower()
            lead = {
                "company_name": company,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title,
                "about_job": dept,
                "experience_required": "",
                "location": location,
                "salary_range": "",
                "job_url": self.POST_URL_TEMPLATE.format(company=company, id=job.get("id", "")),
                "source_site": f"bamboohr.com/{company}",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher_role(title, dept, blob),
                "raw_payload": job,
            }
            leads.append(lead)
        return leads
