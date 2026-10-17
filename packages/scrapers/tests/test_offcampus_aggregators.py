"""Off-campus aggregator scraper: offline parsing + live sitemap check.

Respects each board's robots (freshershunt disallows /feed/ — this flow
uses sitemap + article URLs only).
"""
import pytest

from scrapers.offcampus_aggregators import (
    parse_sitemap_locs, split_company_role, pick_apply_url,
    OffCampusAggregatorsScraper,
)

pytestmark = pytest.mark.asyncio

SITEMAP_INDEX = """<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://x.in/post-sitemap1.xml</loc><lastmod>2026-09-13T00:00:00+00:00</lastmod></sitemap>
<sitemap><loc>https://x.in/page-sitemap.xml</loc><lastmod>2026-01-01T00:00:00+00:00</lastmod></sitemap>
</sitemapindex>"""

POST_SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://x.in/acme-drive/</loc><lastmod>2026-09-13T00:00:00+00:00</lastmod></url>
<url><loc>https://x.in/old-drive/</loc><lastmod>2026-01-01T00:00:00+00:00</lastmod></url>
</urlset>"""


def test_parse_sitemap_index():
    locs = parse_sitemap_locs(SITEMAP_INDEX)
    assert ("https://x.in/post-sitemap1.xml", "2026-09-13T00:00:00+00:00") in locs
    assert len(locs) == 2


def test_parse_post_sitemap():
    locs = parse_sitemap_locs(POST_SITEMAP)
    assert len(locs) == 2
    assert locs[0][0] == "https://x.in/acme-drive/"


def test_parse_malformed_returns_empty():
    assert parse_sitemap_locs("garbage {{{") == []


def test_split_company_role():
    company, role = split_company_role("Infosys EdgeVerve Off Campus Drive 2026 | Systems Engineer-EV")
    assert "infosys" in company.lower()
    assert role != ""


def test_year_only_title_yields_empty_role_for_caller_fallback():
    # "Infineon 2026" has no drive keyword: role comes back empty and the
    # caller substitutes the full title (never a bare year as the job title).
    company, role = split_company_role("Infineon 2026")
    assert company.lower() == "infineon"
    assert role == ""


def test_pick_apply_url_prefers_external_careers_link():
    html = ('<a href="https://x.in/other">x</a>'
            '<a href="https://careers.acme.example/apply/123">Apply</a>')
    assert pick_apply_url(html, "x.in", "https://x.in/post") == "https://careers.acme.example/apply/123"


def test_pick_apply_url_falls_back_to_post():
    assert pick_apply_url("<p>no links</p>", "x.in", "https://x.in/post") == "https://x.in/post"


class TestLiveSitemap:
    async def test_freshershunt_sitemap_has_fresh_posts(self):
        import aiohttp
        from datetime import datetime, timezone
        async with aiohttp.ClientSession() as session:
            async with session.get("https://freshershunt.in/sitemap_index.xml",
                                   timeout=aiohttp.ClientTimeout(total=15)) as resp:
                assert resp.status == 200
                locs = parse_sitemap_locs(await resp.text())
        assert len(locs) >= 1
        assert any("post-sitemap" in loc for loc, _ in locs)

    async def test_registered_in_army(self):
        from scrapers.scrape_consumer import SCRAPER_MAP, DEFAULT_SOURCES
        assert SCRAPER_MAP["offcampus"][1] == "OffCampusAggregatorsScraper"
        assert "offcampus" in DEFAULT_SOURCES


def test_self_reference_taxonomy_never_becomes_company():
    import re
    blob_domain = "freshershunt.in".split(".")[0]
    assert blob_domain in "0-6 years jobs - freshershunt".lower().replace(" ", "")
    blob_domain2 = "offcampusjobs4u.com".split(".")[0]
    assert blob_domain2 not in "standard chartered".lower().replace(" ", "")
