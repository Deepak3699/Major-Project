"""Explicit per-row provider choice is recorded honestly (Track: manual triggers).

provider=snovio with no key -> enrichment_log(provider='snovio',
status='provider_not_configured'), credits_used=0. No silent 'osint_fallback'.
"""
import uuid

import pytest

from scrapers.enrichment_worker import process_enrichment_job

pytestmark = pytest.mark.asyncio


async def _seed_lead(pool):
    async with pool.acquire() as conn:
        raw_company = f"ProvStat Co {uuid.uuid4().hex[:8]}"
        co = await conn.fetchval(
            "INSERT INTO companies (name, domain) VALUES ($1,$2) RETURNING id",
            raw_company, f"ps{uuid.uuid4().hex[:8]}.example",
        )
        hc = await conn.fetchval(
            # A locator is required (hr_contacts_has_locator): this lead starts
            # with a name + LinkedIn but no email, so enrichment has something to
            # improve on -- which is exactly what these tests assert.
            "INSERT INTO hr_contacts (full_name, linkedin_url, current_company_id, confidence_score)"
            " VALUES ('Pat Recruiter', 'https://www.linkedin.com/in/pat-recruiter', $1, 40) RETURNING id",
            co,
        )
        jp = await conn.fetchval(
            "INSERT INTO job_postings (company_id,title,job_url,source_site,fingerprint)"
            " VALUES ($1,'Fresher SDE','http://x/1','test',$2) RETURNING id",
            co, "fp-" + uuid.uuid4().hex[:10],
        )
        lid = await conn.fetchval(
            "INSERT INTO leads (job_posting_id, company_id, hr_contact_id, pipeline_stage)"
            " VALUES ($1,$2,$3,'discovered') RETURNING id",
            jp, co, hc,
        )
        return lid


async def test_explicit_provider_without_key_is_labeled(db_pool, redis_client, monkeypatch):
    monkeypatch.delenv("SNOVIO_API_KEY", raising=False)
    lid = await _seed_lead(db_pool)
    await process_enrichment_job(
        {"lead_id": lid, "provider": "snovio", "requested_by": "system"},
        redis_client, db_pool,
    )
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT provider, status, credits_used FROM enrichment_log"
            " WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1", lid)
    assert row["provider"] == "snovio"
    assert row["status"] == "provider_not_configured"
    assert row["credits_used"] == 0


async def test_auto_without_any_match_stays_osint_no_match(db_pool, redis_client, monkeypatch):
    import scrapers.enrichment_worker as ew

    async def empty_cascade(*a, **k):
        return {"source": "osint_fallback", "confidence_score": 30}

    monkeypatch.setattr(ew, "run_osint_enrichment", empty_cascade)
    lid = await _seed_lead(db_pool)
    await process_enrichment_job(
        {"lead_id": lid, "provider": "auto", "requested_by": "system"},
        redis_client, db_pool,
    )
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT provider, status FROM enrichment_log"
            " WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1", lid)
    assert row["provider"] != "snovio"
    assert row["status"] in ("no_match", "success")
