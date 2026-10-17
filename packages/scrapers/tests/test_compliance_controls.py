"""Compliance technical-control integration tests (real Postgres + fixtures).

Covers the controls the productionization mission requires and that unit tests
can't reach: append-only audit trail, data-retention anonymisation, and the
server-side suppression gate that blocks outreach to opted-out contacts.
"""
import asyncio
import importlib
import uuid

import pytest

from scrapers.utils.redact import redact_email, redact_phone
from scrapers.send_worker import _is_suppressed



async def _mk_company(conn):
    return await conn.fetchval(
        "INSERT INTO companies (name, domain) VALUES ($1,$2) RETURNING id",
        f"Co {uuid.uuid4().hex[:6]}", f"c{uuid.uuid4().hex[:8]}.example",
    )


async def _mk_contact(conn, company_id, email, mobile, created_days_ago=0):
    return await conn.fetchval(
        "INSERT INTO hr_contacts (full_name, personal_email, personal_mobile, "
        "current_company_id, created_at) VALUES ($1,$2,$3,$4, NOW() - ($5 || ' days')::interval) RETURNING id",
        "Some HR", email, mobile, company_id, str(created_days_ago),
    )


async def _mk_lead(conn, company_id, contact_id, stage="discovered", dnc=False):
    jp = await conn.fetchval(
        "INSERT INTO job_postings (company_id,title,job_url,source_site,fingerprint) "
        "VALUES ($1,'T','http://x/1','test',$2) RETURNING id",
        company_id, "fp-" + uuid.uuid4().hex[:10],
    )
    return await conn.fetchval(
        "INSERT INTO leads (job_posting_id, company_id, hr_contact_id, pipeline_stage, do_not_contact) "
        "VALUES ($1,$2,$3,$4,$5) RETURNING id",
        jp, company_id, contact_id, stage, dnc,
    )


class TestRedaction:
    def test_email_masked(self):
        r = redact_email("john.doe@corp.example")
        assert "john.doe" not in r and "corp" not in r
        assert r == "j***@***.example"

    def test_phone_masked(self):
        r = redact_phone("+919876543210")
        assert "987654" not in r
        assert r.endswith("10")

    def test_empty_safe(self):
        assert redact_email("") == "<none>" and redact_phone(None) == "<none>"


@pytest.mark.asyncio
class TestAuditImmutability:
    async def test_audit_log_is_append_only(self, db_pool):
        async with db_pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO audit_log (user_id, action, resource_type) VALUES (NULL,'probe','test')"
            )
            with pytest.raises(Exception):
                await conn.execute("UPDATE audit_log SET action='tampered' WHERE action='probe'")
            with pytest.raises(Exception):
                await conn.execute("DELETE FROM audit_log WHERE action='probe'")
            # INSERT still allowed (logging keeps working)
            await conn.execute(
                "INSERT INTO audit_log (user_id, action, resource_type) VALUES (NULL,'probe2','test')"
            )


@pytest.mark.asyncio
class TestSuppressionGate:
    async def test_suppressed_email_blocks_send(self, db_pool):
        async with db_pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO suppressions (normalized_contact, channel, reason, source) "
                "VALUES ($1,'email','opted_out','self_service')", "optout@corp.example",
            )
            assert await _is_suppressed(conn, "optout@corp.example", "email") is True
            assert await _is_suppressed(conn, "someoneelse@corp.example", "email") is False


@pytest.mark.asyncio
class TestRetention:
    async def test_anonymises_stale_unreached_only(self, db_pool, monkeypatch):
        sched = importlib.import_module("scrapers.scheduler")
        monkeypatch.setattr(sched, "_RETENTION_CONTACT_DAYS", 30)
        monkeypatch.setattr(sched, "_RETENTION_LOG_DAYS", 0)
        async with db_pool.acquire() as conn:
            co = await _mk_company(conn)
            stale = await _mk_contact(conn, co, "stale@corp.example", "+910000000001", created_days_ago=90)
            recent = await _mk_contact(conn, co, "recent@corp.example", "+910000000002", created_days_ago=1)
            contacted_c = await _mk_contact(conn, co, "reached@corp.example", "+910000000003", created_days_ago=90)
            await _mk_lead(conn, co, contacted_c, stage="contacted")
            suppressed_c = await _mk_contact(conn, co, "supp@corp.example", "+910000000004", created_days_ago=90)
            await _mk_lead(conn, co, suppressed_c, stage="contact_unavailable", dnc=True)

            out = await sched.enforce_retention(db_pool)
            assert out["contacts_anonymised"] == 1  # only the stale, unreached, non-suppressed one

            async def email_of(cid):
                return await conn.fetchval("SELECT personal_email FROM hr_contacts WHERE id=$1", cid)

            assert await email_of(stale) is None            # anonymised
            assert await email_of(recent) == "recent@corp.example"        # kept (young)
            assert await email_of(contacted_c) == "reached@corp.example"  # kept (contacted)
            assert await email_of(suppressed_c) == "supp@corp.example"     # kept (blocklist)

    async def test_retention_disabled_is_noop(self, db_pool, monkeypatch):
        sched = importlib.import_module("scrapers.scheduler")
        monkeypatch.setattr(sched, "_RETENTION_CONTACT_DAYS", 0)
        monkeypatch.setattr(sched, "_RETENTION_LOG_DAYS", 0)
        out = await sched.enforce_retention(db_pool)
        assert out == {"contacts_anonymised": 0, "logs_trimmed": 0}


@pytest.mark.asyncio
class TestUnsubscribeToken:
    async def test_mint_token_creates_row_and_opaque_link(self, db_pool, monkeypatch):
        import os, importlib
        monkeypatch.setenv("UNSUBSCRIBE_BASE_URL", "https://app.test")
        sw = importlib.reload(importlib.import_module("scrapers.send_worker"))
        async with db_pool.acquire() as conn:
            link = await sw.mint_unsubscribe_token(conn, "HR@Corp.Example")
            assert link.startswith("https://app.test/api/optout?t=")
            assert "HR@Corp.Example" not in link and "hr@corp.example" not in link  # no PII in URL
            tok = link.split("?t=", 1)[1]
            row = await conn.fetchrow("SELECT normalized_contact, channel FROM outreach_tokens WHERE token=$1", tok)
            assert row is not None and row["normalized_contact"] == "hr@corp.example"
            assert row["channel"] == "email"

    async def test_no_base_url_falls_back_to_mailto(self, db_pool, monkeypatch):
        import importlib
        monkeypatch.delenv("UNSUBSCRIBE_BASE_URL", raising=False)
        monkeypatch.delenv("PUBLIC_APP_URL", raising=False)
        sw = importlib.reload(importlib.import_module("scrapers.send_worker"))
        async with db_pool.acquire() as conn:
            link = await sw.mint_unsubscribe_token(conn, "x@y.test")
            assert link.startswith("mailto:")

