"""
Tier 1: Arbeitnow job listings scraper.

The API endpoint `https://www.arbeitnow.com/api/jobs` returns a JSON object
whose `data` field contains an HTML string with embedded job listings.
Each job is an <li> element with a `data-link` attribute.

Extracts per SRS §4.4 schema.
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

BS4_AVAILABLE = True
try:
    from bs4 import BeautifulSoup
except ImportError:
    BS4_AVAILABLE = False


class ArbeitnowScraper(BaseScraper):
    source_name = "arbeitnow"
    tier = 1
    rate_limit_seconds = 2.0

    API_URL = "https://www.arbeitnow.com/api/jobs"

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(self.API_URL, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                    if resp.status != 200:
                        raise ScraperError(f"Arbeitnow returned {resp.status}")
                    api_response = await resp.json()

            html_str = api_response.get("data", "")
            if not isinstance(html_str, str) or not html_str:
                raise ScraperError("Arbeitnow API returned empty data field")

            if not BS4_AVAILABLE:
                import re as _re
                job_links = _re.findall(
                    r'data-link="(https://www\.arbeitnow\.com/jobs/companies/[^"]+)"',
                    html_str,
                )
                if not job_links:
                    self._logger.warning("Arbeitnow: no job links found in HTML and BeautifulSoup unavailable")
                    return leads
                self._logger.warning("Arbeitnow: parsing without BeautifulSoup, HR data limited")
                for link in job_links:
                    domain_parts = link.split("/companies/")[-1] if "/companies/" in link else link
                    company_name = domain_parts.replace("-", " ").title()
                    lead = {
                        "company_name": company_name,
                        "about_company": "",
                        "hr_name": "",
                        "hr_email": "",
                        "company_email": "",
                        "hr_mobile": "",
                        "company_mobile": "",
                        "hr_linkedin_url": "",
                        "job_title": company_name,
                        "about_job": "",
                        "experience_required": "",
                        "salary_range": "",
                        "job_url": link,
                        "source_site": "arbeitnow.com",
                        "scraped_at": now_iso(),
                        "is_fresher": False,
                        "raw_payload": {"job_url": link},
                    }
                    leads.append(lead)
            else:
                soup = BeautifulSoup(html_str, "html.parser")
                job_cards = soup.find_all("li", class_="list-none")
                for card in job_cards:
                    link_elem = card.find(attrs={"data-link": True})
                    if not link_elem:
                        continue
                    job_url = link_elem.get("data-link", "")
                    full_text = card.get_text(strip=True)
                    # Extract company name from the last line (usually company name)
                    lines = [line.strip() for line in full_text.split('\n') if line.strip()]
                    company_name = lines[-1] if lines else ""
                    # Extract job title (first line or before company name)
                    job_title = lines[0] if lines else full_text[:80]

                    if not job_title:
                        continue

                    experience_text = full_text.lower()
                    is_fresher = is_fresher_role(job_title, "", experience_text)

                    lead = {
                        "company_name": company_name,
                        "about_company": "",
                        "hr_name": "",
                        "hr_email": "",
                        "company_email": "",
                        "hr_mobile": "",
                        "company_mobile": "",
                        "hr_linkedin_url": "",
                        "job_title": job_title,
                        "about_job": full_text,
                        "experience_required": "",
                        "salary_range": card.get("data-salary", "") or "",
                        "job_url": job_url,
                        "source_site": "arbeitnow.com",
                        "scraped_at": now_iso(),
                        "is_fresher": is_fresher,
                        "raw_payload": {"job_url": job_url, "raw_text": full_text[:500]},
                    }
                    leads.append(lead)

            self._logger.info(f"Arbeitnow: scraped {len(leads)} raw leads")
            return leads

        except json.JSONDecodeError as e:
            raise ScraperError(f"Failed to parse Arbeitnow API JSON: {e}")
        except asyncio.TimeoutError:
            raise ScraperError("Arbeitnow API timed out")
        except aiohttp.ClientError as e:
            raise ScraperError(f"HTTP error: {e}")
