"""
Tier 4: Twitter/X scraper for fresher job posts.

Uses snscrape (open-source, no API key required) to search for fresher job tweets.
SRS §4.3 lists Twitter/X as a Tier-4 OSINT source.
"""

import json
import asyncio
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

# Search queries for fresher jobs on Twitter/X
SEARCH_QUERIES = [
    'fresher job hiring 0-1 years #hiring #fresher',
    'entry level job hiring 0-2 years #job',
    'campus hire fresher #internship',
    'graduate trainee hiring #fresherjobs',
    '0-1 years experience fresher #jobopening',
]


class TwitterScraper(BaseScraper):
    source_name = "twitter"
    tier = 4
    rate_limit_seconds = 5.0

    async def scrape(self) -> list[dict[str, Any]]:
        leads: list[dict[str, Any]] = []

        try:
            import snscrape.modules.twitter as sntwitter
        except ImportError:
            raise ScraperError("snscrape package not installed")

        for query in SEARCH_QUERIES:
            try:
                scraper = sntwitter.TwitterSearchScraper(query, max_results=20)
                for tweet in scraper.get_items():
                    if not hasattr(tweet, 'content') or not tweet.content:
                        continue

                    content = tweet.content
                    is_fresher = is_fresher_role("", "", content.lower())

                    if not is_fresher:
                        continue

                    lead = {
                        "company_name": self._extract_company(content),
                        "about_company": "",
                        "hr_name": "",
                        "hr_email": "",
                        "company_email": "",
                        "hr_mobile": "",
                        "company_mobile": "",
                        "hr_linkedin_url": "",
                        "job_title": self._extract_title(content),
                        "about_job": content[:500],
                        "experience_required": "0-1 years",
                        "salary_range": "",
                        "job_url": f"https://twitter.com/i/web/status/{tweet.id}" if hasattr(tweet, 'id') else "",
                        "source_site": "twitter.com",
                        "scraped_at": now_iso(),
                        "is_fresher": is_fresher,
                        "raw_payload": {
                            "content": content,
                            "user": tweet.user.username if hasattr(tweet, 'user') else "",
                            "id": str(tweet.id) if hasattr(tweet, 'id') else "",
                        },
                    }
                    leads.append(lead)

                await asyncio.sleep(self.rate_limit_seconds)
            except Exception as e:
                self._logger.warning(f"Twitter: query '{query}' failed: {e}")
                continue

        self._logger.info(f"Twitter: scraped {len(leads)} raw leads")
        return leads

    def _extract_company(self, text: str) -> str:
        """Extract company name from tweet text."""
        import re
        match = re.search(r'(?:at|@)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)', text)
        if match:
            return match.group(1)
        return ""

    def _extract_title(self, text: str) -> str:
        """Extract job title from tweet text."""
        import re
        patterns = [
            r'hiring\s+(?:for\s+)?(.+?)(?:\s+at|\s*#|$)',
            r'(?:Software|Data|Business|Junior|Entry|Fresher|Intern)\s+[\w\s]+',
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(0).strip()
        return "Fresher Job"
