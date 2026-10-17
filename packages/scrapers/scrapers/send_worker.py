"""
Send worker: consumes send_queue:requests.

Per SRS §8:
- Email send via Resend/Brevo API (if API key configured)
- WhatsApp send via whatsapp-web.js microservice (if session available)
- Checks do_not_contact flag before sending
- Logs to outreach_log table
- Updates pipeline_stage -> 'contacted'

If sending API is unavailable, logs the attempt with status 'failed'.
"""

import json
import asyncio
import logging
import os
from urllib.parse import quote
from typing import Any

import redis.asyncio as redis
import asyncpg

from .utils.db import get_db_pool
from .queue import requeue_or_dlq, reliable_brpop, ack, publish_event
from .api_utils.scoring_client import recompute_lead_score

from .utils.redact import redact_email, redact_phone

logger = logging.getLogger(__name__)

# Compliance footer (CAN-SPAM §5: must contain a clear unsubscribe mechanism +
# a valid postal address). Both are operator-configurable so we NEVER ship a
# fabricated address. If unset, we emit an explicit ACTION-REQUIRED placeholder
# rather than pretending to be compliant.
COMPANY_POSTAL_ADDRESS = os.environ.get(
    "COMPANY_POSTAL_ADDRESS", ""
).strip() or "[ACTION REQUIRED: set COMPANY_POSTAL_ADDRESS to your registered mailing address]"


def _base_url() -> str:
    base = os.environ.get("UNSUBSCRIBE_BASE_URL", "").strip().rstrip("/")
    if not base:
        base = os.environ.get("PUBLIC_APP_URL", "").strip().rstrip("/")
    return base


async def mint_unsubscribe_token(conn, email: str, channel: str = "email") -> str:
    """Return the unsubscribe URL for THIS recipient.

    Mints an opaque, unguessable token mapped to the recipient's normalised
    contact and persists it (outreach_tokens). The public /optout route resolves
    the contact ONLY from that token — so no raw email is ever put in a URL and no
    anonymous caller can force-suppress an address they weren't sent a link for.
    RFC-8058 one-click, without the poisoning/PII-in-URL downsides.
    """
    import secrets
    base = _base_url()
    if not base:
        # No configured endpoint -> mailto fallback (still a valid opt-out path).
        return "mailto:unsubscribe@hiregen.ai?subject=Unsubscribe"
    token = secrets.token_urlsafe(24)
    await conn.execute(
        "INSERT INTO outreach_tokens (token, normalized_contact, channel) VALUES ($1,$2,$3) "
        "ON CONFLICT (token) DO NOTHING",
        token, email.strip().lower(), channel,
    )
    return f"{base}/api/optout?t={quote(token, safe='')}"


async def build_unsubscribe_footer(conn, email: str) -> str:
    link = await mint_unsubscribe_token(conn, email, "email")
    return f"""
<hr style="margin-top: 32px; border: none; border-top: 1px solid #e5e7eb;" />
<p style="font-size: 12px; color: #6b7280; line-height: 1.6;">
  You received this email because your company is hiring and we thought HireGen could help.
  If you would prefer not to receive outreach from us,
  <a href="{link}" style="color: #2563eb; text-decoration: underline;">click here to unsubscribe</a>.
</p>
<p style="font-size: 12px; color: #9ca3af;">{COMPANY_POSTAL_ADDRESS}</p>
"""



async def _is_suppressed(conn, normalized_contact: str, channel: str) -> bool:
    """Server-side suppression check against the suppressions store.

    Matches the exact normalized contact OR its local-part only when a broad
    'any'-channel entry exists. A suppression hit (opted_out / bounced / blocked
    / compliance_hold / manual) MUST stop outreach regardless of the lead flag.
    """
    if not normalized_contact:
        return False
    n = await conn.fetchval(
        "SELECT 1 FROM suppressions WHERE normalized_contact = $1 AND (channel = $2 OR channel = 'any') LIMIT 1",
        normalized_contact.strip().lower(),
        channel,
    )
    return bool(n)


def email_domain(address: str | None) -> str:
    """Recipient domain, lowercased. Empty string when unparseable."""
    parts = (address or "").strip().lower().split("@")
    return parts[1] if len(parts) == 2 and parts[1] else ""


