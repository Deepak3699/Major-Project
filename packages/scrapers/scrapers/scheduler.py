"""
Daily scrape scheduler — stdlib asyncio only (no APScheduler/cron dependency).

The whole pipeline is queue-driven: something must push a job onto
`scrape_queue:requests` or the fleet never runs. Today that only happens via the
HTTP trigger endpoint. This module adds the missing heartbeat: on startup it
schedules a full-fleet scrape every day at a fixed UTC hour and, optionally, a
one-shot catch-up run at boot if none happened recently.

Runs inside the existing FastAPI event loop (started from main.start_consumers),
so it shares the Redis client and adds zero new processes.
"""

from __future__ import annotations

import os
import json
import uuid
import asyncio
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

REQUEST_QUEUE = "scrape_queue:requests"
# Set ENABLE_DAILY_SCHEDULER=0 to disable (e.g. in tests or when an external
# cron/n8n already drives runs). Hour/minute configurable.
_ENABLED = os.environ.get("ENABLE_DAILY_SCHEDULER", "1") != "0"
_HOUR = int(os.environ.get("DAILY_SCRAPE_HOUR", "3"))
_MINUTE = int(os.environ.get("DAILY_SCRAPE_MINUTE", "0"))
_CATCHUP_AT_BOOT = os.environ.get("DAILY_SCRAPE_CATCHUP", "0") == "1"

# Source toggles (Settings UI -> settings.sources_enabled): the daily fleet and
# manual army runs skip disabled sources. Unset/empty -> all defaults.
async def load_enabled_sources(db_pool) -> list[str] | None:
    """Explicit enabled-source list, or None when the operator never toggled."""
    if db_pool is None:
        return None
    try:
        async with db_pool.acquire() as conn:
            row = await conn.fetchval(
                "SELECT value FROM settings WHERE key = 'sources_enabled'"
            )
        if not isinstance(row, dict):
            return None
        enabled = [k for k, v in row.items() if v]
        return enabled or None
    except Exception as e:  # noqa: BLE001
        logger.debug(f"sources_enabled unreadable, using defaults: {e}")
        return None


# Data-retention (DPDP 'storage limitation'): personal data must not be kept
# longer than needed. Opt-in via env (0/absent = disabled) so it never surprises
# an operator; when set, once per day we ANONYMISE (not hard-delete) stale, never
# contacted personal data and trim operational logs. Suppression tombstones are
# ALWAYS preserved — a blocklist must never be forgotten by a retention sweep.
_RETENTION_CONTACT_DAYS = int(os.environ.get("RETENTION_CONTACT_DAYS", "0") or 0)
_RETENTION_LOG_DAYS = int(os.environ.get("RETENTION_LOG_DAYS", "0") or 0)


async def enforce_retention(db_pool) -> dict[str, int]:
    """Anonymise stale unreached contacts + trim old logs. Returns counts.

    Idempotent and safe to re-run. Only runs what the env enables.
    """
    result = {"contacts_anonymised": 0, "logs_trimmed": 0}
    if db_pool is None:
        return result
    async with db_pool.acquire() as conn:
        # Hygiene that runs regardless of the opt-in flags: unredeemed unsubscribe
        # tokens past a reasonable horizon are stale rows (and the address they
        # map to). A leaked-but-unused token is only ever a re-suppression, but we
        # drop them at 90 days so the table stays bounded and fresh.
        try:
            await conn.execute(
                "DELETE FROM outreach_tokens WHERE created_at < NOW() - INTERVAL '90 days'"
            )
        except Exception as e:  # noqa: BLE001
            logger.debug(f"token cleanup skipped: {e}")
    if _RETENTION_CONTACT_DAYS <= 0 and _RETENTION_LOG_DAYS <= 0:
        return result  # retention (contact/log) disabled; token hygiene already ran
    async with db_pool.acquire() as conn:
        if _RETENTION_CONTACT_DAYS > 0:
            # Anonymise personal data on contacts that are: never contacted, not
            # suppressed, and older than the retention window. Keep the row (FK
            # integrity + so we don't re-scrape), drop the identifying values.
            stale = await conn.fetch(
                """
                SELECT hc.id FROM hr_contacts hc
                 WHERE (hc.personal_email IS NOT NULL OR hc.personal_mobile IS NOT NULL)
                   AND hc.created_at < NOW() - ($1 || ' days')::interval
                   AND hc.id NOT IN (SELECT hr_contact_id FROM leads WHERE pipeline_stage IN ('contacted','sent','delivered','replied','converted') AND hr_contact_id IS NOT NULL)
                   AND hc.id NOT IN (SELECT hr_contact_id FROM leads WHERE do_not_contact)
                """,
                str(_RETENTION_CONTACT_DAYS),
            )
            n = await conn.fetch(
                """
                UPDATE hr_contacts
                   SET full_name = NULL, personal_email = NULL, personal_mobile = NULL,
                       linkedin_url = NULL, contact_url = NULL, contact_method = NULL,
                       extraction_provenance = jsonb_build_object('retained_anonymised_at', now()::text),
                       confidence_score = 0, updated_at = NOW()
                 WHERE id = ANY($1::uuid[]) RETURNING id
                """,
                [r["id"] for r in stale],
            )
            result["contacts_anonymised"] = len(n)
        if _RETENTION_LOG_DAYS > 0:
            # Trim verification/enrichment provider metadata (can hold PII) past
            # the window; keep audit_log intact (append-only, compliance needs it).
            for tbl in ("verification_log", "enrichment_log"):
                await conn.execute(
                    f"DELETE FROM {tbl} WHERE created_at < NOW() - ($1 || ' days')::interval",
                    str(_RETENTION_LOG_DAYS),
                )
            result["logs_trimmed"] = 1  # marker: trim ran
    if result["contacts_anonymised"] or result["logs_trimmed"]:
        logger.info(f"Retention sweep: {result}")
    return result


