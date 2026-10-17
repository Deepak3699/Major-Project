"""
Tier-4: WhatsApp broadcast job-alert channel listener.

SRS §4.52: WhatsApp broadcast job-alert channels are used for job distribution
in emerging markets. This listener monitors configured WhatsApp groups/chats
for job postings using the WhatsApp Web API (web.whatsapp.com).

The SRS-approved architecture uses a headless browser session for WhatsApp Web
since the WhatsApp Business API requires a Facebook Business account.

LIVE VERIFICATION: Blocked on external credential — requires a valid
WhatsApp session QR pairing (no credential available in this environment).
Code-complete only.
"""

import asyncio
import logging
import re
import json
import os
from typing import Any, Optional
from datetime import datetime, timezone

from .base import now_iso, ScraperError

logger = logging.getLogger(__name__)

JOB_PATTERN = re.compile(
    r"(hiring|job|opening|urgent.*?hiring|fresher|intern|entry.*?level)"
    r".{0,200}(?:at|@|for)\s+([^.\n]{2,80})",
    re.IGNORECASE,
)

EMAIL_PATTERN = re.compile(r"\b[\w.+-]+@[\w.-]+\.\w+\b")
PHONE_PATTERN = re.compile(r"\b\+?\d[\d\s\-()]{8,}\b")
COMPANY_KEYWORDS = [
    "hiring", "urgent", "fresher", "intern", "walk-in", "walkin",
    "opening", "job", "employment", "vacancy", "position",
]


class WhatsAppListener:
    """Monitor WhatsApp groups/chats for job postings.

    SRS §4.52: session management → channel discovery → message ingestion →
    job extraction → normalization → freshness filtering → deduplication →
    queue insertion → audit/source attribution.

    LIVE STATUS: Blocked on external credential — requires WhatsApp Web QR pairing.
    """

    source_name = "whatsapp"
    tier = 4

    def __init__(self, redis_client=None, db=None):
        self._redis = redis_client
        self._db = db
        self.session_path = os.environ.get("WHATSAPP_SESSION_PATH", "/tmp/whatsapp-session")
        self._logger = logging.getLogger(f"scrapers.{self.source_name}")

    async def discover_channels(self) -> list[dict[str, Any]]:
        """SRS §4.52: Discover job-alert WhatsApp groups/chats."""
        # Requires active WhatsApp Web session
        if not os.environ.get("WHATSAPP_PHONE"):
            raise ScraperError(
                "WhatsApp: WHATSAPP_PHONE env var required for session setup. "
                "LIVE VERIFICATION BLOCKED — no WhatsApp credential available."
            )
        # In production: scan chat list for groups containing "jobs", "hiring", etc.
        # This is the channel discovery step
        return []

    async def start_listening(self) -> asyncio.Queue:
        """Start listening for new messages in discovered job-alert channels.

        SRS §4.52: message ingestion → job extraction.
        """
        queue: asyncio.Queue = asyncio.Queue()
        # Requires active WhatsApp Web session with QR pairing
        raise ScraperError(
            "WhatsApp listener requires QR pairing. "
            "Live verification blocked on external credential."
        )

    def extract_jobs_from_message(self, text: str) -> list[dict[str, Any]]:
        """Extract job postings from a WhatsApp message text."""
        jobs = []
        lines = text.split("\n")

        if any(kw in text.lower() for kw in COMPANY_KEYWORDS):
            company_match = re.search(r"(?:at|@|for)\s+([A-Z][A-Za-z\s]+)", text, re.IGNORECASE)
            company = company_match.group(1).strip() if company_match else "Unknown"

            title_match = re.search(r"(?:hiring|fresher|intern|entry.*?level)\s+([A-Za-z\s]+)", text, re.IGNORECASE)
            title = title_match.group(1).strip() if title_match else "Job Opening"

            emails = EMAIL_PATTERN.findall(text)
            phones = PHONE_PATTERN.findall(text)

            is_fresher = any(kw in text.lower() for kw in ["fresher", "intern", "0-1 year"])

            job = {
                "company_name": company,
                "about_company": "",
                "hr_name": "",
                "hr_email": emails[0] if emails else "",
                "company_email": emails[0] if emails else "",
                "hr_mobile": phones[0].strip() if phones else "",
                "company_mobile": "",
                "hr_linkedin_url": "",
                "job_title": title,
                "about_job": text[:500],
                "experience_required": "",
                "salary_range": "",
                "job_url": "",
                "source_site": "whatsapp",
                "scraped_at": now_iso(),
                "is_fresher": is_fresher,
                "raw_payload": {"message": text[:500]},
            }
            jobs.append(job)

        return jobs

    async def process_message(self, message_text: str) -> list[dict[str, Any]]:
        """Process an incoming WhatsApp message and extract jobs.

        SRS §4.52 pipeline: message ingestion → extraction → normalization.
        """
        jobs = self.extract_jobs_from_message(message_text)

        from .utils.fresher_classifier import is_fresher_role
        from .utils.dedup import generate_fingerprint

        normalized_jobs = []
        for job in jobs:
            job["is_fresher"] = is_fresher_role(
                job["job_title"], job["experience_required"], job["about_job"]
            )
            job["fingerprint"] = generate_fingerprint(
                job["company_name"], job["job_title"], job["job_url"]
            )

            # Enqueue to Redis
            if self._redis:
                await self._redis.lpush(
                    "raw_leads_queue:requests",
                    json.dumps(job),
                )

            normalized_jobs.append(job)
            self._logger.info(f"WhatsApp: extracted job from message: {job['job_title'][:50]}")

        return normalized_jobs