async def domain_sent_count(conn, domain: str, hours: int = 24) -> int:
    """Emails already sent to this recipient domain in the window."""
    if not domain:
        return 0
    n = await conn.fetchval(
        """
        SELECT count(*) FROM outreach_log ol
          JOIN leads l ON ol.lead_id = l.id
          LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
          LEFT JOIN companies c ON l.company_id = c.id
         WHERE ol.channel = 'email' AND ol.delivery_status = 'sent'
           AND ol.sent_at > NOW() - make_interval(hours => $1)
           AND lower(split_part(coalesce(hc.personal_email, c.default_email, ''), '@', 2)) = $2
        """,
        hours, domain,
    )
    return int(n or 0)


def resend_headers(resend_key: str, idempotency_key: str | None = None) -> dict[str, str]:
    """Auth (+ replay protection) headers for Resend.

    The idempotency key makes a crash between provider-accept and our
    outreach_log commit safe: replaying the same job reuses the key and the
    provider dedupes instead of sending twice. Key scope is one
    (lead, draft, channel, day) — the 24h send cooldown owns longer windows.
    """
    headers = {"Authorization": f"Bearer {resend_key}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key[:255]
    return headers


def send_idempotency_key(lead_id: str, draft_id: str | None, channel: str, day: str | None = None) -> str:
    """Deterministic replay key for one send job (pure — unit-testable)."""
    import datetime as _dt
    day = day or _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
    return f"hiregen-{lead_id}-{draft_id or 'live'}-{channel}-{day}"


async def send_email(
    email: str, subject: str, body: str, api_key: str, from_email: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Send email via Resend or Brevo API."""
    # Try Resend first
    resend_key = api_key if api_key.startswith("re_") else None
    brevo_key = api_key if api_key.startswith("key-") else api_key

    import httpx

    # Try Resend
    if resend_key:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.resend.email/v1/emails/send",
                    headers=resend_headers(resend_key, idempotency_key),
                    json={
                        "from": from_email,
                        "to": [email],
                        "subject": subject,
                        "html": body,
                    },
                )
                if resp.status_code == 200 or resp.status_code == 202:
                    data = resp.json()
                    return {
                        "status": "sent",
                        "provider": "resend",
                        "provider_message_id": str(data.get("id", "")),
                        "raw": data,
                    }
                logger.warning(f"Resend returned {resp.status_code}: {resp.text}")
        except Exception as e:
            logger.error(f"Resend send failed: {e}")

    # Try Brevo
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtpEmail",
                headers={
                    "Authorization": f"Bearer {brevo_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "sender": {"email": from_email},
                    "to": [{"email": email}],
                    "subject": subject,
                    "htmlContent": body,
                },
            )
            if resp.status_code == 202 or resp.status_code == 201:
                data = resp.json()
                return {
                    "status": "sent",
                    "provider": "brevo",
                    "provider_message_id": data.get("messageId", ""),
                    "raw": data,
                }
            logger.warning(f"Brevo returned {resp.status_code}: {resp.text}")
    except Exception as e:
        logger.error(f"Brevo send failed: {e}")

    return {"status": "failed", "provider": "unknown", "provider_message_id": None, "raw": {"error": "no provider available"}}


async def send_whatsapp(
    phone: str, message: str, whatsapp_url: str | None = None
) -> dict[str, Any]:
    """Send WhatsApp message via whatsapp-web.js microservice."""
    import httpx

    url = (whatsapp_url or os.environ.get("WHATSAPP_WEB_URL", "http://localhost:3050")) + "/send"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                url,
                json={"phone": phone, "message": message},
            )
            if resp.status_code == 200:
                return {"status": "sent", "provider": "whatsapp-web.js", "provider_message_id": str(resp.json().get("id", "")), "raw": resp.json()}
            return {"status": "failed", "provider": "whatsapp-web.js", "provider_message_id": None, "raw": {"error": f"HTTP {resp.status_code}"}}
    except Exception as e:
        logger.error(f"WhatsApp send failed: {e}")
        return {"status": "failed", "provider": "whatsapp-web.js", "provider_message_id": None, "raw": {"error": str(e)}}


async def process_send_job(
    payload: dict[str, Any],
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool,
) -> None:
    """Process a single send job from the queue."""
    lead_id = payload.get("lead_id")
    channel = payload.get("channel", "both")
    draft_id = payload.get("draft_id")
    requested_by = payload.get("requested_by", "system")
    # outreach_log.sent_by + users lookup require a real UUID; scheduled runs
    # pass sentinels ("system") -> coerce to None so the FK/lookup can't crash.
    user_id: Any = None
    try:
        from uuid import UUID
        user_id = UUID(str(requested_by))
    except (ValueError, TypeError):
        user_id = None

    if not lead_id:
        logger.error("Send job missing lead_id")
        return

    logger.info(f"Processing send for lead {lead_id}, channel={channel}")

    async with db_pool.acquire() as conn:
        # Check do_not_contact flag
        do_not_contact = await conn.fetchval(
            "SELECT do_not_contact FROM leads WHERE id = $1",
            lead_id,
        )
        if do_not_contact:
            logger.warning(f"Send blocked: lead {lead_id} is do_not_contact")
            await publish_event(redis_client, requested_by, {
                "type": "send_blocked",
                "lead_id": str(lead_id),
                "reason": "do_not_contact",
                "timestamp": asyncio.get_event_loop().time(),
            })
            return

        # Get lead details
        lead = await conn.fetchrow(
            """
            SELECT l.id, l.email_status, l.whatsapp_status,
                   c.default_email as company_email, c.default_phone as company_phone,
                   hc.personal_email as hr_email, hc.personal_mobile as hr_mobile
            FROM leads l
            JOIN companies c ON l.company_id = c.id
            LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
            WHERE l.id = $1
            """,
            lead_id,
        )

        if not lead:
            logger.warning(f"Lead not found: {lead_id}")
            return

        # ANTI-SPAM / NO-DUPLICATE-OUTREACH (server-side, non-negotiable): refuse
        # to re-send the same channel to a lead already reached within the cooldown
        # window. Configurable via SEND_COOLDOWN_HOURS (default 24h). This is the
        # real gate — the frontend cannot be trusted as the boundary.
        cooldown_h = float(os.environ.get("SEND_COOLDOWN_HOURS", "24"))
        if cooldown_h > 0:
            recent = await conn.fetchval(
                """
                SELECT count(*) FROM outreach_log
                WHERE lead_id = $1
                  AND channel = ANY($2::text[])
                  AND delivery_status = 'sent'
                  AND sent_at > NOW() - make_interval(hours => $3)
                """,
                lead_id,
                [c for c in ("email", "whatsapp") if channel in (c, "both")],
                cooldown_h,
            )
            if recent:
                logger.warning(f"Send blocked: lead {lead_id} reached in last {cooldown_h}h (dedup)")
                await publish_event(redis_client, requested_by,
                    {"type": "send_blocked", "lead_id": str(lead_id),
                     "reason": "cooldown", "timestamp": asyncio.get_event_loop().time()})
                return

        # Load user-supplied API keys
        user_row = await conn.fetchrow(
            "SELECT api_keys FROM users WHERE id = $1",
            user_id,
        ) if user_id else None
        api_keys: dict[str, str] = {}
        if user_row and user_row["api_keys"]:
            try:
                from .crypto_utils.decrypt import decrypt_api_key
                encrypted = user_row["api_keys"]
                for k, v in encrypted.items():
                    if isinstance(v, str):
                        try:
                            api_keys[k] = decrypt_api_key(v)
                        except Exception:
                            continue  # never forward undecryptable ciphertext
            except Exception:
                pass

        from_email = os.environ.get("EMAIL_FROM", "leads@hiregen.ai")
        resend_key = api_keys.get("resend") or os.environ.get("RESEND_API_KEY")
        brevo_key = api_keys.get("brevo") or os.environ.get("BREVO_API_KEY")
        email_api_key = resend_key or brevo_key

        # Get draft if draft_id provided
        draft = None
        if draft_id:
            draft = await conn.fetchrow(
                "SELECT subject, body FROM outreach_drafts WHERE id = $1 AND lead_id = $2",
                draft_id,
                lead_id,
            )

        results = []

        # Send email
        if channel in ("email", "both"):
            if lead["email_status"] != "valid":
                logger.warning(f"Email send blocked: lead {lead_id} email not verified")
                results.append({"channel": "email", "status": "blocked", "reason": "email not verified"})
            else:
                email = lead["hr_email"] or lead["company_email"]
                if not email:
                    results.append({"channel": "email", "status": "failed", "reason": "no email address"})
                elif await _is_suppressed(conn, email, "email"):
                    logger.warning(f"Email send blocked: {redact_email(email)} is suppressed/opted-out")
                    results.append({"channel": "email", "status": "blocked", "reason": "suppressed"})
                else:
                    domain_cap = int(os.environ.get("SEND_MAX_PER_DOMAIN_PER_DAY", "25") or 25)
                    domain = email_domain(email)
                    over_cap = domain_cap > 0 and await domain_sent_count(conn, domain) >= domain_cap
                    if over_cap:
                        logger.warning(f"Email send blocked: domain {domain} hit daily cap ({domain_cap})")
                        results.append({"channel": "email", "status": "blocked", "reason": "domain_cap"})
                    else:
                        subject = draft["subject"] if draft else f"Opportunity at {lead_id}"
                        body = (draft["body"] if draft else "") + await build_unsubscribe_footer(conn, email)
                        result = await send_email(email, subject, body, email_api_key or "", from_email,
                                                  send_idempotency_key(str(lead_id), draft_id, "email"))
                        results.append({"channel": "email", **result})

                        # Log to outreach_log
                        await conn.execute(
                            """
                            INSERT INTO outreach_log (lead_id, draft_id, channel, sent_by, provider_message_id, delivery_status)
                            VALUES ($1, $2, 'email', $3, $4, $5)
                            """,
                            lead_id,
                            draft_id if draft_id else None,
                            user_id,
                            result.get("provider_message_id"),
                            result["status"],
                        )

        # Send WhatsApp
        if channel in ("whatsapp", "both"):
            if lead["whatsapp_status"] != "registered":
                logger.warning(f"WhatsApp send blocked: lead {lead_id} WhatsApp not verified")
                results.append({"channel": "whatsapp", "status": "blocked", "reason": "whatsapp not verified"})
            else:
                phone = lead["hr_mobile"] or lead["company_phone"]
                if not phone:
                    results.append({"channel": "whatsapp", "status": "failed", "reason": "no phone number"})
                elif await _is_suppressed(conn, phone, "whatsapp"):
                    logger.warning(f"WhatsApp send blocked: {redact_phone(phone)} is suppressed/opted-out")
                    results.append({"channel": "whatsapp", "status": "blocked", "reason": "suppressed"})
                else:
                    message = draft["body"] if draft else ""
                    result = await send_whatsapp(phone, message)
                    results.append({"channel": "whatsapp", **result})

                    await conn.execute(
                        """
                        INSERT INTO outreach_log (lead_id, draft_id, channel, sent_by, provider_message_id, delivery_status)
                        VALUES ($1, $2, 'whatsapp', $3, $4, $5)
                        """,
                        lead_id,
                        draft_id if draft_id else None,
                        user_id,
                        result.get("provider_message_id"),
                        result["status"],
                    )

        # Update pipeline stage to 'contacted' if any send succeeded
        any_sent = any(r["status"] == "sent" for r in results)
        if any_sent:
            await conn.execute(
                "UPDATE leads SET pipeline_stage = 'contacted', updated_at = NOW() WHERE id = $1",
                lead_id,
            )

    await recompute_lead_score(db_pool, lead_id)

    await publish_event(redis_client, requested_by, {
        "type": "send_complete",
        "lead_id": str(lead_id),
        "results": results,
        "timestamp": asyncio.get_event_loop().time(),
    })

    logger.info(f"Send complete for lead {lead_id}: {results}")


async def consume_send_queue(
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool | None = None,
) -> int:
    """Consume send_queue:requests."""
    if db_pool is None:
        db_pool = await get_db_pool()

    processed = 0
    while True:
        payload: Any = None
        raw_msg: Any = None
        try:
            got = await reliable_brpop(redis_client, "send_queue:requests", timeout=30)
            if got is None:
                await asyncio.sleep(1)
                continue

            raw_msg, payload = got
            await process_send_job(payload, redis_client, db_pool)
            await ack(redis_client, "send_queue:requests", raw_msg)
            processed += 1
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in send_queue: {e}")
            if raw_msg is not None:
                await ack(redis_client, "send_queue:requests", raw_msg)
        except Exception as e:
            logger.error(f"Send consumer error: {e}", exc_info=True)
            try:
                if raw_msg is not None:
                    await ack(redis_client, "send_queue:requests", raw_msg)
                await requeue_or_dlq(redis_client, "send_queue:requests", payload)
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(5)

    return processed
