"""
Tier 2: Internshala internship listings scraper.

Uses Playwright browser automation (SRS §3.3) to render JS-heavy pages.
Internshala is behind CSP/anti-bot protection.

Extracts per SRS §4.4 schema.
"""

import json
import re
import asyncio
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role
from .utils.http_client import fetch

logger = logging.getLogger(__name__)

BS4_AVAILABLE = True
try:
    from bs4 import BeautifulSoup
except ImportError:
    BS4_AVAILABLE = False


class InternshalaScraper(BaseScraper):
    source_name = "internshala"
    tier = 2
    rate_limit_seconds = 3.0

    LIST_URLS = [
        "https://www.internshala.com/jobs/",
        "https://www.internshala.com/internships/",
    ]

    @staticmethod
    def _ld_jobs(html: str) -> list[dict[str, Any]]:
        """Pull JobPosting objects from application/ld+json blocks (the reliable,
        schema.org path Internshala SSRs — no browser needed)."""
        out: list[dict[str, Any]] = []
        for m in re.findall(
            r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I
        ):
            try:
                data = json.loads(m.strip())
            except (json.JSONDecodeError, ValueError):
                continue
            items = data if isinstance(data, list) else [data]
            for it in items:
                if isinstance(it, dict) and it.get("@type") in (
                    "JobPosting", "ItemList", "OccupationalCategory"
                ):
                    if "itemListElement" in it:
                        for el in it["itemListElement"]:
                            e = el.get("item", el) if isinstance(el, dict) else el
                            if isinstance(e, dict) and e.get("@type") == "JobPosting":
                                out.append(e)
                    else:
                        out.append(it)
        return out

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []
        seen: set[str] = set()

        for url in self.LIST_URLS:
            try:
                # Escalating fetch (httpx -> curl_cffi -> Playwright-stealth).
                # A missing browser no longer raises — the cheaper engines already
                # carry the SSR'd ld+json. Fixes the old ScraperError crash.
                resp = await fetch(url, timeout=25)
            except Exception as e:  # noqa: BLE001
                self._logger.warning(f"Internshala fetch failed for {url}: {e}")
                continue

            for jp in self._ld_jobs(resp.text):
                job_title = (jp.get("title") or "")[:120].strip()
                if not job_title:
                    continue
                org = jp.get("hiringOrganization") or {}
                company_name = (
                    org.get("name", "") if isinstance(org, dict) else str(org)
                )[:80]
                job_url = jp.get("url") or jp.get("sameAs") or ""
                if not job_url or job_url in seen:
                    continue
                seen.add(job_url)

                loc = jp.get("jobLocation") or {}
                address = loc.get("address", {}) if isinstance(loc, dict) else {}
                if isinstance(address, dict):
                    location = ", ".join(
                        x for x in (
                            address.get("addressLocality", ""),
                            address.get("addressRegion", ""),
                        ) if x
                    )
                    if address.get("addressCountry"):  # append only if present
                        country = address["addressCountry"]
                        location = f"{location}, {country}" if location else str(country)
                else:
                    location = str(loc)[:80]
                location = location[:80]

                exp = jp.get("experienceRequirements", "") or ""
                if isinstance(exp, dict):
                    exp = exp.get("totalTime", "") or ""
                exp = str(exp)[:60]
                sal = jp.get("baseSalary", "")
                salary = ""
                if isinstance(sal, dict):
                    v = sal.get("value", {})
                    if isinstance(v, dict):
                        lo, hi = v.get("minValue", ""), v.get("maxValue", "")
                        cur = v.get("currency", sal.get("currency", "")) or ""
                        salary = "-".join(str(x) for x in (lo, hi) if x)
                        salary = f"{salary} {cur}".strip()

                blob = f"{job_title} {company_name} {location} {exp}".lower()
                is_fresher = is_fresher_role(job_title, exp, blob)

                lead = {
                    "company_name": company_name,
                    "about_company": (jp.get("description") or "")[:500],
                    "hr_name": "",
                    "hr_email": "",
                    "company_email": "",
                    "hr_mobile": "",
                    "company_mobile": "",
                    "hr_linkedin_url": "",
                    "job_title": job_title,
                    "about_job": (jp.get("description") or job_title)[:2000],
                    "experience_required": exp,
                    "location": location,
                    "salary_range": str(salary)[:80],
                    "job_url": job_url,
                    "source_site": "internshala.com",
                    "scraped_at": now_iso(),
                    "is_fresher": is_fresher,
                    "raw_payload": {"title": job_title, "url": job_url},
                }
                leads.append(lead)

            # fallback: if ld+json found nothing but we got HTML, try the card soup
            if not leads and BS4_AVAILABLE:
                soup = BeautifulSoup(resp.text, "html.parser")
                for card in soup.find_all(
                    "div", class_=re.compile(r"internship_card|individual_internship")
                )[:200]:
                    t = card.find(attrs={"class": re.compile(r"heading|title|profile")})
                    job_title = t.get_text(strip=True)[:120] if t else ""
                    if not job_title:
                        continue
                    a = card.find("a", href=True)
                    job_url = (a["href"] if a else "") or ""
                    if job_url and not job_url.startswith("http"):
                        job_url = f"https://www.internshala.com{job_url}"
                    if not job_url or job_url in seen:
                        continue
                    seen.add(job_url)
                    ce = card.find(attrs={"class": re.compile(r"company|organisation")})
                    company_name = ce.get_text(strip=True)[:80] if ce else ""
                    leads.append({
                        "company_name": company_name, "about_company": "", "hr_name": "",
                        "hr_email": "", "company_email": "", "hr_mobile": "",
                        "company_mobile": "", "hr_linkedin_url": "", "job_title": job_title,
                        "about_job": job_title, "experience_required": "", "location": "",
                        "salary_range": "", "job_url": job_url, "source_site": "internshala.com",
                        "scraped_at": now_iso(),
                        "is_fresher": is_fresher_role(job_title, "", job_title.lower()),
                        "raw_payload": {"title": job_title, "url": job_url},
                    })

        if not leads:
            self._logger.warning("Internshala: 0 leads (ld+json and card soup both empty)")
        self._logger.info(f"Internshala: scraped {len(leads)} raw leads")
        return leads
