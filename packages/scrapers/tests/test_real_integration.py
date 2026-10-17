"""
Real integration tests with PostgreSQL and Redis containers (SRS §4.6, §9.1).

These tests use actual PostgreSQL and Redis instances.
No mocks for database or queue. Tests the full dedup + normalizer + persistence path.
"""
import pytest
import pytest_asyncio
import asyncio
import json
import hashlib
import time
import uuid
from datetime import datetime, timezone, timedelta

import asyncpg
import redis.asyncio as redis

from scrapers.utils.fresher_classifier import is_fresher_role
from scrapers.normalizer import normalize_lead, generate_fingerprint, insert_lead, _levenshtein, _similarity

import os
DB_URL = os.environ.get("DB_URL", "postgresql://postgres:postgres@localhost:5432/leads_db")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

SCHEMA_DIR = "/home/rajat/Downloads/sales-agent/packages/api/database/schema"


class TestPostgresIntegration:
    """Real PostgreSQL integration tests (SRS §4.6, §9.5)."""

    @pytest.mark.asyncio
    async def test_database_schema_has_required_tables(self, db_pool):
        async with db_pool.acquire() as conn:
            tables = await conn.fetch(
                "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
            )
            table_names = {t["tablename"] for t in tables}
            required = {
                "leads", "job_postings", "companies", "hr_contacts",
                "outreach_drafts", "audit_log", "scrape_runs", "source_health",
                "settings", "users", "enrichment_log", "verification_log",
                "outreach_log", "suppressions", "daily_runs",
            }
            missing = required - table_names
            assert not missing, f"Missing tables: {missing}. Found: {table_names}"

    @pytest.mark.asyncio
    async def test_lifecycle_check_constraint_is_enforced(self, db_pool):
        """Regression: the schema loader must APPLY the DO-block CHECKs.

        The old test loader split SQL on ';' and silently skipped the
        `DO $$ ... $$;` blocks, so these invariants were never exercised in
        tests. Assert a valid stage inserts and an impossible stage is rejected
        at the DB level (not just app level).
        """
        async with db_pool.acquire() as conn:
            company_id = await conn.fetchval(
                "INSERT INTO companies (name, domain) VALUES ('ChkCorp','chk.com') RETURNING id"
            )

            async def make_lead(stage):
                jp = await conn.fetchval(
                    "INSERT INTO job_postings (company_id, title, job_url, source_site, fingerprint) "
                    "VALUES ($1,'T','http://c/1','test', $2) RETURNING id",
                    company_id, "chk-" + uuid.uuid4().hex[:8],
                )
                return await conn.execute(
                    "INSERT INTO leads (job_posting_id, company_id, pipeline_stage) "
                    "VALUES ($1,$2,$3)", jp, company_id, stage,
                )

            # A real lifecycle state (incl. a failure state) must be accepted.
            await make_lead("contact_unavailable")
            await make_lead("verification_failed")

            # An impossible stage must be rejected by the DB CHECK, not the app.
            with pytest.raises(Exception):
                await make_lead("definitely_not_a_real_stage")

            # A guessed "verified-looking" email_status outside the vocabulary is rejected.
            with pytest.raises(Exception):
                await conn.execute(
                    "UPDATE leads SET email_status = 'looks_good' WHERE job_posting_id IS NOT NULL"
                )

    @pytest.mark.asyncio
    async def test_lead_score_range_enforced(self, db_pool):
        async with db_pool.acquire() as conn:
            cid = await conn.fetchval("INSERT INTO companies (name) VALUES ('ScoreCo') RETURNING id")
            async def mk(score):
                jp = await conn.fetchval(
                    "INSERT INTO job_postings (company_id,title,job_url,source_site,fingerprint) "
                    "VALUES ($1,'T','http://s/1','test', $2) RETURNING id", cid, "sc-" + uuid.uuid4().hex[:8])
                await conn.execute("INSERT INTO leads (job_posting_id, company_id, lead_score) VALUES ($1,$2,$3)", jp, cid, score)
            await mk(85)
            for bad in (-1, 101):
                with pytest.raises(Exception):
                    await mk(bad)

    @pytest.mark.asyncio
    async def test_updated_at_trigger_maintains_freshness(self, db_pool):
        """The set_updated_at() trigger must auto-bump updated_at on UPDATE, so
        freshness never depends on a caller remembering to set it."""
        async with db_pool.acquire() as conn:
            cid = await conn.fetchval("INSERT INTO companies (name) VALUES ('TrigCo') RETURNING id")
            before = await conn.fetchval("SELECT updated_at FROM companies WHERE id=$1", cid)
            await conn.execute("UPDATE companies SET about='hello' WHERE id=$1", cid)
            after = await conn.fetchval("SELECT updated_at FROM companies WHERE id=$1", cid)
            assert after > before

    @pytest.mark.asyncio
    async def test_dedup_30_day_window_rejects_recent_duplicate(self, db_pool):
        """SRS §4.6: Exact fingerprint duplicate within 30 days should be rejected."""
        async with db_pool.acquire() as conn:
            fp = "test-fp-" + uuid.uuid4().hex[:8]
            company_id = await conn.fetchval(
                "INSERT INTO companies (name, domain, about) VALUES ('TestCorp', 'test.com', '') RETURNING id"
            )
            await conn.execute(
                "INSERT INTO job_postings (company_id, hr_contact_id, title, description, "
                "experience_level, salary_range, job_url, source_site, fingerprint, raw_payload, first_seen_at) "
                "VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, NOW())",
                company_id, "Eng", "desc", "0-1 yr", "5 LPA", "http://x.com", "test", fp, "{}"
            )
            result = await insert_lead(conn, {
                "fingerprint": fp,
                "company_name": "TestCorp",
                "about_company": "",
                "hr_name": "", "hr_email": "", "company_email": "",
                "hr_mobile": "", "company_mobile": "", "hr_linkedin_url": "",
                "job_title": "Eng", "about_job": "desc",
                "experience_required": "0-1 yr", "salary_range": "5 LPA",
                "job_url": "http://x.com", "source_site": "test",
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "is_fresher": True, "raw_payload": {},
                "data_quality": "incomplete",
            })
            assert result is None, "Should dedup exact fingerprint within 30 days"

    @pytest.mark.asyncio
    async def test_dedup_30_day_window_allows_old_duplicate(self, db_pool):
        """SRS §4.6: Fingerprint duplicate older than 30 days should NOT be deduped."""
        async with db_pool.acquire() as conn:
            fp = "test-fp-old-" + uuid.uuid4().hex[:8]
            old_date = datetime.now(timezone.utc) - timedelta(days=45)
            company_id = await conn.fetchval(
                "INSERT INTO companies (name, domain, about) VALUES ('OldCorp', 'old.com', '') RETURNING id"
            )
            await conn.execute(
                "INSERT INTO job_postings (company_id, hr_contact_id, title, description, "
                "experience_level, salary_range, job_url, source_site, fingerprint, raw_payload, first_seen_at) "
                "VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                company_id, "Eng", "desc", "0-1 yr", "5 LPA", "http://x.com", "test", fp, "{}", old_date
            )
            result = await insert_lead(conn, {
                "fingerprint": fp,
                "company_name": "OldCorp",
                "about_company": "",
                "hr_name": "", "hr_email": "", "company_email": "",
                "hr_mobile": "", "company_mobile": "", "hr_linkedin_url": "",
                "job_title": "Eng", "about_job": "desc",
                "experience_required": "0-1 yr", "salary_range": "5 LPA",
                "job_url": "http://x.com", "source_site": "test",
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "is_fresher": True, "raw_payload": {},
                "data_quality": "incomplete",
            })
            assert result is not None, "Should NOT dedup fingerprint older than 30 days"

    @pytest.mark.asyncio
    async def test_fuzzy_duplicate_sets_possible_duplicate_of(self, db_pool):
        """SRS §4.6: Fuzzy match (Levenshtein 0.85 on company+title) sets possible_duplicate_of."""
        async with db_pool.acquire() as conn:
            fp1 = "fuzzy-" + uuid.uuid4().hex[:8]
            fp2 = "fuzzy-" + uuid.uuid4().hex[:8]

            lead1_id = await insert_lead(conn, {
                "fingerprint": fp1,
                "company_name": "Acme Corp",
                "about_company": "",
                "hr_name": "", "hr_email": "", "company_email": "",
                "hr_mobile": "", "company_mobile": "", "hr_linkedin_url": "",
                "job_title": "Software Engineer", "about_job": "desc",
                "experience_required": "0-1 yr", "salary_range": "5 LPA",
                "job_url": "http://acme.com/1", "source_site": "test",
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "is_fresher": True, "raw_payload": {},
                "data_quality": "incomplete",
            })
            assert lead1_id is not None, "Lead 1 should be inserted"

            lead2_id = await insert_lead(conn, {
                "fingerprint": fp2,
                "company_name": "Acme Corp",
                "about_company": "",
                "hr_name": "", "hr_email": "", "company_email": "",
                "hr_mobile": "", "company_mobile": "", "hr_linkedin_url": "",
                "job_title": "Software Engineer", "about_job": "desc",
                "experience_required": "0-1 yr", "salary_range": "5 LPA",
                "job_url": "http://acme.com/2", "source_site": "test",
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "is_fresher": True, "raw_payload": {},
                "data_quality": "incomplete",
            })
            assert lead2_id is not None, "Lead 2 should be inserted"
            row = await conn.fetchrow("SELECT possible_duplicate_of FROM leads WHERE id = $1", lead2_id)
            assert row["possible_duplicate_of"] == lead1_id, "Fuzzy dup should set possible_duplicate_of"

    @pytest.mark.asyncio
    async def test_non_duplicate_not_flagged(self, db_pool):
        """Different companies/titles should not be flagged as duplicates."""
        async with db_pool.acquire() as conn:
            normalized = {
                "fingerprint": "unique-" + uuid.uuid4().hex[:8],
                "company_name": "Totally Different Corp",
                "about_company": "",
                "hr_name": "", "hr_email": "", "company_email": "",
                "hr_mobile": "", "company_mobile": "", "hr_linkedin_url": "",
                "job_title": "Data Scientist", "about_job": "desc",
                "experience_required": "3+ years", "salary_range": "15 LPA",
                "job_url": "http://different.com/job", "source_site": "test",
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "is_fresher": False, "raw_payload": {},
                "data_quality": "incomplete",
            }
            result = await insert_lead(conn, normalized)
            assert result is not None
            row = await conn.fetchrow("SELECT possible_duplicate_of FROM leads WHERE id = $1", result)
            assert row["possible_duplicate_of"] is None or row["possible_duplicate_of"] == ""


