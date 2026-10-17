"""
Redis queue processor for worker coordination.

Per SRS §9.1: every stage (scrape → normalize → score → enrich → verify → draft → send)
is a separate Redis-queue consumer.
"""

import json
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable

import redis.asyncio as redis

logger = logging.getLogger(__name__)

# At-least-once delivery: a job that raises is requeued with an attempt counter
# and moved to {queue}:dlq after MAX attempts so it is never silently lost.
MAX_ATTEMPTS = int(os.environ.get("CONSUMER_MAX_ATTEMPTS", "5") or 5)


async def requeue_or_dlq(
    redis_client: redis.Redis,
    queue_name: str,
    payload: dict[str, Any] | None,
) -> str:
    """Requeue a failed job or dead-letter it. Returns 'requeued', 'dlq' or 'dropped'."""
    if not isinstance(payload, dict):
        return "dropped"  # nothing parseable to retry (e.g. brpop itself failed)
    attempts = int(payload.get("_attempts", 0) or 0) + 1
    payload["_attempts"] = attempts
    if attempts >= MAX_ATTEMPTS:
        await redis_client.lpush(f"{queue_name}:dlq", json.dumps(payload))
        logger.error(f"Job dead-lettered to {queue_name}:dlq after {attempts} attempts: {payload.get('lead_id')}")
        return "dlq"
    await redis_client.lpush(queue_name, json.dumps(payload))
    logger.warning(f"Job requeued to {queue_name} (attempt {attempts}/{MAX_ATTEMPTS}): {payload.get('lead_id')}")
    return "requeued"


async def dlq_depth(redis_client: redis.Redis, queue_name: str) -> int:
    """Observable DLQ size for dashboards/alerts."""
    try:
        return int(await redis_client.llen(f"{queue_name}:dlq"))
    except Exception:
        return -1


BROADCAST_CHANNEL = "broadcast:sse"


async def publish_event(
    redis_client: redis.Redis,
    requested_by: str | None,
    payload: dict[str, Any],
) -> None:
    """Publish a pipeline event to the requester's channel AND the global
    broadcast channel.

    Root-cause fix for invisible background work: army/scheduler runs pass
    sentinels ("system"/"daily_scheduler") as requested_by, so publishing
    only to user:{requested_by}:sse meant NO browser ever received wave
    completions. Every EventSource also subscribes to broadcast:sse, so
    list/dashboard/detail pages update in real time no matter who (or what)
    triggered the work. Never raises (fire-and-forget telemetry).
    """
    try:
        body = json.dumps(payload, default=str)
        targets = [BROADCAST_CHANNEL]
        if requested_by:
            targets.append(f"user:{requested_by}:sse")
        for channel in targets:
            try:
                await redis_client.publish(channel, body)
            except Exception as e:  # noqa: BLE001
                logger.debug(f"SSE publish to {channel} failed: {e}")
    except Exception as e:  # noqa: BLE001
        logger.debug(f"SSE publish failed: {e}")


async def enqueue_job(
    redis_client: redis.Redis,
    queue_name: str,
    payload: dict[str, Any],
) -> str:
    """Push a job to a Redis list queue. Returns the job ID (queue length)."""
    job_id = await redis_client.lpush(queue_name, json.dumps(payload))
    logger.info(f"Enqueued job to {queue_name}: {job_id}")
    return str(job_id)


async def chain_lead(
    redis_client: redis.Redis,
    queue_name: str,
    lead_id: str,
    requested_by: str = "system",
    **extra: Any,
) -> None:
    """Forward a lead to the next pipeline stage.

    The pipeline was never chained: scrape→normalize stopped at insert and each
    downstream stage only ran when the API manually enqueued it. This is the one
    place a lead is pushed onward, so the daily full-fleet run actually flows
    all the way to a drafted email (draft-only mode — send is always human).

    Retried with backoff (3x); a persistently failing hand-off goes to the
    queue DLQ so it is visible instead of silently stranded.
    """
    job = {
        "lead_id": str(lead_id),
        "requested_by": requested_by,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        **extra,
    }
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            await enqueue_job(redis_client, queue_name, job)
            return
        except Exception as e:  # noqa: BLE001
            last_err = e
            await asyncio.sleep(2 ** attempt)
    try:
        await redis_client.lpush(f"{queue_name}:dlq", json.dumps(job))
    except Exception:  # noqa: BLE001
        pass
    logger.warning(f"chain_lead -> {queue_name} failed for lead {lead_id} (DLQ): {last_err}")


