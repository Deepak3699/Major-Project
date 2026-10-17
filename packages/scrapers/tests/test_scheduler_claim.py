"""Daily-claim exactly-once guard: fail-CLOSED on Redis errors.

A blind claim (fail-open) would run two full fleets; a skipped day self-heals
on the next tick / boot catch-up.
"""
from datetime import datetime, timezone

import pytest

from scrapers import scheduler as sched

pytestmark = pytest.mark.asyncio


class OkRedis:
    def __init__(self, nx_result=True):
        self.nx_result = nx_result
        self.calls = []

    async def set(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        assert kwargs.get("nx") is True
        assert kwargs.get("ex") == 48 * 3600
        return self.nx_result


class DeadRedis:
    async def set(self, *args, **kwargs):
        raise ConnectionError("redis down")


async def test_claims_free_day():
    r = OkRedis(nx_result=True)
    assert await sched._claim_day(r, datetime.now(timezone.utc)) is True


async def test_skips_claimed_day():
    r = OkRedis(nx_result=False)
    assert await sched._claim_day(r, datetime.now(timezone.utc)) is False


async def test_fail_closed_on_redis_error():
    # Must NOT claim when Redis is unreachable (would risk a duplicate fleet).
    assert await sched._claim_day(DeadRedis(), datetime.now(timezone.utc)) is False
