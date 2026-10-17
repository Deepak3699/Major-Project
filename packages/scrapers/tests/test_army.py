"""
Tests for the OSINT-army expansion: ATS corpus, GitHub email mining,
multi-engine SERP dork guard, daily scheduler timing, and the shared
_extract_experience regex fix. All offline/deterministic (no live network).
"""
import re
import asyncio
from datetime import datetime, timezone, timedelta

import pytest

from scrapers.utils.ats_corpus import corpus_for, SHARED_CORPUS, MAX_BOARDS
from scrapers.utils.github_email_osint import infer_company_pattern, org_slug_for
from scrapers.utils.serp_dork import _email_relates_to_name, _ROLE_LOCAL, _parse_html
from scrapers import scheduler
from scrapers.ashby import AshbyScraper


# ---------- ATS corpus ----------
def test_corpus_deduped_capped_and_clean():
    c = corpus_for("greenhouse")
    assert len(c) <= MAX_BOARDS
    assert len(c) == len(set(c)), "no dupes"
    assert all(s == s.lower() and "." not in s and " " not in s for s in c), "clean slugs"
    # India-first: real Indian employers present
    assert {"zoho", "swiggy", "groww", "razorpay", "browserstack"} <= set(SHARED_CORPUS)


def test_corpus_source_extras_first():
    # greenhouse-specific known-good slugs lead the list
    assert corpus_for("greenhouse")[0] in {"stripe", "gitlab", "discord", "roblox", "databricks", "coinbase"}


# ---------- GitHub email pattern ----------
def test_infer_pattern_firstlast():
    assert infer_company_pattern(["a.b@x.com", "c.d@x.com"], "x.com") == "{first}.{last}"

def test_infer_pattern_firstonly():
    # three {first} emails -> {first}
    assert infer_company_pattern(["alice@x.com", "bobsmith@x.com", "carol@x.com"], "x.com") in (
        "{first}", "{f}{last}")
    assert infer_company_pattern(["johnsmith@x.com", "janedoe@x.com", "jdoe@x.com"], "x.com") != ""

def test_org_slug_from_domain():
    assert org_slug_for("cloudflare.com") == "cloudflare"
    assert org_slug_for("www.acme.com") == "acme"       # skip subdomain (S6)
    assert org_slug_for("careers.foo.co.in") == "foo"

def test_as_text_flattens_dicts():  # B3 root fix
    from scrapers.base import BaseScraper
    as_text = BaseScraper._as_text
    assert as_text({"min": 50000, "max": 80000, "currency": "EUR"}) == "50000-80000 EUR"
    assert as_text({"id": "other", "name": "Other"}) == "Other"
    assert as_text({"country": {"name": "India"}, "city": "Bengaluru"}) == "Bengaluru, India"
    assert as_text("already a string") == "already a string"
    assert as_text(None) == ""


def test_sweep_isolates_bad_items():  # B1 root fix
    import asyncio
    from scrapers.base import BaseScraper
    class _S(BaseScraper):
        source_name = "t"; tier = 3
        async def scrape(self): return []
    s = _S()
    async def good(session, item):
        if item == "bad":
            raise RuntimeError("boom")
        return [{"x": item}]
    async def run():
        return await s._sweep(None, ["a", "bad", "b"], good)
    out = asyncio.run(run())
    assert {o["x"] for o in out} == {"a", "b"}  # bad skipped, others survive


def test_pattern_needs_two_emails():
    assert infer_company_pattern(["solo@x.com"], "x.com") == ""
    assert infer_company_pattern([], "x.com") == ""


# ---------- SERP role/name guard (the correctness fix) ----------
@pytest.mark.parametrize("email,name,exp", [
    ("grauch@vercel.com", "Guillermo Rauch", True),
    ("jdoe@x.com", "John Doe", True),
    ("guillermo@vercel.com", "Guillermo Rauch", True),
    ("ceo@vercel.com", "Guillermo Rauch", False),   # role mailbox must be rejected
    ("info@acme.com", "John Doe", False),
    ("hr@acme.com", "Jane Smith", False),
    ("careers@acme.com", "Jane Smith", False),
    ("random@x.com", "John Doe", False),            # no name relation
])
def test_email_relates_to_name(email, name, exp):
    assert _email_relates_to_name(email, name) is exp

def test_role_regex_covers_common_boxes():
    for box in ("info", "support", "hr", "careers", "noreply", "webmaster"):
        assert _ROLE_LOCAL.match(box), box


def test_parse_html_extracts_snippets():
    html = "<html><body><div class='result__snippet'>Reach me at jane.doe@acme.com today</div></body></html>"
    chunks = _parse_html("ddg", html)
    assert any("jane.doe@acme.com" in c for c in chunks)


# ---------- Scheduler timing ----------
def test_next_run_rolls_to_tomorrow_when_past():
    now = datetime(2026, 1, 1, 5, 0, tzinfo=timezone.utc)  # after 03:00 default
    nxt = scheduler._next_run(now)
    assert nxt > now
    assert nxt.hour == scheduler._HOUR
    assert (nxt - now) < timedelta(days=2)

def test_next_run_today_when_before():
    now = datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc)  # before 03:00
    nxt = scheduler._next_run(now)
    assert nxt.date() == now.date()
    assert nxt.hour == scheduler._HOUR


