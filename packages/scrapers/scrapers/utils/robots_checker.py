"""
Robots.txt checker for ethical scraping per SRS §13.

Fetches and parses robots.txt for a given base URL, then checks
whether a specific path is allowed to be scraped.

Usage:
    from scrapers.utils.robots_checker import RobotsChecker

    checker = RobotsChecker()
    if checker.is_allowed("https://example.com/some/page"):
        # safe to scrape
        pass
"""

import logging
import time
from typing import Optional
from urllib.parse import urlparse, urljoin

import aiohttp

logger = logging.getLogger(__name__)

_cache: dict[str, dict[str, any]] = {}


class RobotsChecker:
    """Check robots.txt compliance for scraping URLs."""

    def __init__(self, timeout: float = 10.0, cache_ttl: int = 3600):
        self._timeout = timeout
        self._cache_ttl = cache_ttl

    def _get_base_url(self, url: str) -> str:
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}"

    def _get_path(self, url: str) -> str:
        parsed = urlparse(url)
        return parsed.path or "/"

    async def _fetch_robots_txt(self, base_url: str) -> str:
        cache_key = base_url
        cached = _cache.get(cache_key)
        if cached:
            if time.time() - cached["fetched_at"] < self._cache_ttl:
                return cached["content"]

        robots_url = urljoin(base_url, "/robots.txt")
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self._timeout)) as session:
                async with session.get(robots_url) as resp:
                    if resp.status == 200:
                        text = await resp.text()
                        _cache[cache_key] = {"content": text, "fetched_at": time.time()}
                        return text
                    logger.debug(f"robots.txt returned {resp.status} for {base_url}")
        except Exception as e:
            logger.debug(f"Failed to fetch robots.txt for {base_url}: {e}")

        _cache[cache_key] = {"content": "", "fetched_at": time.time()}
        return ""

    def _parse_robots_txt(self, content: str) -> dict[str, dict[str, any]]:
        """Parse robots.txt content into per-useragent rules.

        Returns {
            "useragent1": {"allow": [...], "disallow": [...]},
            ...
        }
        """
        rules: dict[str, dict[str, any]] = {}
        current_ua: Optional[str] = None

        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            lower = line.lower()
            if lower.startswith("user-agent:"):
                current_ua = line.split(":", 1)[1].strip()
                if current_ua not in rules:
                    rules[current_ua] = {"allow": [], "disallow": []}
            elif lower.startswith("allow:") and current_ua:
                path = line.split(":", 1)[1].strip()
                rules[current_ua]["allow"].append(path)
            elif lower.startswith("disallow:") and current_ua:
                path = line.split(":", 1)[1].strip()
                rules[current_ua]["disallow"].append(path)

        return rules

    def _is_path_allowed(self, path: str, rules: dict[str, any]) -> bool:
        """Check if a path is allowed given robots.txt rules."""
        allow_patterns = rules.get("allow", [])
        disallow_patterns = rules.get("disallow", [])

        if not disallow_patterns:
            return True

        path_lower = path.lower()

        for pattern in disallow_patterns:
            if not pattern:
                continue
            pattern_lower = pattern.lower()
            if path_lower.startswith(pattern_lower) or pattern_lower == "/":
                if not any(
                    path_lower.startswith(a.lower()) for a in allow_patterns if a
                ):
                    return False

        return True

    async def is_allowed(self, url: str, user_agent: str = "HireGen-LeadGen/1.0") -> bool:
        """Check if a URL is allowed to be scraped per robots.txt.

        If robots.txt cannot be fetched, defaults to True (allow).
        """
        base_url = self._get_base_url(url)
        path = self._get_path(url)

        content = await self._fetch_robots_txt(base_url)
        if not content:
            return True

        rules = self._parse_robots_txt(content)

        ua_rules = rules.get(user_agent) or rules.get("*")

        if ua_rules is None:
            ua_rules = rules.get("googlebot") or rules.get("bingbot")
            if ua_rules is None:
                all_disallow = all(
                    not r.get("disallow") for r in rules.values()
                )
                return all_disallow

        return self._is_path_allowed(path, ua_rules)

    def is_allowed_sync(self, url: str, user_agent: str = "HireGen-LeadGen/1.0") -> bool:
        """Synchronous version — checks cache only, does not fetch."""
        base_url = self._get_base_url(url)
        path = self._get_path(url)

        cached = _cache.get(base_url)
        if not cached:
            return True

        rules = self._parse_robots_txt(cached["content"])
        ua_rules = rules.get(user_agent) or rules.get("*")

        if ua_rules is None:
            return True

        return self._is_path_allowed(path, ua_rules)

    def invalidate_cache(self) -> None:
        _cache.clear()
