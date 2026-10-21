"""
Direct Scraper Runner — runs scrapers and writes directly to PostgreSQL without Redis.

Usage:
  python run_direct.py                      # Runs default safe ATS and API sources
  python run_direct.py remoteok arbeitnow   # Runs specific sources
"""

import asyncio
import os
import sys
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("run_direct")

# Load root .env
for env_path in [os.path.join(os.path.dirname(__file__), "..", "..", ".env"), ".env"]:
    if os.path.exists(env_path):
        load_dotenv(env_path)

from scrapers.utils.db import get_db_pool, close_db_pool
from scrapers.normalizer import normalize_lead, insert_job_posting
from scrapers.scrape_consumer import SCRAPER_MAP, PERMITTED_DEFAULT_SOURCES

async def run_direct(sources: list[str] | None = None, limit_per_source: int = 50):
    selected_sources = sources if sources else ["remoteok", "arbeitnow", "greenhouse", "lever"]
    
    print("Take It -- Direct Scraper (Zero-Redis Mode)")
    print(f"  • Selected Sources : {', '.join(selected_sources)}")
    print(f"  • Destination      : PostgreSQL (Neon DB)")
    print("=" * 65 + "\n")

    pool = await get_db_pool()
    total_scraped = 0
    total_saved = 0

    for source in selected_sources:
        if source not in SCRAPER_MAP:
            logger.warning(f"Unknown source '{source}', skipping...")
            continue
        if source not in PERMITTED_DEFAULT_SOURCES:
            logger.warning(f"Source '{source}' has no configured permitted access path, skipping...")
            continue

        mod_name, cls_name = SCRAPER_MAP[source]
        try:
            mod = __import__(mod_name, fromlist=[cls_name])
            scraper_cls = getattr(mod, cls_name)
            scraper = scraper_cls()
            
            logger.info(f"▶ Scraping [{source}]...")
            # Use the common runner so circuit-breaker, timeout/retry, and
            # robots.txt checks apply to direct runs too.
            jobs = await scraper.run()
            logger.info(f"  ✓ Fetched {len(jobs)} listings from {source}")
            total_scraped += len(jobs)

            saved_for_source = 0
            async with pool.acquire() as conn:
                for job in jobs[:limit_per_source]:
                    try:
                        norm = normalize_lead(job)
                        job_id = await insert_job_posting(conn, norm)
                        if job_id:
                            saved_for_source += 1
                    except Exception as e:
                        logger.debug(f"Failed to normalize/save job: {e}")

            logger.info(f"  ✓ Saved {saved_for_source} new jobs into database")
            total_saved += saved_for_source

        except Exception as e:
            logger.error(f"[ERROR] Scraping {source} failed: {e}")

    print("\n" + "=" * 65)
    print(f"[DONE] Completed! Total Fetched: {total_scraped} | New Jobs Saved: {total_saved}")
    print("=" * 65 + "\n")

    await close_db_pool()

if __name__ == "__main__":
    cli_sources = sys.argv[1:] if len(sys.argv) > 1 else None
    asyncio.run(run_direct(cli_sources))
