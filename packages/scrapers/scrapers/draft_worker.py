"""
Draft generation worker: consumes draft_queue:requests.

Per SRS §7:
- If GEMINI_API_KEY is configured: calls Gemini 2.5 Flash API with structured JSON output
- If not configured: falls back to template-based draft generator (§9.8)

Generates:
- email_draft { subject, body }
- whatsapp_draft { body }

Stores in outreach_drafts table (versioned), updates pipeline_stage -> 'drafted'.
"""

import json
import asyncio
import logging
import os
from pathlib import Path
from typing import Any

import redis.asyncio as redis
import asyncpg

from .base import BaseScraper, ScraperError, now_iso
from .utils.db import get_db_pool
from .queue import requeue_or_dlq, reliable_brpop, ack, publish_event
from .api_utils.scoring_client import recompute_lead_score

logger = logging.getLogger(__name__)

_PROMPTS_DIR = Path(__file__).parent / "prompts"
DRAFT_PROMPT_TEMPLATE = (_PROMPTS_DIR / "draft_prompt.txt").read_text(encoding="utf-8")


EMAIL_TEMPLATE = subject_template = """Hi {hr_name_or_title},

I noticed {company_name} is hiring for a {job_title} role{experience_clause}.

At HireGen, we help companies like yours find top fresher talent — candidates who are ready to contribute from day one. Our platform connects you with pre-verified entry-level candidates who match your exact requirements.

I'd love to show you how we can save you time and improve your hiring quality.

Would you be open to a 10-minute call this week?

Best regards,
HireGen Team

Job posting: {job_url}
"""

WHATSAPP_TEMPLATE = """Hi {name}, 

This is [Your Name] from HireGen. We help {company_name} find top fresher talent for roles like {job_title}. 

Our AI platform pre-screens and verifies entry-level candidates, saving you hours of sourcing.

Would you be open to a quick 10-min call?

Thanks!
"""

SUBJECT_TEMPLATE = "{company_name} x HireGen — Fresher Talent for {job_title}"


def generate_template_draft(lead_data: dict[str, Any]) -> dict[str, Any]:
    """Generate drafts from templates when Gemini API is unavailable (§9.8)."""
    company_name = lead_data.get("company_name", "your company") or "your company"
    job_title = lead_data.get("job_title", "the role") or "the role"
    about_company = lead_data.get("about_company", "") or ""
    about_job = lead_data.get("about_job", "") or ""
    hr_name = lead_data.get("hr_name", "") or ""
    salary_range = lead_data.get("salary_range", "") or ""
    job_url = lead_data.get("job_url", "") or ""

    hr_display = hr_name if hr_name else "Hiring Team"
    exp = (lead_data.get("experience_level", "") or "").strip()
    experience_clause = f" ({exp})" if exp else ""

    email_body = EMAIL_TEMPLATE.format(
        hr_name_or_title=hr_display,
        company_name=company_name,
        job_title=job_title,
        experience_clause=experience_clause,
        job_url=job_url if job_url else "N/A",
    )

    subject = SUBJECT_TEMPLATE.format(
        company_name=company_name,
        job_title=job_title,
    )[:100]

    whatsapp_body = WHATSAPP_TEMPLATE.format(
        name=hr_display,
        company_name=company_name,
        job_title=job_title,
    )

    return {
        "email_draft": {"subject": subject, "body": email_body},
        "whatsapp_draft": {"body": whatsapp_body},
        "generated_by": "template-fallback",
    }


async def generate_gemini_drafts(
    lead_data: dict[str, Any], api_key: str
) -> dict[str, Any] | None:
    """Generate drafts using Gemini 2.5 Flash API (per SRS §3.10, §7)."""
    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)

        prompt = DRAFT_PROMPT_TEMPLATE.format(**{
            "company_name": lead_data.get("company_name", "") or "",
            "job_title": lead_data.get("job_title", "") or "",
            "experience_level": lead_data.get("experience_level", "") or "",
            "about_company": lead_data.get("about_company", "") or "",
            "about_job": lead_data.get("about_job", "") or "",
            "hr_name": lead_data.get("hr_name", "") or "",
            "salary_range": lead_data.get("salary_range", "") or "",
            "job_url": lead_data.get("job_url", "") or "",
        })

        model = genai.GenerativeModel(
            "gemini-2.5-flash",
            generation_config={
                "response_mime_type": "application/json",
            },
        )

        response = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: model.generate_content(prompt),
        )

        result = json.loads(response.text)

        if "email_draft" in result and "whatsapp_draft" in result:
            result["generated_by"] = "gemini-2.5-flash"
            return result

        logger.warning("Gemini response missing required fields")
        return None
    except Exception as e:
        logger.error(f"Gemini draft generation failed: {e}")
        return None


