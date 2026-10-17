"""
Queue consumer for scrape_queue:requests.

Consumes scrape jobs dispatched by n8n/API, runs the requested scrapers,
and pushes results to raw_leads_queue for normalization.

Per SRS §4.1: n8n cron daily at 02:00 IST triggers this consumer via webhook.
Per SRS §4.6: scrapers push raw records to raw_leads_queue.
"""

import json
import os
import asyncio
import logging
from typing import Any

import redis.asyncio as redis

from .queue import requeue_or_dlq, reliable_brpop, ack

logger = logging.getLogger(__name__)

SCRAPER_MAP = {
    "remoteok": ("scrapers.remoteok", "RemoteOkScraper"),
    "arbeitnow": ("scrapers.arbeitnow", "ArbeitnowScraper"),
    "remotive": ("scrapers.remotive", "RemotiveScraper"),
    "github_jobs": ("scrapers.github_jobs", "GitHubJobsScraper"),
    "greenhouse": ("scrapers.greenhouse", "GreenhouseScraper"),
    "lever": ("scrapers.lever", "LeverScraper"),
    "adzuna": ("scrapers.adzuna", "AdzunaScraper"),
    "jooble": ("scrapers.jooble", "JoobleScraper"),
    "usajobs": ("scrapers.usajobs", "USAJobsScraper"),
    "workday": ("scrapers.workday", "WorkdayScraper"),
    "smartrecruiters": ("scrapers.smartrecruiters", "SmartRecruitersScraper"),
    "ashby": ("scrapers.ashby", "AshbyScraper"),
    "recruitee": ("scrapers.recruitee", "RecruiteeScraper"),
    "teamtailor": ("scrapers.teamtailor", "TeamtailorScraper"),
    "breezy": ("scrapers.breezy", "BreezyScraper"),
    "bamboohr": ("scrapers.bamboohr", "BambooHRScraper"),
    "personio": ("scrapers.personio", "PersonioScraper"),
    "duckduckgo": ("scrapers.duckduckgo_search", "DuckDuckGoScraper"),
    "reddit": ("scrapers.reddit_jobs", "RedditScraper"),
    "twitter": ("scrapers.twitter_jobs", "TwitterScraper"),
    "telegram": ("scrapers.telegram_jobs", "TelegramScraper"),
    "naukri": ("scrapers.naukri", "NaukriScraper"),
    "internshala": ("scrapers.internshala", "InternshalaScraper"),
    "indeed": ("scrapers.indeed", "IndeedScraper"),
    "foundit": ("scrapers.foundit", "FounditScraper"),
    "instahyre": ("scrapers.instahyre", "InstahyreScraper"),
    "wellfound": ("scrapers.angelco", "WellfoundScraper"),
    "glassdoor": ("scrapers.glassdoor", "GlassdoorScraper"),
    "shine": ("scrapers.shine", "ShineScraper"),
    "cutshort": ("scrapers.cutshort", "CutShortScraper"),
    "linkedin": ("scrapers.linkedin_jobs", "LinkedInJobsScraper"),
    "freshersworld": ("scrapers.freshersworld", "FreshersworldScraper"),
    "unstop": ("scrapers.unstop", "UnstopScraper"),
    "jobinsider": ("scrapers.jobinsider", "JobinsiderScraper"),
    "iimjobs": ("scrapers.iimjobs", "IimjobsScraper"),
    "timesjobs": ("scrapers.timesjobs", "TimesjobsScraper"),
    "facebook": ("scrapers.facebook_groups", "FacebookGroupsScraper"),
    "whatsapp": ("scrapers.whatsapp_listener", "WhatsAppListener"),
    "college_portals": ("scrapers.spiders.college_placement", "CollegePlacementSpider"),
    "apna": ("scrapers.apna", "ApnaScraper"),
    "workindia": ("scrapers.workindia", "WorkIndiaScraper"),
    "hirist": ("scrapers.hirist", "HiristScraper"),
    "classicjobs": ("scrapers.classicjobs", "ClassicJobsScraper"),
    "hackerearth": ("scrapers.hackerearth", "HackerEarthScraper"),
    "ambitionbox": ("scrapers.ambitionbox", "AmbitionBoxScraper"),
    "offcampus": ("scrapers.offcampus_aggregators", "OffCampusAggregatorsScraper"),
    "hasjob": ("scrapers.hasjob", "HasjobScraper"),
    "amazon": ("scrapers.amazon_jobs", "AmazonJobsScraper"),
}
DEFAULT_SOURCES = [
    # India-native fresher/entry-level portals (primary target).
    "naukri", "internshala", "freshersworld", "apna", "workindia",
    "shine", "timesjobs", "foundit", "instahyre", "cutshort",
    "unstop", "iimjobs", "jobinsider", "hirist", "classicjobs",
    "hackerearth", "ambitionbox", "offcampus", "hasjob",
    # Public ATS career pages (real employer domains; India-filtered downstream,
    # best source of postable HR contacts). Greenhouse/Lever/Workday/Ashby/etc.
    "greenhouse", "lever", "workday", "ashby", "smartrecruiters",
    "bamboohr", "personio",
    # Discovery accelerators (India-keyed).
    "indeed", "duckduckgo", "amazon",
]

