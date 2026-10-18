import os
import json
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import uuid

# Load root .env when running locally outside of Docker
for env_candidate in [os.path.join(os.path.dirname(__file__), "..", "..", ".env"), ".env"]:
    if os.path.exists(env_candidate):
        try:
            with open(env_candidate, "r", encoding="utf-8") as _f:
                for _line in _f:
                    _line = _line.strip()
                    if _line and not _line.startswith("#") and "=" in _line:
                        _k, _v = _line.split("=", 1)
                        _k = _k.strip()
                        _v = _v.strip().strip("'\"")
                        if _k not in os.environ:
                            os.environ[_k] = _v
        except Exception:
            pass

from scrapers.utils.redis import get_redis
from scrapers.utils.db import get_db_pool

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Take It Scraper Fleet API",
    description="Python worker service for scraping, enrichment, verification, and AI drafting",
    version="0.1.0",
)

# Shared asyncpg pool captured at startup so the on-demand /army/run sweep can
# query under-enriched leads without creating a second pool.
_db_pool = None


class ScrapeRequest(BaseModel):
    sources: Optional[list[str]] = None
    run_type: str = "auto"
    triggered_by: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    services: dict


@app.get("/health", response_model=HealthResponse)
async def health():
    redis_ok = bool(get_redis())
    try:
        db_pool = await get_db_pool()
        db_ok = bool(db_pool)
    except Exception:
        db_ok = False
    return HealthResponse(
        status="ok",
        services={
            "redis": "configured" if redis_ok else "down",
            "database": "configured" if db_ok else "down",
            "scrapers": [
                "remoteok", "arbeitnow", "remotive", "github_jobs",
                "greenhouse", "lever", "adzuna", "jooble",
                "usajobs", "workday", "smartrecruiters", "ashby",
                "recruitee", "teamtailor", "breezy",
                "duckduckgo", "reddit", "twitter", "telegram",
            ],
        },
    )


@app.get("/scrapers")
async def list_scrapers():
    from scrapers.scrape_consumer import SCRAPER_MAP, DEFAULT_SOURCES

    return {
        "available": [
            {"name": name, "module": mod, "tier": _get_tier(name)}
            for name, (mod, _) in SCRAPER_MAP.items()
        ],
        "active": DEFAULT_SOURCES,
    }


def _get_tier(name: str) -> int:
    tier_map = {
        "remoteok": 1, "arbeitnow": 1, "remotive": 1, "github_jobs": 1,
        "adzuna": 1, "jooble": 1, "usajobs": 1,
        "greenhouse": 3, "lever": 3, "workday": 3, "smartrecruiters": 3,
        "ashby": 3, "recruitee": 3, "teamtailor": 3, "breezy": 3,
        "linkedin": 2, "naukri": 2, "internshala": 2, "indeed": 2,
        "foundit": 2, "instahyre": 2, "freshersworld": 2,
        "angelist": 2, "glassdoor": 2, "shine": 2, "cutshort": 2,
        "duckduckgo": 4, "reddit": 4, "twitter": 4, "telegram": 4,
        "facebook": 4, "college": 4,
        "apna": 2, "workindia": 2, "hirist": 2, "classicjobs": 2,
    }
    return tier_map.get(name, 3)


@app.post("/scrape/trigger")
async def trigger_scrape(req: ScrapeRequest):
    redis_client = get_redis()
    run_id = str(uuid.uuid4())
    await redis_client.lpush(
        "scrape_queue:requests",
        json.dumps({
            "run_id": run_id,
            "run_type": req.run_type,
            "sources": req.sources,
            "triggered_by": req.triggered_by,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
        }),
    )
    return {"message": "Scrape job queued", "run_id": run_id}


@app.get("/army/status")
async def army_status():
    """Queue depths for every pipeline stage — drives the frontend live status."""
    redis_client = get_redis()
    async def llen(k):
        try:
            return await redis_client.llen(k)
        except Exception:  # noqa: BLE001
            return -1
    return {
        "raw": await llen("raw_leads_queue:requests"),
        "enrichment": await llen("enrichment_queue:requests"),
        "verification": await llen("verification_queue:requests"),
        "draft": await llen("draft_queue:requests"),
    }


@app.post("/army/run")
async def army_run(req: ScrapeRequest):
    """One-click army: enqueue a full-fleet scrape AND an immediate
    re-enrichment sweep so leads already in the DB but missing contacts get the
    fallback cascade retried now (not just at the next daily tick). Scraping and
    the sweep are independent; chaining handles enrich→verify→draft after.
    """
    redis_client = get_redis()
    run_id = str(uuid.uuid4())
    sources = req.sources
    if not sources:
        # No explicit list: honor the Settings source toggles (None = all).
        try:
            from scrapers.scheduler import load_enabled_sources
            sources = await load_enabled_sources(_db_pool)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"source toggles unreadable, using defaults: {e}")
            sources = None
    await redis_client.lpush(
        "scrape_queue:requests",
        json.dumps({
            "run_id": run_id,
            "run_type": "manual",
            "sources": sources,
            "triggered_by": req.triggered_by,
            "triggered_at": datetime.now(timezone.utc).isoformat(),
        }),
    )
    swept = 0
    try:
        from scrapers.scheduler import sweep_unenriched
        swept = await sweep_unenriched(redis_client, _db_pool)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"army sweep failed (scrape still queued): {e}")
    return {"message": "Army run queued", "run_id": run_id, "sweep_reenqueued": swept}


