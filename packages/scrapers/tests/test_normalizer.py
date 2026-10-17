"""Tests for the normalizer (dedup fingerprint, fresher filtering, schema mapping, provenance)."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from scrapers.normalizer import normalize_lead, generate_fingerprint, insert_lead, _calculate_candidate_similarity


class TestNormalizeLead:
    def test_basic_normalization(self):
        raw = {
            "company_name": "Tech Corp",
            "job_title": "Fresher Software Engineer",
            "job_url": "https://careers.tech.com/job/1",
            "experience_required": "0-1 years",
            "about_job": "Entry level position for fresh graduates",
            "source_site": "remoteok.com",
            "scraped_at": "2026-01-01T00:00:00Z",
            "raw_payload": {"original": "data"},
            "hr_name": "Jane Smith",
            "hr_email": "jane@tech.com",
        }
        result = normalize_lead(raw)
        assert result["company_name"] == "Tech Corp"
        assert result["job_title"] == "Fresher Software Engineer"
        assert result["hr_name"] == "Jane Smith"
        assert result["source_site"] == "remoteok.com"
        assert result["data_quality"] == "complete"
        assert result["is_fresher"] is True
        assert len(result["fingerprint"]) == 64

    # ── India-only product correction: central geo-gate ──────────────────────
    def test_india_gate_rejects_global_source_without_signal(self):
        raw = {
            "company_name": "Tech Corp",
            "job_title": "Fresher Engineer",
            "job_url": "https://x.com/j",
            "source_site": "remoteok.com",
            "about_job": "US only, work in California",
        }
        assert normalize_lead(raw)["is_india"] is False

    def test_india_gate_accepts_positive_location(self):
        raw = {
            "company_name": "Tech Corp",
            "job_title": "Fresher Engineer",
            "job_url": "https://x.com/j",
            "source_site": "remoteok.com",
            "location": "Bengaluru, India",
        }
        assert normalize_lead(raw)["is_india"] is True

    def test_india_gate_accepts_india_native_source_blank_location(self):
        raw = {
            "company_name": "Tech Corp",
            "job_title": "Fresher Engineer",
            "job_url": "https://x.com/j",
            "source_site": "naukri.com",
            "location": "",
        }
        assert normalize_lead(raw)["is_india"] is True

    def test_india_gate_location_beats_foreign_description(self):
        # India location must win even if description mentions overseas hubs.
        raw = {
            "company_name": "Tech Corp",
            "job_title": "Fresher Engineer",
            "job_url": "https://x.com/j",
            "source_site": "glassdoor.com",
            "location": "Pune, India",
            "about_job": "support our London and Berlin teams",
        }
        assert normalize_lead(raw)["is_india"] is True

    def test_missing_hr_name_is_incomplete(self):
        raw = {
            "company_name": "Corp",
            "job_title": "Intern",
            "job_url": "https://corp.com/job",
            "source_site": "test",
        }
        result = normalize_lead(raw)
        assert result["data_quality"] == "incomplete"
        assert result["hr_name"] == ""

    def test_fresher_detection_from_keywords(self):
        raw = {
            "company_name": "Corp",
            "job_title": "Junior Developer",
            "job_url": "https://corp.com/job",
            "experience_required": "0-1 years",
            "about_job": "Entry level",
            "source_site": "test",
        }
        result = normalize_lead(raw)
        assert result["is_fresher"] is True

    def test_non_fresher_filtered_out(self):
        raw = {
            "company_name": "Corp",
            "job_title": "Senior Architect",
            "job_url": "https://corp.com/job",
            "experience_required": "10+ years",
            "about_job": "Senior role requiring extensive experience",
            "source_site": "test",
            "is_fresher": False,
        }
        result = normalize_lead(raw)
        assert result["is_fresher"] is False

    def test_fallback_to_company_contact_when_no_hr(self):
        raw = {
            "company_name": "Corp",
            "job_title": "Fresher Role",
            "job_url": "https://corp.com/job",
            "company_email": "careers@corp.com",
            "company_mobile": "+1234567890",
            "source_site": "test",
        }
        result = normalize_lead(raw)
        assert result["hr_email"] == "careers@corp.com"
        assert result["data_quality"] == "incomplete"

    def test_fingerprint_consistency(self):
        raw1 = {
            "company_name": "Same Corp",
            "job_title": "Engineer",
            "job_url": "https://careers.same.com/a",
        }
        raw2 = {
            "company_name": "Same Corp",
            "job_title": "Engineer",
            "job_url": "https://careers.same.com/b",
        }
        fp1 = normalize_lead(raw1)["fingerprint"]
        fp2 = normalize_lead(raw2)["fingerprint"]
        assert fp1 == fp2, "Same company+title+domain should produce same fingerprint"


class TestHRExtractionProvenance:
    """SRS §10.4: hr_extraction_provenance must survive normalization and be persisted."""

    def test_normalize_preserves_incoming_provenance(self):
        raw = {
            "company_name": "TestCorp",
            "job_title": "Intern",
            "job_url": "https://test.com/job",
            "hr_name": "Jane Smith",
            "hr_email": "jane@test.com",
            "hr_extraction_provenance": {
                "stages": [{
                    "stage": "direct",
                    "source": "manual",
                    "method": "test_method",
                    "confidence": 0.5,
                    "result": {"url": "https://test.com/hr"},
                }]
            },
        }
        result = normalize_lead(raw)
        prov = result.get("hr_extraction_provenance")
        assert prov is not None, "hr_extraction_provenance should be preserved"
        assert prov["stages"][0]["source"] == "manual"
        assert prov["stages"][0]["method"] == "test_method"
        assert prov["stages"][0]["result"]["url"] == "https://test.com/hr"

    def test_normalize_seeds_provenance_when_name_extracted(self):
        raw = {
            "company_name": "Corp",
            "job_title": "Intern",
            "job_url": "https://corp.com/job",
            "hr_name": "John Doe",
            "hr_email": "john@corp.com",
        }
        result = normalize_lead(raw)
        prov = result.get("hr_extraction_provenance")
        assert prov is not None, "provenance should be seeded by normalize_lead"
        assert len(prov["stages"]) >= 1

    def test_normalize_creates_provenance_when_no_name(self):
        raw = {
            "company_name": "Corp",
            "job_title": "Intern",
            "job_url": "https://corp.com/job",
        }
        result = normalize_lead(raw)
        prov = result.get("hr_extraction_provenance")
        assert prov is not None
        # hr_name_provenance from extract_hr_name_fallback always exists
        assert "stages" in prov

    @pytest.mark.asyncio
    async def test_insert_lead_persists_contact_source_from_provenance(self):
        sql = MagicMock()
        sql.execute = AsyncMock()
        sql.fetchrow = AsyncMock(return_value=None)
        sql.fetch = AsyncMock(return_value=[])

        fetchval_count = 0
        async def fetchval_side_effect(*args, **kwargs):
            nonlocal fetchval_count
            fetchval_count += 1
            if fetchval_count <= 2:
                return None  # fingerprint checks
            if fetchval_count == 3:
                return "company-1"
            if fetchval_count == 4:
                return "hr-1"  # hr_contact insert
            if fetchval_count == 5:
                return "job-1"  # job_posting insert
            return "lead-1"

        sql.fetchval = AsyncMock(side_effect=fetchval_side_effect)

        normalized = {
            "company_name": "Corp", "job_title": "Intern",
            "job_url": "https://corp.com/job", "about_company": "",
            "hr_name": "Jane Smith", "hr_email": "jane@corp.com",
            "hr_linkedin_url": "", "hr_mobile": "",
            "company_email": "", "company_mobile": "",
            "about_job": "", "experience_required": "0-1",
            "salary_range": "", "source_site": "test",
            "scraped_at": "2026-01-01T00:00:00Z",
            "fingerprint": "fp1", "data_quality": "incomplete",
            "is_fresher": True, "raw_payload": {},
            "hr_extraction_provenance": {
                "stages": [{
                    "source": "career_page",
                    "method": "regex_from_job_page",
                    "confidence": 0.9,
                    "result": {"url": "https://corp.com/careers"},
                }]
            },
        }
        await insert_lead(sql, normalized)

        for call in sql.fetchval.call_args_list:
            if "INSERT INTO hr_contacts" in str(call.args[0]):
                args = call.args
                assert args[6] == "career_page", f"contact_source: {args[6]}"
                assert args[7] == "regex_from_job_page", f"contact_method: {args[7]}"
                assert args[8] == "https://corp.com/careers", f"contact_url: {args[8]}"
                return
        pytest.fail("hr_contacts INSERT not found")

    @pytest.mark.asyncio
    async def test_insert_lead_handles_empty_provenance(self):
        sql = MagicMock()
        sql.execute = AsyncMock()
        sql.fetchrow = AsyncMock(return_value=None)
        sql.fetch = AsyncMock(return_value=[])

        fetchval_count = 0
        async def fetchval_side_effect(*args, **kwargs):
            nonlocal fetchval_count
            fetchval_count += 1
            if fetchval_count <= 2:
                return None
            if fetchval_count == 3:
                return "company-1"
            if fetchval_count == 4:
                return "hr-1"
            if fetchval_count == 5:
                return "job-1"
            return "lead-1"

        sql.fetchval = AsyncMock(side_effect=fetchval_side_effect)

        normalized = {
            "company_name": "Corp", "job_title": "Intern",
            "job_url": "https://corp.com/job", "about_company": "",
            "hr_name": "Jane Smith", "hr_email": "jane@corp.com",
            "hr_linkedin_url": "", "hr_mobile": "",
            "company_email": "", "company_mobile": "",
            "about_job": "", "experience_required": "0-1",
            "salary_range": "", "source_site": "test",
            "scraped_at": "2026-01-01T00:00:00Z",
            "fingerprint": "fp2", "data_quality": "incomplete",
            "is_fresher": True, "raw_payload": {},
            "hr_extraction_provenance": {"stages": []},
        }
        await insert_lead(sql, normalized)

        for call in sql.fetchval.call_args_list:
            if "INSERT INTO hr_contacts" in str(call.args[0]):
                args = call.args
                assert args[6] == "", f"contact_source should be empty: {args[6]}"
                assert args[7] == "", f"contact_method should be empty: {args[7]}"
                assert args[8] == "", f"contact_url should be empty: {args[8]}"
                return
        pytest.fail("hr_contacts INSERT not found")

    @pytest.mark.asyncio
    async def test_insert_lead_handles_missing_provenance(self):
        sql = MagicMock()
        sql.execute = AsyncMock()
        sql.fetchrow = AsyncMock(return_value=None)
        sql.fetch = AsyncMock(return_value=[])

        fetchval_count = 0
        async def fetchval_side_effect(*args, **kwargs):
            nonlocal fetchval_count
            fetchval_count += 1
            if fetchval_count <= 2:
                return None
            if fetchval_count == 3:
                return "company-1"
            if fetchval_count == 4:
                return "hr-1"
            if fetchval_count == 5:
                return "job-1"
            return "lead-1"

        sql.fetchval = AsyncMock(side_effect=fetchval_side_effect)

        normalized = {
            "company_name": "Corp", "job_title": "Intern",
            "job_url": "https://corp.com/job", "about_company": "",
            "hr_name": "Jane Smith", "hr_email": "jane@corp.com",
            "hr_linkedin_url": "", "hr_mobile": "",
            "company_email": "", "company_mobile": "",
            "about_job": "", "experience_required": "0-1",
            "salary_range": "", "source_site": "test",
            "scraped_at": "2026-01-01T00:00:00Z",
            "fingerprint": "fp3", "data_quality": "incomplete",
            "is_fresher": True, "raw_payload": {},
        }
        await insert_lead(sql, normalized)

        for call in sql.fetchval.call_args_list:
            if "INSERT INTO hr_contacts" in str(call.args[0]):
                args = call.args
                assert args[6] == "", f"contact_source should be empty: {args[6]}"
                assert args[7] == "", f"contact_method should be empty: {args[7]}"
                return
        pytest.fail("hr_contacts INSERT not found")

    @pytest.mark.asyncio
    async def test_insert_lead_picks_first_valid_url_from_multi_stage(self):
        sql = MagicMock()
        sql.execute = AsyncMock()
        sql.fetchrow = AsyncMock(return_value=None)
        sql.fetch = AsyncMock(return_value=[])

        fetchval_count = 0
        async def fetchval_side_effect(*args, **kwargs):
            nonlocal fetchval_count
            fetchval_count += 1
            if fetchval_count <= 2:
                return None
            if fetchval_count == 3:
                return "company-1"
            if fetchval_count == 4:
                return "hr-1"
            if fetchval_count == 5:
                return "job-1"
            return "lead-1"

        sql.fetchval = AsyncMock(side_effect=fetchval_side_effect)

        normalized = {
            "company_name": "Corp", "job_title": "Intern",
            "job_url": "https://corp.com/job", "about_company": "",
            "hr_name": "Jane Smith", "hr_email": "jane@corp.com",
            "hr_linkedin_url": "", "hr_mobile": "",
            "company_email": "", "company_mobile": "",
            "about_job": "", "experience_required": "0-1",
            "salary_range": "", "source_site": "test",
            "scraped_at": "2026-01-01T00:00:00Z",
            "fingerprint": "fp4", "data_quality": "incomplete",
            "is_fresher": True, "raw_payload": {},
            "hr_extraction_provenance": {
                "stages": [
                    {"source": "whois", "method": "domain_whois", "confidence": 0.3, "result": {}},
                    {"source": "career_page", "method": "regex_from_career_page", "confidence": 0.8,
                     "result": {"url": "https://corp.com/team/jane"}},
                ]
            },
        }
        await insert_lead(sql, normalized)

        for call in sql.fetchval.call_args_list:
            if "INSERT INTO hr_contacts" in str(call.args[0]):
                args = call.args
                assert args[6] == "whois", f"contact_source should be first stage: {args[6]}"
                assert args[7] == "domain_whois", f"contact_method should be first stage: {args[7]}"
                assert args[8] == "https://corp.com/team/jane", f"contact_url from second stage: {args[8]}"
                return
        pytest.fail("hr_contacts INSERT not found")


class TestGenerateFingerprint:
    def test_deterministic(self):
        fp1 = generate_fingerprint("Tech", "Engineer", "https://tech.com/a")
        fp2 = generate_fingerprint("Tech", "Engineer", "https://tech.com/b")
        assert fp1 == fp2

    def test_different_company(self):
        fp1 = generate_fingerprint("Tech", "Engineer", "https://tech.com")
        fp2 = generate_fingerprint("Corp", "Engineer", "https://corp.com")
        assert fp1 != fp2

    def test_different_domain(self):
        fp1 = generate_fingerprint("Tech", "Engineer", "https://tech.com")
        fp2 = generate_fingerprint("Tech", "Engineer", "https://other.com")
        assert fp1 != fp2


class TestCandidateSimilarity:
    def test_distinct_companies_identical_title_low_similarity(self):
        sim = _calculate_candidate_similarity(
            "T-Mobile", "Software Engineering Intern", "https://careers.t-mobile.com/job/1",
            "PwC", "Software Engineering Intern", "https://jobs.pwc.com/job/2"
        )
        assert sim < 0.85
        assert sim <= 0.5

    def test_same_company_identical_title_high_similarity(self):
        sim = _calculate_candidate_similarity(
            "T-Mobile", "Software Engineering Intern", "https://careers.t-mobile.com/job/1",
            "T-Mobile", "Software Engineering Intern", "https://careers.t-mobile.com/job/2"
        )
        assert sim == 1.0

