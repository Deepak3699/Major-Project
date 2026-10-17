"""
Tier 2: AmbitionBox Jobs scraper (Naukri-group India board).

Pre-flight verified: https://www.ambitionbox.com/jobs returns 200 with
server-rendered __NEXT_DATA__ JSON: pageProps.jobsList[] carries title,
company, locations[], minExp/maxExp, minCtc/maxCtc, skills[], postedOn,
jdpUrl. robots.txt does not disallow /jobs.

Deliberately capped at page 1: filtered/paginated URLs 302 to a bot-
verification wall. One honest page (~20 jobs, minExp-prefiltered) per run —
no wall-fighting, ever.
"""

import json
import re
import asyncio
import aiohttp
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

_NEXT_DATA_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)


def _lpa(value: Any) -> str:
    """AmbitionBox CTC units are inconsistent (LPA vs paise): normalize."""
    try:
        v = float(value or 0)
    except (TypeError, ValueError):
        return ""
    if v <= 0:
        return ""
    if v > 100000:
        v = v / 100000
    s = f"{v:g}"
    return f"{s} LPA"


class AmbitionBoxScraper(BaseScraper):
    source_name = "ambitionbox"
    tier = 2
    rate_limit_seconds = 2.0

    LIST_URL = "https://www.ambitionbox.com/jobs"

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    self.LIST_URL,
                    headers={"User-Agent": "HireGen-LeadGen/1.0"},
                    timeout=aiohttp.ClientTimeout(total=20),
                ) as resp:
                    if resp.status != 200:
                        return []
                    html = await resp.text()
            except Exception as e:  # noqa: BLE001
                raise ScraperError(f"ambitionbox fetch failed: {e}")
        m = _NEXT_DATA_RE.search(html)
        if not m:
            return []
        try:
            jobs = json.loads(m.group(1))["props"]["pageProps"]["jobsList"]
        except (ValueError, KeyError, TypeError):
            return []
        if not isinstance(jobs, list):
            return []

        leads: list[dict[str, Any]] = []
        for job in jobs:
            if not isinstance(job, dict):
                continue
            title = str(job.get("title", "") or "")
            company = str(job.get("company", "") or "")
            if not title or not company:
                continue
            try:
                min_exp = job.get("minExp")
                min_exp = float(min_exp) if min_exp is not None else None
            except (TypeError, ValueError):
                min_exp = None
            if min_exp is None or min_exp > 1:
                continue
            locs = job.get("locations") or []
            location = ", ".join(str(x) for x in locs[:3])
            skills = job.get("skills") or []
            salary = _lpa(job.get("minCtc"))
            salary_max = _lpa(job.get("maxCtc"))
            if salary and salary_max and salary_max != salary:
                salary = f"{salary.replace(' LPA', '')}-{salary_max}"
            blob = json.dumps(job).lower()
            lead = {
                "company_name": company,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title,
                "about_job": ", ".join(str(s) for s in skills[:10]),
                "experience_required": f"{job.get('minExp')}-{job.get('maxExp')} years",
                "location": location,
                "salary_range": salary,
                "job_url": f"https://www.ambitionbox.com{job.get('jdpUrl', '')}",
                "source_site": "ambitionbox.com",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher_role(title, "", blob),
                "raw_payload": job,
            }
            leads.append(lead)
        self._logger.info(f"AmbitionBox: scraped {len(leads)} fresher leads")
        return leads
