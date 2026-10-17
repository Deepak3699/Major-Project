"""Offline tests for the LinkedIn OSINT pure helpers (the anti-wrong-person gates)."""

from scrapers.utils.linkedin_osint import (
    slug_to_name,
    name_similarity,
    company_in_text,
)


def test_slug_to_name_strips_linkedin_id_suffix():
    assert slug_to_name("priya-sharma-2a9b1c14") == "Priya Sharma"
    assert slug_to_name("rahul-verma") == "Rahul Verma"
    assert slug_to_name("john-alexander-smith") == "John Alexander Smith"


def test_slug_to_name_drops_generic_and_nonascii():
    assert slug_to_name("in") == ""
    assert slug_to_name("company") == ""
    # non-ascii trailing tokens are cut, name still usable
    assert slug_to_name("priya-sharma-प्रिया").startswith("Priya")


def test_name_similarity_is_order_insensitive_and_rejects_strangers():
    assert name_similarity("Priya Sharma", "Sharma Priya") > 0.9
    assert name_similarity("Priya Sharma", "priya  sharma") > 0.9
    # the whole point: a different person must NOT pass a realistic threshold
    assert name_similarity("Priya Sharma", "Rahul Verma") < 0.4
    assert name_similarity("Priya Sharma", "") == 0.0


def test_name_similarity_tolerates_middle_initial():
    assert name_similarity("Priya K Sharma", "Priya Sharma") > 0.7


def test_company_in_text_matches_root_token_not_suffix_noise():
    assert company_in_text("Acme Technologies Pvt Ltd", "Works at Acme") is True
    assert company_in_text("Globex India", "engineer at globex, bengaluru") is True
    assert company_in_text("Acme", "unrelated headline about fintech") is False
    assert company_in_text("", "anything") is False
    assert company_in_text("Acme", "") is False