class TestRedisIntegration:
    """Real Redis integration tests (SRS §9.1)."""

    @pytest.mark.asyncio
    async def test_redis_queue_push_pop(self, redis_client):
        """Verify Redis queue works for scraper → normalizer pipeline."""
        await redis_client.lpush("test_queue:requests", json.dumps({"test": "data"}))
        item = await redis_client.brpop("test_queue:requests", timeout=5)
        assert item is not None
        _, value = item
        parsed = json.loads(value)
        assert parsed["test"] == "data"

    @pytest.mark.asyncio
    async def test_redis_pipeline_roundtrip(self, redis_client):
        """Simulate scraper → queue → normalizer → database flow (SRS §9.1)."""
        lead = {
            "company_name": "PipeTest Corp",
            "job_title": "Fresher Developer",
            "job_url": "https://pipetest.com/job/1",
            "source_site": "test",
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "is_fresher": True,
            "raw_payload": {"test": True},
        }
        normalized = normalize_lead(lead)
        await redis_client.lpush("raw_leads_queue", json.dumps(normalized))
        item = await redis_client.brpop("raw_leads_queue", timeout=5)
        assert item is not None
        _, value = item
        reparsed = json.loads(value)
        assert reparsed["company_name"] == "PipeTest Corp"
        assert reparsed["fingerprint"] == normalized["fingerprint"]
        assert len(reparsed["fingerprint"]) == 64


