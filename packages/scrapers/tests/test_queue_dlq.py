"""At-least-once queue hardening: requeue with backoff, DLQ after MAX attempts.

Stub tests (no live Redis) for the contract the seven consumer loops rely on,
plus the send-worker domain helpers.
"""
import json
from typing import Any

import pytest

from scrapers import queue as qmod
from scrapers.queue import (
    requeue_or_dlq, chain_lead, dlq_depth,
    reliable_brpop, ack, reclaim_processing, processing_queue,
)
from scrapers.send_worker import email_domain, domain_sent_count

pytestmark = pytest.mark.asyncio


class StubRedis:
    def __init__(self, fail_lpush=0):
        self.lists: dict[str, list[str]] = {}
        self.fail_lpush = fail_lpush

    async def lpush(self, key, value):
        if self.fail_lpush > 0:
            self.fail_lpush -= 1
            raise ConnectionError("redis down")
        self.lists.setdefault(key, []).insert(0, value)
        return len(self.lists[key])

    async def llen(self, key):
        return len(self.lists.get(key, []))

    async def brpoplpush(self, src, dst, timeout=0):
        items = self.lists.get(src, [])
        if not items:
            return None
        val = items.pop()
        self.lists.setdefault(dst, []).insert(0, val)
        return val

    async def rpoplpush(self, src, dst):
        items = self.lists.get(src, [])
        if not items:
            return None
        val = items.pop()
        self.lists.setdefault(dst, []).insert(0, val)
        return val

    async def lrem(self, key, count, value):
        items = self.lists.get(key, [])
        if value in items:
            items.remove(value)
            return 1
        return 0


class TestRequeueOrDlq:
    async def test_requeues_under_max(self, monkeypatch):
        monkeypatch.setattr(qmod, "MAX_ATTEMPTS", 5)
        r: Any = StubRedis()
        out = await requeue_or_dlq(r, "send_queue:requests", {"lead_id": "L1"})
        assert out == "requeued"
        assert json.loads(r.lists["send_queue:requests"][0])["_attempts"] == 1

    async def test_attempts_accumulate(self, monkeypatch):
        monkeypatch.setattr(qmod, "MAX_ATTEMPTS", 5)
        r: Any = StubRedis()
        payload = {"lead_id": "L1", "_attempts": 3}
        out = await requeue_or_dlq(r, "send_queue:requests", payload)
        assert out == "requeued"
        assert json.loads(r.lists["send_queue:requests"][0])["_attempts"] == 4

    async def test_dead_letters_at_max(self, monkeypatch):
        monkeypatch.setattr(qmod, "MAX_ATTEMPTS", 3)
        r: Any = StubRedis()
        out = await requeue_or_dlq(r, "send_queue:requests", {"lead_id": "L1", "_attempts": 2})
        assert out == "dlq"
        assert "send_queue:requests" not in r.lists
        assert json.loads(r.lists["send_queue:requests:dlq"][0])["lead_id"] == "L1"

    async def test_drops_unparseable(self):
        r: Any = StubRedis()
        assert await requeue_or_dlq(r, "send_queue:requests", None) == "dropped"
        assert r.lists == {}


class TestChainLead:
    async def test_enqueues_on_first_try(self):
        r: Any = StubRedis()
        await chain_lead(r, "enrichment_queue:requests", "L9")
        payload = json.loads(r.lists["enrichment_queue:requests"][0])
        assert payload["lead_id"] == "L9"

    async def test_retries_then_succeeds(self):
        r: Any = StubRedis(fail_lpush=2)
        await chain_lead(r, "enrichment_queue:requests", "L9")
        assert "enrichment_queue:requests" in r.lists
        assert "enrichment_queue:requests:dlq" not in r.lists

    async def test_dlq_after_persistent_failure(self):
        # First 3 pushes (retries) fail; the DLQ write itself succeeds.
        r: Any = StubRedis(fail_lpush=3)
        await chain_lead(r, "enrichment_queue:requests", "L9")
        assert "enrichment_queue:requests:dlq" in r.lists


