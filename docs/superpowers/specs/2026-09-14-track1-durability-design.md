# Track 1 — Durability Design ("leads stay even if server stopped")

## Problem
- Redis (queues, DLQs, circuit-breaker state, daily-claim keys, SSE pub/sub) has
  no volume and no AOF: any `down`, restart, or host reboot loses everything.
- Consumers use `BRPOP` (pop-then-process): a worker crash between pop and DB
  commit silently loses the job. DLQ/retry (added earlier) only covers
  *handled* exceptions, not crashes.
- Postgres already persists via the `pgdata` volume. No change needed there.

## Non-goals
- No new services (no Kafka/NATS/Temporal — rejected in program review).
- No Redis Streams migration now (Lists + reclaim hold at this throughput).
- No cross-DB distributed transactions; full outbox pattern deferred.

## Design
1. **Redis persistence** (`docker-compose.yml` only): named volume
   `redisdata:/data` + `command: redis-server --appendonly yes
   --appendfsync everysec`. RPO ≤ 1s for queued jobs. Also drops the
   obsolete `version: '3.8'` key (compose warning noise).
2. **Reliable queue** (`scrapers/queue.py`): three helpers —
   - `reliable_brpop(redis, queue, timeout)` → `BRPOPLPUSH queue
     queue:processing timeout`; returns `(raw_msg, payload)`.
   - `ack(redis, queue, raw_msg)` → `LREM queue:processing 1 raw_msg`.
   - `reclaim_processing(redis, queues)` → `RPOPLPUSH processing → queue`
     until empty at boot; returns per-queue counts for logging.
   - `run_queue_consumer` uses the same three helpers (it is currently
     unused by the bespoke loops but must not rot).
3. **Consumer loops** (7 files): replace `brpop` with `reliable_brpop`,
   call `ack` after successful `process_*`, keep existing
   `requeue_or_dlq` on handled exceptions (a requeued job must ALSO be
   acked from `:processing` first, else it duplicates — order: ack, then
   requeue/DLQ).
4. **Boot reclaim** (`main.start_consumers`): before spawning consumers,
   `reclaim_processing` over all 7 queues + DLQ-depth log line (feeds the
   future /metrics endpoint).
5. **Backup runbook** (`docs/BACKUP_RESTORE.md`): `pg_dump` command, volume
   inventory, restore drill steps, RPO/RTO statement. Doc-only; no cron
   container (host cron owns scheduling — one line in the doc).

## Failure semantics after this track
| Event | Outcome |
|---|---|
| Worker crash mid-job | Job sits in `:processing`; reclaimed to main queue on next boot, processed once (consumers idempotent via fingerprints + cooldowns). |
| Redis restart | AOF replays ≤1s window; `:processing` lists also replay → reclaimed. |
| `compose down` (volumes kept) | Everything resumes. |
| `compose down -v` | Data gone by explicit operator choice; restore via runbook dump. |

## Testing
- Unit (stubs): ack removes exactly one copy; reclaim drains in order;
  requeue path acks before re-pushing (no duplicates).
- Live (real redis, `leads_db_test`-adjacent db index — never `leads_db`):
  push → reliable_brpop → assert main empty + processing has it → simulate
  crash (no ack) → reclaim → job back in main.
- Full suites + `tsc` + prod build unchanged (no API/web changes except none).

## Rollout
`docker compose up -d redis workers` (redis restarts once to pick up AOF;
in-flight queue content today is empty/dev-only — accepted, documented in
the verification log).
