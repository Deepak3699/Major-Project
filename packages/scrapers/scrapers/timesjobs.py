"""
Tier 2: TimesJobs.com — India fresher/entry-level jobs.

TimesJobs uses a Next.js SPA with an internal JSON API (tjapi.timesjobs.com)
that returns 403 to plain HTTP but works when accessed with browser cookies.
We navigate with Playwright and intercept the API response containing structured
job data.

Extracts per SRS §4.4 schema.
"""

import json
import re
import asyncio
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)


class TimesjobsScraper(BaseScraper):
    source_name = "timesjobs"
    tier = 2
    rate_limit_seconds = 4.0

    BASE_URL = "https://www.timesjobs.com"
    API_URL = "https://tjapi.timesjobs.com/search/api/v1/search/jobs/list"
    robots_url = "https://www.timesjobs.com"

    SEARCH_PAGES = [
        "https://www.timesjobs.com/jobs/jobs-fresher-india",
    ]

    async def _intercept_api(self, page, url: str) -> list[dict]:
        """Navigate to page and intercept the tjapi jobs/list response."""
        captured: list[dict] = []

        async def on_response(response):
            if "tjapi.timesjobs.com" in response.url and "/list" in response.url:
                try:
                    body = await response.text()
                    if body and body.startswith("{"):
                        data = json.loads(body)
                        captured.extend(data.get("jobs") or [])
                except Exception:
                    pass

        page.on("response", on_response)
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(4000)
        return captured

    @staticmethod
    def _parse_job(item: dict) -> dict | None:
        try:
            title = re.sub(r"<[^>]+>", "", item.get("title") or "").strip()
            title = re.sub(r"\s*Job\s+Details\s*\|\s*", " — ", title).strip()
            if not title:
                return None

            company = (item.get("company") or item.get("hfCompany") or item.get("companyName") or "").strip()
            job_id = item.get("jobId") or ""
            job_url = item.get("jobDetailUrl") or ""
            if not job_url and job_id:
                job_url = f"https://www.timesjobs.com/job-details?jobId={job_id}"

            # Location
            location = item.get("location") or ""
            if isinstance(location, list):
                location = ", ".join(str(l) for l in location[:5])

            # Experience from API fields
            exp_from = item.get("experienceFrom")
            exp_to = item.get("experienceTo")
            exp_str = ""
            if exp_from is not None and exp_to is not None:
                exp_str = f"{exp_from}-{exp_to} year(s)"
            elif item.get("experience"):
                exp_str = str(item["experience"])

            # Salary
            low = item.get("lowSalary")
            high = item.get("highSalary")
            salary = ""
            if low and high and low > 0 and high > 0:
                cur = item.get("currency", "INR")
                salary = f"{cur} {low:,} - {high:,}"

            # Description
            desc = item.get("description") or ""
            desc = re.sub(r"<[^>]+>", " ", desc)
            desc = re.sub(r"\s+", " ", desc).strip()[:500]

            is_fresher = is_fresher_role(title, exp_str, desc.lower())

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
                "about_job": desc,
                "experience_required": exp_str,
                "location": str(location)[:120],
                "salary_range": salary,
                "job_url": job_url,
                "source_site": "timesjobs.com",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {
                    "jobId": job_id,
                    "title": title,
                    "company": company,
                    "url": job_url,
                },
            }
        except Exception:
            return None

    async def scrape(self) -> list[dict[str, Any]]:
        from playwright.async_api import async_playwright

        leads: list[dict[str, Any]] = []
        seen_codes: set[str] = set()

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                ctx = await browser.new_context(
                    user_agent=self._get_user_agent(),
                    locale="en-IN",
                )

                for page_url in self.SEARCH_PAGES:
                    page = await ctx.new_page()
                    try:
                        raw_jobs = await self._intercept_api(page, page_url)
                        for item in raw_jobs:
                            code = item.get("jobCode") or str(item.get("jobId", ""))
                            if code in seen_codes:
                                continue
                            seen_codes.add(code)
                            lead = self._parse_job(item)
                            if lead:
                                leads.append(lead)
                    finally:
                        await page.close()
                    await asyncio.sleep(self.rate_limit_seconds)

                await browser.close()
        except ImportError:
            raise ScraperError("Playwright required for TimesJobs (SPA-only, API 403s without browser cookies)")
        except Exception as e:
            logger.warning(f"TimesJobs scrape error: {e}")

        self._logger.info(f"TimesJobs: scraped {len(leads)} raw leads")
        return leads
