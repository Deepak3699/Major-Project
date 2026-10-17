"""
Tier 4: Reddit scraper for fresher job posts.

Uses PRAW (Python Reddit API Wrapper) to search fresher-focused subreddits.
SRS §4.3 lists Reddit as a Tier-4 OSINT source.

Requires Reddit API credentials (free registration at reddit.com/prefs/apps).
If credentials are not configured, the scraper raises a ScraperError.
"""

import json
import re
import asyncio
import logging
from typing import Any

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)

# Subreddits known for fresher/entry-level job postings
FRESHER_SUBREDDITS = [
    "developersIndia", "csCareerQuestions", "forhire",
    "internships", "jobsearching", "cscareerquestions",
    "indian_jobs", "remotejs", "workonline",
]

SEARCH_QUERY = "fresher OR entry level OR 0-1 years OR internship OR campus hire"


class RedditScraper(BaseScraper):
    source_name = "reddit"
    tier = 4
    rate_limit_seconds = 2.0

    def __init__(
        self,
        redis_client=None,
        db=None,
        client_id: str | None = None,
        client_secret: str | None = None,
        user_agent: str = "HireGen-LeadGen/1.0",
    ):
        super().__init__(redis_client, db)
        self._client_id = client_id
        self._client_secret = client_secret
        self._user_agent = user_agent

    async def scrape(self) -> list[dict[str, Any]]:
        client_id = self._client_id or "REDDIT_CLIENT_ID"
        client_secret = self._client_secret or "REDDIT_CLIENT_SECRET"

        if client_id == "REDDIT_CLIENT_ID" or not client_id or not client_secret:
            raise ScraperError(
                "Reddit API credentials not configured (REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET)"
            )

        try:
            import praw

            reddit = praw.Reddit(
                client_id=client_id,
                client_secret=client_secret,
                user_agent=self._user_agent,
            )
        except Exception as e:
            raise ScraperError(f"Failed to initialize Reddit client: {e}")

        leads: list[dict[str, Any]] = []

        for subreddit_name in FRESHER_SUBREDDITS:
            try:
                subreddit = reddit.subreddit(subreddit_name)
                search_results = subreddit.search(SEARCH_QUERY, limit=20, sort="new")

                for submission in search_results:
                    title = submission.title or ""
                    if not title:
                        continue

                    is_fresher = is_fresher_role(title, "", json.dumps(submission.__dict__).lower())

                    if not is_fresher:
                        continue

                    # Try to extract HR contact from post body
                    body = submission.selftext or ""
                    hr_email = ""
                    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', body)
                    if email_match:
                        hr_email = email_match.group(0)

                    lead = {
                        "company_name": self._extract_company(title, body),
                        "about_company": "",
                        "hr_name": "",
                        "hr_email": hr_email,
                        "company_email": hr_email,
                        "hr_mobile": "",
                        "company_mobile": "",
                        "hr_linkedin_url": "",
                        "job_title": title,
                        "about_job": body[:500],
                        "experience_required": "0-1 years" if is_fresher else "",
                        "salary_range": "",
                        "job_url": submission.url,
                        "source_site": f"reddit.com/r/{subreddit_name}",
                        "scraped_at": now_iso(),
                        "is_fresher": is_fresher,
                        "raw_payload": {
                            "title": title,
                            "body": body,
                            "score": submission.score,
                            "created_utc": submission.created_utc,
                        },
                    }
                    leads.append(lead)

            except Exception as e:
                self._logger.warning(f"Reddit: r/{subreddit_name} failed: {e}")
                continue

        self._logger.info(f"Reddit: scraped {len(leads)} raw leads")
        return leads

    def _extract_company(self, title: str, body: str) -> str:
        """Try to extract company name from title patterns like '[Company] Role'."""
        match = re.match(r'\[([^\]]+)\]', title)
        if match:
            return match.group(1)

        text = f"{title} {body}"
        company_patterns = [
            r'at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
            r'company:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)',
        ]
        for pattern in company_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return ""
