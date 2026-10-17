"""
Tier 2: iimjobs.com — India management/graduate trainee/entry-level jobs.

Uses the public search API at gladiator.iimjobs.com/job/search with
experience=0-1 to target fresher/entry-level roles. No auth required.

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


class IimjobsScraper(BaseScraper):
    source_name = "iimjobs"
    tier = 2
    rate_limit_seconds = 1.5

    BASE_URL = "https://www.iimjobs.com"
    API_URL = "https://gladiator.iimjobs.com/job/search"
    robots_url = "https://www.iimjobs.com"

    # Query terms targeting India entry-level/fresher roles
    SEARCH_TERMS = ["management trainee", "business analyst", "associate"]
    MAX_PAGES_PER_TERM = 3

    async def _fetch_page(self, query: str, page: int) -> dict | None:
        url = (
            f"{self.API_URL}"
            f"?query={query.replace(' ', '+')}"
            f"&experience=0-1&page={page}"
        )
        r = await fetch(
            url,
            timeout=20,
            headers={
                "Accept": "application/json",
                "Origin": "https://www.iimjobs.com",
                "Referer": "https://www.iimjobs.com/",
            },
            min_engine="httpx",
            max_engine="curl",
        )
        if r.status != 200:
            return None
        try:
            return json.loads(r.text)
        except (json.JSONDecodeError, TypeError):
            return None

    @staticmethod
    def _parse_job(item: dict) -> dict | None:
        try:
            title = (item.get("title") or item.get("jobdesignation") or "").strip()
            if not title:
                return None

            job_url = item.get("jobDetailUrl", "")
            company_data = item.get("companyData") or {}
            company_name = company_data.get("companyName", "")

            # Recruiter fields
            recruiter = item.get("recruiter") or {}
            hr_name = recruiter.get("recruiterName", "")

            # Location
            locations = item.get("locations") or item.get("location") or []
            if isinstance(locations, list):
                location = ", ".join(
                    loc.get("name", "") if isinstance(loc, dict) else str(loc)
                    for loc in locations[:5]
                )
            else:
                location = str(locations)

            # Experience
            min_exp = item.get("min")
            max_exp = item.get("max")
            exp_str = ""
            if min_exp is not None and max_exp is not None:
                exp_str = f"{min_exp}-{max_exp} year(s)"

            # Salary
            min_sal = item.get("minSal")
            max_sal = item.get("maxSal")
            salary = ""
            if min_sal and max_sal and int(min_sal) > 0:
                salary = f"₹{int(min_sal):,} - ₹{int(max_sal):,}"

            is_fresher = is_fresher_role(title, exp_str, "")

            return {
                "company_name": company_name,
                "about_company": "",
                "hr_name": hr_name,
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title[:120],
                "about_job": title,
                "experience_required": exp_str,
                "location": location[:120],
                "salary_range": salary,
                "job_url": job_url,
                "source_site": "iimjobs.com",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {
                    "id": item.get("id"),
                    "title": title,
                    "company": company_name,
                    "url": job_url,
                },
            }
        except Exception:
            return None

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []
        seen_ids: set[int] = set()

        for term in self.SEARCH_TERMS:
            for page in range(0, self.MAX_PAGES_PER_TERM):
                try:
                    data = await self._fetch_page(term, page)
                except Exception as e:
                    logger.debug(f"iimjobs: fetch error term={term} page={page}: {e}")
                    break
                if not data:
                    break
                items = data.get("data") or []
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
                # Check if there are more pages
                total = data.get("totalJobs", 0)
                count = data.get("count", 0)
                if (page + 1) * 50 >= total:
                    break
                await asyncio.sleep(self.rate_limit_seconds)

        self._logger.info(f"iimjobs: scraped {len(leads)} raw leads")
        return leads
