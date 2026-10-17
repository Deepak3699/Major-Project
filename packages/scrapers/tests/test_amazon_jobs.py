"""Amazon Jobs scraper: live API checks + army registration."""
import pytest

from scrapers.amazon_jobs import AmazonJobsScraper

pytestmark = pytest.mark.asyncio


class TestLiveApi:
    async def test_intern_query_returns_india_jobs(self):
        s = AmazonJobsScraper()
        import aiohttp
        async with aiohttp.ClientSession() as session:
            leads = await s._scrape_query(
                session, {"base_query": "intern", "country": "IND"})
        assert len(leads) >= 1
        for lead in leads:
            assert lead["company_name"] == "Amazon"
            assert lead["job_url"].startswith("https://www.amazon.jobs/en/jobs/")
            assert lead["source_site"] == "amazon.jobs"
            assert "IN" in lead["location"] or "india" in lead["location"].lower()

    async def test_full_sweep_registers(self):
        from scrapers.scrape_consumer import SCRAPER_MAP, DEFAULT_SOURCES
        assert SCRAPER_MAP["amazon"] == ("scrapers.amazon_jobs", "AmazonJobsScraper")
        assert "amazon" in DEFAULT_SOURCES


class TestTelegramRoster:
    def test_iceberg_handles_present(self):
        from scrapers.telegram_jobs import FRESHER_CHANNELS
        for handle in ["work4freshers", "job4fresherss", "fresherjobinfo",
                       "hrgroupindia1", "freshersarea", "Jobs_Careers"]:
            assert handle in FRESHER_CHANNELS
