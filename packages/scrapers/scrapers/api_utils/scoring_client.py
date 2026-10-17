"""
API utilities shared across workers.
Provides scoring recompute that mirrors the Node.js implementation in scoring.ts.
"""
import logging

logger = logging.getLogger(__name__)


SCORING_WEIGHTS = {
    "hr_name": 20,
    "hr_contact": 25,
    "hr_linkedin": 15,
    "company_contact": 10,
    "job_quality_max": 10,
    "email_verified": 10,
    "whatsapp_verified": 10,
}


def calculate_score(input_data: dict) -> dict[str, int | dict]:
    """Calculate lead score mirroring scoring.ts calculateLeadScore."""
    score = 0
    breakdown: dict[str, dict] = {}

    if input_data.get("hr_name"):
        score += SCORING_WEIGHTS["hr_name"]
        breakdown["hr_name"] = {"points": SCORING_WEIGHTS["hr_name"], "reason": "HR name found"}

    if input_data.get("hr_personal_email") or input_data.get("hr_personal_mobile"):
        score += SCORING_WEIGHTS["hr_contact"]
        breakdown["hr_contact"] = {"points": SCORING_WEIGHTS["hr_contact"], "reason": "HR personal contact found"}

    if input_data.get("hr_linkedin_url"):
        score += SCORING_WEIGHTS["hr_linkedin"]
        breakdown["hr_linkedin"] = {"points": SCORING_WEIGHTS["hr_linkedin"], "reason": "HR LinkedIn URL found"}

    if input_data.get("company_default_email") or input_data.get("company_default_phone"):
        score += SCORING_WEIGHTS["company_contact"]
        breakdown["company_contact"] = {"points": SCORING_WEIGHTS["company_contact"], "reason": "Company official contact found"}

    quality = min(
        SCORING_WEIGHTS["job_quality_max"],
        (3 if input_data.get("salary_range") else 0) +
        (4 if input_data.get("job_description") and len(input_data.get("job_description", "")) > 100 else 0) +
        (3 if input_data.get("job_url") else 0),
    )
    if quality > 0:
        score += quality
        breakdown["job_quality"] = {"points": quality, "reason": "Job description quality indicators"}

    if input_data.get("email_status") == "valid":
        score += SCORING_WEIGHTS["email_verified"]
        breakdown["email_verified"] = {"points": SCORING_WEIGHTS["email_verified"], "reason": "Email verified deliverable"}

    if input_data.get("whatsapp_status") == "registered":
        score += SCORING_WEIGHTS["whatsapp_verified"]
        breakdown["whatsapp_verified"] = {"points": SCORING_WEIGHTS["whatsapp_verified"], "reason": "WhatsApp number verified active"}

    band = "hot" if score >= 70 else ("warm" if score >= 40 else "cold")

    return {"score": score, "breakdown": breakdown, "band": band}


async def recompute_lead_score(db_pool, lead_id: str, pipeline_stage: str | None = None) -> int:
    """Recompute lead score from DB and update the leads table.

    Mirrors recomputeLeadScore in scoring.ts.
    If pipeline_stage is provided, updates the pipeline_stage column atomically.
    """
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
              hc.full_name as hr_name,
              hc.personal_email as hr_personal_email,
              hc.personal_mobile as hr_personal_mobile,
              hc.linkedin_url as hr_linkedin_url,
              c.default_email as company_default_email,
              c.default_phone as company_default_phone,
              jp.salary_range, jp.description as job_description, jp.job_url,
              l.email_status, l.whatsapp_status
            FROM leads l
            JOIN companies c ON l.company_id = c.id
            LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
            JOIN job_postings jp ON l.job_posting_id = jp.id
            WHERE l.id = $1
            """,
            lead_id,
        )

        if not row:
            return 0

        result = calculate_score({
            "hr_name": row["hr_name"],
            "hr_personal_email": row["hr_personal_email"],
            "hr_personal_mobile": row["hr_personal_mobile"],
            "hr_linkedin_url": row["hr_linkedin_url"],
            "company_default_email": row["company_default_email"],
            "company_default_phone": row["company_default_phone"],
            "salary_range": row["salary_range"],
            "job_description": row["job_description"],
            "job_url": row["job_url"],
            "email_status": row["email_status"],
            "whatsapp_status": row["whatsapp_status"],
        })

        set_clauses = ["lead_score = $1", "updated_at = NOW()"]
        values: list = [result["score"]]

        if pipeline_stage:
            values.append(pipeline_stage)
            set_clauses.append(f"pipeline_stage = ${len(values)}")

        values.append(lead_id)
        await conn.execute(
            f"UPDATE leads SET {', '.join(set_clauses)} WHERE id = ${len(values)}",
            *values,
        )

        return result["score"]
