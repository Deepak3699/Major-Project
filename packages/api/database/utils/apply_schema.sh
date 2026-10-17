#!/bin/sh
# Apply the declarative schema (source of truth for a fresh DB) in strict
# dependency order:
#   tables -> constraints -> functions -> triggers -> indexes
# (functions precede triggers because a trigger calls a function; indexes come
# last because some are partial/functional and depend on the columns existing.)
# Everything is idempotent, so this is safe to re-run on every boot. Incremental
# prod deltas live in ../migrations and are applied separately via npm run migrate.
#
# Usage: apply_schema.sh   (reads DATABASE_URL, or PG* env vars)
set -eu
DB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PSQL="psql ${DATABASE_URL:-} -v ON_ERROR_STOP=1 -q"

for dir in tables constraints functions triggers indexes; do
  echo "==> schema/$dir"
  for f in "$DB_DIR"/schema/$dir/*.sql; do
    [ -e "$f" ] || continue
    case "$f" in */README.md) continue;; esac
    $PSQL -f "$f"
  done
done
echo "==> schema applied"
