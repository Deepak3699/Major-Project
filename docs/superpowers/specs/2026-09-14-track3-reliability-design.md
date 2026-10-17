# Track 3 — Reliability Depth Design

## Premise (verified, not assumed)
Log tables carry `REFERENCES … ON DELETE CASCADE` — true orphans are
impossible. Reliability depth therefore means: snapshot versioning, stuck
detection, and DLQ operability.

## Implemented
- **Snapshot versioning**: `job_postings.parser_version` (const `PARSER_VERSION`
  in normalizer, bump on contract change) + `content_hash` (sha256 over
  canonical raw payload). Set on insert, refreshed on dedup re-see.
  Migration `004_job_posting_snapshot_version` (schema file alone is a no-op
  on existing tables — deltas go in `migrations/`).
- **Integrity endpoint** `GET /api/integrity` (admin): leads parked in
  transient stages > 6h + per-queue `{depth, processing, dlq}` for all 7
  queues. Live-verified.
- **DLQ ops** (admin, audited): `GET /api/dlq/:queue` (inspect, cap 50),
  `POST …/redrive` (attempt counters reset), `DELETE …` (purge).

## Testing
`test/admin-integrity.test.ts` (4), live endpoint checks, full suites green.
