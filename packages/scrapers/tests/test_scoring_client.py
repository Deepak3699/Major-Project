"""Tests for Python scoring client (SRS §5.1 — Python scoring mirror)."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from scrapers.api_utils.scoring_client import calculate_score, recompute_lead_score, SCORING_WEIGHTS


class TestCalculateScore:
    """Verify Python scoring mirror matches TS scoring.ts exactly (SRS §5.1)."""

    def test_hot_lead_full_info(self):
        result = calculate_score({
            "hr_name": "John Smith",
            "hr_personal_email": "john@company.com",
            "hr_linkedin_url": "https://linkedin.com/in/johnsmith",
            "job_description": "This is a full job description with details about the role and company culture that matters to freshers looking for entry level positions.",
            "job_url": "https://company.com/jobs/1",
            "salary_range": "10-15 LPA",
            "email_status": "valid",
            "whatsapp_status": "registered",
        })
        assert result["score"] == 90
        assert result["band"] == "hot"

    def test_warm_lead_partial_info(self):
        result = calculate_score({
            "hr_name": "Jane Doe",
            "hr_personal_email": "jane@company.com",
        })
        assert result["score"] == 45
        assert result["band"] == "warm"

    def test_cold_lead_no_info(self):
        result = calculate_score({})
        assert result["score"] == 0
        assert result["band"] == "cold"

    def test_company_contact_only(self):
        result = calculate_score({
            "company_default_email": "careers@company.com",
            "company_default_phone": "+1234567890",
        })
        assert result["score"] == 10
        assert result["band"] == "cold"

    def test_job_quality_with_all_fields(self):
        """Salary (3) + description (4) + URL (3) = 10, capped at 10."""
        result = calculate_score({
            "salary_range": "5-10 LPA",
            "job_description": "A" * 150,
            "job_url": "https://company.com/job/1",
        })
        assert result["breakdown"]["job_quality"]["points"] == 10
        assert result["score"] == 10

    def test_job_quality_no_salary(self):
        """Description (4) + URL (3) = 7, no salary."""
        result = calculate_score({
            "job_description": "A" * 150,
            "job_url": "https://company.com/job/1",
        })
        assert result["breakdown"]["job_quality"]["points"] == 7
        assert result["score"] == 7

    def test_job_quality_no_description(self):
        """Salary (3) + URL (3) = 6, no description."""
        result = calculate_score({
            "salary_range": "5-10 LPA",
            "job_url": "https://company.com/job/1",
        })
        assert result["breakdown"]["job_quality"]["points"] == 6
        assert result["score"] == 6

    def test_job_quality_salary_only(self):
        """Salary (3) only."""
        result = calculate_score({
            "salary_range": "5-10 LPA",
        })
        assert result["breakdown"]["job_quality"]["points"] == 3
        assert result["score"] == 3

    def test_email_verified(self):
        result = calculate_score({"email_status": "valid"})
        assert result["score"] == 10
        assert result["breakdown"]["email_verified"]["points"] == 10

    def test_whatsapp_verified(self):
        result = calculate_score({"whatsapp_status": "registered"})
        assert result["score"] == 10
        assert result["breakdown"]["whatsapp_verified"]["points"] == 10

    def test_score_breakdown_sums_to_total(self):
        result = calculate_score({
            "hr_name": "Test",
            "hr_personal_email": "test@test.com",
            "hr_linkedin_url": "https://linkedin.com/in/test",
            "job_description": "x" * 100,
            "job_url": "https://test.com/j",
            "salary_range": "1-2 LPA",
            "email_status": "valid",
            "whatsapp_status": "registered",
        })
        total = sum(b["points"] for b in result["breakdown"].values())
        assert total == result["score"]

    def test_scoring_weights(self):
        assert SCORING_WEIGHTS["hr_name"] == 20
        assert SCORING_WEIGHTS["hr_contact"] == 25
        assert SCORING_WEIGHTS["hr_linkedin"] == 15
        assert SCORING_WEIGHTS["company_contact"] == 10
        assert SCORING_WEIGHTS["email_verified"] == 10
        assert SCORING_WEIGHTS["whatsapp_verified"] == 10
        assert SCORING_WEIGHTS["job_quality_max"] == 10

    def test_hot_threshold_70(self):
        result = calculate_score({
            "hr_name": "A",
            "hr_personal_email": "a@b.com",
            "hr_linkedin_url": "https://linkedin.com/in/a",
            "job_description": "x" * 100,
            "job_url": "https://a.com/j",
            "salary_range": "1-2 LPA",
            "email_status": "valid",
            "whatsapp_status": "registered",
        })
        assert result["score"] >= 70
        assert result["band"] == "hot"

    def test_warm_threshold_40_69(self):
        result = calculate_score({
            "hr_name": "A",
            "hr_personal_email": "a@b.com",
            "hr_linkedin_url": "https://linkedin.com/in/a",
        })
        assert result["score"] >= 40
        assert result["score"] < 70
        assert result["band"] == "warm"

    def test_cold_below_40(self):
        result = calculate_score({})
        assert result["score"] < 40
        assert result["band"] == "cold"


class TestRecomputeLeadScore:
    """Verify recompute_lead_score mirror matches TS (SRS §5.1 + pipeline_stage)."""

    @pytest.mark.asyncio
    async def test_updates_score_and_pipeline_stage(self):
        sql = MagicMock()
        sql.acquire = MagicMock()
        sql.acquire().__aenter__ = AsyncMock(return_value=sql)
        sql.acquire().__aexit__ = AsyncMock(return_value=None)

        sql.fetchrow = AsyncMock(return_value={
            "hr_name": "Jane Doe",
            "hr_personal_email": "jane@corp.com",
            "hr_personal_mobile": None,
            "hr_linkedin_url": None,
            "company_default_email": None,
            "company_default_phone": None,
            "salary_range": None,
            "job_description": None,
            "job_url": None,
            "email_status": "unknown",
            "whatsapp_status": "unknown",
        })

        sql.execute = AsyncMock()
        sql.fetchval = AsyncMock(return_value=45)

        score = await recompute_lead_score(sql, "lead-123", pipeline_stage="enriched")

        assert score == 45
        assert sql.execute.called
        call_args = sql.execute.call_args
        sql_str = call_args[0][0] if call_args[0] else call_args[1][0] if call_args[1] else ""
        assert "pipeline_stage" in sql_str
        assert "lead_score" in sql_str
        assert "updated_at" in sql_str

    @pytest.mark.asyncio
    async def test_without_pipeline_stage(self):
        sql = MagicMock()
        sql.acquire = MagicMock()
        sql.acquire().__aenter__ = AsyncMock(return_value=sql)
        sql.acquire().__aexit__ = AsyncMock(return_value=None)

        sql.fetchrow = AsyncMock(return_value={
            "hr_name": None,
            "hr_personal_email": None,
            "hr_personal_mobile": None,
            "hr_linkedin_url": None,
            "company_default_email": None,
            "company_default_phone": None,
            "salary_range": None,
            "job_description": None,
            "job_url": None,
            "email_status": "unknown",
            "whatsapp_status": "unknown",
        })

        sql.execute = AsyncMock()

        score = await recompute_lead_score(sql, "lead-456")
        assert score == 0
        assert sql.execute.called

    @pytest.mark.asyncio
    async def test_returns_zero_for_nonexistent_lead(self):
        sql = MagicMock()
        sql.acquire = MagicMock()
        sql.acquire().__aenter__ = AsyncMock(return_value=sql)
        sql.acquire().__aexit__ = AsyncMock(return_value=None)

        sql.fetchrow = AsyncMock(return_value=None)
        score = await recompute_lead_score(sql, "nonexistent")
        assert score == 0
