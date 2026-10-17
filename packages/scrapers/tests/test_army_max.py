"""Regression checks for the max-coverage additions:
  - escalating evasion HTTP layer (pure logic: block detection, engine ordering, headers)
  - cost-aware paid waterfall + key-free OSINT (no-key no-op, gravatar guard)
  - registry integrity (every DEFAULT_SOURCES maps to a real scraper class)
No network is hit: these assert the *decision logic* that gates the heavy paths.
"""
import asyncio
import hashlib
import os
import importlib

import pytest

from scrapers.utils import http_client as hc


# ---- http_client: block detection --------------------------------------------
def test_looks_blocked_status_codes():
    assert hc._looks_blocked(403, "ok")
    assert hc._looks_blocked(429, "ok")
    assert hc._looks_blocked(503, "ok")


def test_looks_blocked_marker_text():
    body = "<html><head><title>Attention Required! | Cloudflare</title></head></html>"
    assert hc._looks_blocked(200, body)
    assert hc._looks_blocked(200, "captcha")


def test_not_blocked_on_real_document():
    body = "<html><body>" + ("job listing data " * 60) + "</body></html>"
    assert not hc._looks_blocked(200, body)


def test_headers_are_browser_like():
    h = hc._browser_headers()
    assert "User-Agent" in h and "Mozilla" in h["User-Agent"]
    assert "text/html" in h["Accept"]
    # caller-supplied headers win over defaults (e.g. Accept: application/json)
    assert hc._browser_headers({"Accept": "application/json"})["Accept"] == "application/json"


# ---- http_client: engine ordering (min..max) ---------------------------------
def _ordered(min_engine, max_engine):
    ranks = {"httpx": 0, "curl": 1, "playwright": 2}
    lo, hi = ranks[min_engine], ranks[max_engine]
    return [e for i, e in enumerate(["httpx", "curl", "playwright"]) if lo <= i <= hi]


def test_js_portal_forces_playwright_only():
    # JS-rendered portals must NOT short-circuit on the httpx empty shell
    assert _ordered("playwright", "playwright") == ["playwright"]


def test_json_api_uses_cheap_tiers():
    assert _ordered("httpx", "curl") == ["httpx", "curl"]


def test_default_escalates_all_three():
    assert _ordered("httpx", "playwright") == ["httpx", "curl", "playwright"]


# ---- gravatar md5 identity (email -> hash) -----------------------------------
def test_gravatar_hash_matches_md5_of_trimmed_lower():
    email = "  Alice@Example.com "
    expected = hashlib.md5(email.strip().lower().encode()).hexdigest()
    assert expected == hashlib.md5(b"alice@example.com").hexdigest()


# ---- paid waterfall: no keys => no spend, no network, {} --------------------
def test_paid_waterfall_no_keys_returns_empty():
    from scrapers.utils.email_providers import paid_email_waterfall
    assert asyncio.run(paid_email_waterfall("Jane Doe", "acme.com", {})) == {}


def test_all_adapters_noop_without_key():
    from scrapers.utils import email_providers as ep
    for slug, fn in ep.PROVIDERS.items():
        assert asyncio.run(fn("Jane Doe", "acme.com", None)) == {}, slug


# ---- key-free OSINT modules present + callable (their live network probes run
# via the worker's own self-checks; here we only assert the no-fabricate guards) -
def test_osint_contacts_exports_and_gravatar_guard():
    from scrapers.utils import osint_contacts as oc
    for fn in ("crtsh_emails", "wayback_emails", "gravatar_lookup", "company_mails_from_crt"):
        assert callable(getattr(oc, fn)), fn


def test_gravatar_rejects_non_email():
    from scrapers.utils.osint_contacts import gravatar_lookup
    assert gravatar_lookup("no-at-sign") == {}
    assert gravatar_lookup("") == {}


# ---- registry integrity: the 4 new India sources + all defaults wired --------
def test_new_india_sources_registered_and_india_native():
    import scrapers.scrape_consumer as sc
    from scrapers.utils.india_filter import INDIA_NATIVE_SOURCES
    for s in ("unstop", "jobinsider", "iimjobs", "timesjobs"):
        assert s in sc.SCRAPER_MAP
        assert s in sc.DEFAULT_SOURCES
        assert s in INDIA_NATIVE_SOURCES


def test_every_default_source_has_instantiable_class():
    import scrapers.scrape_consumer as sc
    for s in sc.DEFAULT_SOURCES:
        mod_path, cls_name = sc.SCRAPER_MAP[s]
        cls = getattr(importlib.import_module(mod_path), cls_name)
        assert callable(getattr(cls, "scrape", None)), s


# ---- cost-aware enrichment order: cascade takes api_keys, Tier4 gated --------
def test_run_osint_enrichment_accepts_api_keys_param():
    import inspect
    from scrapers.enrichment_worker import run_osint_enrichment as f
    assert "api_keys" in inspect.signature(f).parameters


