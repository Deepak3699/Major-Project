"""
Tier 2: Amazon Jobs public search API scraper (India).

Pre-flight verified: GET
https://www.amazon.jobs/en/search.json?base_query=intern&country=IND
returns 200 JSON {hits, jobs: [{title, location, posted_date, job_path,
description, basic_qualifications, is_intern, ...}]}\u2014no key, no login.

Fresher strategy: intern + fresher + graduate base queries scoped to India
(country=IND), one page each (polite cap). company_name on Amazon postings
is a site code ("ASSPL - Telangana - D82"), so the employer is recorded as
Amazon with the site kept in the location string.
"""

import asyncio
import aiohttp
import logging
from typing import Any
from urllib.parse import urlencode

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

SEARCH_URL = "https://www.amazon.jobs/en/search.json"
QUERIES = [
    {"base_query": "intern", "country": "IND"},
    {"base_query": "fresher", "country": "IND"},
    {"base_query": "graduate", "country": "IND"},
]
RESULT_LIMIT = 50


class AmazonJobsScraper(BaseScraper):
    source_name = "amazon"
    tier = 2
    rate_limit_seconds = 2.0

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, QUERIES, self._scrape_query)
        self._logger.info(f"AmazonJobs: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_query(self, session, query) -> list[dict[str, Any]]:
        params = {**query, "result_limit": RESULT_LIMIT}
        try:
            async with session.get(
                SEARCH_URL + "?" + urlencode(params),
                headers={"User-Agent": "HireGen-LeadGen/1.0"},
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json(content_type=None)
        except Exception:  # noqa: BLE001
            return []
        jobs = data.get("jobs") if isinstance(data, dict) else None
        if not isinstance(jobs, list):
            return []

        leads: list[dict[str, Any]] = []
        for job in jobs:
            if not isinstance(job, dict):
                continue
            title = str(job.get("title", "") or "")
            if not title:
                continue
            site = str(job.get("company_name", "") or "")
            location = str(job.get("location", "") or "")
            if site and site not in location:
                location = f"{location} ({site})".strip(" ()")
            desc = str(job.get("description", "") or "")
            quals = str(job.get("basic_qualifications", "") or "")
            blob = f"{title} {desc} {quals}".lower()
            if job.get("is_intern"):
                blob += " internship"
            leads.append({
                "company_name": "Amazon",
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title,
                "about_job": (desc[:1500] + "\n" + quals[:500]).strip(),
                "experience_required": "",
                "location": location,
                "salary_range": "",
                "job_url": f"https://www.amazon.jobs{job.get('job_path', '')}",
                "source_site": "amazon.jobs",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher_role(title, "", blob),
                "raw_payload": {"id": job.get("id"), "posted_date": job.get("posted_date")},
            })
        return leads
