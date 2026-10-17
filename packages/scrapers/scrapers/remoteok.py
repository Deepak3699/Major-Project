"""
Tier 1: RemoteOK public JSON API scraper.

Pre-flight verified: https://remoteok.com/api returns JSON array of job postings.
Terms of service require attribution (link back to RemoteOK).

Extracts per SRS §4.4 schema:
  company_name, about_company, hr_name, hr_email, company_email,
  hr_mobile, company_mobile, hr_linkedin_url, job_title,
  about_job, experience_required, salary_range, job_url,
  source_site, scraped_at, raw_payload
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


class RemoteOkScraper(BaseScraper):
    source_name = "remoteok"
    tier = 1
    rate_limit_seconds = 2.0

    API_URL = "https://remoteok.com/api"

    async def scrape(self) -> list[dict[str, Any]]:
        """Scrape RemoteOK API and return normalized lead dicts."""
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; HireGen-LeadGen/1.0; +https://your-domain.com)",
            "Accept": "application/json",
        }

        leads: list[dict[str, Any]] = []
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.API_URL, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        raise ScraperError(f"RemoteOK API returned {resp.status}")
                    raw_text = await resp.text()

            data = json.loads(raw_text)

            if isinstance(data, dict):
                data = [data]

            for item in data:
                if not isinstance(item, dict):
                    continue
                if "error" in item:
                    continue

                job_title = item.get("position", "") or item.get("title", "")
                if not job_title:
                    continue

                # India-only: RemoteOK supports location filtering; capture the
                # posting location so the central geo-gate can evaluate it.
                item_location = (item.get("location", "")
                                 or item.get("candidate_required_location", ""))

                experience_required = item.get("experience", "") or ""
                is_fresher = is_fresher_role(job_title, experience_required, json.dumps(item).lower())

                lead = {
                    "company_name": item.get("company", ""),
                    "about_company": item.get("company_description", ""),
                    "hr_name": item.get("recruiter_name", ""),
                    "hr_email": item.get("email", ""),
                    "company_email": item.get("email", ""),
                    "hr_mobile": item.get("phone", ""),
                    "company_mobile": item.get("phone", ""),
                    "hr_linkedin_url": item.get("recruiter_linkedin", ""),
                    "job_title": job_title,
                    "about_job": item.get("description", ""),
                    "experience_required": experience_required,
                    "location": item_location,
                    "salary_range": item.get("salary", ""),
                    "job_url": item.get("url", ""),
                    "source_site": "remoteok.com",
                    "scraped_at": now_iso(),
                    "is_fresher": is_fresher,
                    "raw_payload": {k: v for k, v in item.items() if k != "description"},
                }
                leads.append(lead)

            self._logger.info(f"RemoteOK: scraped {len(leads)} raw leads")
            return leads

        except json.JSONDecodeError as e:
            raise ScraperError(f"Failed to parse RemoteOK JSON: {e}")
        except asyncio.TimeoutError:
            raise ScraperError("RemoteOK API timed out")
        except aiohttp.ClientError as e:
            raise ScraperError(f"HTTP error: {e}")

    def _is_fresher_role(self, title: str, experience: str, full_text: str) -> bool:
        """NLP re-validation per SRS §4.2b: keyword classifier on experience field."""
        combined = f"{title} {experience} {full_text}".lower()
        return any(kw in combined for kw in FRESHER_KEYWORDS)
