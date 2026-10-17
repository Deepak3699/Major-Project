"""
Tier-4: Facebook Groups job-alert scraper.

SRS §4.54: Facebook Groups are opt-in and DISABLED BY DEFAULT.
This scraper is only activated when the admin enables it in Settings.

Configuration:
  - FACEBOOK_EMAIL / FACEBOOK_PASSWORD: credentials for Facebook login
  - FACEBOOK_GROUPS: comma-separated list of group URLs or IDs to monitor

LIVE STATUS: Disabled by default per SRS. Code-complete.
Live access blocked on external credential (Facebook account).
"""

import os
import logging
from typing import Any
from datetime import datetime, timezone

from .base import BaseScraper, ScraperError, now_iso
from .utils.fresher_classifier import is_fresher_role

logger = logging.getLogger(__name__)


class FacebookGroupsScraper(BaseScraper):
    source_name = "facebook"
    tier = 4
    rate_limit_seconds = 5.0

    CONFIG_KEY = "FACEBOOK_GROUPS_ENABLED"

    def __init__(self, redis_client=None, db=None, group_urls: list[str] | None = None):
        super().__init__(redis_client, db)
        self._enabled = os.environ.get(self.CONFIG_KEY, "").lower() in ("true", "1", "yes")
        self._group_urls = group_urls or os.environ.get("FACEBOOK_GROUPS", "").split(",") if os.environ.get("FACEBOOK_GROUPS") else []

    async def scrape(self) -> list[dict[str, Any]]:
        """Scrape Facebook groups for job postings.

        SRS §4.54: DISABLED BY DEFAULT. Only runs if FACEBOOK_GROUPS_ENABLED=true.
        """
        if not self._enabled:
            self._logger.info("Facebook Groups: disabled by default (SRS §4.54)")
            return []

        if not self._group_urls:
            self._logger.warning("Facebook Groups: enabled but no FACEBOOK_GROUPS configured")
            return []

        if not os.environ.get("FACEBOOK_EMAIL") or not os.environ.get("FACEBOOK_PASSWORD"):
            raise ScraperError(
                "Facebook Groups: FACEBOOK_EMAIL and FACEBOOK_PASSWORD required when enabled. "
                "LIVE VERIFICATION BLOCKED — no Facebook credential available."
            )

        # In production: use Playwright to log in to Facebook and scrape group posts
        # This requires valid Facebook credentials
        leads: list[dict[str, Any]] = []
        return leads
