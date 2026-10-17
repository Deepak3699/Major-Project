"""Every async pipeline worker once crashed on its FIRST real job because the
write/publish tail was never run against a live DB. These tests drive each
worker end to end with a *sentinel* requester ("daily_scheduler", what the
scheduler uses) and stub only the external network calls, so the DB + SSE tail
is exercised for real.

Bug classes guarded (found in enrichment + verification + send + verify_send):
  * phantom `l.hr_email`/`l.hr_mobile` columns on `leads`
  * bare `FOR UPDATE` over a LEFT JOIN (illegal in Postgres)
  * sentinel requester bound to a UUID column (users.id, outreach_log.sent_by)
  * json.dumps() on a UUID lead_id in the SSE publish
"""
import asyncio
import importlib
import uuid

import pytest

from scrapers.normalizer import normalize_lead, insert_lead

SENTINEL = "daily_scheduler"


async def _seed_lead(pool):
    async with pool.acquire() as conn:
        raw = {
            "company_name": f"Worker Co {uuid.uuid4().hex[:8]}",
            "job_title": "Fresher SDE",
            "job_url": f"https://worker-{uuid.uuid4().hex[:8]}.test/j/1",
            "description": "fresher 0-1 years",
            "source_site": "test",
        }
        lid = await insert_lead(conn, normalize_lead(raw))
        assert lid, "seed lead must insert"
        comp = await conn.fetchval("SELECT company_id FROM leads WHERE id = $1", lid)
        hc = await conn.fetchval(
            """INSERT INTO hr_contacts
                 (full_name, personal_email, personal_mobile, current_company_id, confidence_score)
               VALUES ('Jane Recruiter', 'jane@worker.test', '+919000000001', $1, 80)
               RETURNING id""",
            comp,
        )
        await conn.execute(
            "UPDATE leads SET hr_contact_id=$1, email_status='valid', "
            "whatsapp_status='registered', do_not_contact=false WHERE id=$2",
            hc, lid,
        )
        return lid


def _stub_network(monkeypatch):
    async def ok(*a, **k):
        # Email vocabulary: valid|invalid|catch_all|disposable|unknown|expired|pending
        return {"status": "valid", "raw": {"provider": "stub"}}

    async def ok_wa(*a, **k):
        # WhatsApp vocabulary is DISTINCT: registered|not_registered|unknown|expired|pending.
        # (An earlier stub returned "valid" here, which the DB CHECK now correctly
        # rejects — discovery/verification vocabularies must not be conflated.)
        return {"status": "registered", "raw": {"provider": "stub"}}

    async def sent(*a, **k):
        return {"status": "sent", "provider_message_id": "msg_stub"}

    async def none(*a, **k):
        return None

    vw = importlib.import_module("scrapers.verification_worker")
    sw = importlib.import_module("scrapers.send_worker")
    vsw = importlib.import_module("scrapers.verify_send_worker")
    dw = importlib.import_module("scrapers.draft_worker")
    for m in (vw, vsw):
        monkeypatch.setattr(m, "verify_email_reacher", ok)
        monkeypatch.setattr(m, "verify_whatsapp", ok_wa)
    for m in (sw, vsw):
        monkeypatch.setattr(m, "send_email", sent)
        monkeypatch.setattr(m, "send_whatsapp", sent)
    monkeypatch.setattr(dw, "generate_gemini_drafts", none)
    return vw, sw, vsw, dw


@pytest.mark.asyncio
async def test_verification_worker_sentinel_requester(db_pool, redis_client, monkeypatch):
    vw, *_ = _stub_network(monkeypatch)
    lid = await _seed_lead(db_pool)
    await vw.process_verification_job({"lead_id": lid, "requested_by": SENTINEL}, redis_client, db_pool)
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT channel FROM verification_log WHERE lead_id=$1", lid)
        stage = await conn.fetchval("SELECT pipeline_stage FROM leads WHERE id=$1", lid)
    assert len(rows) == 2, "email + whatsapp verification rows must be written"
    assert stage == "verified"


@pytest.mark.asyncio
async def test_draft_worker_sentinel_requester(db_pool, redis_client, monkeypatch):
    _, _, _, dw = _stub_network(monkeypatch)
    lid = await _seed_lead(db_pool)
    await dw.process_draft_job(
        {"lead_id": lid, "requested_by": SENTINEL, "channels": ["email"]}, redis_client, db_pool)
    async with db_pool.acquire() as conn:
        drafts = await conn.fetchval("SELECT count(*) FROM outreach_drafts WHERE lead_id=$1", lid)
    assert drafts >= 1, "a draft must be written and not crash on the sentinel requester"


@pytest.mark.asyncio
async def test_send_worker_sentinel_requester(db_pool, redis_client, monkeypatch):
    _, sw, _, _ = _stub_network(monkeypatch)
    lid = await _seed_lead(db_pool)
    await sw.process_send_job({"lead_id": lid, "requested_by": SENTINEL, "channel": "both"}, redis_client, db_pool)
    async with db_pool.acquire() as conn:
        logs = await conn.fetch("SELECT channel FROM outreach_log WHERE lead_id=$1", lid)
        stage = await conn.fetchval("SELECT pipeline_stage FROM leads WHERE id=$1", lid)
    assert len(logs) == 2, "email + whatsapp outreach_log rows must be written (sent_by NULL for sentinel)"
    assert stage == "contacted"


@pytest.mark.asyncio
async def test_verify_send_worker_sentinel_requester(db_pool, redis_client, monkeypatch):
    *_, vsw, _ = _stub_network(monkeypatch)
    lid = await _seed_lead(db_pool)
    await vsw.process_verify_and_send_job(
        {"lead_id": lid, "requested_by": SENTINEL, "channel": "both"}, redis_client, db_pool)
    async with db_pool.acquire() as conn:
        logs = await conn.fetch("SELECT sent_by FROM outreach_log WHERE lead_id=$1", lid)
    assert len(logs) >= 1, "verify-and-send must write outreach without crashing on the sentinel UUID"
    assert all(l["sent_by"] is None for l in logs), "sentinel requester must store NULL, not crash"
