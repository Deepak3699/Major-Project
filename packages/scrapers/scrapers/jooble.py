"""
Tier 1: Jooble job search API scraper.

Requires free partner API key. The scraper adapter is fully implemented;
live execution requires JOOBLE_API_KEY env var.

SRS §4.3 lists Jooble as a Tier-1 aggregator source.
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


class JoobleScraper(BaseScraper):
    source_name = "jooble"
    tier = 1
    rate_limit_seconds = 1.0

    API_URL = "https://jooble.org/api"
    API_KEY = os.environ.get("JOOBLE_API_KEY", "")

    async def scrape(self) -> list[dict[str, Any]]:
        if not self.API_KEY:
            raise ScraperError("Jooble API key not configured (JOOBLE_API_KEY)")

        leads: list[dict[str, Any]] = []
        headers = {"Content-Type": "application/json", "User-Agent": "HireGen-LeadGen/1.0"}

        # Jooble uses POST with search keywords
        payload = {
            "keywords": "fresher entry level 0-1 years campus hire",
            "location": "India",
            "page": 1,
        }
        url = f"{self.API_URL}?key={self.API_KEY}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        raise ScraperError(f"Jooble API returned {resp.status}")
                    data = json.loads(await resp.text())

            jobs = data.get("jobs", data.get("items", []))
            for job in jobs:
                job_title = job.get("title", "")
                if not job_title:
                    continue

                company_name = job.get("company", job.get("company_name", ""))
                experience_required = job.get("experience", "") or ""
                is_fresher = is_fresher_role(job_title, str(experience_required), json.dumps(job).lower())

                lead = {
                    "company_name": company_name,
                    "about_company": "",
                    "hr_name": "",
                    "hr_email": "",
                    "company_email": "",
                    "hr_mobile": "",
                    "company_mobile": "",
                    "hr_linkedin_url": "",
                    "job_title": job_title,
                    "about_job": job.get("description", job.get("snippet", "")),
                    "experience_required": experience_required,
                    "salary_range": job.get("salary", "") or "",
                    "job_url": job.get("link", job.get("url", "")),
                    "source_site": "jooble.org",
                    "scraped_at": now_iso(),
                    "is_fresher": is_fresher,
                    "raw_payload": job,
                }
                leads.append(lead)

            self._logger.info(f"Jooble: scraped {len(leads)} raw leads")
            return leads

        except json.JSONDecodeError:
            raise ScraperError("Failed to parse Jooble JSON")
        except asyncio.TimeoutError:
            raise ScraperError("Jooble API timed out")
        except aiohttp.ClientError as e:
            raise ScraperError(f"HTTP error: {e}")
