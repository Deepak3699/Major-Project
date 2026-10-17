import os
import json
import abc
import asyncio
import logging
import time
import random
from typing import Any, Optional
from tenacity import (
    retry, stop_after_attempt, wait_exponential, retry_if_exception_type,
    RetryCallState, retry_if_exception_type as _retry_exceptions,
)
import aiohttp

import redis.asyncio as redis

from .utils.robots_checker import RobotsChecker

logger = logging.getLogger(__name__)

_UA_ROTATOR: Optional[Any] = None
try:
    from fake_useragent import UserAgent
    _UA_ROTATOR = UserAgent()
except Exception:
    _UA_ROTATOR = None

_FREE_PROXY_CLIENT: Optional[Any] = None
try:
    from fp.fp import FreeProxy
    _FREE_PROXY_CLIENT = FreeProxy(anonym=True)
except Exception:
    _FREE_PROXY_CLIENT = None

logger = logging.getLogger(__name__)

_robot_checker: RobotsChecker | None = None


def get_robot_checker() -> RobotsChecker:
    global _robot_checker
    if _robot_checker is None:
        _robot_checker = RobotsChecker()
    return _robot_checker


class ScraperError(Exception):
    """Base exception for scraper failures."""
    pass


class SourceBlockedError(ScraperError):
    """Raised when a source blocks the scraper (anti-bot, 403, etc.)."""
    pass


class ScrapingError(ScraperError):
    """Raised when scraping fails for non-block reasons."""
    pass


class CircuitBreaker:
    """Per-source circuit breaker as per SRS §9.2."""

    def __init__(
        self,
        source_name: str,
        failure_threshold: int = 5,
        cooldown_seconds: int = 7200,
        redis_client=None,
        db=None,
    ):
        self.source_name = source_name
        self.failure_threshold = failure_threshold
        self.cooldown_seconds = cooldown_seconds
        self._redis = redis_client
        self._db = db
        self.failure_count = 0
        self.last_failure_time: float | None = None

    def is_open(self) -> bool:
        """Synchronous check — used when no Redis (in-memory mode for tests)."""
        if self.failure_count >= self.failure_threshold:
            if self.last_failure_time is not None:
                if time.time() - self.last_failure_time > self.cooldown_seconds:
                    return False
                return True
            return True
        return False

    async def is_open_async(self) -> bool:
        """Async check — used when Redis is available."""
        if self._redis:
            raw = await self._redis.get(f"circuit_breaker:{self.source_name}")
            if raw:
                state = json.loads(raw)
                open_until = state.get("open_until", 0)
                if open_until and open_until > time.time() * 1000:
                    return True
                elif open_until:
                    await self._redis.delete(f"circuit_breaker:{self.source_name}")
                    await self._persist_health(consecutive_failures=0)
                    return False
            return False

        return self.is_open()

    async def _persist_health(self, consecutive_failures: int, reason: str | None = None, is_open: bool = False):
        """Persist circuit breaker state to PostgreSQL (source_health table per SRS §10)."""
        if self._db:
            try:
                await self._db.execute(
                    """
                    INSERT INTO source_health (source_name, consecutive_failures, circuit_open_until, last_failure_reason)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (source_name) DO UPDATE SET
                        consecutive_failures = EXCLUDED.consecutive_failures,
                        circuit_open_until = EXCLUDED.circuit_open_until,
                        last_failure_reason = EXCLUDED.last_failure_reason
                    """,
                    (self.source_name, consecutive_failures,
                     None if not is_open else "infinity",
                     reason),
                )
            except Exception as e:
                logger.warning(f"Failed to persist source_health for {self.source_name}: {e}")

    def record_success(self):
        self.failure_count = 0
        self.last_failure_time = None

    async def record_success_async(self):
        self.record_success()
        if self._redis:
            await self._redis.delete(f"circuit_breaker:{self.source_name}")
        await self._persist_health(consecutive_failures=0)

    def record_failure(self, reason: str):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            logger.warning(
                f"Circuit breaker OPENED for {self.source_name} for {self.cooldown_seconds}s"
            )

    async def record_failure_async(self, reason: str):
        self.record_failure(reason)

        if self._redis:
            state = {"failures": self.failure_count}
            if self.is_open():
                state["open_until"] = (time.time() + self.cooldown_seconds) * 1000
            await self._redis.setex(
                f"circuit_breaker:{self.source_name}",
                86400,
                json.dumps(state),
            )

        await self._persist_health(
            consecutive_failures=self.failure_count,
            reason=reason,
            is_open=self.is_open(),
        )

    def reset(self):
        self.failure_count = 0
        self.last_failure_time = None


