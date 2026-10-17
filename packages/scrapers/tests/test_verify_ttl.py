"""Scenario 9: verification expires and forces re-verify (no immortal 'valid')."""
from datetime import datetime, timedelta, timezone

from scrapers.verify_send_worker import is_verification_stale

NOW = datetime(2026, 9, 14, tzinfo=timezone.utc)


def test_missing_verification_is_stale():
    assert is_verification_stale(None, 30, NOW) is True


def test_fresh_verification_is_not_stale():
    assert is_verification_stale(NOW - timedelta(days=1), 30, NOW) is False


def test_old_verification_is_stale():
    assert is_verification_stale(NOW - timedelta(days=31), 30, NOW) is True


def test_boundary_is_not_stale():
    assert is_verification_stale(NOW - timedelta(days=30), 30, NOW) is False


def test_naive_timestamp_fails_safe_to_stale():
    assert is_verification_stale(NOW.replace(tzinfo=None), 30, NOW) is True
