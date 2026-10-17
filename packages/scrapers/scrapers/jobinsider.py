"""
Tier 2: JobInsider.in — India freser/internship/graduate job listings.

Uses the public WordPress REST API at jobinsider.in/wp-json/wp/v2/job_postings
with the custom `experience_level` taxonomy to target fresher roles (ID 406).

Extracts per SRS §4.4 schema.
"""

import json
import re
import asyncio
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.http_client import fetch
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)


class JobinsiderScraper(BaseScraper):
    source_name = "jobinsider"
    tier = 2
    rate_limit_seconds = 1.5

    BASE_URL = "https://jobinsider.in"
    API_URL = "https://jobinsider.in/wp-json/wp/v2/job_postings"
    robots_url = "https://jobinsider.in"

    # experience_level taxonomy term ID 406 = "Fresher"
    FRESHER_LEVEL_ID = 406
    PER_PAGE = 50
    MAX_PAGES = 3

    async def _fetch_page(self, page: int) -> list[dict]:
        url = (
            f"{self.API_URL}"
            f"?experience_level={self.FRESHER_LEVEL_ID}"
            f"&per_page={self.PER_PAGE}&page={page}&_embed"
        )
        r = await fetch(
            url,
            timeout=25,
            headers={"Accept": "application/json"},
            min_engine="httpx",
            max_engine="curl",
        )
        if r.status != 200:
            return []
        try:
            data = json.loads(r.text)
        except (json.JSONDecodeError, TypeError):
            return []
        return data if isinstance(data, list) else []

    @staticmethod
    def _extract_taxonomy(item: dict, group_index: int) -> list[str]:
        """Pull taxonomy names from _embedded['wp:term'][group_index]."""
        try:
            terms = item.get("_embedded", {}).get("wp:term", [])
            if group_index < len(terms):
                group = terms[group_index]
                if isinstance(group, list):
                    return [t.get("name", "") for t in group if isinstance(t, dict) and t.get("name")]
        except Exception:
            pass
        return []

    @staticmethod
    def _parse_job(item: dict) -> dict | None:
        try:
            title = re.sub(r"<[^>]+>", "", item.get("title", {}).get("rendered", "")).strip()
            if not title:
                return None

            link = item.get("link", "")
            excerpt = re.sub(r"<[^>]+>", " ", item.get("excerpt", {}).get("rendered", ""))
            excerpt = re.sub(r"\s+", " ", excerpt).strip()[:500]

            content_text = re.sub(r"<[^>]+>", " ", item.get("content", {}).get("rendered", ""))
            content_text = re.sub(r"\s+", " ", content_text).strip()[:800]
            about_job = content_text if len(content_text) > len(excerpt) else excerpt

            # Taxonomies: group 0=company, 1=location, 2=category, 3=experience_level, 4=education
            companies = JobinsiderScraper._extract_taxonomy(item, 0)
            locations = JobinsiderScraper._extract_taxonomy(item, 1)
            experience = JobinsiderScraper._extract_taxonomy(item, 3)

            company_name = companies[0] if companies else ""
            location = ", ".join(locations) if locations else ""
            exp_str = ", ".join(experience) if experience else "Fresher"

            # The WP 'company' taxonomy is a category (e.g. "Multinational Companies"),
            # not the actual hiring org. Try to extract real company from excerpt pattern
            # "CompanyX is hiring..." or "Apply at CompanyX"
            real_company = ""
            for text_src in [excerpt, about_job]:
                m = re.search(r"^(\w[\w &.]{1,40}?)\s+(?:is\s+hiring|has\s+(?:started|announced)|invites|is\s+recruiting)", text_src, re.I)
                if m:
                    real_company = m.group(1).strip()
                    break
                m = re.search(r"(?:Apply\s+(?:to|at|for)\s+|Careers\s+at\s+|Join\s+)(\w[\w &.]{1,40})", text_src, re.I)
                if m:
                    real_company = m.group(1).strip()
                    break
            if real_company:
                company_name = real_company

            is_fresher = is_fresher_role(title, exp_str, about_job.lower())

            return {
                "company_name": company_name,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title[:120],
                "about_job": about_job,
                "experience_required": exp_str,
                "location": location[:120],
                "salary_range": "",
                "job_url": link,
                "source_site": "jobinsider.in",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {
                    "id": item.get("id"),
                    "title": title,
                    "link": link,
                },
            }
        except Exception:
            return None

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []
        seen_ids: set[int] = set()

        for page in range(1, self.MAX_PAGES + 1):
            try:
                items = await self._fetch_page(page)
            except Exception as e:
                logger.debug(f"JobInsider: fetch error page={page}: {e}")
                break
            if not items:
                break
            for item in items:
                jid = item.get("id")
                if jid in seen_ids:
                    continue
                seen_ids.add(jid)
                lead = self._parse_job(item)
                if lead:
                    leads.append(lead)
            await asyncio.sleep(self.rate_limit_seconds)

        self._logger.info(f"JobInsider: scraped {len(leads)} raw leads")
        return leads
