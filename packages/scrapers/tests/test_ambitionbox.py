"""AmbitionBox scraper: fixture parsing + live page check.

Live test fetches the real /jobs page (robots-clean, server-rendered JSON).
Capped at page 1 by design — filtered URLs hit a verification wall.
"""
import pytest

from scrapers.ambitionbox import AmbitionBoxScraper, _lpa

pytestmark = pytest.mark.asyncio


class TestLpa:
    def test_paise_to_lpa(self):
        assert _lpa(2110000) == "21.1 LPA"

    def test_plain_lpa(self):
        assert _lpa(21) == "21 LPA"

    def test_empty(self):
        assert _lpa(None) == "" and _lpa(0) == "" and _lpa("x") == ""


class TestLivePage:
    async def test_first_page_yields_fresher_leads(self):
        s = AmbitionBoxScraper()
        leads = await s.scrape()
        assert len(leads) >= 1, "page 1 should carry fresher postings"
        for lead in leads:
            assert lead["company_name"] and lead["job_title"]
            assert lead["job_url"].startswith("https://www.ambitionbox.com/jobs/")
            assert lead["source_site"] == "ambitionbox.com"

    async def test_registered_in_army(self):
        from scrapers.scrape_consumer import SCRAPER_MAP, DEFAULT_SOURCES
        assert SCRAPER_MAP["ambitionbox"] == ("scrapers.ambitionbox", "AmbitionBoxScraper")
        assert "ambitionbox" in DEFAULT_SOURCES