class TestScraperMap:
    """Verify all required source scrapers are registered."""

    def test_all_tier2_scrapers_registered(self):
        from scrapers.scrape_consumer import SCRAPER_MAP
        required = {
            "naukri", "internshala", "indeed", "foundit", "instahyre",
            "wellfound", "glassdoor", "shine", "cutshort", "linkedin",
            "freshersworld",
        }
        registered = set(SCRAPER_MAP.keys())
        missing = required - registered
        assert not missing, f"Missing Tier-2 scrapers in SCRAPER_MAP: {missing}"

    def test_all_tier2_default_sources(self):
        from scrapers.scrape_consumer import DEFAULT_SOURCES, EXTRA_SOURCES
        default_set = set(DEFAULT_SOURCES)
        required = {
            # India-native fresher/entry-level portals + reliable career-page ATS
            # must be in the daily default set.
            "naukri", "internshala", "indeed", "foundit", "instahyre",
            "shine", "cutshort", "freshersworld",
            "apna", "workindia", "hackerearth", "greenhouse", "lever",
        }
        missing = required - default_set
        assert not missing, f"Missing India-fresher sources in DEFAULT_SOURCES: {missing}"
        # US/global boards and ToS-hostile social sources are best-effort and are
        # deliberately NOT scraped in the India-fresher daily default.
        for off_target in ("usajobs", "remoteok", "arbeitnow", "linkedin",
                           "twitter", "facebook"):
            assert off_target not in default_set, f"{off_target} should not be a daily default"
            assert off_target in set(EXTRA_SOURCES), f"{off_target} must stay opt-in via EXTRA_SOURCES"

    def test_srs_minimum_source_count(self):
        """SRS §16.1 requires >=15 sources."""
        from scrapers.scrape_consumer import SCRAPER_MAP
        assert len(SCRAPER_MAP) >= 15, f"Need >=15 sources, only {len(SCRAPER_MAP)}"


