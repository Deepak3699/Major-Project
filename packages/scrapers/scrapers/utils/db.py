import os
import asyncpg
import logging

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def init_db(db_url: str) -> asyncpg.Pool:
    """Initialize database connection pool with the given URL."""
    pool = await asyncpg.create_pool(
        db_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    return pool


async def get_db_pool() -> asyncpg.Pool:
    """Get or create the postgres connection pool."""
    global _pool
    if _pool is None:
        db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/leads_db")
        _pool = await init_db(db_url)
    return _pool


async def close_db_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