@app.on_event("startup")
async def startup_event():
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Friendly diagnostic banner
    print("\n" + "=" * 68)
    print("🚀 \033[1;36mTake It — Scraper Fleet & Background Workers Started!\033[0m")
    print("=" * 68)
    print("  • \033[1mWorkers API:\033[0m   http://localhost:8000")
    print("  • \033[1mHealth Check:\033[0m  http://localhost:8000/health")

    try:
        r = get_redis()
        await r.ping()
        print("  • \033[1mRedis:\033[0m         \033[32m✅ Connected (Queue workers active)\033[0m")
    except Exception:
        print("  • \033[1mRedis:\033[0m         \033[33m⚠️ Not connected (Port 6379)\033[0m")
        print("    \033[90m-> Notice: Queue consumers paused. Start Redis or configure REDIS_URL in .env\033[0m")

    try:
        pool = await get_db_pool()
        if pool:
            print("  • \033[1mPostgreSQL:\033[0m    \033[32m✅ Connected\033[0m")
        else:
            print("  • \033[1mPostgreSQL:\033[0m    \033[33m⚠️ Not connected\033[0m")
    except Exception:
        print("  • \033[1mPostgreSQL:\033[0m    \033[33m⚠️ Not connected (Check DATABASE_URL in .env)\033[0m")

    print("=" * 68 + "\n")
    asyncio.create_task(start_consumers())


@app.on_event("shutdown")
async def shutdown_event():
    pass


async def start_consumers():
    """Start background queue consumers per SRS §9.1."""
    from scrapers.scrape_consumer import consume_scrape_queue
    from scrapers.normalizer import run_normalizer
    from scrapers.enrichment_worker import consume_enrichment_queue
    from scrapers.verification_worker import consume_verification_queue
    from scrapers.draft_worker import consume_draft_queue
    from scrapers.send_worker import consume_send_queue
    from scrapers.verify_send_worker import consume_verify_send_queue
    from scrapers.scheduler import daily_scrape_scheduler

    redis_client = get_redis()

    try:
        db_pool = await get_db_pool()
    except Exception:
        db_pool = None
    global _db_pool
    _db_pool = db_pool

    tasks = []
    if redis_client:
        # Crash recovery first: jobs stranded in :processing lists (worker died
        # between pop and ack) go back to their queues before consumers start.
        try:
            from scrapers.queue import reclaim_processing, dlq_depth
            reclaimed = await reclaim_processing(redis_client, [
                "scrape_queue:requests", "raw_leads_queue:requests",
                "enrichment_queue:requests", "verification_queue:requests",
                "draft_queue:requests", "send_queue:requests",
                "verify_send_queue:requests",
            ])
            total_dlq = 0
            for qn in list(reclaimed):
                total_dlq += await dlq_depth(redis_client, qn)
            logger = logging.getLogger(__name__)
            logger.info(f"Boot reclaim: {reclaimed} (DLQ depth total: {total_dlq})")
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).warning(f"Boot reclaim failed (queues still consumable): {e}")
        tasks.append(asyncio.create_task(consume_scrape_queue(redis_client, db_pool)))
        tasks.append(asyncio.create_task(run_normalizer(redis_client, db_pool)))
        # daily full-fleet heartbeat (India jobs -> enrich -> verify -> draft -> send)
        tasks.append(asyncio.create_task(daily_scrape_scheduler(redis_client, db_pool=db_pool)))

        if db_pool:
            # Contact enrichment is the product priority, but the keyless OSINT
            # cascade is latency-bound (crt.sh / search-engine timeouts), so a
            # single consumer drains the queue ~1 lead/min. Run a small bounded
            # pool to multiply throughput. ponytail: 4 is tuned to the 10-conn DB
            # pool + shared search-engine rate limits; raise ENRICH_CONCURRENCY as
            # paid-provider keys (which return instantly) are added.
            _enrich_n = max(1, int(os.environ.get("ENRICH_CONCURRENCY", "4") or 4))
            for _ in range(_enrich_n):
                tasks.append(asyncio.create_task(consume_enrichment_queue(redis_client, db_pool)))
            tasks.append(asyncio.create_task(consume_verification_queue(redis_client, db_pool)))
            tasks.append(asyncio.create_task(consume_draft_queue(redis_client, db_pool)))
            tasks.append(asyncio.create_task(consume_send_queue(redis_client, db_pool)))
            tasks.append(asyncio.create_task(consume_verify_send_queue(redis_client, db_pool)))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
