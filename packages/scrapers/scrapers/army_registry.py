"""
Army corps registry + sibling failover (doctrine: Fallback & Support Corps).

Every soldier belongs to a corps; every scout names its siblings. When a
source errors — or a Tier-1 source returns zero leads — the scrape consumer
enqueues ONE bounded compensation wave over the siblings (depth capped at 1,
sources capped at 4) instead of leaving a coverage hole. No chains, no storms.

Corps:
  scouts      every entry in SCRAPER_MAP (discovery soldiers)
  hunters     normalizer (extraction soldier; single, idempotent)
  enrichment  enrichment_queue workers (contact soldiers)
  cleaners    dedup + scoring + verification gates (quality soldiers)
  fallback    DLQ/requeue/reclaim + this compensation map (support soldiers)
  orchestrator scheduler + run_army trigger + wave quality gate (command)
"""

from __future__ import annotations

# Sibling sources that cover the same ground when one fails. Same coverage
# class only — a dead niche board must not trigger a full-fleet re-run.
FAILOVER: dict[str, list[str]] = {
    # India generalist boards compensate each other
    "naukri": ["foundit", "shine", "timesjobs"],
    "foundit": ["naukri", "shine"],
    "shine": ["foundit", "timesjobs"],
    "timesjobs": ["shine", "foundit"],
    # Fresher/entry specialists
    "internshala": ["unstop", "freshersworld", "apna"],
    "unstop": ["internshala", "freshersworld"],
    "freshersworld": ["internshala", "unstop"],
    "apna": ["workindia", "freshersworld"],
    "workindia": ["apna"],
    # Tech/startup boards
    "cutshort": ["instahyre", "hirist"],
    "instahyre": ["cutshort", "hirist"],
    "hirist": ["cutshort", "instahyre"],
    "iimjobs": ["jobinsider", "cutshort"],
    "jobinsider": ["iimjobs"],
    "hackerearth": ["unstop", "cutshort"],
    "classicjobs": ["foundit", "naukri"],
    "ambitionbox": ["foundit", "naukri", "shine"],
    "offcampus": ["internshala", "freshersworld", "unstop"],
    "hasjob": ["cutshort", "instahyre", "unstop"],
    "amazon": ["indeed", "jooble"],
    # ATS boards compensate within the ATS family (same employer-direct class)
    "greenhouse": ["lever", "ashby"],
    "lever": ["greenhouse", "ashby"],
    "ashby": ["lever", "workday"],
    "workday": ["ashby", "smartrecruiters"],
    "smartrecruiters": ["workday", "teamtailor"],
    "teamtailor": ["smartrecruiters", "breezy"],
    "breezy": ["teamtailor", "recruitee"],
    "recruitee": ["breezy", "bamboohr"],
    "bamboohr": ["personio", "recruitee"],
    "personio": ["bamboohr"],
    # Aggregators / discovery accelerators
    "indeed": ["jooble", "adzuna"],
    "jooble": ["indeed", "adzuna"],
    "adzuna": ["jooble", "indeed"],
    "duckduckgo": ["indeed", "jooble"],
}

# Tier-1 sources whose EMPTY result is itself a failure signal (primary
# coverage — silence here means a hole, not a quiet niche).
TIER1_ZERO_SENSITIVE = {
    "naukri", "internshala", "apna", "foundit",
    "greenhouse", "lever",
}

MAX_COMPENSATION_SOURCES = 4
MAX_COMPENSATION_DEPTH = 1


def corps_of(source: str) -> str:
    """Which corps a source soldier belongs to (all map sources are scouts)."""
    from .scrape_consumer import SCRAPER_MAP
    if source in SCRAPER_MAP:
        return "scouts"
    return "unknown"


def compensate(failed_sources: list[str], depth: int = 0) -> list[str]:
    """Sibling replacements for failed sources. Empty when depth is exhausted
    (no compensation chains) or nothing relevant exists."""
    if depth >= MAX_COMPENSATION_DEPTH:
        return []
    failed = {s for s in failed_sources if s}
    out: list[str] = []
    try:
        from .scrape_consumer import SCRAPER_MAP
        known = set(SCRAPER_MAP)
    except Exception:  # noqa: BLE001
        known = set()
    for src in failed_sources:
        for sib in FAILOVER.get(src, ["duckduckgo"]):
            if sib not in failed and sib not in out and (not known or sib in known):
                out.append(sib)
            if len(out) >= MAX_COMPENSATION_SOURCES:
                return out
    return out


async def maybe_fallback_wave(
    redis_client,
    job: dict,
    sources: list[str],
    results: dict,
    per_source_counts: dict[str, int],
) -> list[str]:
    """Wave quality gate (Fallback Corps). After a wave, if sources errored or
    Tier-1 sources came back barren AND the wave is empty/weak, enqueue ONE
    bounded compensation wave over sibling sources. Compensation jobs
    (depth>=1) never compensate further. Returns the sibling list (possibly
    empty). Never raises."""
    import json as _json
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    try:
        depth = int((job or {}).get("compensation_depth", 0) or 0)
        if depth >= MAX_COMPENSATION_DEPTH:
            return []
        failed = [f["source"] for f in (results.get("sources_failed") or [])]
        attempted = sources or []
        barren_tier1 = [
            s for s in attempted
            if s in TIER1_ZERO_SENSITIVE and per_source_counts.get(s, 0) == 0
            and s not in failed
        ]
        triggers = failed + barren_tier1
        empty_wave = (
            int(results.get("leads_found", 0) or 0) == 0
            and int(results.get("sources_succeeded", 0) or 0) < max(1, len(attempted) // 2)
        )
        if not triggers or not (failed or empty_wave or barren_tier1):
            return []
        sibs = compensate(triggers, depth)
        if not sibs:
            return []
        await redis_client.lpush(
            "scrape_queue:requests",
            _json.dumps({
                "run_id": f"fallback-{_uuid.uuid4().hex[:8]}",
                "run_type": "fallback-wave",
                "sources": sibs,
                "triggered_by": (job or {}).get("triggered_by"),
                "triggered_at": _dt.now(_tz.utc).isoformat(),
                "compensation_depth": depth + 1,
                "compensated_for": triggers,
            }),
        )
        return sibs
    except Exception:  # noqa: BLE001
        return []
