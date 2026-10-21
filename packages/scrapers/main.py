import os
import json
import asyncio
import logging
import io
import re
import secrets
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
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
from scrapers.utils.resume_parser import parse_resume_profile

logger = logging.getLogger(__name__)


def legacy_outreach_enabled() -> bool:
    return os.environ.get("ENABLE_LEGACY_OUTREACH_PIPELINE", "0").strip().lower() in {"1", "true", "yes", "on"}

app = FastAPI(
    title="JobPilot AI Worker Service",
    description="Worker service for permitted job discovery, normalization, and application support",
    version="0.1.0",
)

# Shared asyncpg pool captured at startup so the on-demand /army/run sweep can
# query under-enriched leads without creating a second pool.
_db_pool = None


class ScrapeRequest(BaseModel):
    sources: Optional[list[str]] = None
    run_type: str = "auto"
    triggered_by: Optional[str] = None


class ContactDiscoveryRequest(BaseModel):
    limit: int = 12


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
    from scrapers.scrape_consumer import SCRAPER_MAP, PERMITTED_DEFAULT_SOURCES, resolve_sources

    return {
        "available": [
            {"name": name, "module": mod, "tier": _get_tier(name), "permitted_by_default": name in PERMITTED_DEFAULT_SOURCES}
            for name, (mod, _) in SCRAPER_MAP.items()
        ],
        "active": resolve_sources(None),
    }


@app.post("/resume/parse")
async def parse_resume(request: Request):
    """Extract editable profile suggestions without storing the uploaded file."""
    expected_token = os.getenv("WORKER_INTERNAL_TOKEN", "")
    supplied_token = request.headers.get("x-internal-token", "")
    if not expected_token or not secrets.compare_digest(expected_token, supplied_token):
        raise HTTPException(status_code=401, detail="Unauthorized worker request")

    filename = request.headers.get("x-resume-filename", "resume.txt")
    extension = os.path.splitext(filename.lower())[1]
    if extension not in {".pdf", ".docx", ".txt"}:
        raise HTTPException(status_code=415, detail="Upload a PDF, DOCX, or TXT resume")
    raw = await request.body()
    if not raw or len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413 if raw else 400, detail="Resume must be between 1 byte and 8 MB")

    try:
        if extension == ".pdf":
            from pypdf import PdfReader
            document = PdfReader(io.BytesIO(raw))
            text = "\n".join(page.extract_text() or "" for page in document.pages[:30])
        elif extension == ".docx":
            from docx import Document
            document = Document(io.BytesIO(raw))
            text = "\n".join(paragraph.text for paragraph in document.paragraphs)
            for table in document.tables:
                text += "\n" + "\n".join(" | ".join(cell.text for cell in row.cells) for row in table.rows)
        else:
            text = raw.decode("utf-8", errors="replace")
    except Exception as exc:
        raise HTTPException(status_code=422, detail="We could not read this resume file") from exc

    text = re.sub(r"\r\n?", "\n", text)
    # Keep the original horizontal spacing until the resume parser has repaired
    # PDF text where glyphs are spaced out. Collapsing here first merges names
    # whose PDF text layer uses spacing to mark word boundaries.
    text = re.sub(r"\n{3,}", "\n\n", text).strip()[:120_000]
    if len(text) < 30:
        if extension == ".pdf":
            raise HTTPException(status_code=422, detail="This PDF has no readable text layer. Export an OCR-enabled PDF or upload a DOCX/TXT copy of the resume.")
        raise HTTPException(status_code=422, detail="The file contains too little readable text. Check that it is not empty or password protected.")

    return parse_resume_profile(text, filename)

async def _discover_public_hr_contacts(limit: int) -> None:
    """Find public HR details from listing, career and public search sources."""
    from scrapers.normalizer import enrich_public_job_contact, save_public_hr_contact

    pool = await get_db_pool()
    if not pool:
        logger.warning("Public HR discovery stopped: database unavailable")
        return
    async with pool.acquire() as conn:
        jobs = await conn.fetch(
            """SELECT jp.id, jp.fingerprint, jp.job_url, jp.title, jp.hr_contact_id,
                      c.id AS company_id, c.name AS company_name
                 FROM job_postings jp JOIN companies c ON c.id=jp.company_id
                WHERE jp.hr_contact_id IS NULL
                  AND jp.job_url ~* '^https://'
                  AND jp.review_status IN ('pending','published')
                ORDER BY COALESCE(jp.posted_at,jp.first_seen_at) DESC
                LIMIT $1""",
            max(1, min(limit, 12)),
        )
    semaphore = asyncio.Semaphore(4)

    async def process_job(row) -> int:
        normalized = {
            "fingerprint": row["fingerprint"], "job_url": row["job_url"],
            "job_title": row["title"], "company_id": row["company_id"],
            "company_name": row["company_name"], "hr_name": "", "hr_email": "",
            "hr_mobile": "", "hr_linkedin_url": "", "hr_extraction_provenance": {"stages": []},
        }
        async with semaphore:
            try:
                normalized = await enrich_public_job_contact(normalized, pool, allow_search=True)
                if not normalized.get("_public_hr_discovery"):
                    return 0
                async with pool.acquire() as conn:
                    contact_id = await save_public_hr_contact(conn, normalized, row["company_id"])
                    if not contact_id:
                        return 0
                    await conn.execute("UPDATE job_postings SET hr_contact_id=$2 WHERE id=$1 AND hr_contact_id IS NULL", row["id"], contact_id)
                    if normalized.get("hr_email") or normalized.get("hr_mobile"):
                        await get_redis().lpush("verification_queue:requests", json.dumps({
                            "contact_id": contact_id,
                            "requested_by": "system",
                            "requested_at": datetime.now(timezone.utc).isoformat(),
                        }))
                    return 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("Public HR discovery failed for job %s: %s", row["id"], exc)
                return 0

    results = await asyncio.gather(*(process_job(row) for row in jobs))
    logger.info("Public HR discovery complete: checked=%s discovered=%s", len(jobs), sum(results))


