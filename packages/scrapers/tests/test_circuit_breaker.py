"""Tests for the circuit breaker (Python version, SRS §9.2)."""
import time
import pytest
from scrapers.base import CircuitBreaker


class TestCircuitBreaker:
    def test_closed_initially(self):
        cb = CircuitBreaker("test_source", failure_threshold=3, cooldown_seconds=60)
        assert cb.is_open() is False

    def test_opens_after_threshold(self):
        cb = CircuitBreaker("test_source", failure_threshold=3, cooldown_seconds=60)
        cb.record_failure("error1")
        cb.record_failure("error2")
        assert cb.is_open() is False
        cb.record_failure("error3")
        assert cb.is_open() is True

    def test_closes_on_success(self):
        cb = CircuitBreaker("test_source", failure_threshold=5, cooldown_seconds=60)
        cb.record_failure("error")
        cb.record_success()
        assert cb.is_open() is False
        assert cb.failure_count == 0

    def test_half_open_after_cooldown(self):
        cb = CircuitBreaker("test_source", failure_threshold=3, cooldown_seconds=1)
        cb.record_failure("e1")
        cb.record_failure("e2")
        cb.record_failure("e3")
        assert cb.is_open() is True
        time.sleep(1.1)
        assert cb.is_open() is False

    def test_reset(self):
        cb = CircuitBreaker("test_source", failure_threshold=3, cooldown_seconds=60)
        cb.record_failure("e1")
        cb.record_failure("e2")
        cb.reset()
        assert cb.is_open() is False
        assert cb.failure_count == 0
