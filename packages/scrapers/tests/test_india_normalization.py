"""India normalization (§54): ATS hosts never become employer domains,
corporate suffixes slug cleanly, all states/UTs gate correctly."""
from scrapers.utils.india_filter import (
    derive_company_domain, is_india_relevant,
)


def _lead(location="", about="", source="bamboohr.com/acme"):
    return {"location": location, "about_job": about, "source_site": source}


class TestAtsHostsNeverBecomeEmployerDomain:
    def test_bamboohr_board_url(self):
        assert derive_company_domain(
            "Acme", "https://acme.bamboohr.com/careers/15") != "bamboohr.com"

    def test_personio_board_url(self):
        assert derive_company_domain(
            "Acme", "https://acme.jobs.personio.com/?posting=9") != "jobs.personio.com"

    def test_greenhouse_board_url(self):
        assert derive_company_domain(
            "Acme", "https://boards.greenhouse.io/acme/jobs/1") != "greenhouse.io"

    def test_lever_board_url(self):
        assert derive_company_domain(
            "Acme", "https://jobs.lever.co/acme/abc") != "lever.co"


class TestCorporateSuffixes:
    def test_private_limited(self):
        assert derive_company_domain("Acme Private Limited", "") == "acme.com"

    def test_llp(self):
        assert derive_company_domain("Acme Consulting LLP", "") == "acmeconsulting.com"

    def test_limited(self):
        assert derive_company_domain("Acme Limited", "") == "acme.com"

    def test_pvt_ltd_dotted(self):
        assert derive_company_domain("Acme Pvt. Ltd.", "") == "acme.com"


class TestStateCoverage:
    def test_northeast_states_pass(self):
        assert is_india_relevant(_lead(location="Guwahati, Assam")) is True
        assert is_india_relevant(_lead(location="Shillong")) is True

    def test_uts_pass(self):
        assert is_india_relevant(_lead(location="Puducherry")) is True
        assert is_india_relevant(_lead(location="Jammu")) is True

    def test_foreign_still_rejected(self):
        assert is_india_relevant(_lead(location="Berlin, Germany")) is False
        assert is_india_relevant(_lead(location="Mayfair, London")) is False


class TestCanonicalCompanyKey:
    def test_suffix_variants_match(self):
        from scrapers.utils.india_filter import canonical_company_key as k
        assert k("Adani Group") == k("Adani")
        assert k("Acme Private Limited") == k("Acme Pvt Ltd")
        assert k("Acme Solutions Private Limited") == k("Acme")

    def test_distinct_companies_stay_distinct(self):
        from scrapers.utils.india_filter import canonical_company_key as k
        assert k("Tata Motors") != k("Tata Steel")
        assert k("Infosys") != k("Wipro")

    def test_empty_safe(self):
        from scrapers.utils.india_filter import canonical_company_key as k
        assert k("") == "" and k(None) == ""
