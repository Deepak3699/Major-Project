"""Crash recovery against live Redis (db index from REDIS_URL, never db 0).

Simulates a worker dying between pop and ack, then proves boot reclaim
restores the job exactly once. Uses an isolated queue name per test run.
"""
import json
import uuid

import pytest

from scrapers.queue import (
    reliable_brpop, ack, reclaim_processing, processing_queue,
)

pytestmark = pytest.mark.asyncio

Q = f"qa_reliable:{uuid.uuid4().hex[:8]}"


async def _depth(client, key):
    return int(await client.llen(key))


async def test_crash_between_pop_and_ack_loses_nothing(redis_client):
    await redis_client.lpush(Q, json.dumps({"lead_id": "LIVE-1"}))

    # Worker pops (job now held in :processing)...
    got = await reliable_brpop(redis_client, Q, timeout=2)
    assert got is not None
    raw, payload = got
    assert payload["lead_id"] == "LIVE-1"
    assert await _depth(redis_client, Q) == 0
    assert await _depth(redis_client, processing_queue(Q)) == 1

    # ...then the process dies before ack. Boot reclaim restores it.
    counts = await reclaim_processing(redis_client, [Q])
    assert counts[Q] == 1
    assert await _depth(redis_client, Q) == 1
    assert await _depth(redis_client, processing_queue(Q)) == 0

    # Re-process to completion: pop + ack leaves zero copies anywhere.
    got2 = await reliable_brpop(redis_client, Q, timeout=2)
    assert got2 is not None
    await ack(redis_client, Q, got2[0])
    assert await _depth(redis_client, Q) == 0
    assert await _depth(redis_client, processing_queue(Q)) == 0