def processing_queue(queue_name: str) -> str:
    """Side list holding jobs popped but not yet acknowledged."""
    return f"{queue_name}:processing"


async def reliable_brpop(
    redis_client: redis.Redis,
    queue_name: str,
    timeout: int = 30,
) -> tuple[str, dict[str, Any]] | None:
    """Pop a job WITHOUT losing it on crash: atomically moves it to
    {queue}:processing (BRPOPLPUSH). The caller MUST ack() after the DB commit
    (or requeue/DLQ path, which acks first). Returns (raw_msg, payload)."""
    raw = await redis_client.brpoplpush(queue_name, processing_queue(queue_name), timeout=timeout)
    if raw is None:
        return None
    raw_msg = raw.decode() if isinstance(raw, bytes) else str(raw)
    return raw_msg, json.loads(raw_msg)


async def ack(redis_client: redis.Redis, queue_name: str, raw_msg: str) -> None:
    """Remove one processed copy from {queue}:processing."""
    try:
        await redis_client.lrem(processing_queue(queue_name), 1, raw_msg)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"ack failed for {queue_name} (reclaim will retry it): {e}")


async def reclaim_processing(
    redis_client: redis.Redis,
    queue_names: list[str],
) -> dict[str, int]:
    """Boot recovery: move stranded :processing jobs back to their queues
    (crashed workers never acked them). Returns per-queue reclaimed counts."""
    counts: dict[str, int] = {}
    for queue_name in queue_names:
        n = 0
        try:
            while await redis_client.rpoplpush(processing_queue(queue_name), queue_name) is not None:
                n += 1
        except Exception as e:  # noqa: BLE001
            logger.warning(f"reclaim failed for {queue_name}: {e}")
        if n:
            logger.warning(f"Reclaimed {n} stranded job(s) to {queue_name}")
        counts[queue_name] = n
    return counts


async def dequeue_job(
    redis_client: redis.Redis,
    queue_name: str,
    timeout: int = 5,
) -> tuple[str, dict[str, Any]] | None:
    """Blocking pop from queue. Returns (raw_message, parsed_payload) or None."""
    raw = await redis_client.brpop(queue_name, timeout=timeout)
    if raw is None:
        return None
    raw_msg = raw[1].decode() if isinstance(raw[1], bytes) else str(raw[1])
    msg = json.loads(raw_msg)
    return raw_msg, msg


async def enqueue_scrape_job(
    redis_client: redis.Redis | None = None,
    sources: list[str] | None = None,
    run_type: str = "auto",
    triggered_by: str | None = None,
) -> str:
    """Enqueue a scrape job per SRS §4.1."""
    if redis_client is None:
        from scrapers.utils.redis import get_redis
        redis_client = get_redis()

    payload = {
        "run_type": run_type,
        "sources": sources,
        "triggered_by": triggered_by,
        "triggered_at": asyncio.get_event_loop().time(),
    }
    return await enqueue_job(redis_client, "scrape_queue:requests", payload)


async def run_queue_consumer(
    redis_client: redis.Redis,
    queue_name: str,
    handler: Callable[[dict[str, Any]], Awaitable[None]],
    timeout: int = 30,
) -> None:
    """Generic queue consumer loop. Runs until cancelled.

    Crash-safe: jobs move to {queue}:processing on pop and are acked only
    after the handler succeeds; boot reclaim restores the rest.
    """
    logger.info(f"Starting consumer for queue: {queue_name}")
    while True:
        payload: Any = None
        raw_msg: str | None = None
        try:
            got = await reliable_brpop(redis_client, queue_name, timeout=timeout)
            if got is None:
                continue

            raw_msg, payload = got
            await handler(payload)
            await ack(redis_client, queue_name, raw_msg)

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in {queue_name}: {e}")
            if raw_msg is not None:
                await ack(redis_client, queue_name, raw_msg)
        except Exception as e:
            logger.error(f"Consumer error in {queue_name}: {e}")
            try:
                # Ack first so the requeue/DLQ copy is the ONLY copy.
                if raw_msg is not None:
                    await ack(redis_client, queue_name, raw_msg)
                await requeue_or_dlq(redis_client, queue_name, payload)
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(5)
