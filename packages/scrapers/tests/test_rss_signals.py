"""RSS hiring-signal tier (Agent-Reach channel port): offline parsing +
live feed check. Signals only — this tier must never yield a contact."""
from datetime import datetime, timezone

import pytest

from scrapers.utils.rss_signals import (
    parse_feed_items, match_hiring_signals, fetch_company_hiring_signals,
)

pytestmark = pytest.mark.asyncio

RSS_FIXTURE = """<?xml version="1.0"?>
<rss version="2.0"><channel><title>Acme Blog</title>
<item><title>We are hiring freshers for 2026</title>
<link>https://acme.example/blog/hiring</link>
<pubDate>Fri, 11 Sep 2026 12:00:00 +0000</pubDate></item>
<item><title>Quarterly product update</title>
<link>https://acme.example/blog/q3</link>
<pubDate>Fri, 11 Sep 2026 12:00:00 +0000</pubDate></item>
<item><title>Walk-in drive last year</title>
<link>https://acme.example/blog/old</link>
<pubDate>Mon, 01 Jan 2024 12:00:00 +0000</pubDate></item>
</channel></rss>"""


def test_parse_rss_items_offline():
    items = parse_feed_items(RSS_FIXTURE)
    assert len(items) == 3
    assert items[0]["title"] == "We are hiring freshers for 2026"
    assert items[0]["url"].startswith("https://acme.example")


def test_match_keeps_hiring_drops_stale_and_irrelevant():
    now = datetime(2026, 9, 14, tzinfo=timezone.utc)
    signals = match_hiring_signals(parse_feed_items(RSS_FIXTURE), now)
    titles = [s["title"] for s in signals]
    assert any("hiring freshers" in t for t in titles)
    assert not any("Quarterly" in t for t in titles)
    assert not any("last year" in t for t in titles)


def test_malformed_feed_returns_empty():
    assert parse_feed_items("not xml at all {{{") == []
    assert parse_feed_items("<html><body>no feed here</body></html>") == []


def test_signals_carry_no_contact_fields():
    now = datetime(2026, 9, 14, tzinfo=timezone.utc)
    for s in match_hiring_signals(parse_feed_items(RSS_FIXTURE), now):
        assert set(s) <= {"title", "url", "published", "matched"}
        assert "email" not in s and "phone" not in s and "name" not in s


async def test_bad_domain_returns_empty_without_raising():
    out = await fetch_company_hiring_signals("Acme", "not-a-domain")
    assert out == {"signals": [], "feeds_checked": 0}


async def test_live_zoho_blog_feed():
    out = await fetch_company_hiring_signals("Zoho", "zoho.com")
    assert isinstance(out["signals"], list)
    assert out["feeds_checked"] >= 1
    for s in out["signals"]:
        assert set(s) <= {"title", "url", "published", "matched"}
