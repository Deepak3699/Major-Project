"""
Tier 2: Freshersworld job listings scraper.

Fetches fresher job listings from https://www.freshersworld.com/jobs/.
Parses server-rendered HTML to extract job postings.

Extracts per SRS §4.4 schema.
"""

import json
import re
import asyncio
import aiohttp
import logging
import os
import random
import time
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

BS4_AVAILABLE = True
try:
    from bs4 import BeautifulSoup
except ImportError:
    BS4_AVAILABLE = False

# ── Circuit breaker config ────────────────────────────────────────────────────
HEALTH_FILE = os.path.join(os.path.dirname(__file__), "..", "source_health.json")
CIRCUIT_THRESHOLD = 5       # consecutive failures before tripping
COOLDOWN_SECONDS = 2 * 60 * 60  # 2 hours

# ── Retry config ──────────────────────────────────────────────────────────────
MAX_RETRIES = 3

# ── Pagination config ─────────────────────────────────────────────────────────
MAX_PAGES = 10


def _load_health() -> dict:
    if os.path.exists(HEALTH_FILE):
        with open(HEALTH_FILE) as f:
            return json.load(f)
    return {}


def _save_health(data: dict) -> None:
    with open(HEALTH_FILE, "w") as f:
        json.dump(data, f, indent=2)


class FreshersworldScraper(BaseScraper):
    source_name = "freshersworld"
    tier = 2
    rate_limit_seconds = 2.0

    API_URL = "https://www.freshersworld.com/jobs/"

    async def _fetch_page(
        self,
        session: aiohttp.ClientSession,
        url: str,
        headers: dict,
    ) -> str:
        """Fetch a single page with retry + exponential backoff (fix #4)."""
        last_exc: Exception = RuntimeError("unreachable")
        for attempt in range(MAX_RETRIES):
            try:
                async with session.get(
                    url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        raise ScraperError(f"Freshersworld returned {resp.status}")
                    return await resp.text()
            except (asyncio.TimeoutError, aiohttp.ClientError) as exc:
                last_exc = exc
                if attempt == MAX_RETRIES - 1:
                    break
                backoff = (2 ** attempt) + random.uniform(0, 1)
                logger.warning(
                    "Freshersworld: attempt %d/%d failed (%s), retrying in %.1fs",
                    attempt + 1,
                    MAX_RETRIES,
                    exc,
                    backoff,
                )
                await asyncio.sleep(backoff)
        raise ScraperError(
            f"Freshersworld failed after {MAX_RETRIES} attempts: {last_exc}"
        )

    async def scrape(self) -> list[dict[str, Any]]:
        # ── Circuit breaker check (fix #5) ───────────────────────────────────
        health = _load_health()
        source = health.get(
            self.source_name,
            {"consecutive_failures": 0, "tripped_at": None},
        )

        if source.get("tripped_at"):
            elapsed = time.time() - source["tripped_at"]
            if elapsed < COOLDOWN_SECONDS:
                remaining = int((COOLDOWN_SECONDS - elapsed) / 60)
                raise ScraperError(
                    f"Circuit breaker open for {self.source_name} — "
                    f"cooldown {remaining}m remaining"
                )
            # Cooldown expired — reset
            source["tripped_at"] = None
            source["consecutive_failures"] = 0

        # ── Main scrape logic ─────────────────────────────────────────────────
        try:
            leads = await self._do_scrape()

            # Success — reset circuit breaker
            source["consecutive_failures"] = 0
            source["tripped_at"] = None
            health[self.source_name] = source
            _save_health(health)

            self._logger.info("Freshersworld: scraped %d raw leads", len(leads))
            return leads

        except ScraperError:
            # Track failure for circuit breaker
            source["consecutive_failures"] = source.get("consecutive_failures", 0) + 1
            if source["consecutive_failures"] >= CIRCUIT_THRESHOLD:
                source["tripped_at"] = time.time()
                logger.error(
                    "Circuit breaker TRIPPED for %s after %d consecutive failures "
                    "— pausing 2h",
                    self.source_name,
                    CIRCUIT_THRESHOLD,
                )
                logger.critical(
                    "ALERT: %s scraper is down. Manual check required.",
                    self.source_name,
                )
            health[self.source_name] = source
            _save_health(health)
            raise

    async def _do_scrape(self) -> list[dict[str, Any]]:
        """Paginated scrape across all result pages (fix #1)."""
        if not BS4_AVAILABLE:
            raise ScraperError("beautifulsoup4 is required for Freshersworld parsing")

        leads: list[dict[str, Any]] = []
        headers = {"User-Agent": self._get_user_agent()}

        async with aiohttp.ClientSession() as session:
            for page in range(1, MAX_PAGES + 1):
                url = self.API_URL if page == 1 else f"{self.API_URL}?page={page}"

                html = await self._fetch_page(session, url, headers)

                soup = BeautifulSoup(html, "html.parser")

                job_cards = soup.find_all("div", class_="job-detail")
                if not job_cards:
                    job_cards = soup.find_all(
                        "div",
                        attrs={"class": re.compile(r"job|opening|listing")},
                    )

                if not job_cards:
                    logger.info(
                        "Freshersworld: no cards on page %d — stopping pagination",
                        page,
                    )
                    break

                for card in job_cards:
                    link_elem = card.find("a", href=True)
                    if not link_elem:
                        continue

                    job_title = link_elem.get_text(strip=True) or ""
                    company_elem = card.find(
                        attrs={"class": re.compile(r"company|employer|org")}
                    )
                    company_name = (
                        company_elem.get_text(strip=True) if company_elem else ""
                    )

                    if not job_title or "Page" in job_title:
                        continue

                    job_url = link_elem["href"]
                    if job_url and not job_url.startswith("http"):
                        job_url = f"https://www.freshersworld.com{job_url}"

                    experience_text = (
                        job_title + " " + (company_name or "") + " " + html[:200]
                    )
                    is_fresher = is_fresher_role(
                        job_title, "", experience_text.lower()
                    )

                    location_elem = card.find(
                        attrs={"class": re.compile(r"location|loc")}
                    )
                    location = (
                        location_elem.get_text(strip=True) if location_elem else ""
                    )

                    experience_elem = card.find(
                        attrs={"class": re.compile(r"experience|exp")}
                    )
                    experience = (
                        experience_elem.get_text(strip=True)
                        if experience_elem
                        else ""
                    )

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
                        "about_job": job_title,
                        "experience_required": experience,
                        "location": location,
                        "salary_range": "",
                        "job_url": job_url,
                        "source_site": "freshersworld.com",
                        "scraped_at": now_iso(),
                        "is_fresher": is_fresher,
                        "raw_payload": {
                            "title": job_title,
                            "company": company_name,
                            "url": job_url,
                            "location": location,
                            "is_fresher": is_fresher,
                            "scraped_at": now_iso(),
                        },
                    }
                    leads.append(lead)

                await asyncio.sleep(self.rate_limit_seconds)

        return leads
