"""Lifecycle transition machine against live Postgres (schema under test).

The DB trigger is the final boundary: API, workers and webhooks all write
pipeline_stage, so enforcement must live in the database, not the frontend.
"""
import uuid

import pytest

pytestmark = pytest.mark.asyncio


async def _mk_lead(conn, stage="discovered"):
    co = await conn.fetchval(
        "INSERT INTO companies (name, domain) VALUES ($1,$2) RETURNING id",
        f"Co {uuid.uuid4().hex[:6]}", f"c{uuid.uuid4().hex[:8]}.example",
    )
    jp = await conn.fetchval(
        "INSERT INTO job_postings (company_id,title,job_url,source_site,fingerprint) "
        "VALUES ($1,'T','http://x/1','test',$2) RETURNING id",
        co, "fp-" + uuid.uuid4().hex[:10],
    )
    return await conn.fetchval(
        "INSERT INTO leads (job_posting_id, company_id, pipeline_stage) VALUES ($1,$2,$3) RETURNING id",
        jp, co, stage,
    )


async def test_legal_transition_applies(db_pool):
    async with db_pool.acquire() as conn:
        lid = await _mk_lead(conn, "discovered")
        await conn.execute("UPDATE leads SET pipeline_stage='enriching' WHERE id=$1", lid)
        stage = await conn.fetchval("SELECT pipeline_stage FROM leads WHERE id=$1", lid)
        assert stage == "enriching"


async def test_same_stage_update_allowed(db_pool):
    async with db_pool.acquire() as conn:
        lid = await _mk_lead(conn, "verified")
        await conn.execute("UPDATE leads SET lead_score=55 WHERE id=$1", lid)
        stage = await conn.fetchval("SELECT pipeline_stage FROM leads WHERE id=$1", lid)
        assert stage == "verified"


async def test_forward_skip_applies(db_pool):
    # Writers jump straight to outcome stages (no fabricated intermediates).
    async with db_pool.acquire() as conn:
        lid = await _mk_lead(conn, "discovered")
        await conn.execute("UPDATE leads SET pipeline_stage='verified' WHERE id=$1", lid)
        assert await conn.fetchval("SELECT pipeline_stage FROM leads WHERE id=$1", lid) == "verified"


async def test_backward_jump_rejected(db_pool):
    async with db_pool.acquire() as conn:
        lid = await _mk_lead(conn, "sent")
        with pytest.raises(Exception, match="illegal lead stage transition"):
            await conn.execute("UPDATE leads SET pipeline_stage='drafted' WHERE id=$1", lid)
        # Row unchanged after the rejected write
        assert await conn.fetchval("SELECT pipeline_stage FROM leads WHERE id=$1", lid) == "sent"


async def test_wrong_failure_entry_rejected(db_pool):
    async with db_pool.acquire() as conn:
        lid = await _mk_lead(conn, "discovered")
        with pytest.raises(Exception, match="illegal lead stage transition"):
            await conn.execute("UPDATE leads SET pipeline_stage='bounced' WHERE id=$1", lid)


async def test_suppressed_is_terminal(db_pool):
    async with db_pool.acquire() as conn:
        lid = await _mk_lead(conn, "suppressed")
        with pytest.raises(Exception, match="illegal lead stage transition"):
            await conn.execute("UPDATE leads SET pipeline_stage='discovered' WHERE id=$1", lid)


async def test_full_send_path_reachable(db_pool):
    async with db_pool.acquire() as conn:
        lid = await _mk_lead(conn, "verified")
        for stage in ("drafted", "send_pending", "contacted", "replied", "converted"):
            await conn.execute("UPDATE leads SET pipeline_stage=$1 WHERE id=$2", stage, lid)
        assert await conn.fetchval("SELECT pipeline_stage FROM leads WHERE id=$1", lid) == "converted"


async def test_new_columns_default(db_pool):
    async with db_pool.acquire() as conn:
        lid = await _mk_lead(conn, "discovered")
        row = await conn.fetchrow("SELECT legal_basis, processing_purpose FROM leads WHERE id=$1", lid)
        assert row["legal_basis"] == "legitimate_interest_b2b"
        assert row["processing_purpose"] == "b2b_recruitment_outreach"
