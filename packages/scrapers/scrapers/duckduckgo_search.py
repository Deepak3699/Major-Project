"""
Tier 4: DuckDuckGo search scraper.

Uses duckduckgo_search to find fresher job postings via site-restricted dorks.
Per SRS §4.3 and §4.5.2: Google Search / "hidden" listings with site-restricted dorks.

No API key required — open-source search.
"""

import json
import asyncio
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

# Search queries for fresher jobs across various job board platforms
SEARCH_QUERIES = [
    '"fresher" "job" site:greenhouse.io OR site:lever.co',
    '"entry level" "job" site:workday.com OR site:greenhouse.io',
    '"0-1 years" "job" site:lever.co OR site:smartrecruiters.com',
    '"campus hire" "job" site:lever.co OR site:greenhouse.io',
    '"graduate trainee" "job" site:careers OR site:lever.co',
]


class DuckDuckGoScraper(BaseScraper):
    source_name = "duckduckgo"
    tier = 4
    rate_limit_seconds = 2.0

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []

        try:
            from duckduckgo_search import DDGS
        except ImportError:
            raise ScraperError("duckduckgo_search package not installed")

        ddgs = DDGS()

        all_results: list[dict[str, Any]] = []
        for query in SEARCH_QUERIES:
            try:
                results = ddgs.text(query, max_results=30)
                all_results.extend(results)
                await asyncio.sleep(self.rate_limit_seconds)
            except Exception as e:
                self._logger.warning(f"DuckDuckGo query failed '{query}': {e}")
                continue

        for result in all_results:
            href = result.get("href", "")
            title = result.get("title", "")
            body = result.get("body", "")

            if not href or not title:
                continue

            # Extract domain from URL to determine source
            from urllib.parse import urlparse
            parsed = urlparse(href)
            domain = parsed.hostname or ""
            source_site = domain

            is_fresher = is_fresher_role(
                title, "", (title + " " + body + " " + href).lower()
            )

            # Only include fresher jobs
            if not is_fresher:
                continue

            # Try to extract company name from title/URL
            company_name = ""
            for sep in [" - ", " at ", " @ "]:
                if sep in title:
                    company_name = title.split(sep)[-1].strip()
                    break

            lead = {
                "company_name": company_name,
                "about_company": "",
                "hr_name": "",
                "hr_email": "",
                "company_email": f"careers@{domain}" if domain else "",
                "hr_mobile": "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title,
                "about_job": body,
                "experience_required": "0-1 years" if is_fresher else "",
                "salary_range": "",
                "job_url": href,
                "source_site": source_site,
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {"title": title, "href": href, "body": body},
            }
            leads.append(lead)

        self._logger.info(f"DuckDuckGo: scraped {len(leads)} raw leads")
        return leads
