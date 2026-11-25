#!/usr/bin/env bash
# One-command bootstrap for a fresh Oracle Cloud Always-Free ARM VM (Ubuntu).
# Run as the default 'ubuntu' user with sudo rights:
#   bash <(curl -fsSL https://raw.githubusercontent.com/Deepak3699/Major-Project/main/deploy/setup-oracle.sh)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Deepak3699/Major-Project.git}"
APP_DIR="${APP_DIR:-$HOME/hiregen}"
COMPOSE="docker-compose.deploy.yml"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
ask() { local prompt="$1" var="$2" current="${3:-}"; read -r -p "$prompt" "$var"; }

say "Installing Docker and prerequisites"
sudo apt-get update -qq
sudo apt-get install -y -qq ca-certificates curl git openssl cron >/dev/null
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo systemctl enable --now docker

say "Getting the project"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

say "Configuring environment"
if [ ! -f .env ]; then
  cp deploy/.env.deploy.example .env
fi
# shellcheck disable=SC1091
set -a; . ./.env; set +a

if [ -z "${DOMAIN:-}" ] || [ "${DOMAIN}" = "your-name.duckdns.org" ]; then
  ask "DuckDNS subdomain only (e.g. hiregen-team): " DUCK_SUB
  ask "DuckDNS token: " DUCK_TOKEN
  DOMAIN="${DUCK_SUB}.duckdns.org"
  sed -i "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" .env
  CRON_LINE="*/5 * * * * curl -fsS 'https://www.duckdns.org/update?domains=${DUCK_SUB}&token=${DUCK_TOKEN}&ip=' >/dev/null 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'duckdns.org/update' || true; echo "$CRON_LINE" ) | crontab -
  say "DuckDNS updater installed (runs every 5 minutes)"
fi

gen_secret() { openssl rand -hex 32; }
replace_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" .env; then sed -i "s|^${key}=.*|${key}=${value}|" .env; else echo "${key}=${value}" >> .env; fi
}
for key in POSTGRES_PASSWORD JWT_SECRET ENCRYPTION_SECRET; do
  current="$(grep "^${key}=" .env | cut -d= -f2- || true)"
  if [ -z "$current" ] || [[ "$current" == change-me* ]]; then
    replace_env "$key" "$(gen_secret)"
    say "Generated $key"
  fi
done
if [ -z "${BOOTSTRAP_ADMIN_EMAIL:-}" ] || [[ "$BOOTSTRAP_ADMIN_EMAIL" == *example.com ]]; then
  ask "Admin email: " ADMIN_EMAIL_IN
  replace_env BOOTSTRAP_ADMIN_EMAIL "$ADMIN_EMAIL_IN"
  export BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL_IN"
fi
if [ -z "${BOOTSTRAP_ADMIN_PASSWORD:-}" ] || [[ "$BOOTSTRAP_ADMIN_PASSWORD" == change-me* ]]; then
  ask "Admin password (min 8 chars): " ADMIN_PASS_IN
  replace_env BOOTSTRAP_ADMIN_PASSWORD "$ADMIN_PASS_IN"
  export BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASS_IN"
fi

say "Updating DuckDNS now"
if [ -n "${DUCK_SUB:-}" ] && [ -n "${DUCK_TOKEN:-}" ]; then
  curl -fsS "https://www.duckdns.org/update?domains=${DUCK_SUB}&token=${DUCK_TOKEN}&ip=" || true
fi

say "Opening VM firewall ports (Oracle security list must also allow 80/443)"
sudo ufw allow 22/tcp >/dev/null || true
sudo ufw allow 80/tcp >/dev/null || true
sudo ufw allow 443/tcp >/dev/null || true
sudo ufw --force enable >/dev/null || true

say "Building and starting the stack (first build takes several minutes)"
sudo docker compose -f "$COMPOSE" pull 2>/dev/null || true
sudo docker compose -f "$COMPOSE" up -d --build

say "Waiting for HTTPS to come up"
for i in $(seq 1 60); do
  if curl -fsS "https://${DOMAIN}/api/health" >/dev/null 2>&1; then break; fi
  sleep 5
done

say "Creating the first administrator"
sudo docker compose -f "$COMPOSE" exec -T api npm run bootstrap:admin || true

say "Done"
echo "Open: https://${DOMAIN}"
echo "Login: ${BOOTSTRAP_ADMIN_EMAIL:-see .env}"
echo "Useful commands (run from $APP_DIR):"
echo "  sudo docker compose -f $COMPOSE logs -f"
echo "  sudo docker compose -f $COMPOSE restart"
echo "  sudo docker compose -f $COMPOSE down        # stop without deleting data"
