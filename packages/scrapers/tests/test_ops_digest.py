"""Operator digest: aggregates without PII, silent when unconfigured."""
import pytest

from scrapers.utils import ops_digest as od

pytestmark = pytest.mark.asyncio


class FakeConn:
    async def fetch(self, q, *a):
        if "FROM leads" in q and "GROUP BY pipeline_stage" in q:
            return [{"pipeline_stage": "verified", "n": 3}]
        if "verification_log" in q:
            return [{"result": "valid", "n": 2}]
        if "outreach_log" in q:
            return []
        return []

    async def fetchval(self, q, *a):
        return 1


class FakePool:
    def acquire(self):
        class Ctx:
            async def __aenter__(self):
                return FakeConn()

            async def __aexit__(self, *a):
                return False
        return Ctx()


async def test_build_digest_aggregates_no_pii():
    text = await od.build_digest(FakePool())
    assert "verified=3" in text
    assert "valid=2" in text
    assert "Stuck leads: 1" in text
    assert "@" not in text


async def test_build_digest_no_db():
    assert "no database" in (await od.build_digest(None)).lower()


async def test_unconfigured_sends_nothing(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
    assert od.digest_configured() is False
    assert await od.send_digest("hi") is False
    assert await od.maybe_send_daily_digest(None, None) is False


async def test_daily_guard_claims_once(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "tok")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "chat")
    monkeypatch.setattr(od, "send_digest", lambda *a, **k: _ok())
    monkeypatch.setattr(od, "build_digest", lambda *a, **k: _ok("text"))

    async def _ok(*a, **k):
        return True

    calls = []

    class FakeRedis:
        def __init__(self, claim):
            self.claim = claim

        async def set(self, *a, **k):
            calls.append(1)
            return self.claim

    assert await od.maybe_send_daily_digest(FakeRedis(True), FakePool()) is True
    assert await od.maybe_send_daily_digest(FakeRedis(False), FakePool()) is False
    assert len(calls) == 2
