"""Integration tests for the scraper pipeline (SRS §4.2b, §4.6)."""
import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from scrapers.normalizer import normalize_lead, generate_fingerprint, insert_lead
from scrapers.utils.fresher_classifier import is_fresher_role


class TestFingerprintCrossPlatform:
    """Verify Python fingerprint matches TS fingerprint (SRS §4.6)."""

    def test_python_fingerprint_matches_ts_logic(self):
        """Python re.sub must match TS replace(/[^a-z0-9]/g, '')."""
        fp = generate_fingerprint("Tech Corp!", "Jr. Dev", "https://careers.tech.com/job/1")
        # Manually compute the TS equivalent
        import hashlib
        normalized_company = "techcorp"
        normalized_title = "jrdev"
        domain = "careers.tech.com"
        raw = f"{normalized_company}|{normalized_title}|{domain}"
        expected = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        assert fp == expected

    def test_fingerprint_special_chars_stripped(self):
        """Special characters in company name must be stripped, not replaced literally."""
        fp1 = generate_fingerprint("Tech Corp!", "Engineer", "https://tech.com")
        fp2 = generate_fingerprint("Tech Corp", "Engineer", "https://tech.com")
        assert fp1 == fp2, "Exclamation mark should be stripped, not kept as literal"


class TestFresherClassifier:
    """Tests for fresher classification per SRS §4.2b."""

    def test_fresher_keyword_match(self):
        assert is_fresher_role(
            "Fresher Engineer", "", "Join our team"
        ) is True

    def test_intern_keyword(self):
        assert is_fresher_role(
            "Intern", "", "Internship program"
        ) is True

    def test_entry_level(self):
        assert is_fresher_role(
            "Entry Level Developer", "", ""
        ) is True

    def test_senior_not_fresher(self):
        assert is_fresher_role(
            "Senior Architect", "10+ years", "Extensive experience required"
        ) is False

    def test_word_boundary_no_false_positive(self):
        """'internally' should not match 'intern'."""
        assert is_fresher_role(
            "Internal Tools Engineer", "", ""
        ) is False

    def test_campus_hire(self):
        assert is_fresher_role(
            "Campus Hire", "", ""
        ) is True

    def test_zero_experience(self):
        assert is_fresher_role(
            "Data Analyst", "0-1 years", ""
        ) is True

    def test_new_grad(self):
        assert is_fresher_role(
            "New Grad SDE", "", ""
        ) is True

    def test_walk_in_drive(self):
        assert is_fresher_role("Walk-in Drive Saturday", "", "") is True

    def test_off_campus(self):
        assert is_fresher_role("Off Campus Hiring", "", "") is True

    def test_apprenticeship(self):
        assert is_fresher_role("Apprentice Engineer", "", "") is True

    def test_early_career(self):
        assert is_fresher_role("Early Careers Program", "", "") is True

    def test_year_cohort(self):
        assert is_fresher_role("Hiring 2026 graduates", "", "") is True
        assert is_fresher_role("Class of 2025", "", "") is True

    def test_bare_get_not_matched(self):
        # "GET" alone would match the verb "get" — must NOT fire.
        assert is_fresher_role("Get Started Here", "", "") is False

    def test_graduate_engineer_trainee(self):
        assert is_fresher_role("Graduate Engineer Trainee", "", "") is True


