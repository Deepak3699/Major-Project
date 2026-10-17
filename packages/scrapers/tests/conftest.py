"""Shared DB/Redis fixtures for the real integration + worker tests.

These spin up against live PostgreSQL (DB_URL) and Redis (REDIS_URL), reload the
authoritative schema from packages/api/database/schema (split by concern), and are hermetic per test (drop +
recreate schema, flush redis). No mocks for the database or queue.
"""
import glob
import os
import re

import asyncpg
import pytest_asyncio
import redis.asyncio as redis

DB_URL = os.environ.get("DB_URL", "postgresql://postgres:postgres@localhost:5432/leads_db_test")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/1")

# NEVER wipe the shared dev/prod databases. Integration fixtures DROP SCHEMA —
# running them against leads_db destroyed real data once (2026-09-14). Fail fast.
_FORBIDDEN_DBS = {"leads_db", "n8n", "postgres"}
_db_name = (DB_URL.rsplit("/", 1)[-1] or "").split("?")[0]
assert _db_name not in _FORBIDDEN_DBS, (
    f"Refusing to run destructive integration tests against database '{_db_name}'. "
    "Use leads_db_test (default)."
)

SCHEMA_DIR = os.environ.get(
    "SCHEMA_DIR",
    "/home/rajat/Downloads/sales-agent/packages/api/database/schema",
)

# Apply in strict dependency order (matches schema/utils/apply_schema.sh):
# tables -> constraints -> functions -> triggers -> indexes.
_SCHEMA_SUBDIRS = ["tables", "constraints", "functions", "triggers", "indexes"]


def _split_statements(sql: str) -> list[str]:
    """Split SQL into statements WITHOUT breaking dollar-quoted bodies.

    A naive .split(';') corrupts `DO $$ BEGIN ...; ... END $$;` blocks (the
    internal semicolons), which silently skipped our CHECK constraints in the
    test DB. This walker tracks dollar-quote and single-quote state and only
    breaks on a top-level ';'.
    """
    stmts: list[str] = []
    buf: list[str] = []
    i, n = 0, len(sql)
    dollar_tag = None
    in_single = False
    while i < n:
        ch = sql[i]
        if dollar_tag is None and not in_single:
            if sql.startswith("--", i):
                j = sql.find("\n", i)
                i = n if j == -1 else j + 1
                continue
            m = re.match(r"\$[A-Za-z_0-9]*\$", sql[i:])
            if m:
                dollar_tag = m.group(0)
                buf.append(dollar_tag)
                i += len(dollar_tag)
                continue
            if ch == "'":
                in_single = True
            if ch == ";":
                stmts.append("".join(buf))
                buf = []
                i += 1
                continue
        elif dollar_tag is not None:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
                continue
        else:  # in_single
            if ch == "'":
                if sql.startswith("''", i):
                    buf.append("''")
                    i += 2
                    continue
                in_single = False
        buf.append(ch)
        i += 1
    if "".join(buf).strip():
        stmts.append("".join(buf))
    return [s for s in (x.strip() for x in stmts) if s]


def _load_schema() -> list[str]:
    """Return every schema statement across the concern subdirs, in order."""
    statements: list[str] = []
    for sub in _SCHEMA_SUBDIRS:
        for path in sorted(glob.glob(os.path.join(SCHEMA_DIR, sub, "*.sql"))):
            with open(path) as f:
                statements.extend(_split_statements(f.read()))
    return statements


@pytest_asyncio.fixture
async def db_pool():
    pool = await asyncpg.create_pool(DB_URL, min_size=1, max_size=5, command_timeout=30)
    async with pool.acquire() as conn:
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        for stmt in _load_schema():
            await conn.execute(stmt)
    yield pool
    async with pool.acquire() as conn:
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    await pool.close()


@pytest_asyncio.fixture
async def redis_client():
    os.environ["ENCRYPTION_SECRET"] = "0" * 64
    client = redis.from_url(REDIS_URL, decode_responses=True)
    await client.flushdb()
    yield client
    await client.flushdb()
    await client.close()
