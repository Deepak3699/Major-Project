"""Tier 2: HackerEarth Jobs (India) — fresher / entry-level dev + internship roles.

HackerEarth is India-heavy and skews freshers/interns for engineering roles. It
exposes a public JSON listing endpoint (no auth). Defensive parser: we only rely
on a handful of fields and skip anything ambiguous, so a payload-shape change
degrades to zero leads (and the self-healing sweep retries) rather than crashing
the run or fabricating fields.

Product rule (SRS §6.2 never-fabricate): a company email/phone is NOT invented
from the board — those fields stay empty and are resolved later by the
enrichment army against the real employer domain.
"""
import asyncio
import logging
from typing import Any

import aiohttp

from .base import BaseScraper, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)


class HackerEarthScraper(BaseScraper):
    source_name = "hackerearth"
    tier = 2
    rate_limit_seconds = 1.5
    API_URL = "https://www.hackerearth.com/jobs/api/"

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.API_URL,
                    params={
                        "country": "india",
                        "format": "json",
                        "page": "1",
                        "items_per_page": "50",
                    },
                    headers={"User-Agent": "HireGen-LeadGen/1.0", "Accept": "application/json"},
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        self._logger.warning(f"hackerearth: HTTP {resp.status}")
                        return leads
                    data = await resp.json(content_type=None)
        except (asyncio.TimeoutError, aiohttp.ClientError, ValueError) as e:
            self._logger.warning(f"hackerearth: request/parse failed: {e}")
            return leads

        items = self._extract_items(data)
        for item in items:
            lead = self._parse(item)
            if lead:
                leads.append(lead)
        self._logger.info(f"hackerearth: {len(leads)} raw leads from {len(items)} postings")
        return leads

    @staticmethod
    def _extract_items(data: Any) -> list[dict[str, Any]]:
        """Find the list of job dicts across the known envelope shapes."""
        if isinstance(data, list):
            return [d for d in data if isinstance(d, dict)]
        if isinstance(data, dict):
            for key in ("jobs", "results", "data", "items"):
                v = data.get(key)
                if isinstance(v, list):
                    return [d for d in v if isinstance(d, dict)]
                # nested e.g. {"data": {"jobs": [...]}}
                if isinstance(v, dict):
                    inner = v.get("jobs") or v.get("results")
                    if isinstance(inner, list):
                        return [d for d in inner if isinstance(d, dict)]
        return []

    def _parse(self, item: dict[str, Any]) -> dict[str, Any] | None:
        title = (item.get("title") or item.get("role") or "").strip()
        if not title:
            return None
        company = (
            item.get("company_name")
            or item.get("company")
            or ""
        )
        if not company and isinstance(item.get("organization"), dict):
            company = item["organization"].get("name") or ""
        company = (str(company) if not isinstance(company, str) else company).strip()
        location = item.get("location") or item.get("city") or ""
        if isinstance(location, list):
            location = ", ".join(str(x) for x in location)
        url = item.get("url") or item.get("_url") or item.get("apply_url") or ""
        if url and url.startswith("/"):
            url = "https://www.hackerearth.com" + url
        experience = item.get("experience_required") or item.get("experience") or ""
        if isinstance(experience, (int, float)):
            experience = f"0-{int(experience)} years"
        blob = (title + " " + location + " " + str(item.get("tags", ""))).lower()
        is_fresher = is_fresher_role(title, str(experience), blob)

        return {
            "company_name": company,
            "about_company": "",
            "hr_name": "",
            "hr_email": "",
            "company_email": "",
            "hr_mobile": "",
            "company_mobile": "",
            "hr_linkedin_url": "",
            "job_title": title,
            "about_job": item.get("description") or item.get("short_description") or "",
            "experience_required": str(experience),
            "salary_range": item.get("stipend") or item.get("salary") or "",
            "job_url": url,
            "source_site": "hackerearth.com",
            "location": str(location),
            "scraped_at": now_iso(),
            "is_fresher": is_fresher,
            "raw_payload": item,
        }
