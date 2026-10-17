# Database
Single home for all database definitions, separated by concern:

- `schema/`       declarative base applied on every boot (idempotent)
  - `tables/`     CREATE TABLE (+ 000_extensions.sql)
  - `indexes/`    CREATE INDEX
  - `constraints/`CHECK / invariant constraints
  - `enums/` `views/` `functions/` `triggers/`  reserved (see each README)
- `migrations/`   forward-only deltas for already-provisioned prod DBs
- `seeds/`        reference/demo data
- `config/`       runner config (node-pg-migrate)
- `utils/`        apply helpers

`schema/` is the source of truth for a fresh deployment. It is applied by the
`pg-migrator` container on boot via `utils/apply_schema.sh`, which runs
tables -> constraints -> indexes -> migrations in dependency order.