# ---------- Shared experience-fix (regression for the crash) ----------
def test_extract_experience_single_group_no_crash():
    a = AshbyScraper(companies=["x"])
    # single-group pattern "... years of relevant experience" used to IndexError
    job = {"descriptionHtml": "Requires 3 years of relevant experience in Python"}
    out = a._extract_experience(job)
    assert out and "years" in out  # returns, doesn't crash

def test_extract_experience_range():
    a = AshbyScraper(companies=["x"])
    job = {"descriptionHtml": "Looking for 2-5 years of experience"}
    assert a._extract_experience(job) == "2-5 years"


# --- Per-adapter fixture parsing (real captured payloads) --------------------
# These are the tests that would have caught B3 (dict salary/location -> asyncpg
# DataError / dropped geo) and B4 (empty location strings) at review time.
import asyncio
from unittest import mock
from scrapers.recruitee import RecruiteeScraper
from scrapers.breezy import BreezyScraper


RECRUITEE_FIXTURE = {"offers": [{
    "title": "Backend Engineer",
    "description": "Build APIs.",
    "location": "Warsaw, Mazowieckie, Poland",
    "city": "Warsaw", "country": "Poland",
    "salary": {"min": 50000, "max": 80000, "currency": "EUR", "period": "year"},
    "careers_url": "https://gong.recruitee.com/o/xyz",
    "company_name": "Gong",
}]}

BREEZY_FIXTURE = [{
    "id": "abc",
    "name": "Junior Developer",
    "url": "https://acme.breezy.hr/abc",
    "type": {"id": "full_time", "name": "Full time"},
    # real breezy nests company as an OBJECT, not a string (live-confirmed)
    "company": {"id": "c1", "name": "Acme Corp"},
    "location": {"country": {"name": "India"}, "city": "Bengaluru", "name": "Bengaluru, India"},
}]


def _run(scrap, fixture):
    async def fake_get_json(self, session, url, **kw):
        return 200, fixture
    with mock.patch("scrapers.base.BaseScraper._get_json", fake_get_json):
        return asyncio.run(scrap._scrape_company(None, "acme"))


def test_recruitee_flattens_salary_dict_and_keeps_location():
    leads = _run(RecruiteeScraper(companies=["gong"]), RECRUITEE_FIXTURE)
    assert len(leads) == 1
    l = leads[0]
    assert isinstance(l["salary_range"], str)          # never a dict -> asyncpg-safe
    assert "50000" in l["salary_range"] and "EUR" in l["salary_range"]
    assert "Poland" in l["location"]                    # geo survives


def test_breezy_flattens_location_dict():
    leads = _run(BreezyScraper(companies=["acme"]), BREEZY_FIXTURE)
    assert len(leads) == 1
    l = leads[0]
    assert isinstance(l["location"], str) and "India" in l["location"]
    assert isinstance(l["salary_range"], str)           # breezy has no salary -> ""
    assert l["is_fresher"] is True                      # "Junior Developer"
    assert l["job_title"] == "Junior Developer"
    assert isinstance(l["company_name"], str) and "Acme" in l["company_name"]  # nested dict -> str


# SmartRecruiters fixture — real captured shape (v1 postings) + the shape-variance
# cases the API is known to mix: company dict OR str, experienceLevel dict,
# country string OR {code,name} object, ref string OR {uri} object.
# This is the test that would have caught C1/C2/C3.
from scrapers.smartrecruiters import SmartRecruitersScraper

SR_FIXTURE = {"content": [
    {   # ground-truth dataiku: company dict, experienceLevel dict, country str, ref str
        "name": "Full-Stack R&D Engineer",
        "company": {"identifier": "Dataiku", "name": "Dataiku"},
        "experienceLevel": {"id": "mid_senior_level", "label": "Mid-Senior Level"},
        "location": {"city": "Paris", "region": "IDF", "country": "fr"},
        "ref": "https://api.smartrecruiters.com/v1/companies/dataiku/postings/1",
    },
    {   # adversarial variant: company str, country object, ref object, fresher title
        "name": "Junior Developer (Graduate)",
        "company": "AcmeCo",
        "location": {"city": "Bengaluru", "country": {"code": "in", "name": "India"}},
        "ref": {"id": "9", "uri": "https://api.smartrecruiters.com/.../9"},
    },
]}


def test_smartrecruiters_handles_dict_and_str_shapes():  # C1/C2/C3
    leads = _run(SmartRecruitersScraper(companies=["dataiku"]), SR_FIXTURE)
    assert len(leads) == 2
    for l in leads:
        # every TEXT-bound field MUST be a str or asyncpg DataError
        for k in ("company_name", "location", "experience_required", "job_url", "job_title", "about_job", "salary_range"):
            assert isinstance(l[k], str), f"{k} is {type(l[k]).__name__}"
    assert leads[0]["company_name"] == "Dataiku"                 # dict.company -> name
    assert "India" in leads[1]["location"]                        # country object flattened
    assert leads[1]["job_url"].endswith("/9")                     # ref object -> uri
    assert leads[1]["is_fresher"] is True                         # "Junior/Graduate"
    assert leads[0]["experience_required"] == "Mid-Senior Level"  # expLevel dict -> label
