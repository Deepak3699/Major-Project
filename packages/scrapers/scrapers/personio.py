"""
Tier 3: Personio public XML feed scraper.

Pre-flight verified: https://personio.jobs.personio.com/xml
Returns <workzag-jobs><position>... with id, subcompany, office,
additionalOffices, department, name, employmentType, seniority, schedule,
yearsOfExperience, occupation, createdAt. yearsOfExperience maps directly to
experience_required (e.g. "0-1", "1-2"); seniority "entry" also counts.
A non-Personio slug redirects (307) or returns non-XML -> skipped by _sweep.
Parsed with stdlib xml.etree (no new dependency).
"""

import asyncio
import aiohttp
import logging
import xml.etree.ElementTree as ET
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role
from .utils.ats_corpus import corpus_for

logger = logging.getLogger(__name__)


def _text(el: ET.Element | None, tag: str) -> str:
    if el is None:
        return ""
    child = el.find(tag)
    if child is None or child.text is None:
        return ""
    return child.text.strip()


class PersonioScraper(BaseScraper):
    source_name = "personio"
    tier = 3
    rate_limit_seconds = 0.5

    API_URL_TEMPLATE = "https://{company}.jobs.personio.com/xml"

    def __init__(self, redis_client=None, db=None, companies: list[str] | None = None):
        super().__init__(redis_client, db)
        self._companies = companies or corpus_for("personio")

    async def scrape(self) -> list[dict[str, Any]]:
        async with aiohttp.ClientSession() as session:
            leads = await self._sweep(session, self._companies, self._scrape_company)
        self._logger.info(f"Personio: scraped {len(leads)} raw leads")
        return leads

    async def _scrape_company(self, session, company):
        url = self.API_URL_TEMPLATE.format(company=company)
        try:
            async with session.get(
                url, headers={"User-Agent": "HireGen-LeadGen/1.0"},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    return []
                body = await resp.text()
        except Exception:  # noqa: BLE001
            return []
        if "<position" not in body:
            return []
        try:
            root = ET.fromstring(body)
        except ET.ParseError:
            return []

        leads: list[dict[str, Any]] = []
        for pos in root.iter("position"):
            title = _text(pos, "name")
            if not title:
                continue
            offices = [_text(pos, "office")]
            addl = pos.find("additionalOffices")
            if addl is not None:
                offices += [o.text.strip() for o in addl.findall("office") if o.text]
            location = ", ".join(o for o in offices if o)
            dept = _text(pos, "department")
            yoe = _text(pos, "yearsOfExperience")
            seniority = _text(pos, "seniority").lower()
            blob = f"{title} {dept} {yoe} {seniority}".lower()
            lead = {
                "company_name": _text(pos, "subcompany") or company,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title,
                "about_job": f"{dept} · {seniority}".strip(" ·"),
                "experience_required": yoe,
                "location": location,
                "salary_range": "",
                "job_url": f"https://{company}.jobs.personio.com/?posting={_text(pos, 'id')}",
                "source_site": f"personio.com/{company}",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher_role(title, dept, blob) or yoe.startswith("0-"),
                "raw_payload": {"id": _text(pos, "id"), "xml": ET.tostring(pos, encoding="unicode")[:2000]},
            }
            leads.append(lead)
        return leads