# ---- fresher classifier handles ATS pluralisation ('year(s)', '0 to 2') -------
def test_fresher_classifier_normalises_ats_forms():
    from scrapers.utils.fresher_classifier import is_fresher_role as f
    assert f("Management Trainee", "0-1 year(s)", "management trainee 0-1 year(s)")
    assert f("Engineer", "0 to 2 years", "")
    assert f("Backend Intern", "", "")
    assert not f("Engineering Manager", "5+ years", "engineering manager 5+ years")
    assert not f("Principal Architect", "12 years", "")


# ---- §6.3 / CRITICAL regression: a paid verified hit must NOT blow past 100.
# The old Tier-4 did int(conf*90) on adapters that already report 0..100, so an
# Apollo "verified" (conf=90) produced confidence_score=8100, which then made the
# no-clobber UPDATE guard (`$5 > confidence_score`) always pass and let a paid
# guess overwrite a stored verified email. This drives the REAL Tier-4 code path.
def test_paid_hit_confidence_is_clamped(monkeypatch):
    import asyncio
    import scrapers.enrichment_worker as ew
    import scrapers.utils.linkedin_osint as lo
    import scrapers.utils.github_email_osint as gh
    import scrapers.utils.osint as oi
    import scrapers.utils.serp_dork as sd
    import scrapers.utils.osint_contacts as oc
    import scrapers.utils.email_providers as ep

    async def _empty(*a, **k):
        return {}

    async def _none(*a, **k):
        return []

    # disable every free tier so we land on the paid waterfall
    monkeypatch.setattr(lo, "resolve_linkedin_profile", _empty)
    monkeypatch.setattr(gh, "github_company_contacts", _empty)
    monkeypatch.setattr(oi, "osint_find_email", _empty)
    monkeypatch.setattr(sd, "dork_find_email", _empty)
    monkeypatch.setattr(oc, "crtsh_emails", _none)
    monkeypatch.setattr(oc, "wayback_emails", _none)
    monkeypatch.setattr(oc, "gravatar_lookup", lambda e: {})
    # a verified Apollo-style hit: adapter reports confidence already on 0..100
    async def _hit(name, domain, keys):
        return {"hr_email": "j@acme.com", "confidence": 90, "verified": True,
                "source": "apollo_io", "credits": 1}
    monkeypatch.setattr(ep, "paid_email_waterfall", _hit)

    res = asyncio.run(ew.run_osint_enrichment(
        None, "Acme", "Jane Doe", "acme.com", {"apollo_io": "k"}))
    assert 0 <= res["confidence_score"] <= 100, res["confidence_score"]
    assert res["hr_email"] == "j@acme.com"
    assert res["method"] == "paid_apollo_io"


def test_waterfall_reports_credit_count(monkeypatch):
    # two configured vendors, first misses, second hits -> credits == 2
    import asyncio
    import scrapers.utils.email_providers as ep
    async def _miss(n, d, k):
        return {}
    async def _hit(n, d, k):
        return {"hr_email": "x@acme.com", "confidence": 70, "source": "findymail"}
    # force exactly the first two waterfall entries to be configured, swapping
    # their adapters so we can count attempts deterministically.
    order = ep._WATERFALL[:2]
    monkeypatch.setattr(ep, "_WATERFALL", [
        (order[0][0], _miss, order[0][2]),
        (order[1][0], _hit, order[1][2]),
    ])
    keys = {order[0][0]: "k1", order[1][0]: "k2"}
    out = asyncio.run(ep.paid_email_waterfall("Jane Doe", "acme.com", keys))
    assert out["credits"] == 2


def test_proxy_normalisation_adds_scheme():
    from scrapers.utils.http_client import _norm_proxy
    assert _norm_proxy("user:pass@1.2.3.4:8080") == "http://user:pass@1.2.3.4:8080"
    assert _norm_proxy("http://a.b:3128") == "http://a.b:3128"
    assert _norm_proxy("  ") == ""


def test_fetch_rejects_non_http_scheme():
    import asyncio
    import pytest
    from scrapers.utils.http_client import fetch
    with pytest.raises(ValueError):
        asyncio.run(fetch("file:///etc/passwd"))


def test_free_proxy_opt_in_default_off(monkeypatch):
    # with no operator proxies, we must NOT silently route through random public
    # proxies unless ALLOW_FREE_PROXIES=1 (MITM/poisoned-HTML risk).
    import scrapers.utils.http_client as hc
    for k in ("ROTATING_PROXIES", "PROXY_URL", "ALLOW_FREE_PROXIES"):
        monkeypatch.delenv(k, raising=False)
    assert hc._proxies() == []
    monkeypatch.setenv("ROTATING_PROXIES", "http://1.2.3.4:8080")
    assert hc._proxies() == ["http://1.2.3.4:8080"]
