"""
Tier 1: Remotive remote-jobs scraper.

The API endpoint https://remotive.com/api/remote-jobs returns JSON array of job postings.
Note: remotive.com is behind Cloudflare protection — if the JSON endpoint returns
403, the scraper should fall back to Playwright browser automation (SRS §3.3)
when available, or raise a clear BLOCKED_TECHNICAL error.

Extracts per SRS §4.4 schema.
"""

import json
import asyncio
import aiohttp
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

# Experience keywords per SRS §4.2
FRESHER_KEYWORDS = [
    "fresher", "0-1 years", "0-1yr", "0-2 years", "0-2yr",
    "no experience", "no-experience", "entry level", "entry-level",
    "graduate trainee", "campus hire", "0 years",
]


class RemotiveScraper(BaseScraper):
    source_name = "remotive"
    tier = 1
    rate_limit_seconds = 2.0

    API_URL = "https://remotive.com/api/remote-jobs?country=India"

    async def scrape(self) -> list[dict[str, Any]]:
        """Scrape Remotive API and return normalized lead dicts."""
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; HireGen-LeadGen/1.0; +https://your-domain.com)",
            "Accept": "application/json",
        }

        leads: list[dict[str, Any]] = []
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.API_URL, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        raw_text = await resp.text()
                        if resp.status == 403 and "just a moment" in raw_text.lower():
                            raise ScraperError(
                                "Remotive is behind Cloudflare — requires Playwright browser automation "
                                "(SRS §3.3). Install playwright: pip install playwright && playwright install chromium"
                            )
                        raise ScraperError(f"Remotive API returned {resp.status}")
                    raw_text = await resp.text()

            data = json.loads(raw_text)

            if isinstance(data, dict):
                # Remotive API returns {"jobs": [...]}
                jobs = data.get("jobs", [])
            elif isinstance(data, list):
                jobs = data
            else:
                jobs = []

            for job in jobs:
                if not isinstance(job, dict):
                    continue

                job_title = job.get("title", "")
                if not job_title:
                    continue

                experience_required = job.get("experience", "") or ""
                is_fresher = is_fresher_role(job_title, experience_required, json.dumps(job).lower())

                # India-only: capture posting location for the central geo-gate.
                job_location = job.get("location", "") or job.get("candidate_required_location", "")

                # Remotive doesn't provide HR info directly
                lead = {
                    "company_name": job.get("company_name", ""),
                    "about_company": job.get("company_description", ""),
                    "hr_name": "",
                    "hr_email": "",
                    "company_email": job.get("company_email", ""),
                    "hr_mobile": "",
                    "company_mobile": "",
                    "hr_linkedin_url": "",
                    "job_title": job_title,
                    "about_job": job.get("description", ""),
                    "experience_required": experience_required,
                    "location": job_location,
                    "salary_range": job.get("salary", ""),
                    "job_url": job.get("url", ""),
                    "source_site": "remotive.com",
                    "scraped_at": now_iso(),
                    "is_fresher": is_fresher,
                    "raw_payload": job,
                }
                leads.append(lead)

            self._logger.info(f"Remotive: scraped {len(leads)} raw leads")
            return leads

        except json.JSONDecodeError as e:
            raise ScraperError(f"Failed to parse Remotive JSON: {e}")
        except asyncio.TimeoutError:
            raise ScraperError("Remotive API timed out")
        except aiohttp.ClientError as e:
            raise ScraperError(f"HTTP error: {e}")