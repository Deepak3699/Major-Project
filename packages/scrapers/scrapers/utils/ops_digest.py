"""
Operator digest (Telegram): once-daily pipeline summary for the human reviewer.

Key-gated (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID); completely off when unset.
This is OPERATOR alerting, not outreach — it only ever messages the configured
chat, never a lead. Never raises: a failed digest must not break the scheduler.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def digest_configured() -> bool:
    return bool(os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID"))


async def build_digest(db_pool) -> str:
    """Aggregate the last-24h pipeline numbers into a short text digest."""
    lines = ["HR Shakti daily digest"]
    if db_pool is None:
        return "\n".join(lines + ["(no database connection)"])
    try:
        async with db_pool.acquire() as conn:
            stages = await conn.fetch(
                "SELECT pipeline_stage, COUNT(*) AS n FROM leads "
                "WHERE updated_at > NOW() - INTERVAL '24 hours' "
                "GROUP BY pipeline_stage ORDER BY n DESC"
            )
            verif = await conn.fetch(
                "SELECT result, COUNT(*) AS n FROM verification_log "
                "WHERE created_at > NOW() - INTERVAL '24 hours' "
                "GROUP BY result"
            )
            out = await conn.fetch(
                "SELECT delivery_status, COUNT(*) AS n FROM outreach_log "
                "WHERE sent_at > NOW() - INTERVAL '24 hours' "
                "GROUP BY delivery_status"
            )
            stuck = await conn.fetchval(
                "SELECT COUNT(*) FROM leads WHERE pipeline_stage IN "
                "('enriching','verifying','send_pending','retry_pending') "
                "AND updated_at < NOW() - INTERVAL '6 hours'"
            )
        if stages:
            lines.append("Leads (24h): " + ", ".join(
                f"{r['pipeline_stage']}={r['n']}" for r in stages))
        else:
            lines.append("Leads (24h): none touched")
        if verif:
            lines.append("Verified (24h): " + ", ".join(
                f"{r['result']}={r['n']}" for r in verif))
        if out:
            lines.append("Outreach (24h): " + ", ".join(
                f"{r['delivery_status']}={r['n']}" for r in out))
        lines.append(f"Stuck leads: {stuck or 0}")
    except Exception as e:  # noqa: BLE001
        lines.append(f"(stats unavailable: {type(e).__name__})")
    lines.append(datetime.now(timezone.utc).strftime("As of %Y-%m-%d %H:%M UTC"))
    return "\n".join(lines)


async def send_digest(text: str) -> bool:
    """POST the digest to Telegram. False when unconfigured or on any error."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": text},
            )
            return r.status_code == 200
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Telegram digest failed: {e}")
        return False


async def maybe_send_daily_digest(redis_client, db_pool) -> bool:
    """Once-daily guarded send (SET NX date key). Returns True if sent."""
    if not digest_configured():
        return False
    try:
        key = f"digest:sent:{datetime.now(timezone.utc):%Y-%m-%d}"
        claimed = await redis_client.set(key, "1", nx=True, ex=48 * 3600)
        if not claimed:
            return False
        return await send_digest(await build_digest(db_pool))
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Daily digest skipped: {e}")
        return False