# Global / US boards kept available but NOT in the India-fresher default set
# (they're mostly filtered out by the India geo-gate, so running them daily just
# burns egress). Enable explicitly via job["sources"] or SCRAPE_SOURCES.
EXTRA_SOURCES = [
    "remoteok", "github_jobs", "arbeitnow", "adzuna", "jooble",
    "usajobs", "recruitee", "teamtailor", "breezy",
    "glassdoor", "wellfound", "linkedin", "twitter", "telegram",
    "reddit", "facebook", "whatsapp", "college_portals",
]


def resolve_sources(job_sources):
    """Choose which sources a run scrapes.

    Priority: explicit per-job list > SCRAPE_SOURCES env override > India-fresher
    DEFAULT_SOURCES. Keeps the operator able to retune the fleet without a code
    deploy (e.g. enable the global set, or narrow to a few reliable boards), and
    ignores unknown names rather than crashing the run.
    """
    if job_sources:
        return [x for x in job_sources if x in SCRAPER_MAP] or None
    override = os.environ.get("SCRAPE_SOURCES", "").strip()
    if override:
        picked = [x.strip() for x in override.split(",") if x.strip() in SCRAPER_MAP]
        if picked:
            return picked
    return DEFAULT_SOURCES


async def run_scraper(source: str, redis_client: redis.Redis, db=None, requested_by: str | None = None) -> tuple[int, str | None]:
    """Run a single scraper and enqueue its results.

    Returns (leads_count, error_message).
    """
    import importlib

    scraper_info = SCRAPER_MAP.get(source)
    if not scraper_info:
        return 0, f"Unknown source: {source}"

    module_path, class_name = scraper_info
    try:
        mod = importlib.import_module(module_path)
        scraper_cls = getattr(mod, class_name)
        scraper = scraper_cls(redis_client=redis_client, db=db)

        leads = await scraper.scrape_and_enqueue(requested_by=requested_by)
        logger.info(f"Source {source}: scraped and enqueued {leads} leads")
        if db is not None:
            # Source health is written HERE (success and failure): nothing else
            # records per-run health, which is why the table stayed empty.
            try:
                await db.execute(
                    """INSERT INTO source_health
                         (source_name, consecutive_failures, circuit_open_until, last_success_at, last_failure_reason)
                       VALUES ($1, 0, NULL, NOW(), NULL)
                       ON CONFLICT (source_name) DO UPDATE SET
                         consecutive_failures = 0, circuit_open_until = NULL,
                         last_success_at = NOW()""",
                    source,
                )
            except Exception as he:  # noqa: BLE001
                logger.debug(f"source_health success write skipped for {source}: {he}")
        return leads, None

    except Exception as e:
        logger.error(f"Source {source} failed: {e}", exc_info=True)
        if db is not None:
            try:
                await db.execute(
                    """INSERT INTO source_health
                         (source_name, consecutive_failures, circuit_open_until, last_failure_reason)
                       VALUES ($1, 1, NULL, $2)
                       ON CONFLICT (source_name) DO UPDATE SET
                         consecutive_failures = source_health.consecutive_failures + 1,
                         last_failure_reason = $2""",
                    source, str(e)[:500],
                )
            except Exception:  # noqa: BLE001
                pass
        return 0, str(e)


