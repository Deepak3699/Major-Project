"""HackerEarth parser offline tests — envelope shapes + never-fabricate contacts.

Live scrape can't be exercised in CI (network), so we pin the defensive parser:
it must extract items from every known envelope, drop postings without a title,
and NEVER invent an HR email/phone (those are resolved later by enrichment).
"""
from scrapers.hackerearth import HackerEarthScraper as H


def test_extract_items_all_envelopes():
    assert H._extract_items([{"title": "A"}]) == [{"title": "A"}]
    assert H._extract_items({"jobs": [{"title": "A"}]}) == [{"title": "A"}]
    assert H._extract_items({"data": {"jobs": [{"title": "A"}]}}) == [{"title": "A"}]
    assert H._extract_items({"unexpected": 1}) == []


def test_parse_maps_fields_and_no_fabricated_contacts():
    s = H()
    lead = s._parse({
        "title": "Backend Intern (Fresher)", "company": "Acme Labs",
        "location": "Bengaluru", "_url": "/jobs/xyz",
        "experience_required": 0, "stipend": "15000/month",
        "description": "Build APIs. 0-1 years, freshers welcome.",
    })
    assert lead["job_title"].startswith("Backend Intern")
    assert lead["company_name"] == "Acme Labs"
    assert lead["job_url"] == "https://www.hackerearth.com/jobs/xyz"
    assert lead["source_site"] == "hackerearth.com"
    assert lead["is_fresher"] is True
    # never-fabricate: contacts come from enrichment, not the board
    assert lead["hr_email"] == "" and lead["company_email"] == "" and lead["hr_mobile"] == ""


def test_parse_requires_title():
    assert H()._parse({"company": "NoTitle Co"}) is None