class TestNormalization:
    """Tests for normalize_lead per SRS §4.4/§4.7."""

    def test_all_fields_mapped(self):
        raw = {
            "company_name": "Acme Corp",
            "about_company": "Great place",
            "hr_name": "John Doe",
            "hr_email": "john@acme.com",
            "company_email": "careers@acme.com",
            "hr_mobile": "+1234567890",
            "company_mobile": "",
            "hr_linkedin_url": "https://linkedin.com/in/johndoe",
            "job_title": "Fresher Software Engineer",
            "about_job": "Entry level position",
            "experience_required": "0-1 years",
            "salary_range": "5-8 LPA",
            "job_url": "https://acme.com/jobs/1",
            "source_site": "acmen.com",
            "scraped_at": "2026-01-01T00:00:00Z",
            "is_fresher": True,
            "raw_payload": {"test": "data"},
        }
        result = normalize_lead(raw)
        assert result["company_name"] == "Acme Corp"
        assert result["hr_name"] == "John Doe"
        assert result["hr_email"] == "john@acme.com"
        assert result["company_email"] == "careers@acme.com"
        assert result["job_title"] == "Fresher Software Engineer"
        assert result["about_job"] == "Entry level position"
        assert result["experience_required"] == "0-1 years"
        assert result["salary_range"] == "5-8 LPA"
        assert result["job_url"] == "https://acme.com/jobs/1"
        assert result["source_site"] == "acmen.com"
        assert result["is_fresher"] is True
        assert result["data_quality"] == "complete"
        assert len(result["fingerprint"]) == 64
        assert result["raw_payload"] == {"test": "data"}

    def test_fallback_company_email(self):
        raw = {
            "company_name": "Corp",
            "job_title": "Intern",
            "job_url": "https://corp.com/job",
            "company_email": "careers@corp.com",
            "source_site": "test",
            "is_fresher": True,
        }
        result = normalize_lead(raw)
        assert result["hr_email"] == "careers@corp.com"
        assert result["data_quality"] == "incomplete"

    def test_empty_company_name_still_has_fingerprint(self):
        raw = {
            "company_name": "",
            "job_title": "Intern",
            "job_url": "https://corp.com/job",
            "source_site": "test",
            "is_fresher": True,
        }
        result = normalize_lead(raw)
        assert len(result["fingerprint"]) == 64
        assert result["data_quality"] == "incomplete"


class TestInsertLead:
    """Tests for insert_lead dedup logic per SRS §4.6."""

    @pytest.mark.asyncio
    async def test_insert_deduped_returns_none_on_existing_fingerprint(self):
        sql = MagicMock()
        sql.execute = AsyncMock()
        sql.fetchrow = AsyncMock(return_value=None)

        async def fetchval_side_effect(*args, **kwargs):
            return "existing-id"  # fingerprint check returns existing within 30 days

        sql.fetchval = AsyncMock(side_effect=fetchval_side_effect)

        normalized = {
            "fingerprint": "abc123",
            "company_name": "Corp",
            "job_url": "https://corp.com/job",
            "about_company": "",
            "company_email": "",
            "hr_name": "",
            "hr_email": "",
            "hr_linkedin_url": "",
            "company_mobile": "",
            "hr_mobile": "",
            "job_title": "Engineer",
            "about_job": "",
            "experience_required": "",
            "salary_range": "",
            "source_site": "test",
            "data_quality": "incomplete",
            "is_fresher": True,
            "raw_payload": {},
        }
        result = await insert_lead(sql, normalized)
        assert result is None, "Should return None when fingerprint exists"

    @pytest.mark.asyncio
    async def test_insert_new_lead(self):
        sql = MagicMock()
        sql.execute = AsyncMock()
        sql.fetchrow = AsyncMock(return_value=None)
        sql.fetch = AsyncMock(return_value=[])

        fetchval_count = 0
        async def fetchval_side_effect(*args, **kwargs):
            nonlocal fetchval_count
            fetchval_count += 1
            call = fetchval_count
            if call == 1:
                return None  # fingerprint check → no existing within 30 days
            if call == 2:
                return None  # old_existing check → not found
            if call == 3:
                return "company-1"  # company INSERT RETURNING id
            if call == 4:
                return "job-1"  # job_posting INSERT RETURNING id
            return "lead-1"  # lead INSERT RETURNING id

        sql.fetchval = AsyncMock(side_effect=fetchval_side_effect)

        normalized = {
            "fingerprint": "new-fp",
            "company_name": "NewCorp",
            "job_url": "https://newcorp.com/job",
            "about_company": "About",
            "company_email": "careers@newcorp.com",
            "hr_name": "",
            "hr_email": "jane@newcorp.com",
            "hr_linkedin_url": "",
            "company_mobile": "",
            "hr_mobile": "",
            "job_title": "Engineer",
            "about_job": "Desc",
            "experience_required": "0-1 years",
            "salary_range": "5 LPA",
            "source_site": "test.com",
            "data_quality": "incomplete",
            "is_fresher": True,
            "raw_payload": {},
        }
        result = await insert_lead(sql, normalized)
        assert result == "lead-1"
