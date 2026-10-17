"""Hasjob scraper: offline entry parsing + live feed check."""
import xml.etree.ElementTree as ET

import pytest

from scrapers.hasjob import parse_entry, HasjobScraper, ATOM_NS

pytestmark = pytest.mark.asyncio

ENTRY_XML = (
    '<entry xmlns="http://www.w3.org/2005/Atom">'
    "<title>Backend Developer (Fresher)</title>"
    "<id>https://hasjob.co/acmeco/abc12</id>"
    "<published>2026-09-12T06:00:00+00:00</published>"
    "<location>Bengaluru</location>"
    "<content><p><strong><a href='https://acmeco.example'>Acme Co</a></strong><br/>Bengaluru</p></content>"
    "</entry>"
)


def test_parse_entry_offline():
    parsed = parse_entry(ET.fromstring(ENTRY_XML))
    assert parsed is not None
    assert parsed["title"] == "Backend Developer (Fresher)"
    assert parsed["company"] == "acmeco"
    assert parsed["location"] == "Bengaluru"
    assert parsed["job_url"] == "https://hasjob.co/acmeco/abc12"


def test_parse_entry_rejects_non_job_urls():
    bad = ET.fromstring(
        '<entry xmlns="http://www.w3.org/2005/Atom">'
        "<title>x</title><id>https://other.example/y</id></entry>"
    )
    assert parse_entry(bad) is None


class TestLiveFeed:
    async def test_feed_yields_leads(self):
        leads = await HasjobScraper().scrape()
        assert len(leads) >= 1
        for lead in leads:
            assert lead["job_url"].startswith("https://hasjob.co/")
            assert lead["source_site"] == "hasjob.co"

    async def test_registered_in_army(self):
        from scrapers.scrape_consumer import SCRAPER_MAP, DEFAULT_SOURCES
        assert SCRAPER_MAP["hasjob"] == ("scrapers.hasjob", "HasjobScraper")
        assert "hasjob" in DEFAULT_SOURCES
