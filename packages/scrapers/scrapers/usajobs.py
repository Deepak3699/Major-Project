"""
Tier 1: USAJobs (U.S. federal government) API scraper.

Per SRS §4.3, USAJobs is a Tier-1 government portal source.
Requires a free USAJobs API key (Authorization-Key header).
"""

import json
import os
import asyncio
import aiohttp
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)


class USAJobsScraper(BaseScraper):
    source_name = "usajobs"
    tier = 1
    rate_limit_seconds = 2.0

    API_URL = "https://data.usajobs.gov/api/search"
    HEADERS = {
        "User-Agent": "HireGen-LeadGen/1.0",
        "Accept": "application/json",
    }

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []

        headers = dict(self.HEADERS)
        api_key = os.environ.get("USAJOBS_API_KEY") or os.environ.get("USAJOBS_AUTH_KEY")
        if api_key:
            headers["Authorization-Key"] = api_key

        params = {
            "Keyword": "fresher OR entry level OR internship OR campus hire",
            "Location": "United States",
            "ResultsPerPage": 50,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.API_URL, params=params, headers=headers,
                                       timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        if resp.status == 401:
                            raise ScraperError(
                                "USAJobs API requires Authorization-Key header. "
                                "Set USAJOBS_API_KEY in environment."
                            )
                        raise ScraperError(f"USAJobs API returned {resp.status}")
                    data = json.loads(await resp.text())

            if not api_key:
                self._logger.warning(
                    "USAJobs: running without API key — 401 expected. Set USAJOBS_API_KEY."
                )

            items = data.get("SearchResult", {}).get("SearchResultItems", [])
            for item in items:
                job = item.get("MatchedObject", {})
                if not job:
                    continue

                job_title = job.get("JobTitle", "") or job.get("PositionTitle", "")
                if not job_title:
                    continue

                company_name = job.get("OrganizationName", "") or job.get("Agency", "")
                experience_required = json.dumps(job.get("Grade", ""))
                is_fresher = is_fresher_role(
                    job_title, json.dumps(job).lower(), json.dumps(job).lower()
                )

                lead = {
                    "company_name": company_name,
                    "about_company": job.get("Agency", ""),
                    "hr_name": "",
                    "hr_email": "",
                    "company_email": "",
                    "hr_mobile": "",
                    "company_mobile": "",
                    "hr_linkedin_url": "",
                    "job_title": job_title,
                    "about_job": job.get("JobSynopsis", job.get("Description", "")),
                    "experience_required": experience_required,
                    "salary_range": job.get("Salary", job.get("PayScale", "")),
                    "job_url": job.get("DetailUrl", job.get("ApplyLink", "")),
                    "source_site": "usajobs.gov",
                    "scraped_at": now_iso(),
                    "is_fresher": is_fresher,
                    "raw_payload": item,
                }
                leads.append(lead)

            self._logger.info(f"USAJobs: scraped {len(leads)} raw leads")
            return leads

        except json.JSONDecodeError:
            raise ScraperError("Failed to parse USAJobs JSON")
        except asyncio.TimeoutError:
            raise ScraperError("USAJobs API timed out")
        except aiohttp.ClientError as e:
            raise ScraperError(f"HTTP error: {e}")
