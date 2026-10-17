"""
Tier 4: Telegram scraper for fresher job posts.

Monitors public Telegram channels/chats for fresher job postings.
SRS §4.3 lists Telegram as a Tier-4 OSINT source.

Requires Telegram API credentials (free from my.telegram.org).
"""

import json
import asyncio
import logging
import re
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

# Public channels/keywords for fresher jobs (roster extended 2026-09-14 with
# high-volume off-campus handles; exact handles only — no guesses).
FRESHER_CHANNELS = [
    "fresherjobspol", "jobsindiasite", "sarkari_niyukti",
    "gupy_app", "corporatecareers_in", "campusfresher",
    "work4freshers", "job4fresherss", "fresherjobinfo",
    "hrgroupindia1", "freshersarea", "jobsinternshipshub",
    "Jobs_Careers", "jobsandinternshipsupdates",
]

SEARCH_KEYWORDS = ["fresher", "0-1 years", "entry level", "campus hire", "internship"]


class TelegramScraper(BaseScraper):
    source_name = "telegram"
    tier = 4
    rate_limit_seconds = 2.0

    def __init__(
        self,
        redis_client=None,
        db=None,
        api_id: str | None = None,
        api_hash: str | None = None,
    ):
        super().__init__(redis_client, db)
        self._api_id = api_id
        self._api_hash = api_hash

    async def scrape(self) -> list[dict[str, Any]]:
        api_id = self._api_id
        api_hash = self._api_hash

        if not api_id or not api_hash:
            raise ScraperError(
                "Telegram API credentials not configured (api_id/api_hash from my.telegram.org)"
            )

        try:
            from telethon import TelegramClient
        except ImportError:
            raise ScraperError("telethon package not installed")

        client = TelegramClient("hiregen_session", api_id, api_hash)

        try:
            await client.start()
        except Exception as e:
            raise ScraperError(f"Failed to connect to Telegram: {e}")

        leads: list[dict[str, Any]] = []

        for channel in FRESHER_CHANNELS:
            try:
                messages = await client.get_messages(channel, limit=50)

                for message in messages:
                    if not message.message:
                        continue

                    content = message.message
                    is_fresher = is_fresher_role("", "", content.lower())

                    if not is_fresher:
                        continue

                    # Extract any links from the message
                    links = re.findall(r'https?://[^\s]+', content)
                    job_url = ""
                    for link in links:
                        if any(kw in link.lower() for kw in ["job", "career", "apply", "lever", "greenhouse", "workday"]):
                            job_url = link
                            break
                    if not job_url and links:
                        job_url = links[0]

                    # Extract emails
                    emails = re.findall(r'[\w\.-]+@[\w\.-]+\.\w+', content)
                    hr_email = emails[0] if emails else ""

                    # Extract company name
                    company_name = self._extract_company(content)

                    lead = {
                        "company_name": company_name,
                        "about_company": "",
                        "hr_name": "",
                        "hr_email": hr_email,
                        "company_email": hr_email,
                        "hr_mobile": "",
                        "company_mobile": "",
                        "hr_linkedin_url": "",
                        "job_title": self._extract_title(content),
                        "about_job": content[:500],
                        "experience_required": "0-1 years",
                        "salary_range": "",
                        "job_url": job_url,
                        "source_site": f"telegram.me/{channel}",
                        "scraped_at": now_iso(),
                        "is_fresher": is_fresher,
                        "raw_payload": {
                            "content": content,
                            "message_id": message.id,
                            "date": str(message.date) if message.date else "",
                        },
                    }
                    leads.append(lead)

            except Exception as e:
                self._logger.warning(f"Telegram: channel '{channel}' failed: {e}")
                continue

        await client.disconnect()
        self._logger.info(f"Telegram: scraped {len(leads)} raw leads")
        return leads

    def _extract_company(self, text: str) -> str:
        """Extract company name from Telegram message."""
        lines = text.split("\n")
        for line in lines:
            if re.search(r'(?:company|employer|organization):\s*(.+)', line, re.IGNORECASE):
                return re.search(r'(?:company|employer|organization):\s*(.+)', line, re.IGNORECASE).group(1).strip()
            match = re.search(r'(?:Hiring|Recruiting|Job Opening).*?\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', line, re.IGNORECASE)
            if match:
                return match.group(1)
        return ""

    def _extract_title(self, text: str) -> str:
        """Extract job title from Telegram message."""
        lines = text.split("\n")
        for line in lines:
            match = re.search(r'(?:Job Title|Position|Role):\s*(.+)', line, re.IGNORECASE)
            if match:
                return match.group(1).strip()
            keywords = ["Software", "Data", "Business", "Junior", "Entry", "Fresher", "Intern", "Trainee"]
            for kw in keywords:
                if kw.lower() in line.lower():
                    return line.strip()
        return "Fresher Job"
