# Track 5 — Observability Design

## Decision
Dependency-free Prometheus exposition at `GET /api/metrics` (admin-gated;
scrape with a bearer token). No Grafana/Prometheus containers now — the
endpoint is the contract; visualization later. No new npm dependencies
(hand-rolled ~50 lines vs prom-client).

## Series (§39 coverage, aggregates only — zero PII)
- `hiregen_leads_total{stage}`, `hiregen_leads_score_band{band}`
- `hiregen_queue_depth{queue,state}` (pending/processing/dlq × 7 queues)
- `hiregen_stuck_leads`, `hiregen_source_failures{source}`,
  `hiregen_source_circuit_open{source}`
- `hiregen_verifications_24h{channel,result}`,
  `hiregen_outreach_24h{channel,status}`, `hiregen_suppressions_total`

## Testing
Shape/content-type/PII-absence test in `test/admin-integrity.test.ts`.
Redis outage degrades (series omitted) instead of failing the scrape.
