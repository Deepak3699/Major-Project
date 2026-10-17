"""
Tier 2: Hirist.in scraper — India entry-level / fresher TECH jobs.

Hirist specialises in tech roles including junior/fresher engineer listings. It is
JS-rendered, so we use the shared escalating http layer (curl_cffi → Playwright+
stealth) and parse job cards heuristically. Degrades to zero leads (soft miss)
rather than crashing when the listing is fully client-rendered.

Extracts per SRS §4.4 schema. Best-effort: selectors are heuristic and the
normalizer + India geo-gate re-validate every record.
"""

import re
import logging
from typing import Any

from .base import BaseScraper, now_iso

logger = logging.getLogger(__name__)

BS4_AVAILABLE = True
try:
    from bs4 import BeautifulSoup
except ImportError:
    BS4_AVAILABLE = False


class HiristScraper(BaseScraper):
    source_name = "hirist"
    tier = 2
    rate_limit_seconds = 3.0

    BASE = "https://www.hirist.in"
    LIST_URLS = [
        "https://www.hirist.in/jobs/fresher",
        "https://www.hirist.in/entry-level-jobs",
    ]

    async def _render(self, url: str) -> str:
        from .utils.http_client import fetch
        try:
            resp = await fetch(url, timeout=45, min_engine="playwright", max_engine="playwright")
            if len(resp.text) > 500:
                return resp.text
        except Exception as e:  # noqa: BLE001
            logger.debug(f"Playwright render failed for {url}: {e}; falling back to curl_cffi")
        try:
            return (await fetch(url, timeout=25, min_engine="curl", max_engine="curl")).text
        except Exception as e:  # noqa: BLE001
            logger.warning(f"All render engines failed for {url}: {e}")
            return ""

    async def scrape(self) -> list[dict[str, Any]]:
        if not BS4_AVAILABLE:
            self._logger.warning("beautifulsoup4 unavailable; Hirist skipped")
            return []

        from .utils.fresher_classifier import is_fresher_role
        leads: list[dict[str, Any]] = []
        seen: set[str] = set()

        for url in self.LIST_URLS:
            soup = BeautifulSoup(await self._render(url), "html.parser")
            cards = soup.find_all(attrs={"class": re.compile(r"jobCard|job-card|JobCard|jcard|css-[a-z0-9]+job")})
            if not cards:
                cards = soup.find_all("a", href=re.compile(r"/job/|/job-detail|/hiring/"))

            for card in cards[:120]:
                link = card if getattr(card, "name", "") == "a" else card.find("a", href=True)
                href = link.get("href", "") if link else ""
                job_url = href if href.startswith("http") else (self.BASE + href if href.startswith("/") else "")
                if not job_url or job_url in seen:
                    continue

                title = ""
                t = card.find(attrs={"class": re.compile(r"title|role|jobTitle|designation")})
                if t:
                    title = t.get_text(strip=True)
                if not title and link:
                    title = link.get_text(strip=True)
                title = title[:120]
                if not title or len(title) < 3:
                    continue
                seen.add(job_url)

                comp = card.find(attrs={"class": re.compile(r"company|organi[sz]ation|client")})
                company_name = comp.get_text(strip=True)[:80] if comp else ""
                loc = card.find(attrs={"class": re.compile(r"location|city")})
                location = loc.get_text(strip=True)[:80] if loc else ""
                exp = card.find(attrs={"class": re.compile(r"experience|exp")})
                experience = exp.get_text(strip=True)[:40] if exp else ""

                leads.append({
                    "company_name": company_name, "about_company": "", "hr_name": "",
                    "hr_email": "", "company_email": "", "hr_mobile": "",
                    "company_mobile": "", "hr_linkedin_url": "",
                    "job_title": title, "about_job": title, "experience_required": experience,
                    "location": location, "salary_range": "", "job_url": job_url,
                    "source_site": "hirist.in", "scraped_at": now_iso(),
                    "is_fresher": is_fresher_role(title, experience, location.lower() + " fresher junior entry"),
                    "raw_payload": {"title": title, "url": job_url, "company": company_name},
                })

        self._logger.info(f"Hirist: scraped {len(leads)} raw leads")
        return leads