async def process_draft_job(
    payload: dict[str, Any],
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool,
) -> None:
    """Process a single draft generation job from the queue."""
    lead_id = payload.get("lead_id")
    channel = payload.get("channel", "both")
    requested_by = payload.get("requested_by", "system")

    if not lead_id:
        logger.error("Draft job missing lead_id")
        return

    logger.info(f"Processing draft generation for lead {lead_id}, channel={channel}")

    async with db_pool.acquire() as conn:
        lead = await conn.fetchrow(
            """
            SELECT l.id, l.hr_contact_id, l.pipeline_stage,
                   c.name as company_name, c.about as about_company, c.default_email,
                   jp.title as job_title, jp.description as about_job,
                   jp.experience_level, jp.salary_range, jp.job_url, jp.source_site,
                   hc.full_name as hr_name, hc.linkedin_url
            FROM leads l
            JOIN companies c ON l.company_id = c.id
            JOIN job_postings jp ON l.job_posting_id = jp.id
            LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
            WHERE l.id = $1
            """,
            lead_id,
        )

        if not lead:
            logger.warning(f"Lead not found: {lead_id}")
            return

        lead_data = {
            "company_name": lead["company_name"],
            "about_company": lead["about_company"] or "",
            "job_title": lead["job_title"],
            "about_job": lead["about_job"] or "",
            "hr_name": lead["hr_name"] or "",
            "experience_level": lead["experience_level"] or "",
            "salary_range": lead["salary_range"] or "",
            "job_url": lead["job_url"] or "",
            "source_site": lead["source_site"] or "",
        }

        # Try Gemini first
        gemini_key = os.environ.get("GEMINI_API_KEY")
        if not gemini_key:
            # Try user-supplied key. `requested_by` may be a scheduled sentinel
            # ("system"/"daily_scheduler"), not a UUID -> coerce or skip lookup.
            user_id = None
            try:
                from uuid import UUID
                user_id = UUID(str(requested_by))
            except (ValueError, TypeError):
                user_id = None
            user_row = await conn.fetchrow(
                "SELECT api_keys FROM users WHERE id = $1",
                user_id,
            ) if user_id else None
            if user_row and user_row["api_keys"]:
                try:
                    from .crypto_utils.decrypt import decrypt_api_key
                    keys = user_row["api_keys"]
                    if isinstance(keys, dict) and "gemini" in keys:
                        gemini_key = decrypt_api_key(keys["gemini"])
                except Exception as e:
                    logger.warning(f"Failed to decrypt Gemini key: {e}")

        result = None
        if gemini_key:
            result = await generate_gemini_drafts(lead_data, gemini_key)

        # Fallback to template-based draft (§9.8)
        if not result:
            result = generate_template_draft(lead_data)
            logger.info(f"Used template fallback for lead {lead_id}")

        email_draft = result.get("email_draft", {})
        whatsapp_draft = result.get("whatsapp_draft", {})
        generated_by = result.get("generated_by", "template-fallback")

        channels_to_create = []
        if channel in ("email", "both"):
            channels_to_create.append(("email", email_draft))
        if channel in ("whatsapp", "both"):
            channels_to_create.append(("whatsapp", whatsapp_draft))

        for ch, draft in channels_to_create:
            subject = draft.get("subject") if ch == "email" else None
            body = draft.get("body", "")

            await conn.execute(
                """
                INSERT INTO outreach_drafts
                  (lead_id, channel, version, subject, body, generated_by, is_edited)
                VALUES ($1, $2,
                        (SELECT COALESCE(MAX(version), 0) + 1 FROM outreach_drafts WHERE lead_id = $1 AND channel = $2),
                        $3, $4, $5, false)
                """,
                lead_id,
                ch,
                subject,
                body,
                generated_by,
            )

        await conn.execute(
            "UPDATE leads SET pipeline_stage = 'drafted', updated_at = NOW() WHERE id = $1",
            lead_id,
        )

    await recompute_lead_score(db_pool, lead_id)

    await publish_event(redis_client, requested_by, {
        "type": "draft_generated",
        "lead_id": str(lead_id),
        "generated_by": generated_by,
        "channels": [ch for ch, _ in channels_to_create],
        "timestamp": asyncio.get_event_loop().time(),
    })

    logger.info(f"Draft generation complete for lead {lead_id}: {generated_by}")


async def consume_draft_queue(
    redis_client: redis.Redis,
    db_pool: asyncpg.Pool | None = None,
) -> int:
    """Consume draft_queue:requests."""
    if db_pool is None:
        db_pool = await get_db_pool()

    processed = 0
    while True:
        payload: Any = None
        raw_msg: Any = None
        try:
            got = await reliable_brpop(redis_client, "draft_queue:requests", timeout=30)
            if got is None:
                await asyncio.sleep(1)
                continue

            raw_msg, payload = got
            await process_draft_job(payload, redis_client, db_pool)
            await ack(redis_client, "draft_queue:requests", raw_msg)
            processed += 1
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in draft_queue: {e}")
            if raw_msg is not None:
                await ack(redis_client, "draft_queue:requests", raw_msg)
        except Exception as e:
            logger.error(f"Draft consumer error: {e}", exc_info=True)
            try:
                if raw_msg is not None:
                    await ack(redis_client, "draft_queue:requests", raw_msg)
                await requeue_or_dlq(redis_client, "draft_queue:requests", payload)
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(5)

    return processed
