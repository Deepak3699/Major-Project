"""
Tier 2: Unstop (formerly DigiZone) campus/fresher jobs & internships.

Uses the public JSON search API at unstop.com/api/public/opportunity/search-result.
No auth required; returns structured job/internship data with salary, locations,
company, and experience filters.

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


class UnstopScraper(BaseScraper):
    source_name = "unstop"
    tier = 2
    rate_limit_seconds = 1.5

    BASE_URL = "https://unstop.com"
    API_URL = "https://unstop.com/api/public/opportunity/search-result"
    robots_url = "https://unstop.com"

    # India fresher/entry-level queries
    SEARCH_TERMS = ["fresher graduate trainee", "entry level job", "graduate trainee"]
    OPPORTUNITY_TYPES = ["jobs", "internships"]
    MAX_PAGES = 3
    PER_PAGE = 20

    async def _fetch_page(self, opportunity: str, term: str, page: int) -> list[dict]:
        params = (
            f"?opportunity={opportunity}&page={page}"
            f"&perPage={self.PER_PAGE}&term={term.replace(' ', '+')}&locations=india"
        )
        url = f"{self.API_URL}{params}"
        r = await fetch(
            url,
            timeout=20,
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
        return data.get("data", {}).get("data", []) or []

    @staticmethod
    def _parse_job(item: dict) -> dict | None:
        try:
            title = (item.get("title") or "").strip()
            if not title:
                return None

            company = (item.get("organisation") or {}).get("name", "")
            seo_url = item.get("seo_url", "")
            if not seo_url:
                public_url = item.get("public_url", "")
                seo_url = f"https://unstop.com/{public_url}" if public_url else ""

            # Location from the locations array
            locs = item.get("locations") or []
            location = ", ".join(
                filter(None, [locs[0].get("city", "") if locs else "",
                              locs[0].get("state", "") if locs else ""])
            )

            # Salary from jobDetail
            jd = item.get("jobDetail") or {}
            salary = ""
            if jd.get("show_salary") and not jd.get("not_disclosed"):
                mn = jd.get("min_salary")
                mx = jd.get("max_salary")
                pay_in = jd.get("pay_in", "annually")
                if mn and mx:
                    salary = f"₹{int(mn):,} - ₹{int(mx):,} {pay_in}"

            # Experience from jobDetail or filters
            min_exp = jd.get("min_experience")
            max_exp = jd.get("max_experience")
            exp_str = ""
            if min_exp is not None or max_exp is not None:
                exp_str = f"{min_exp or 0}-{max_exp or 1} year(s)"
            filters = [f.get("name", "") for f in (item.get("filters") or [])]
            if "Fresher" in filters:
                exp_str = exp_str or "Fresher"

            # Strip HTML from details for about_job
            raw_details = item.get("details") or ""
            about = re.sub(r"<[^>]+>", " ", raw_details)
            about = re.sub(r"\s+", " ", about).strip()[:500]

            is_fresher = is_fresher_role(title, exp_str, about.lower())

            return {
                "company_name": company,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title[:120],
                "about_job": about,
                "experience_required": exp_str,
                "location": location[:120],
                "salary_range": salary,
                "job_url": seo_url,
                "source_site": "unstop.com",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {
                    "id": item.get("id"),
                    "title": title,
                    "company": company,
                    "url": seo_url,
                },
            }
        except Exception:
            return None

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []
        seen_ids: set[int] = set()

        for opp in self.OPPORTUNITY_TYPES:
            for term in self.SEARCH_TERMS:
                for page in range(1, self.MAX_PAGES + 1):
                    try:
                        items = await self._fetch_page(opp, term, page)
                    except Exception as e:
                        logger.debug(f"Unstop: fetch error opp={opp} term={term} page={page}: {e}")
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

        self._logger.info(f"Unstop: scraped {len(leads)} raw leads")
        return leads
