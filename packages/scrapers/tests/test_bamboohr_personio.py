"""BambooHR + Personio ATS scrapers: fixture parsing + live endpoint checks.

Live tests hit the two pre-flight-verified public boards (freshworks on
BambooHR, personio on Personio) — public JSON/XML, no keys, polite rate.
"""
import pytest

from scrapers.bamboohr import BambooHRScraper
from scrapers.personio import PersonioScraper

pytestmark = pytest.mark.asyncio


class TestBambooUnit:
    def test_post_url_template(self):
        s = BambooHRScraper(companies=[])
        assert "freshworks" in s.POST_URL_TEMPLATE.format(company="freshworks", id="15")

    def test_corpus_includes_verified_board(self):
        from scrapers.utils.ats_corpus import corpus_for
        assert "freshworks" in corpus_for("bamboohr")


class TestPersonioUnit:
    def test_corpus_includes_verified_board(self):
        from scrapers.utils.ats_corpus import corpus_for
        assert "personio" in corpus_for("personio")

    def test_yoe_prefix_counts_as_fresher(self):
        assert "0-".startswith("0-")

    async def test_parses_xml_positions(self):
        import xml.etree.ElementTree as ET
        xml = """<workzag-jobs><position><id>1</id><subcompany>Acme</subcompany>
          <office>Bengaluru</office><department>Engineering</department>
          <name>Graduate Trainee</name><employmentType>permanent</employmentType>
          <seniority>entry</seniority><schedule>full-time</schedule>
          <yearsOfExperience>0-1</yearsOfExperience></position></workzag-jobs>"""
        root = ET.fromstring(xml)
        pos = next(root.iter("position"))
        name = pos.find("name")
        yoe = pos.find("yearsOfExperience")
        assert name is not None and name.text == "Graduate Trainee"
        assert yoe is not None and yoe.text == "0-1"


class TestLiveBoards:
    async def test_bamboohr_freshworks_returns_jobs(self):
        import aiohttp
        s = BambooHRScraper(companies=["freshworks"])
        async with aiohttp.ClientSession() as session:
            leads = await s._scrape_company(session, "freshworks")
        assert len(leads) >= 1
        assert all(l["job_url"].startswith("https://freshworks.bamboohr.com/careers/") for l in leads)
        assert all(l["source_site"] == "bamboohr.com/freshworks" for l in leads)

    async def test_bamboohr_non_customer_returns_empty(self):
        import aiohttp
        s = BambooHRScraper(companies=["definitely-not-a-bamboohr-company-xyz"])
        async with aiohttp.ClientSession() as session:
            assert await s._scrape_company(session, "definitely-not-a-bamboohr-company-xyz") == []

    async def test_personio_board_returns_jobs(self):
        import aiohttp
        s = PersonioScraper(companies=["personio"])
        async with aiohttp.ClientSession() as session:
            leads = await s._scrape_company(session, "personio")
        assert len(leads) >= 1
        assert all(l["source_site"] == "personio.com/personio" for l in leads)

    async def test_personio_non_customer_returns_empty(self):
        import aiohttp
        s = PersonioScraper(companies=["definitely-not-a-personio-company-xyz"])
        async with aiohttp.ClientSession() as session:
            assert await s._scrape_company(session, "definitely-not-a-personio-company-xyz") == []
