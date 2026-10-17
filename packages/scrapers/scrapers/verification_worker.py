"""
Verification worker: consumes verification_queue:requests.

Per SRS §6:
- Email: calls self-hosted Reacher API (http://reacher:5050)
- WhatsApp: calls self-hosted whatsapp-web.js microservice (http://whatsapp-service:3050)

If services are unavailable, marks status as 'unknown' (graceful degradation per §6.3).

Updates:
- verification_log table (channel, result, raw_response)
- leads table (email_status / whatsapp_status, pipeline_stage -> 'verified')
- Pushes SSE event to user channel
- Recomputes lead score
"""

import json
import asyncio
import logging
import os
from typing import Any

import redis.asyncio as redis
import asyncpg

from .utils.db import get_db_pool
from .api_utils.scoring_client import recompute_lead_score
from .queue import chain_lead, requeue_or_dlq, reliable_brpop, ack, publish_event

from .utils.redact import redact_email, redact_phone

logger = logging.getLogger(__name__)


async def verify_email_reacher(email: str, reacher_url: str | None = None) -> dict[str, Any]:
    """Verify an email using the Reacher API.

    Returns {status, deliverable, ...} mapped to SRS §6.1 enum values:
    valid | invalid | catch_all | disposable | unknown
    """
    import httpx

    url = (reacher_url or os.environ.get("REACHER_URL", "http://reacher:5050")) + "/"
    payload = {"to_emails": [email]}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                logger.warning(f"Reacher returned {resp.status_code}")
                return {"status": "unknown", "raw": {"error": f"HTTP {resp.status_code}"}}

            data = resp.json()
            # Reacher returns a list of results: [{ is_reachable, misc, mx, smtp, syntax }]
            result = data[0] if isinstance(data, list) and len(data) > 0 else data
            is_reachable = result.get("is_reachable", "unknown")
            is_disposable = result.get("misc", {}).get("is_disposable", False)
            is_role = result.get("misc", {}).get("is_role_account", False)
            smtp_error = result.get("smtp", {}).get("error")

            if smtp_error:
                status = "invalid"
            elif is_reachable == "true":
                status = "valid"
            elif is_reachable == "false":
                if is_disposable:
                    status = "disposable"
                else:
                    status = "invalid"
            elif is_reachable == "invalid":
                status = "invalid"
            elif is_reachable == "unknown":
                if is_disposable:
                    status = "disposable"
                elif is_role:
                    status = "catch_all"
                else:
                    status = "unknown"
            else:
                status = "unknown"

            return {"status": status, "raw": result}
    except httpx.ConnectError:
        logger.warning(f"Reacher not reachable at {url}")
        return {"status": "unknown", "raw": {"error": "connection_failed"}}
    except Exception as e:
        logger.warning(f"Reacher verification failed for {redact_email(email)}: {e}")
        return {"status": "unknown", "raw": {"error": str(e)}}


async def verify_whatsapp(
    phone: str, whatsapp_url: str | None = None
) -> dict[str, Any]:
    """Verify a WhatsApp number via whatsapp-web.js microservice.

    Returns {status, ...} mapped to SRS §6.2 enum values:
    registered | not_registered | unknown
    """
    import httpx

    url = (whatsapp_url or os.environ.get("WHATSAPP_WEB_URL", "http://localhost:3050")) + "/check"
    params = {"phone": phone}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return {"status": "unknown", "raw": {"error": f"HTTP {resp.status_code}"}}

            data = resp.json()
            exists = data.get("exists", False)
            status = "registered" if exists else "not_registered"
            return {"status": status, "raw": data}
    except Exception as e:
        logger.error(f"WhatsApp verification failed for {redact_phone(phone)}: {e}")
        return {"status": "unknown", "raw": {"error": str(e)}}


