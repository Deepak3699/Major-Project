"""
Tier 3: Recruitee ATS JSON API scraper.

Endpoint: https://{company}.recruitee.com/api/offers/
Returns structured JSON for companies using Recruitee as their ATS.
Companies not on Recruitee return 404 or connection errors — skipped gracefully.
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



class RecruiteeScraper(BaseScraper):
    source_name = "recruitee"
    tier = 3
    rate_limit_seconds = 0.5

    API_URL_TEMPLATE = "https://{company}.recruitee.com/api/offers/"

    def __init__(self, redis_client=None, db=None, companies: list[str] | None = None):
        super().__init__(redis_client, db)
        self._companies = companies or corpus_for("recruitee")

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, self._companies, self._scrape_company)
        self._logger.info(f"Recruitee: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_company(self, session, company):
        url = self.API_URL_TEMPLATE.format(company=company)
        status, data = await self._get_json(session, url)
        if status != 200 or data is None:
            self._logger.debug(f"Recruitee: {company} returned {status}")
            return []

        offers = data.get("offers", []) if isinstance(data, dict) else []

        leads: list[dict[str, Any]] = []
        for offer in offers:
            if not isinstance(offer, dict):
                continue

            job_title = offer.get("title", "")
            if not job_title:
                continue

            is_fresher = is_fresher_role(job_title, "", json.dumps(offer).lower())
            hr_info = self._extract_hr_info(offer)
            experience_required = self._extract_experience(offer)

            location = offer.get("location") or ""
            if not location:
                city = offer.get("city", "")
                country = offer.get("country", "")
                parts = [p for p in (city, country) if p]
                location = ", ".join(parts)

            job_url = offer.get("careers_url", "") or offer.get("careers_apply_url", "")

            lead = {
                "company_name": offer.get("company_name") or company,
                "about_company": "",
                "hr_name": hr_info.get("name", ""),
                "hr_email": hr_info.get("email", ""),
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": hr_info.get("linkedin", ""),
                "job_title": job_title,
                "about_job": offer.get("description") or offer.get("sharing_description") or "",
                "experience_required": experience_required,
                "location": self._as_text(location),
                "salary_range": self._as_text(offer.get("salary")),
                "job_url": job_url,
                "source_site": f"recruitee.com/{company}",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": offer,
            }
            leads.append(lead)
        return leads

    def _extract_hr_info(self, job: dict[str, Any]) -> dict[str, str]:
        """Extract HR name/contact from offer metadata."""
        result: dict[str, str] = {}

        for field in ["recruiter_name", "created_by", "contact_person"]:
            val = job.get(field, "")
            if val:
                result["name"] = str(val)
                break

        # emails can be a list or string
        emails = job.get("emails", "")
        if isinstance(emails, list) and emails:
            result["email"] = str(emails[0])
        elif isinstance(emails, str) and emails:
            result["email"] = emails

        for field in ["recruiter_linkedin", "contact_linkedin"]:
            val = job.get(field, "")
            if val:
                result["linkedin"] = str(val)
                break

        return result

    def _extract_experience(self, job: dict[str, Any]) -> str:
        """Extract experience requirements."""
        text_fields = [
            job.get("description", ""),
            job.get("requirements", ""),
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
