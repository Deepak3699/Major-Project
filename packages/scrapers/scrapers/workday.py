"""
Tier 3: Workday ATS scraper.

Workday tenants expose predictable REST endpoints. This scraper iterates
known company Workday tenants and queries their job search API.

SRS §4.3 lists Workday as a Tier-3 ATS source.
"""

import json
import re
import asyncio
import aiohttp
import logging
from typing import Any
from urllib.parse import urlparse

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

# Known Workday tenant slugs
KNOWN_WORKDAY_TENANTS = [
    "accenture", "adobe", "cisco", "dell", "hewlettpackardenterprise",
    "hitachivantara", "ibm", "intel", "microsoft", "oracle",
    "salesforce", "sap", "servicenow", "snowflake", "splunk",
    "vmware", "workday",
]


class WorkdayScraper(BaseScraper):
    source_name = "workday"
    tier = 3
    rate_limit_seconds = 1.0

    def __init__(self, redis_client=None, db=None, tenants: list[str] | None = None):
        super().__init__(redis_client, db)
        self._tenants = tenants or KNOWN_WORKDAY_TENANTS

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []

        async with aiohttp.ClientSession() as session:
            for tenant in self._tenants:
                url = f"https://{tenant}.my.workday.com/ccx/service/{tenant}/JobBoards/JobSearchResults"
                try:
                    async with session.get(
                        url,
                        params={"jobSearch": "fresher", "location": "india"},
                        headers={"User-Agent": "HireGen-LeadGen/1.0"},
                        timeout=aiohttp.ClientTimeout(total=15),
                    ) as resp:
                        if resp.status == 404 or resp.status == 403:
                            continue
                        if resp.status != 200:
                            self._logger.warning(f"Workday: {tenant} returned {resp.status}")
                            continue

                        text = await resp.text()
                        # Workday returns HTML with embedded JSON
                        json_match = re.search(r'window\.__INITIAL_STATE__\s*=\s*({.*?})\s*;</script>', text, re.DOTALL)
                        if json_match:
                            data = json.loads(json_match.group(1))
                        else:
                            continue

                        jobs = self._extract_jobs(data)
                        for job in jobs:
                            job_title = job.get("title", job.get("positionName", ""))
                            if not job_title:
                                continue

                            is_fresher = is_fresher_role(
                                job_title,
                                job.get("experience", ""),
                                json.dumps(job).lower(),
                            )

                            if is_fresher:
                                lead = {
                                    "company_name": tenant,
                                    "about_company": "",
                                    "hr_name": "",
                                    "hr_email": "",
                                    "company_email": f"careers@{tenant}.com",
                                    "hr_mobile": "",
                                    "company_mobile": "",
                                    "hr_linkedin_url": "",
                                    "job_title": job_title,
                                    "about_job": job.get("description", job.get("jobDescription", "")),
                                    "experience_required": job.get("experienceLevel", ""),
                                    "salary_range": "",
                                    "job_url": job.get("jobUrl", job.get("externalApplyUrl", "")),
                                    "source_site": f"workday.com/{tenant}",
                                    "scraped_at": now_iso(),
                                    "is_fresher": is_fresher,
                                    "raw_payload": job,
                                }
                                leads.append(lead)

                except json.JSONDecodeError:
                    self._logger.warning(f"Workday: {tenant} returned non-JSON")
                    continue
                except asyncio.TimeoutError:
                    self._logger.warning(f"Workday: {tenant} timed out")
                    continue
                except aiohttp.ClientError as e:
                    self._logger.warning(f"Workday: {tenant} HTTP error: {e}")
                    continue

        self._logger.info(f"Workday: scraped {len(leads)} raw leads")
        return leads

    def _extract_jobs(self, data: Any) -> list[dict]:
        """Extract job list from Workday JSON response."""
        if isinstance(data, dict):
            if "jobs" in data:
                return data["jobs"]
            for key in ("report_Entry", "jobPosting", "result"):
                if key in data and isinstance(data[key], list):
                    return data[key]
            for value in data.values():
                if isinstance(value, list) and value and isinstance(value[0], dict):
                    return value
        elif isinstance(data, list):
            return data
        return []
