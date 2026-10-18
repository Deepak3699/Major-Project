import os
import redis.asyncio as redis

_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis | None:
    """Get or create the Redis client (singleton)."""
    global _redis_client
    if _redis_client is None:
        url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        if url == "memory" or not url.startswith(("redis://", "rediss://")):
            return None
        try:
            _redis_client = redis.from_url(
                url,
                max_connections=20,
                retry_on_timeout=True,
                socket_connect_timeout=10,
                socket_timeout=None,
                socket_keepalive=True,
                health_check_interval=30,
            )
        except Exception:
            return None
    return _redis_client


async def close_redis():
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
