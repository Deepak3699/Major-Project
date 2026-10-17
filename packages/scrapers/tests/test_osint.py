"""Offline unit tests for the OSINT email module (no network)."""

from scrapers.utils.osint import (
    _name_parts,
    generate_email_candidates,
    infer_pattern_from_sample,
    _render,
)


def test_name_parts_single_two_three_tokens():
    assert _name_parts("Priya Sharma") == {"first": "priya", "middle": "", "last": "sharma"}
    assert _name_parts("Rahul K Verma")["first"] == "rahul"
    assert _name_parts("Rahul K Verma")["last"] == "verma"
    assert _name_parts("Madonna")["first"] == "madonna"
    assert _name_parts("")["first"] == ""


def test_generate_candidates_ordering_and_dedup():
    cands = generate_email_candidates("Priya Sharma", "acme.co.in")
    assert cands[0] == "priya.sharma@acme.co.in"  # most-prevalent first
    assert "priyasharma@acme.co.in" in cands
    assert "psharma@acme.co.in" in cands
    assert len(cands) == len(set(cands))  # deduped


def test_generate_requires_name_and_domain():
    assert generate_email_candidates("", "acme.co.in") == []
    assert generate_email_candidates("Priya Sharma", "") == []


def test_infer_pattern_from_sample():
    assert infer_pattern_from_sample("priya.sharma@acme.co.in", "acme.co.in", "Priya", "Sharma") == "{first}.{last}"
    assert infer_pattern_from_sample("psharma@acme.co.in", "acme.co.in", "Priya", "Sharma") == "{first[0]}{last}"
    # format not in the known set → None (caller falls back to common patterns)
    assert infer_pattern_from_sample("weird@acme.co.in", "acme.co.in", "Priya", "Sharma") is None


def test_render_handles_short_name_without_crash():
    parts = _name_parts("Al")  # first='al', last=''
    # last[0] slicing on empty must not raise
    assert _render("{first}.{last[0]}", parts) is not None


def test_mobile_e164_normalization():
    from scrapers.utils.career_page_extractor import normalize_mobile_e164 as n
    for variant in ("+91 98765 43210", "09876543210", "9876543210",
                    "0091-98765-43210", "919876543210", "+919876543210"):
        assert n(variant) == "+919876543210", variant
    # landline, too-short, bad mobile prefix, empty all rejected (never fabricate)
    for bad in ("(0471) 234 5678", "12345", "5876543210", ""):
        assert n(bad) == "", bad