class BaseScraper(abc.ABC):
    """Base scraper module — every source implements this interface per SRS §4.2/§9.2."""

    source_name: str
    tier: int
    rate_limit_seconds: float = 1.0
    # Per-source overall scrape budget. Multi-board ATS sweeps fan out many
    # independent public API calls; 60s was too tight for a 40+ company corpus.
    scrape_timeout_seconds: float = 120.0

    async def _sweep(
        self,
        session: "aiohttp.ClientSession",
        items: list[Any],
        fetch_one,
        concurrency: int = 8,
    ) -> list[dict[str, Any]]:
        """Run `fetch_one(item)` across `items` with bounded concurrency, flattening
        the per-item lead lists into one result.

        Root-cause fix for two failure modes every ATS adapter shares:
          * an error on ONE company (DNS miss, 410, 200-with-HTML → ContentTypeError)
            must NOT raise and abort the whole run (which used to discard every
            lead already collected and trip the circuit breaker);
          * a sequential loop over a 40+ company corpus blows the timeout budget.
        A single bad slug is now logged and skipped; the rest still land.

        `fetch_one` is called as `fetch_one(session, item)` and returns a list.
        """
        sem = asyncio.Semaphore(concurrency)

        async def _guard(item):
            async with sem:
                try:
                    return await fetch_one(session, item)
                except asyncio.CancelledError:
                    raise
                except Exception as e:  # noqa: BLE001  (intentional: per-item isolation)
                    self._logger.debug(
                        f"{self.source_name}: item skipped ({type(e).__name__}: {e})"
                    )
                    return []

        results = await asyncio.gather(*(_guard(i) for i in items))
        return [lead for group in results for lead in (group or [])]

    @staticmethod
    def _as_text(value: Any) -> str:
        """Coerce an ATS field to a TEXT-column-safe string.
        ATS payloads put dicts (recruitee salary, breezy type/location) where a
        plain string is expected; binding a dict to a TEXT column raises
        `asyncpg DataError`. Flatten the useful parts, else empty string.
        """
        if value is None or isinstance(value, str):
            return value or ""
        if isinstance(value, dict):
            if "min" in value or "max" in value:
                parts = [str(p) for p in (value.get("min"), value.get("max")) if p not in (None, "")]
                cur = value.get("currency") or ""
                return ("-".join(parts) + (f" {cur}" if cur and parts else "")).strip()
            if value.get("name"):
                return str(value["name"])
            country = value.get("country")
            if isinstance(country, dict):
                country = country.get("name", "")
            loc_bits = [str(b) for b in (value.get("city"), value.get("state"), country) if b]
            return ", ".join(loc_bits)
        return str(value)

    async def _get_json(self, session, url, *, timeout=15):
        """GET and best-effort-parse JSON, tolerating wrong content-type on a 200.
        Returns (status, data_or_None). Never raises on decode issues.
        """
        async with session.get(
            url, headers={"User-Agent": "HireGen-LeadGen/1.0"},
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as resp:
            if resp.status != 200:
                return resp.status, None
            try:
                return resp.status, await resp.json(content_type=None)
            except Exception:  # noqa: BLE001
                return resp.status, None

    def __init__(self, redis_client=None, db=None, proxies: Optional[list[str]] = None):
        self._redis = redis_client
        self._circuit_breaker = CircuitBreaker(
            source_name=self.source_name,
            redis_client=redis_client,
            db=db,
        )
        self._logger = logging.getLogger(f"scraper.{self.source_name}")
        self._proxies: list[str] = proxies or self._load_proxies()

    @staticmethod
    def _load_proxies() -> list[str]:
        """Load proxy URLs from the ROTATING_PROXIES env var (comma-separated).

        If not set, attempts to fetch free proxies via the free-proxy library (SRS §3.4).
        """
        raw = os.environ.get("ROTATING_PROXIES", "")
        proxies = [p.strip() for p in raw.split(",") if p.strip()]
        if proxies:
            return proxies
        if _FREE_PROXY_CLIENT:
            try:
                raw_proxies = _FREE_PROXY_CLIENT.get_proxy_list()
                if raw_proxies:
                    return [f"http://{p}" for p in raw_proxies[:5]]
            except Exception as e:
                logger.debug(f"Free proxy fetch failed: {e}")
        return []

    @staticmethod
    def _get_user_agent() -> str:
        """Return a random User-Agent string via fake-useragent (SRS §3.4).

        Falls back to a static UA if the library is unavailable.
        """
        if _UA_ROTATOR:
            try:
                return _UA_ROTATOR.random
            except Exception:
                pass
        return "Mozilla/5.0 (compatible; HireGen-LeadGen/1.0; +https://your-domain.com)"

    def _get_proxy(self) -> Optional[str]:
        """Round-robin select a proxy if configured, else None."""
        if not self._proxies:
            return None
        idx = random.randint(0, len(self._proxies) - 1)
        return self._proxies[idx]

    def _jittered_wait(self, attempt: int) -> float:
        """Jittered backoff: exponential * (0.5 to 1.5 multiplier) for retry, per SRS §9.3."""
        base = min(10, max(1, 2 ** attempt))
        jitter = random.uniform(0.5, 1.5)
        return base * jitter

    async def _check_robots_txt(self, url: str, user_agent: str = "HireGen-LeadGen/1.0") -> bool:
        """Check robots.txt compliance per SRS §13 before scraping a URL.

        Returns True if the URL is allowed, False if disallowed.
        Defaults to allowed if robots.txt cannot be fetched.
        """
        try:
            checker = get_robot_checker()
            return await checker.is_allowed(url, user_agent)
        except Exception as e:
            self._logger.debug(f"Robots check skipped for {url}: {e}")
            return True

    @abc.abstractmethod
    async def scrape(self) -> list[dict[str, Any]]:
        """Execute the scrape and return a list of normalized raw lead dicts.

        Returns dicts with keys matching SRS §4.4 extraction schema:
        company_name, about_company, hr_name, hr_email, company_email,
        hr_mobile, company_mobile, hr_linkedin_url, job_title,
        about_job, experience_required, salary_range, job_url,
        source_site, scraped_at, raw_payload
        """
        pass

    async def run(self) -> list[dict[str, Any]]:
        """Wrapper with circuit breaker + retry with jitter + proxy rotation, per SRS §9.2/§9.3/§9.4.

        Checks robots.txt compliance before scraping (SRS §13).
        """
        if self._circuit_breaker.is_open():
            self._circuit_breaker.logger.warning(f"Circuit breaker open for {self.source_name}, skipping")
            return []

        base_url = getattr(self, "API_URL", None) or getattr(self, "BASE_URL", None)
        if base_url:
            ua = self._get_user_agent()
            if not await self._check_robots_txt(base_url, ua):
                self._logger.warning(f"Robots.txt disallows scraping {base_url} for {self.source_name}")
                return []

        max_attempts = 3
        attempt = 0
        while attempt < max_attempts:
            try:
                leads = await asyncio.wait_for(self.scrape(), timeout=self.scrape_timeout_seconds)
                self._circuit_breaker.record_success()
                return leads
            except (asyncio.TimeoutError, aiohttp.ClientError, ScrapingError) as e:
                attempt += 1
                if attempt >= max_attempts:
                    self._circuit_breaker.record_failure(str(e))
                    self._logger.error(f"Scrape failed for {self.source_name} after {max_attempts} attempts: {e}")
                    return []
                wait = self._jittered_wait(attempt)
                self._logger.warning(
                    f"Retry {attempt}/{max_attempts} for {self.source_name} after {e}, waiting {wait:.1f}s"
                )
                await asyncio.sleep(wait)
            except Exception as e:
                self._circuit_breaker.record_failure(str(e))
                self._logger.error(f"Scrape failed for {self.source_name}: {e}")
                return []

    async def enqueue_leads(self, leads: list[dict[str, Any]], requested_by: str | None = None):
        """Push raw lead dicts to the raw_leads_queue Redis list.

        Stamps the triggering user (from the scrape job) onto each lead so the
        downstream auto-chain can publish progress to that user's SSE channel.
        """
        if not self._redis:
            self._logger.warning("No Redis connection, skipping enqueue")
            return

        # One lpush per lead is 2490 sequential Redis round-trips on a full-fleet
        # run (measured: the /army trigger looked like a hang). A single pipelined
        # batch does them all in one round-trip. Cap the batch so a huge scrape
        # doesn't build one enormous multi-MB pipeline.
        if not leads:
            return
        CHUNK = 500
        for i in range(0, len(leads), CHUNK):
            pipe = self._redis.pipeline()
            for lead in leads[i:i + CHUNK]:
                if requested_by:
                    lead["requested_by"] = requested_by
                pipe.lpush("raw_leads_queue:requests", json.dumps(lead))
            await pipe.execute()


    async def scrape_and_enqueue(self, requested_by: str | None = None) -> int:
        """Convenience: scrape + enqueue + return count."""
        leads = await self.run()
        if leads:
            await self.enqueue_leads(leads, requested_by=requested_by)
        return len(leads)


def now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