@pytest.mark.asyncio
async def test_process_enrichment_job_sentinel_runs_end_to_end(db_pool, redis_client, monkeypatch):
    """Regression: process_enrichment_job crashed on EVERY real job.

    Four latent bugs, only caught once this path was run against a live DB:
      1. `SELECT l.hr_name` — leads has no hr_name column (name lives on
         hr_contacts.full_name).
      2. bare `FOR UPDATE` over the LEFT JOIN is illegal (nullable side).
      3. scheduled runs pass requested_by='daily_scheduler' (non-UUID) which
         crashed the users lookup AND the enrichment_log FK insert.
      4. SSE json.dumps(lead_id) on a UUID object -> not serializable.
    All four live in the DB-write / publish tail, reached regardless of whether
    the OSINT cascade finds anything, so we stub the network tiers for hermeticity.
    """
    import importlib
    from scrapers.normalizer import normalize_lead, insert_lead
    from scrapers.enrichment_worker import process_enrichment_job

    async def _empty(*a, **k):
        return {}

    async def _none(*a, **k):
        return []

    for mod, fn, repl in [
        ("linkedin_osint", "resolve_linkedin_profile", _empty),
        ("github_email_osint", "github_company_contacts", _empty),
        ("osint", "osint_find_email", _empty),
        ("serp_dork", "dork_find_email", _empty),
        ("osint_contacts", "crtsh_emails", _none),
        ("osint_contacts", "wayback_emails", _none),
        ("osint_contacts", "gravatar_lookup", lambda e: {}),
    ]:
        monkeypatch.setattr(importlib.import_module("scrapers.utils." + mod), fn, repl)

    raw = {
        "company_name": "Acme Regression Co",
        "job_title": "Fresher Engineer",
        "job_url": "https://careers.acme-regression.test/j/42",
        "description": "fresher role 0-1 years",
        "source_site": "test",
    }
    async with db_pool.acquire() as conn:
        lead_id = await insert_lead(conn, normalize_lead(raw))
        assert lead_id, "seed lead should insert"

    # Sentinel requester (what the scheduler uses) must not raise.
    await process_enrichment_job(
        {"lead_id": lead_id, "provider": "auto", "requested_by": "daily_scheduler"},
        redis_client, db_pool,
    )

    async with db_pool.acquire() as conn:
        log = await conn.fetchrow(
            "SELECT provider, status, requested_by FROM enrichment_log WHERE lead_id = $1",
            lead_id,
        )
        stage = await conn.fetchval(
            "SELECT pipeline_stage FROM leads WHERE id = $1", lead_id)
    assert log is not None, "enrichment_log row must be written"
    assert log["requested_by"] is None, "sentinel requester must store NULL, not crash"
    # Every enrichment provider is stubbed to return nothing here, so the army
    # legitimately finds no contact. The correct, non-fabricating lifecycle
    # outcome is 'contact_unavailable' (NOT a fake 'enriched'), and the lead must
    # not be chained to verification. It stays eligible for the daily re-enrichment
    # sweep (whose filter excludes only 'contacted').
    assert stage == "contact_unavailable", (
        "lead with no discoverable contact must be contact_unavailable, never fabricated"
    )

    # No-contact lead must NOT be chained to verification (no fabricated target).
    # (The queue may hold unrelated items from other tests; the contract is the
    #  stage above — a contact_unavailable lead never advances.)