async def _run_public_hr_discovery(limit: int) -> None:
    try:
        await _discover_public_hr_contacts(limit)
    except Exception:  # noqa: BLE001
        logger.exception("Public HR contact discovery task failed")


@app.post("/contacts/discover")
async def discover_contacts(req: ContactDiscoveryRequest, request: Request):
    expected_token = os.getenv("WORKER_INTERNAL_TOKEN", "")
    supplied_token = request.headers.get("x-internal-token", "")
    if not expected_token or not secrets.compare_digest(expected_token, supplied_token):
        raise HTTPException(status_code=401, detail="Unauthorized worker request")
    asyncio.create_task(_run_public_hr_discovery(req.limit))
    return {"status": "queued", "limit": max(1, min(req.limit, 12)), "message": "Public job and careers page contact discovery queued"}


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
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Scrape queue is unavailable. Configure Redis before starting a scrape.")
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
    if redis_client is None:
        raise HTTPException(status_code=503, detail="Worker queues are unavailable. Configure Redis before starting a run.")
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
    if legacy_outreach_enabled():
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
    logger.info("Scraper fleet and background workers started")
    logger.info("Workers API: http://localhost:8000")
    logger.info("Health check: http://localhost:8000/health")

    try:
        r = get_redis()
        await r.ping()
        logger.info("Redis: connected; queue workers active")
    except Exception:
        logger.warning("Redis is not connected; queue consumers are paused. Start Redis or configure REDIS_URL.")

    try:
        pool = await get_db_pool()
        if pool:
            logger.info("PostgreSQL: connected")
        else:
            logger.warning("PostgreSQL is not connected")
    except Exception:
        logger.warning("PostgreSQL is not connected; check DATABASE_URL in .env")
    asyncio.create_task(start_consumers())


@app.on_event("shutdown")
async def shutdown_event():
    pass


async def start_consumers():
    """Start discovery workers; start legacy contact/outreach queues only by opt-in."""
    redis_client = get_redis()
    if redis_client is None:
        logging.getLogger(__name__).info("Queue consumers are idle because Redis is not configured")
        return

    from scrapers.scrape_consumer import consume_scrape_queue
    from scrapers.normalizer import run_normalizer
    from scrapers.scheduler import daily_scrape_scheduler

    try:
        db_pool = await get_db_pool()
    except Exception:
        db_pool = None
    global _db_pool
    _db_pool = db_pool
    legacy_enabled = legacy_outreach_enabled()

    tasks = []
    if redis_client:
        # Crash recovery first: jobs stranded in :processing lists (worker died
        # between pop and ack) go back to their queues before consumers start.
        try:
            from scrapers.queue import reclaim_processing, dlq_depth
            queues = ["scrape_queue:requests", "raw_leads_queue:requests", "verification_queue:requests"]
            if legacy_enabled:
                queues.extend([
                    "enrichment_queue:requests",
                    "draft_queue:requests", "send_queue:requests", "verify_send_queue:requests",
                ])
            reclaimed = await reclaim_processing(redis_client, queues)
            total_dlq = 0
            for qn in list(reclaimed):
                total_dlq += await dlq_depth(redis_client, qn)
            logger = logging.getLogger(__name__)
            logger.info(f"Boot reclaim: {reclaimed} (DLQ depth total: {total_dlq})")
        except Exception as e:  # noqa: BLE001
            logging.getLogger(__name__).warning(f"Boot reclaim failed (queues still consumable): {e}")
        tasks.append(asyncio.create_task(consume_scrape_queue(redis_client, db_pool)))
        tasks.append(asyncio.create_task(run_normalizer(redis_client, db_pool)))
        # Daily permitted job discovery. Legacy lead enrichment is separately gated.
        tasks.append(asyncio.create_task(daily_scrape_scheduler(redis_client, db_pool=db_pool)))

        if db_pool:
            from scrapers.verification_worker import consume_verification_queue
            tasks.append(asyncio.create_task(consume_verification_queue(redis_client, db_pool)))
        if db_pool and legacy_enabled:
            from scrapers.enrichment_worker import consume_enrichment_queue
            from scrapers.draft_worker import consume_draft_queue
            from scrapers.send_worker import consume_send_queue
            from scrapers.verify_send_worker import consume_verify_send_queue
            # Contact enrichment is the product priority, but the keyless OSINT
            # cascade is latency-bound (crt.sh / search-engine timeouts), so a
            # single consumer drains the queue ~1 lead/min. Run a small bounded
            # pool to multiply throughput. ponytail: 4 is tuned to the 10-conn DB
            # pool + shared search-engine rate limits; raise ENRICH_CONCURRENCY as
            # paid-provider keys (which return instantly) are added.
            _enrich_n = max(1, int(os.environ.get("ENRICH_CONCURRENCY", "4") or 4))
            for _ in range(_enrich_n):
                tasks.append(asyncio.create_task(consume_enrichment_queue(redis_client, db_pool)))
            tasks.append(asyncio.create_task(consume_draft_queue(redis_client, db_pool)))
            tasks.append(asyncio.create_task(consume_send_queue(redis_client, db_pool)))
            tasks.append(asyncio.create_task(consume_verify_send_queue(redis_client, db_pool)))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
