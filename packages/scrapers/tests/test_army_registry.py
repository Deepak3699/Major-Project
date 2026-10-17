"""Fallback Corps: sibling compensation, wave gate, ATS flywheel.

No live network except the explicitly-marked CSE test (which asserts the
key-gated engine stays silent without keys).
"""
import json
from typing import Any

import pytest

from scrapers.army_registry import (
    compensate, corps_of, maybe_fallback_wave,
    TIER1_ZERO_SENSITIVE, MAX_COMPENSATION_SOURCES,
)
from scrapers.utils.ats_corpus import suggest_new_slugs

pytestmark = pytest.mark.asyncio


class StubRedis:
    def __init__(self):
        self.lists: dict[str, list[str]] = {}

    async def lpush(self, key, value):
        self.lists.setdefault(key, []).insert(0, value)
        return len(self.lists[key])


class TestCompensate:
    def test_siblings_cover_same_class(self):
        sibs = compensate(["naukri"])
        assert "foundit" in sibs and "naukri" not in sibs

    def test_ats_stays_in_ats_family(self):
        sibs = compensate(["greenhouse"])
        assert set(sibs) <= {"lever", "ashby", "greenhouse"}

    def test_depth_cap_kills_chains(self):
        assert compensate(["naukri"], depth=1) == []
        assert compensate(["naukri"], depth=9) == []

    def test_unknown_source_falls_back_to_discovery(self):
        assert compensate(["mystery-board-xyz"]) == ["duckduckgo"]

    def test_output_capped(self):
        sibs = compensate(["naukri", "internshala", "greenhouse", "indeed", "apna"])
        assert len(sibs) <= MAX_COMPENSATION_SOURCES

    def test_corps_mapping(self):
        assert corps_of("naukri") == "scouts"
        assert corps_of("nope-not-real") == "unknown"
        assert "naukri" in TIER1_ZERO_SENSITIVE


class TestFallbackWave:
    async def test_failed_source_enqueues_bounded_wave(self):
        r: Any = StubRedis()
        job = {"run_id": "r1", "triggered_by": "qa"}
        results = {"sources_failed": [{"source": "naukri", "error": "boom"}],
                   "sources_succeeded": 0, "leads_found": 0}
        sibs = await maybe_fallback_wave(r, job, ["naukri"], results, {"naukri": 0})
        assert sibs, "a failed Tier-1 must trigger compensation"
        assert len(sibs) <= MAX_COMPENSATION_SOURCES
        payload = json.loads(r.lists["scrape_queue:requests"][0])
        assert payload["run_type"] == "fallback-wave"
        assert payload["compensation_depth"] == 1
        assert payload["compensated_for"] == ["naukri"]

    async def test_healthy_wave_enqueues_nothing(self):
        r: Any = StubRedis()
        results = {"sources_failed": [], "sources_succeeded": 5, "leads_found": 40}
        assert await maybe_fallback_wave(
            r, {"run_id": "r1"}, ["naukri", "apna"], results,
            {"naukri": 20, "apna": 20}) == []
        assert r.lists == {}

    async def test_compensation_never_chains(self):
        r: Any = StubRedis()
        job = {"run_id": "fallback-x", "compensation_depth": 1}
        results = {"sources_failed": [{"source": "naukri", "error": "x"}],
                   "sources_succeeded": 0, "leads_found": 0}
        assert await maybe_fallback_wave(r, job, ["naukri"], results, {}) == []
        assert r.lists == {}

    async def test_barren_tier1_triggers_but_quiet_niche_does_not(self):
        r: Any = StubRedis()
        results = {"sources_failed": [], "sources_succeeded": 2, "leads_found": 0}
        # barren Tier-1 (naukri silent) -> compensate
        sibs = await maybe_fallback_wave(
            r, {"run_id": "r1"}, ["naukri", "remotive"], results,
            {"naukri": 0, "remotive": 0})
        assert sibs, "barren Tier-1 is a coverage hole"
        # quiet niche board with some success elsewhere -> no wave
        r2: Any = StubRedis()
        results2 = {"sources_failed": [], "sources_succeeded": 2, "leads_found": 12}
        assert await maybe_fallback_wave(
            r2, {"run_id": "r2"}, ["remotive", "naukri"], results2,
            {"remotive": 0, "naukri": 12}) == []


class TestFlywheel:
    def test_extracts_new_board_slugs(self):
        out = suggest_new_slugs([
            "https://boards.greenhouse.io/acmeco/jobs/1",
            "https://jobs.lever.co/acmeco/abc",
            "https://newco.bamboohr.com/careers/7",
        ])
        assert out["greenhouse"] == ["acmeco"]
        assert out["lever"] == ["acmeco"]
        assert out["bamboohr"] == ["newco"]

    def test_known_slugs_are_not_suggested(self):
        out = suggest_new_slugs(["https://boards.greenhouse.io/stripe/jobs/1"])
        assert out.get("greenhouse", []) == []

    def test_garbage_urls_yield_nothing(self):
        assert suggest_new_slugs([]) == {}
        assert suggest_new_slugs(["not a url", "https://example.com/x"]) == {}


class TestGoogleCseGating:
    async def test_unconfigured_cse_makes_no_network_call(self, monkeypatch):
        import scrapers.utils.serp_dork as sd
        monkeypatch.delenv("GOOGLE_CSE_KEY", raising=False)
        monkeypatch.delenv("GOOGLE_CSE_CX", raising=False)
        assert sd._google_cse_configured() is False
        assert await sd._fetch_snippets_cse("test query") == []