async def process_verification_job(
    payload: dict[str, Any],
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool,
) -> None:
    """Process a single verification job from the queue."""
    lead_id = payload.get("lead_id")
    requested_by = payload.get("requested_by", "system")

    if not lead_id:
        logger.error("Verification job missing lead_id")
        return

    logger.info(f"Processing verification for lead {lead_id}")

    async with db_pool.acquire() as conn:
        lead = await conn.fetchrow(
            """
            SELECT l.id, l.email_status, l.whatsapp_status,
                   hc.personal_email, hc.personal_mobile
            FROM leads l
            LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
            WHERE l.id = $1
            FOR UPDATE OF l
            """,
            lead_id,
        )

        if not lead:
            logger.warning(f"Lead not found: {lead_id}")
            return

        # Contactable values live on the joined hr_contacts row — leads has no
        # hr_email/hr_mobile columns (verified against the authoritative schema).
        email_to_verify = lead["personal_email"] or ""
        phone_to_verify = lead["personal_mobile"] or ""

        email_status = "unknown"
        whatsapp_status = "unknown"

        # Email verification via Reacher
        if email_to_verify:
            result = await verify_email_reacher(email_to_verify)
            email_status = result["status"]

            await conn.execute(
                """
                INSERT INTO verification_log (lead_id, channel, result, raw_response)
                VALUES ($1, 'email', $2, $3)
                """,
                lead_id,
                email_status,
                json.dumps(result["raw"]),
            )

        # WhatsApp verification
        if phone_to_verify:
            result = await verify_whatsapp(phone_to_verify)
            whatsapp_status = result["status"]

            await conn.execute(
                """
                INSERT INTO verification_log (lead_id, channel, result, raw_response)
                VALUES ($1, 'whatsapp', $2, $3)
                """,
                lead_id,
                whatsapp_status,
                json.dumps(result["raw"]),
            )

        # Lifecycle correctness: 'verified' is only set when a channel genuinely
        # verified as reachable. A lead whose only contact verified as bad (invalid
        # email / not-registered / no contact) is 'verification_failed' — it must
        # NEVER silently read as 'verified'. Discovery and verification stay
        # distinct states per spec.
        email_ok = email_status in ("valid", "catch_all")
        wa_ok = whatsapp_status == "registered"
        new_stage = "verified" if (email_ok or wa_ok) else "verification_failed"

        # Update lead
        await conn.execute(
            """
            UPDATE leads
            SET email_status = $1, whatsapp_status = $2,
                pipeline_stage = $3, updated_at = NOW()
            WHERE id = $4
            """,
            email_status,
            whatsapp_status,
            new_stage,
            lead_id,
        )

    await recompute_lead_score(db_pool, lead_id)

    await publish_event(redis_client, requested_by, {
        "type": "verification_complete",
        "lead_id": str(lead_id),
        "email_status": email_status,
        "whatsapp_status": whatsapp_status,
        "timestamp": asyncio.get_event_loop().time(),
    })

    logger.info(f"Verification complete for lead {lead_id}: email={email_status}, whatsapp={whatsapp_status}")

    # Chain to drafting only for deliverable contacts. DRAFT-ONLY mode: nothing
    # here ever pushes to send_queue — sending to a real HR is always a manual
    # human action via the API.
    if email_status in ("valid", "catch_all"):
        await chain_lead(redis_client, "draft_queue:requests", lead_id,
                         requested_by=requested_by)


async def consume_verification_queue(
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool | None = None,
) -> int:
    """Consume verification_queue:requests."""
    if db_pool is None:
        db_pool = await get_db_pool()

    processed = 0
    while True:
        payload: Any = None
        raw_msg: Any = None
        try:
            got = await reliable_brpop(redis_client, "verification_queue:requests", timeout=30)
            if got is None:
                await asyncio.sleep(1)
                continue

            raw_msg, payload = got
            await process_verification_job(payload, redis_client, db_pool)
            await ack(redis_client, "verification_queue:requests", raw_msg)
            processed += 1
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in verification_queue: {e}")
            if raw_msg is not None:
                await ack(redis_client, "verification_queue:requests", raw_msg)
        except Exception as e:
            logger.error(f"Verification consumer error: {e}", exc_info=True)
            try:
                if raw_msg is not None:
                    await ack(redis_client, "verification_queue:requests", raw_msg)
                await requeue_or_dlq(redis_client, "verification_queue:requests", payload)
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(5)

    return processed
