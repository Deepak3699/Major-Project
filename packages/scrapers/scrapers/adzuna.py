"""
Tier 1: Adzuna job search API scraper.

Requires free-tier API key (1,000 calls/month). The scraper adapter is fully
implemented; live execution requires ADZUNA_APP_ID and ADZUNA_APP_KEY env vars.

SRS §4.3 lists Adzuna as a Tier-1 source for India-region entry-level search.
"""

import json
import asyncio
import aiohttp
import logging
import os
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

# India fresher/entry-level keywords per SRS §4.2
FRESHER_QUERY_SUFFIX = "fresher OR 0-1 years OR entry level OR campus hire"


class AdzunaScraper(BaseScraper):
    source_name = "adzuna"
    tier = 1
    rate_limit_seconds = 1.0

    API_URL = "https://api.adzuna.com/v1/api/jobs/in/search"
    APP_ID = os.environ.get("ADZUNA_APP_ID", "")
    APP_KEY = os.environ.get("ADZUNA_APP_KEY", "")

    async def scrape(self) -> list[dict[str, Any]]:
        if not self.APP_ID or not self.APP_KEY:
            raise ScraperError("Adzuna API credentials not configured (ADZUNA_APP_ID/ADZUNA_APP_KEY)")

        leads: list[dict[str, Any]] = []
        headers = {"User-Agent": "HireGen-LeadGen/1.0"}

        # Search for fresher/entry-level jobs in India
        query = "fresher OR entry level OR 0-1 years OR campus hire"
        url = (
            f"{self.API_URL}/1?app_id={self.APP_ID}&app_key={self.APP_KEY}"
            f"&results_per_page=50&what={query}&where=india&fresher_jobs=1"
        )

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        raise ScraperError(f"Adzuna API returned {resp.status}")
                    data = json.loads(await resp.text())

            jobs = data.get("results", [])
            for job in jobs:
                job_title = job.get("title", "")
                if not job_title:
                    continue

                experience_required = job.get("salary_min", "") or ""
                is_fresher = is_fresher_role(job_title, str(experience_required), json.dumps(job).lower())

                lead = {
                    "company_name": job.get("company", {}).get("display_name", ""),
                    "about_company": "",
                    "hr_name": "",
                    "hr_email": "",
                    "company_email": job.get("company", {}).get("display_name", "").lower().replace(" ", "") + "@example.com",
                    "hr_mobile": "",
                    "company_mobile": "",
                    "hr_linkedin_url": "",
                    "job_title": job_title,
                    "about_job": job.get("description", ""),
                    "experience_required": experience_required,
                    "salary_range": job.get("salary_min", "") or "",
                    "job_url": job.get("redirect_url", ""),
                    "source_site": "adzuna.com",
                    "scraped_at": now_iso(),
                    "is_fresher": is_fresher,
                    "raw_payload": job,
                }
                leads.append(lead)

            self._logger.info(f"Adzuna: scraped {len(leads)} raw leads")
            return leads

        except json.JSONDecodeError:
            raise ScraperError("Failed to parse Adzuna JSON")
        except asyncio.TimeoutError:
            raise ScraperError("Adzuna API timed out")
        except aiohttp.ClientError as e:
            raise ScraperError(f"HTTP error: {e}")