async def sweep_unenriched(redis_client, db_pool, lookback_hours: int = 12) -> int:
    """Self-healing re-enrichment sweep — the '100% contact enrichment' driver.

    A lead that first flows through enrichment with no HR name (many portals
    never expose the poster) or whose free tiers found nothing stays 'discovered'
    forever once the one-shot chain has passed it. This sweep finds every lead
    still missing a contactable email OR phone and re-enqueues it through the
    full enrichment army (LinkedIn→GitHub→pattern/MX/SMTP→SERP dorks→crt.sh/
    Wayback→generic-HR→paid-if-keyed), so coverage climbs toward saturation
    across daily runs instead of freezing after one attempt.

    Rate-limit-safe: a lead re-enriched within the last `lookback_hours` is
    skipped, so the daily sweep can't hammer DuckDuckGo/Brave (they 429 fast).
    Returns the number of leads re-enqueued.
    """
    if db_pool is None:
        return 0
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT l.id FROM leads l
            LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
            WHERE COALESCE(hc.personal_email, '') = ''
              AND COALESCE(hc.personal_mobile, '') = ''
              AND l.pipeline_stage NOT IN ('contacted')
              AND NOT l.do_not_contact
              AND l.id NOT IN (
                    SELECT lead_id FROM enrichment_log
                    WHERE created_at > NOW() - ($1 || ' hours')::interval
                  )
            ORDER BY l.created_at ASC
            LIMIT 500
            """,
            str(lookback_hours),
        )
    # Skip leads already sitting UNPROCESSED in the enrichment queue: the
    # enrichment_log guard only excludes leads whose job has already RUN, so a
    # second sweep while a backlog drains would otherwise double-enqueue (and
    # double-hit the rate-limited OSINT sources). Peek the queue and subtract.
    pending: set[str] = set()
    try:
        raw_items = await redis_client.lrange("enrichment_queue:requests", 0, -1)
        for item in raw_items:
            try:
                pending.add(str(json.loads(item).get("lead_id", "")))
            except Exception:  # noqa: BLE001
                continue
    except Exception as e:  # noqa: BLE001
        logger.warning(f"sweep could not peek enrichment queue: {e}")
    n = 0
    for r in rows:
        if str(r["id"]) in pending:
            continue
        await _enqueue_lead(redis_client, "enrichment_queue:requests", r["id"])
        n += 1
    if n:
        logger.info(f"Re-enrichment sweep: re-enqueued {n} under-enriched leads")
    return n


async def _enqueue_lead(redis_client, queue: str, lead_id) -> None:
    try:
        await redis_client.lpush(queue, json.dumps({
            "lead_id": str(lead_id),
            "provider": "auto",
            "requested_by": "daily_scheduler",
            "requested_at": datetime.now(timezone.utc).isoformat(),
        }))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"sweep enqueue to {queue} failed for {lead_id}: {e}")


def _next_run(at: datetime) -> datetime:
    target = at.replace(hour=_HOUR, minute=_MINUTE, second=0, microsecond=0)
    if target <= at:
        target += timedelta(days=1)
    return target


async def _enqueue(redis_client, sources: list[str] | None = None) -> str:
    run_id = str(uuid.uuid4())
    await redis_client.lpush(
        REQUEST_QUEUE,
        json.dumps({
            "run_id": run_id,
            "run_type": "scheduled",
            "sources": sources,          # None -> consumer uses DEFAULT_SOURCES
            "triggered_by": "daily_scheduler",
            "triggered_at": datetime.now(timezone.utc).isoformat(),
        }),
    )
    return run_id


async def _claim_day(redis_client, when: datetime) -> bool:
    """Exactly-once guard for the daily discovery run.

    Uses a Redis SET-NX keyed by UTC date (TTL 48h). If the key already exists,
    another worker (or a same-day restart) already claimed today, so we skip —
    running the daily job twice must not double-discover. Idempotency lives in
    Redis (shared across workers), not in-process state.

    Fail-CLOSED: if Redis itself is unreachable we return False (skip). Claiming
    blind would risk two schedulers each running a full fleet; a skipped day is
    recoverable via the next tick / boot catch-up, a duplicate fleet is not.
    """
    key = f"daily_scrape:claimed:{when:%Y-%m-%d}"
    try:
        return bool(await redis_client.set(key, "1", nx=True, ex=48 * 3600))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"daily claim check failed (skipping run, will retry next tick): {e}")
        return False


async def daily_scrape_scheduler(redis_client, sources: list[str] | None = None, db_pool=None) -> None:
    """Forever-loop: enqueue one full-fleet scrape per day at the configured time,
    then run the self-healing re-enrichment sweep so under-enriched leads keep
    climbing toward full contact coverage across runs."""
    if redis_client is None or not _ENABLED:
        logger.info("Daily scheduler disabled (no redis or ENABLE_DAILY_SCHEDULER=0)")
        return

    if _CATCHUP_AT_BOOT:
        try:
            run_id = await _enqueue(redis_client, await load_enabled_sources(db_pool))
            logger.info(f"Boot catch-up scrape enqueued: {run_id}")
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Boot catch-up enqueue failed: {e}")

    # Sweep once at boot too, so leads left under-enriched by a previous run (or
    # a crash) get re-tried without waiting for the next scheduled scrape.
    try:
        await sweep_unenriched(redis_client, db_pool)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Boot re-enrichment sweep failed: {e}")

    while True:
        now = datetime.now(timezone.utc)
        nxt = _next_run(now)
        wait = (nxt - now).total_seconds()
        logger.info(f"Daily scrape scheduled for {nxt.isoformat()} (in {int(wait)}s)")
        try:
            await asyncio.sleep(wait)
        except asyncio.CancelledError:
            raise
        try:
            if not await _claim_day(redis_client, datetime.now(timezone.utc)):
                logger.info("Daily scrape already claimed today — skipping (idempotent)")
            else:
                enabled = await load_enabled_sources(db_pool)
                run_id = await _enqueue(redis_client, enabled)
                logger.info(f"Scheduled daily scrape enqueued: {run_id} (sources={'defaults' if not enabled else f'{len(enabled)} enabled'})")
        except Exception as e:  # noqa: BLE001
            # ponytail: a missed day self-heals next tick; alert path if it matters
            logger.error(f"Daily scheduler enqueue failed: {e}")
            await asyncio.sleep(60)
        # After the scrape settles, re-try every lead still missing a contact.
        try:
            # let the scrape→normalize→enrich chain drain a bit before sweeping
            await asyncio.sleep(600)
            await sweep_unenriched(redis_client, db_pool)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"scheduled re-enrichment sweep failed: {e}")
        # Once-daily data-retention pass (opt-in via RETENTION_* env; no-op off).
        try:
            await enforce_retention(db_pool)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"retention sweep failed: {e}")
        # Operator digest (opt-in via TELEGRAM_* env; no-op off).
        try:
            from .utils.ops_digest import maybe_send_daily_digest
            await maybe_send_daily_digest(redis_client, db_pool)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"daily digest failed: {e}")
