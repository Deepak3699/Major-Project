# HR Shakti Lead Army — doctrine map

How the "army" doctrine maps to running code. Soldiers cooperate through
shared Postgres + Redis; no soldier phones home anywhere else.

| Doctrine corps | Code | Notes |
|---|---|---|
| Scout Corps | `scrapers/*` (~47 scrapers) + `SCRAPER_MAP` | Parallel by `asyncio.gather`; per-source circuit breakers |
| Corps registry | `scrapers/army_registry.py` | `corps_of`, `FAILOVER` map, `TIER1_ZERO_SENSITIVE` |
| Hunter Corps | `scrapers/normalizer.py` | Extraction + fresher/India gates + E.164 validation |
| Enrichment Corps | `enrichment_worker.py` cascade (Tiers 1–4 + RSS 2d) | Free-first, paid waterfall last, credit-capped |
| Cleaner Corps | dedup fingerprint + fuzzy match, scoring, verification gates, lifecycle trigger | Zero-redundancy + impossible-transition rejection |
| Fallback Corps | `maybe_fallback_wave` + DLQ/requeue/reclaim + sweep | ONE bounded wave (depth 1, ≤4 sources, same coverage class); compensation jobs never re-compensate |
| Orchestrator | `run_army` trigger + daily scheduler + `/api/integrity` + `/api/metrics` | Triggers: cron, API, manual; health via source_health + metrics |
| ATS flywheel | `suggest_new_slugs` + integrity `suggested_slugs` | Suggestions only; promotion needs live proof (standing rule) |

## Trigger once, run to mission-complete
`POST /api/runs/army` (or cron/manual) → scrape wave → per-source results →
wave gate (fallback wave if failed/barren) → normalize → enrich → verify →
draft. Human reviews; send is always manual. Draft-only mode is structural:
no code path sends without an explicit per-lead send call.

## Deliberately NOT built (doctrine requests declined)
- **Residential proxies / stealth evasion**: evading anti-bot measures
  violates provider terms; respectful rate limits + backoff are the policy.
- **JobSpy**: duplicates 3 existing scrapers and drags LinkedIn ToS exposure.
- **pandas/Polars pipelines**: cleaning already runs in the normalizer without
  a 100MB dependency; revisit only for offline batch reprocessing.
- **Playwright scraping of new targets**: the plumbing exists (`http_client`
  tiers); each new target still needs per-site terms review first.
- **NCS/gov portals**: auth-walled; unattended automation there is out of bounds.
- **Phone-carrier lookup APIs**: no credentials; stdlib E.164 validation stands.
