# Backup & Restore Runbook

## What persists where

| Data | Lives in | Survives restart? | Survives `down -v`? |
|---|---|---|---|
| Leads, contacts, jobs, outreach, audit | Postgres `pgdata` volume | Yes | No — restore from dump |
| Queues, DLQs, circuit-breakers, daily claims | Redis `redisdata` volume + AOF (`everysec`, RPO ≤ 1s) | Yes | No — queues re-drive from Postgres sweeps |
| n8n workflows/credentials | `n8n-data` volume | Yes | No — re-import from `packages/n8n/workflows/` |

## Nightly Postgres dump (host cron, 02:00)

```bash
docker compose exec -T postgres pg_dump -U postgres -d leads_db \
  | gzip > /var/backups/hiregen/leads_db-$(date +%F).sql.gz
find /var/backups/hiregen -name 'leads_db-*.sql.gz' -mtime +14 -delete
```

## Restore drill (do this quarterly)

```bash
docker compose up -d postgres redis
zcat /var/backups/hiregen/leads_db-<date>.sql.gz \
  | docker compose exec -T postgres psql -U postgres -d leads_db
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/leads_db \
  sh packages/api/database/utils/apply_schema.sh   # re-assert schema/triggers
docker compose up -d api workers web               # boot reclaim restores queues
```

## Disaster notes
- `down -v` destroys volumes by explicit operator choice — that is the one
  path that loses data. Everything else (crash, reboot, `down`, image
  rebuild) resumes: Postgres replays WAL, Redis replays AOF, workers reclaim
  stranded `:processing` jobs on boot.
- Suppression tombstones are never deleted by retention sweeps — a restore
  can only ever re-add blocks, never drop them.
- RTO: fresh host + `./up.sh` + latest dump ≈ 15 minutes.
