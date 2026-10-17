#!/usr/bin/env bash
# up.sh - one-shot stack launcher for Linux/macOS.
# Windows users: run .\up.ps1 in PowerShell instead. Same steps, same result.
#
# Usage: ./up.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Starting SSH server..."
if ! ss -tln | grep -q ':22 '; then
  sudo systemctl start ssh 2>/dev/null || sudo systemctl start sshd
fi

echo "==> Building images & starting stack (postgres, redis, api, web, workers, reacher, n8n)..."
docker compose up -d --build

echo "==> Applying database migrations (idempotent; waits for postgres)..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if docker compose exec -T api npm run --silent migrate 2>/dev/null; then
    echo "    migrations applied"; break
  fi
  echo "    db/api not ready yet, retrying ($i/15)..."; sleep 3
done

echo "==> Bootstrapping admin account (idempotent, reads ADMIN_EMAIL/ADMIN_PASSWORD from .env)..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if docker compose exec -T api npm run --silent seed:admin 2>/dev/null; then break; fi
  echo "    api not ready yet, retrying ($i/10)..."; sleep 3
done

echo "==> Status:"
docker compose ps
