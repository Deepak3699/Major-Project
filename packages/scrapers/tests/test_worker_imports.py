"""Tests verifying worker modules can be imported and basic functions work (SRS §9.1, §5.2, §6, §7, §8)."""
import pytest


class TestWorkerImports:
    """Verify all worker modules can be imported without ImportError (SRS §9.1)."""

    def test_enrichment_worker_imports(self):
        """enrichment_worker.py must import successfully (SRS §5.2)."""
        from scrapers.enrichment_worker import (
            call_contactout,
            call_snovio,
            run_osint_enrichment,
            process_enrichment_job,
            consume_enrichment_queue,
            handle_enrichment_job,
        )
        assert callable(call_contactout)
        assert callable(call_snovio)
        assert callable(run_osint_enrichment)
        assert callable(process_enrichment_job)
        assert callable(consume_enrichment_queue)
        assert callable(handle_enrichment_job)

    def test_enrichment_worker_scoring_import(self):
        """Verify recompute_lead_score is accessible from correct import path."""
        from scrapers.enrichment_worker import recompute_lead_score
        assert callable(recompute_lead_score)

    def test_enrichment_worker_crypto_import(self):
        """Verify decrypt_api_key is accessible from correct import path."""
        from scrapers.crypto_utils.decrypt import decrypt_api_key
        assert callable(decrypt_api_key)

    def test_verification_worker_imports(self):
        """verification_worker.py must import successfully (SRS §6)."""
        from scrapers.verification_worker import (
            verify_email_reacher,
            verify_whatsapp,
            process_verification_job,
            consume_verification_queue,
        )
        assert callable(verify_email_reacher)
        assert callable(verify_whatsapp)
        assert callable(process_verification_job)
        assert callable(consume_verification_queue)

    def test_draft_worker_imports(self):
        """draft_worker.py must import successfully (SRS §7)."""
        from scrapers.draft_worker import (
            generate_template_draft,
            generate_gemini_drafts,
            process_draft_job,
            consume_draft_queue,
        )
        assert callable(generate_template_draft)
        assert callable(generate_gemini_drafts)
        assert callable(process_draft_job)
        assert callable(consume_draft_queue)

    def test_send_worker_imports(self):
        """send_worker.py must import successfully (SRS §8)."""
        from scrapers.send_worker import (
            send_email,
            send_whatsapp,
            process_send_job,
            consume_send_queue,
        )
        assert callable(send_email)
        assert callable(send_whatsapp)
        assert callable(process_send_job)
        assert callable(consume_send_queue)

    def test_verify_send_worker_imports(self):
        """verify_send_worker.py must import successfully (SRS §8)."""
        from scrapers.verify_send_worker import (
            process_verify_and_send_job,
            consume_verify_send_queue,
        )
        assert callable(process_verify_and_send_job)
        assert callable(consume_verify_send_queue)

    def test_normalizer_imports(self):
        """normalizer.py must import successfully (SRS §4.6)."""
        from scrapers.normalizer import (
            normalize_lead,
            generate_fingerprint,
            insert_lead,
            run_normalizer,
            process_batch,
            run_holehe_check,
            search_linkedin_profile,
            fallback_hr_cascade,
            enrich_hr_data,
        )
        assert callable(normalize_lead)
        assert callable(generate_fingerprint)
        assert callable(insert_lead)
        assert callable(run_normalizer)
        assert callable(process_batch)
        assert callable(run_holehe_check)
        assert callable(search_linkedin_profile)
        assert callable(fallback_hr_cascade)
        assert callable(enrich_hr_data)

    def test_base_scraper_imports(self):
        """base.py must import successfully (SRS §9.2/§9.3/§9.4/§13)."""
        from scrapers.base import (
            BaseScraper,
            ScraperError,
            SourceBlockedError,
            ScrapingError,
            CircuitBreaker,
            get_robot_checker,
        )
        assert BaseScraper
        assert ScraperError
        assert SourceBlockedError
        assert ScrapingError
        assert CircuitBreaker
        assert callable(get_robot_checker)

    def test_scoring_client_imports(self):
        """scoring_client.py must import successfully (SRS §5.1 Python mirror)."""
        from scrapers.api_utils.scoring_client import (
            calculate_score,
            recompute_lead_score,
        )
        assert callable(calculate_score)
        assert callable(recompute_lead_score)

    def test_all_workers_have_consume_function(self):
        """Every worker must have a consume_* function per SRS §9.1 (queue-based isolation)."""
        from scrapers.scrape_consumer import consume_scrape_queue
        from scrapers.normalizer import run_normalizer
        from scrapers.enrichment_worker import consume_enrichment_queue
        from scrapers.verification_worker import consume_verification_queue
        from scrapers.draft_worker import consume_draft_queue
        from scrapers.send_worker import consume_send_queue
        from scrapers.verify_send_worker import consume_verify_send_queue

        for fn in [consume_scrape_queue, run_normalizer, consume_enrichment_queue,
                   consume_verification_queue, consume_draft_queue, consume_send_queue,
                   consume_verify_send_queue]:
            assert callable(fn)

    def test_main_starts_all_consumers(self):
        """Verify main.py start_consumers starts all 6 workers (SRS §9.1)."""
        import inspect
        import main as main_module
        source = inspect.getsource(main_module)
        assert "consume_scrape_queue" in source
        assert "run_normalizer" in source
        assert "consume_enrichment_queue" in source
        assert "consume_verification_queue" in source
        assert "consume_draft_queue" in source
        assert "consume_send_queue" in source
        assert "consume_verify_send_queue" in source

    def test_scrraper_map_has_16_sources(self):
        """Verify SCRAPER_MAP has all 16 sources (SRS §4.3/§16.1)."""
        from scrapers.scrape_consumer import SCRAPER_MAP
        expected = {
            "remoteok", "arbeitnow", "remotive", "github_jobs",
            "adzuna", "jooble", "usajobs", "greenhouse", "lever",
            "workday", "smartrecruiters", "duckduckgo",
            "reddit", "twitter", "telegram",
        }
        assert expected.issubset(set(SCRAPER_MAP.keys())), f"Missing: {expected - set(SCRAPER_MAP.keys())}"

    def test_base_scraper_has_robots_check(self):
        """Verify BaseScraper has robots.txt check method (SRS §13)."""
        from scrapers.base import BaseScraper
        assert hasattr(BaseScraper, "_check_robots_txt")

    def test_draft_worker_has_template_fallback(self):
        """Verify draft_worker has template-based fallback (SRS §9.8)."""
        from scrapers.draft_worker import generate_template_draft
        result = generate_template_draft({
            "company_name": "TestCorp",
            "job_title": "Fresher Engineer",
            "about_company": "",
            "about_job": "",
            "hr_name": "John",
            "salary_range": "",
            "job_url": "https://test.com/job/1",
            "source_site": "test.com",
        })
        assert "email_draft" in result
        assert "whatsapp_draft" in result
        assert "generated_by" in result
        assert result["generated_by"] == "template-fallback"
        assert "TestCorp" in result["email_draft"]["body"]
        assert "Fresher Engineer" in result["email_draft"]["body"]
        assert "HireGen" in result["email_draft"]["body"]
        assert result["whatsapp_draft"]["body"] != ""