class TestDlqDepth:
    async def test_reports_llen(self):
        r: Any = StubRedis()
        r.lists["x:dlq"] = ["a", "b"]
        assert await dlq_depth(r, "x") == 2

    async def test_redis_error_returns_sentinel(self):
        class Dead:
            async def llen(self, _k):
                raise ConnectionError("down")
        dead: Any = Dead()
        assert await dlq_depth(dead, "x") == -1


class TestReliableQueue:
    async def test_pop_moves_to_processing_not_away(self):
        r: Any = StubRedis()
        await r.lpush("q", json.dumps({"lead_id": "L1"}))
        got = await reliable_brpop(r, "q", timeout=1)
        assert got is not None
        raw, payload = got
        assert payload["lead_id"] == "L1"
        assert await r.llen("q") == 0  # gone from main...
        assert await r.llen(processing_queue("q")) == 1  # ...but held, not lost

    async def test_empty_returns_none(self):
        r: Any = StubRedis()
        assert await reliable_brpop(r, "q", timeout=1) is None

    async def test_ack_removes_exactly_one_copy(self):
        r: Any = StubRedis()
        await r.lpush("q", json.dumps({"lead_id": "L1"}))
        got = await reliable_brpop(r, "q", timeout=1)
        assert got is not None
        raw, _ = got
        await ack(r, "q", raw)
        assert await r.llen(processing_queue("q")) == 0

    async def test_reclaim_restores_crashed_jobs_in_order(self):
        r: Any = StubRedis()
        await r.lpush("q", json.dumps({"n": 1}))
        await r.lpush("q", json.dumps({"n": 2}))
        await reliable_brpop(r, "q", timeout=1)  # worker takes job...
        await reliable_brpop(r, "q", timeout=1)  # ...and another, then crashes (no ack)
        counts = await reclaim_processing(r, ["q"])
        assert counts == {"q": 2}
        assert await r.llen("q") == 2
        assert await r.llen(processing_queue("q")) == 0

    async def test_reclaim_empty_is_zero(self):
        r: Any = StubRedis()
        assert await reclaim_processing(r, ["q", "other"]) == {"q": 0, "other": 0}


class TestEmailDomain:
    def test_extracts_lowercased_domain(self):
        assert email_domain("HR@Corp.Example") == "corp.example"

    def test_unparseable_is_empty(self):
        assert email_domain("") == ""
        assert email_domain("not-an-email") == ""
        assert email_domain(None) == ""


class TestDomainSentCount:
    async def test_counts_via_query(self):
        seen = {}

        class Conn:
            async def fetchval(self, query, *args):
                seen["query"] = query
                seen["args"] = args
                return 7

        assert await domain_sent_count(Conn(), "corp.example") == 7
        assert "outreach_log" in seen["query"]
        assert seen["args"][1] == "corp.example"

    async def test_empty_domain_short_circuits(self):
        class Exploding:
            async def fetchval(self, *a, **k):
                raise AssertionError("must not query")

        assert await domain_sent_count(Exploding(), "") == 0


class TestSendIdempotency:
    def test_key_is_deterministic_per_job_day(self):
        from scrapers.send_worker import send_idempotency_key, resend_headers
        k1 = send_idempotency_key("L1", "D1", "email", day="2026-09-14")
        k2 = send_idempotency_key("L1", "D1", "email", day="2026-09-14")
        assert k1 == k2 == "hiregen-L1-D1-email-2026-09-14"
        assert send_idempotency_key("L1", "D1", "email", day="2026-09-15") != k1
        assert send_idempotency_key("L1", None, "email", day="2026-09-14") != k1

    def test_resend_headers_carry_key(self):
        from scrapers.send_worker import resend_headers
        h = resend_headers("re_x", "hiregen-L1-D1-email-2026-09-14")
        assert h["Authorization"] == "Bearer re_x"
        assert h["Idempotency-Key"] == "hiregen-L1-D1-email-2026-09-14"
        assert "Idempotency-Key" not in resend_headers("re_x")
