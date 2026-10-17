import json
import asyncio
import logging
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

from scrapers.normalizer import normalize_lead

async def get_redis_connection():
    import os
    import redis.asyncio as redis
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6380")
    return redis.from_url(redis_url, decode_responses=True)


class NormalizerPipeline:
    """SRS §4.2c: Normalize + deduplicate scraped items before queuing."""

    def process_item(self, item, spider):
        normalized = normalize_lead(dict(item))
        if normalized["fingerprint"]:
            # Enqueue to Redis
            asyncio.create_task(self._enqueue(normalized))
        return normalized

    async def _enqueue(self, normalized):
        try:
            r = await get_redis_connection()
            await r.lpush("raw_leads_queue:requests", json.dumps(normalized))
            await r.close()
        except Exception as e:
            logger.warning(f"Failed to enqueue lead: {e}")
