"""Tests for the robots.txt checker (SRS §13)."""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, AsyncMock as MockAsync
from scrapers.utils.robots_checker import RobotsChecker, _cache


class TestRobotsChecker:
    """Tests for robots.txt parsing and compliance checking per SRS §13."""

    def test_parse_robots_txt_basic(self):
        checker = RobotsChecker()
        content = """
User-agent: *
Disallow: /admin/
Disallow: /private/

User-agent: Googlebot
Disallow: /search
"""
        rules = checker._parse_robots_txt(content)
        assert "*" in rules
        assert "/admin/" in rules["*"]["disallow"]
        assert "/private/" in rules["*"]["disallow"]
        assert "Googlebot" in rules
        assert "/search" in rules["Googlebot"]["disallow"]

    def test_parse_robots_txt_with_allow(self):
        checker = RobotsChecker()
        content = """
User-agent: *
Disallow: /
Allow: /public/
"""
        rules = checker._parse_robots_txt(content)
        assert "/public/" in rules["*"]["allow"]
        assert "/" in rules["*"]["disallow"]

    def test_parse_robots_txt_empty(self):
        checker = RobotsChecker()
        rules = checker._parse_robots_txt("")
        assert rules == {}

    def test_parse_robots_txt_comments_ignored(self):
        checker = RobotsChecker()
        content = """
# This is a comment
User-agent: *
# Another comment
Disallow: /admin/
"""
        rules = checker._parse_robots_txt(content)
        assert "/admin/" in rules["*"]["disallow"]

    def test_is_path_allowed_disallowed(self):
        checker = RobotsChecker()
        rules = {"allow": [], "disallow": ["/admin/"]}
        assert checker._is_path_allowed("/admin/dashboard", rules) is False
        assert checker._is_path_allowed("/public/page", rules) is True

    def test_is_path_allowed_no_disallow(self):
        checker = RobotsChecker()
        rules = {"allow": [], "disallow": []}
        assert checker._is_path_allowed("/any/path", rules) is True

    def test_is_path_allowed_root_disallow_with_allow(self):
        checker = RobotsChecker()
        rules = {"allow": ["/public/"], "disallow": ["/"]}
        assert checker._is_path_allowed("/public/page", rules) is True
        assert checker._is_path_allowed("/private/page", rules) is False

    def test_invalidate_cache(self):
        _cache["https://example.com"] = {"content": "test", "fetched_at": 0}
        assert "https://example.com" in _cache
        checker = RobotsChecker()
        checker.invalidate_cache()
        assert "https://example.com" not in _cache

    def test_get_base_url(self):
        checker = RobotsChecker()
        assert checker._get_base_url("https://example.com/some/path") == "https://example.com"
        assert checker._get_base_url("http://sub.example.com/page") == "http://sub.example.com"

    def test_get_path(self):
        checker = RobotsChecker()
        assert checker._get_path("https://example.com/some/page?q=1") == "/some/page"
        assert checker._get_path("https://example.com/") == "/"
        assert checker._get_path("https://example.com") == "/"

    @pytest.mark.asyncio
    async def test_is_allowed_sync_no_cache(self):
        checker = RobotsChecker()
        checker.invalidate_cache()
        result = checker.is_allowed_sync("https://example.com/page")
        assert result is True

    @pytest.mark.asyncio
    async def test_is_allowed_sync_with_cache_disallowed(self):
        checker = RobotsChecker()
        checker.invalidate_cache()
        _cache["https://example.com"] = {
            "content": "User-agent: *\nDisallow: /admin/\n",
            "fetched_at": float("inf"),
        }
        assert checker.is_allowed_sync("https://example.com/admin/") is False
        assert checker.is_allowed_sync("https://example.com/public/") is True


class TestRobotsCheckerAsync:
    """Async tests for robots.txt fetching."""

    @pytest.mark.asyncio
    async def test_is_allowed_allows_when_no_robots_txt(self):
        checker = RobotsChecker()
        checker.invalidate_cache()

        with patch("scrapers.utils.robots_checker.aiohttp.ClientSession") as mock_session:
            mock_resp = AsyncMock()
            mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
            mock_resp.__aexit__ = AsyncMock(return_value=None)
            mock_resp.status = 404
            mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session.return_value)
            mock_session.return_value.__aexit__ = AsyncMock(return_value=None)
            mock_session.return_value.get = MagicMock(return_value=mock_resp)

            result = await checker.is_allowed("https://example.com/page")
            assert result is True

    @pytest.mark.asyncio
    async def test_is_allowed_allows_when_robots_txt_disallows(self):
        checker = RobotsChecker()
        checker.invalidate_cache()

        mock_resp = AsyncMock()
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=None)
        mock_resp.status = 200
        mock_resp.text = AsyncMock(return_value="User-agent: *\nDisallow: /private/\n")

        mock_session = MagicMock()
        mock_session.return_value.__aenter__ = AsyncMock(return_value=mock_session.return_value)
        mock_session.return_value.__aexit__ = AsyncMock(return_value=None)
        mock_session.return_value.get = MagicMock(return_value=mock_resp)

        with patch("scrapers.utils.robots_checker.aiohttp.ClientSession", mock_session):
            result = await checker.is_allowed("https://example.com/public/page")
            assert result is True

            result_private = await checker.is_allowed("https://example.com/private/page")
            assert result_private is False
