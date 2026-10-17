import os
import redis.asyncio as redis

_redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Get or create the Redis client (singleton)."""
    global _redis_client
    if _redis_client is None:
        url = os.environ.get("REDIS_URL", "redis://localhost:6379")
        # Root-cause fix for the worker crash-loop: the queue consumers block on
        # brpop(timeout=10..30). redis-py's default socket_timeout is shorter than
        # that, so every blocking read raised TimeoutError and crash-looped every
        # worker. Disabling the socket read timeout for this client (the blocking
        # commands already cap themselves via their own timeout) plus a periodic
        # health check keeps idle connections alive and reconnects dead ones.
        _redis_client = redis.from_url(
            url,
            max_connections=20,
            retry_on_timeout=True,
            socket_connect_timeout=10,
            socket_timeout=None,
            socket_keepalive=True,
            health_check_interval=30,
        )
    return _redis_client


async def close_redis():
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