async def consume_scrape_queue(
    redis_client: redis.Redis,
    db_pool=None,
) -> int:
    """Consume scrape jobs from scrape_queue:requests.

    Each job contains:
      - run_id: unique identifier
      - sources: list of source names to scrape (or null for defaults)
      - run_type: 'scheduled' or 'manual'
      - triggered_by: user ID
    """
    processed = 0

    while True:
        job = None
        raw_msg: Any = None
        try:
            got = await reliable_brpop(redis_client, "scrape_queue:requests", timeout=10)
            if got is None:
                await asyncio.sleep(1)
                continue
            raw_msg, job = got
            run_id = job.get("run_id", "unknown")
            sources = resolve_sources(job.get("sources")) or []
            run_type = job.get("run_type", "manual")
            triggered_by = job.get("triggered_by")

            logger.info(f"Scrape job {run_id} ({run_type}): sources={sources}")

            results: dict[str, Any] = {
                "run_id": run_id,
                "sources_attempted": len(sources),
                "sources_succeeded": 0,
                "sources_failed": [],
                "leads_found": 0,
            }
            per_source_counts: dict[str, int] = {}

            async def scrape_source(src: str):
                db = None
                if db_pool:
                    db = await db_pool.acquire()
                try:
                    count, err = await run_scraper(src, redis_client, db, requested_by=triggered_by)
                    if err:
                        results["sources_failed"].append({"source": src, "error": err})
                    else:
                        results["sources_succeeded"] += 1
                    results["leads_found"] += count
                    per_source_counts[src] = count
                finally:
                    if db and db_pool:
                        await db_pool.release(db)

            await asyncio.gather(*[scrape_source(s) for s in sources])

            # Persist run report to scrape_runs (§9.6)
            if db_pool:
                async with db_pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO scrape_runs
                          (id, started_at, finished_at, sources_attempted,
                           sources_succeeded, sources_circuit_broken, leads_found, leads_deduped, errors)
                        VALUES ($1, NOW(), NOW(), $2, $3, $4, $5, $6, $7)
                        """,
                        run_id,
                        results["sources_attempted"],
                        results["sources_succeeded"],
                        [f["source"] for f in results["sources_failed"]],
                        results["leads_found"],
                        0,
                        json.dumps({
                            "sources": sources,
                            "run_type": run_type,
                            "triggered_by": triggered_by,
                            "errors": results["sources_failed"],
                        }),
                    )

            processed += 1
            await ack(redis_client, "scrape_queue:requests", raw_msg)
            logger.info(f"Scrape job {run_id} complete: {results}")

            # Wave quality gate (Fallback Corps): on a failed or barren wave,
            # sibling soldiers compensate with ONE bounded fallback wave.
            # Compensation jobs (depth>=1) never compensate further: no chains.
            try:
                from .army_registry import maybe_fallback_wave
                sibs = await maybe_fallback_wave(
                    redis_client, job, sources, results, per_source_counts,
                )
                if sibs:
                    logger.warning(f"Fallback wave queued -> {sibs}")
            except Exception as e:  # noqa: BLE001
                logger.debug(f"Fallback-wave check skipped: {e}")

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in scrape_queue: {e}")
            if raw_msg is not None:
                await ack(redis_client, "scrape_queue:requests", raw_msg)
        except Exception as e:
            logger.error(f"Consumer error in scrape_queue: {e}", exc_info=True)
            try:
                if raw_msg is not None:
                    await ack(redis_client, "scrape_queue:requests", raw_msg)
                await requeue_or_dlq(redis_client, "scrape_queue:requests", job)
            except Exception:  # noqa: BLE001
                pass
            await asyncio.sleep(5)

    return processed
