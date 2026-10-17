"""Server-side suppression + anti-spam guard unit tests (no live DB).

`_is_suppressed` must query the suppressions table by normalized contact and
channel, treating 'any'-channel rows as blocking both. A fake conn proves the
guard's decision logic without a database.
"""
import pytest
from scrapers.send_worker import _is_suppressed


class FakeConn:
    def __init__(self, hit):
        self._hit = hit
        self.calls = []

    async def fetchval(self, q, *args):
        self.calls.append((q, args))
        # emulate: return 1 only when the contact is actually suppressed
        return 1 if self._hit else None


@pytest.mark.asyncio
async def test_suppression_blocks_when_row_present():
    assert await _is_suppressed(FakeConn(True), "HR@Acme.com", "email") is True


@pytest.mark.asyncio
async def test_suppression_allows_when_no_row():
    assert await _is_suppressed(FakeConn(False), "ok@acme.com", "email") is False


@pytest.mark.asyncio
async def test_suppression_normalizes_contact_and_passes_channel():
    conn = FakeConn(False)
    await _is_suppressed(conn, " Priya@Acme.com ", "email")
    _, args = conn.calls[0]
    # lower-cased, trimmed contact; channel forwarded for the (channel OR 'any') match
    assert args[0] == "priya@acme.com"
    assert args[1] == "email"


@pytest.mark.asyncio
async def test_empty_contact_is_not_suppressed_and_makes_no_query():
    conn = FakeConn(True)
    assert await _is_suppressed(conn, "", "email") is False
    assert conn.calls == []  # short-circuits before touching the DB
