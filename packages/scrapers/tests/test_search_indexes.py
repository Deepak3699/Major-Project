"""Track 4: fuzzy-search indexes exist and the planner uses them.

pg_trgm GIN indexes serve the leads/contacts ILIKE '%term%' filters.
"""
import pytest

pytestmark = pytest.mark.asyncio

EXPECTED = {
    "idx_companies_name_trgm",
    "idx_companies_domain_trgm",
    "idx_jobposting_title_trgm",
    "idx_hrcontacts_name_trgm",
    "idx_hrcontacts_email_trgm",
}


async def test_all_search_indexes_exist(db_pool):
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT indexname FROM pg_indexes WHERE schemaname='public'"
        )
        have = {r["indexname"] for r in rows}
    assert EXPECTED.issubset(have), f"missing: {EXPECTED - have}"


async def test_company_name_filter_uses_trgm_index(db_pool):
    async with db_pool.acquire() as conn:
        # Empty tables seq-scan correctly; force the planner's hand to prove
        # the trigram index CAN serve the ILIKE filter (same transaction —
        # SET LOCAL does not survive across implicit transactions).
        async with conn.transaction():
            await conn.execute("SET LOCAL enable_seqscan = off")
            plan = await conn.fetch(
                "EXPLAIN SELECT * FROM companies WHERE name ILIKE '%acme%'"
            )
        text = "\n".join(r["QUERY PLAN"] for r in plan)
    assert "idx_companies_name_trgm" in text, f"planner ignored trigram index:\n{text}"
