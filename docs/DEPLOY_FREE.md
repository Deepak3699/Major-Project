# Free permanent deployment (Oracle Cloud Always Free + DuckDNS)

This deploys the **whole stack** — web, API, PostgreSQL, Redis, workers, and an
automatic-HTTPS reverse proxy — on one Oracle Cloud **Always Free** ARM VM and a
free DuckDNS subdomain. Oracle asks for a card at signup but does not charge
while you stay inside the always-free limits. Nothing in this setup sleeps.

Estimated monthly cost: **₹0 / $0** within the always-free allowance.

---

## 1. Create the free VM

1. Sign up at <https://www.oracle.com/cloud/free/> (free tier).
2. In the console: **Compute → Instances → Create instance**.
3. Name it anything, e.g. `hiregen`.
4. **Image:** Canonical Ubuntu 22.04 LTS (ARM64).
5. **Shape:** `VM.Standard.A1.Flex`, then set **4 OCPU / 24 GB RAM** (all inside
   the always-free pool). If Oracle reports "out of capacity", try another
   Availability Domain, another region, or 2 OCPU / 12 GB.
6. Add your SSH public key (or save the private key Oracle gives you).
7. Create the instance and note its **public IP**.

### Open the firewall in Oracle (very important)

In the instance's **VCN → Security Lists → Default Security List → Ingress
Rules**, add:

| Source | Protocol | Port | Purpose |
|---|---|---|---|
| `0.0.0.0/0` | TCP | 80 | Let's Encrypt HTTP challenge / redirect |
| `0.0.0.0/0` | TCP | 443 | HTTPS traffic |

The setup script also opens 80/443 inside Ubuntu (`ufw`). Both layers must allow
the ports or Caddy cannot issue a certificate.

---

## 2. Create a free domain

1. Go to <https://www.duckdns.org> and sign in with GitHub/Google/email.
2. Add a domain, e.g. `hiregen-team` → `hiregen-team.duckdns.org`.
3. Copy the **token** shown on the page. The setup script installs a cron job
   that keeps the DNS record pointed at the VM's public IP.

---

## 3. SSH into the VM and run the setup

```bash
ssh ubuntu@<public-ip>
bash <(curl -fsSL https://raw.githubusercontent.com/Deepak3699/Major-Project/main/deploy/setup-oracle.sh)
```

The script:

- installs Docker,
- clones the repository into `~/hiregen`,
- creates `.env` from `deploy/.env.deploy.example`,
- generates strong `POSTGRES_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_SECRET`,
- asks for your DuckDNS subdomain/token and admin credentials,
- installs the DuckDNS IP updater cron,
- opens the VM firewall,
- builds and starts every container (first build can take 10–20 minutes),
- waits for HTTPS, then creates the first administrator.

When it finishes:

```
Open: https://your-name.duckdns.org
Login: <the admin email you entered>
```

The same URL is public — share it with anyone. New candidates can register from
the login page.

---

## 4. Gemini key (optional)

The app works without Gemini: every AI feature has a complete template
fallback. To enable real Gemini calls on the server, add the key to the VM's
`.env` (never commit it):

```bash
cd ~/hiregen
sudo nano .env          # set GEMINI_API_KEY=...
sudo docker compose -f docker-compose.deploy.yml up -d --build api
```

Alternatively log in as admin → **Settings → Gemini API Key** → save. The
stored key is encrypted and takes priority over the env value. Admins can see
requests, tokens, cost and caps under **Gemini usage & cost**.

> The free-tier key may only allow newer models; the default is
> `gemini-3.5-flash-lite`, which is selectable in the admin page.

---

## 5. Day-to-day commands

Run from `~/hiregen`:

```bash
# Status / logs
sudo docker compose -f docker-compose.deploy.yml ps
sudo docker compose -f docker-compose.deploy.yml logs -f

# Deploy an update from GitHub
git pull
sudo docker compose -f docker-compose.deploy.yml up -d --build

# Stop without deleting data
sudo docker compose -f docker-compose.deploy.yml down

# Backup the database
sudo docker compose -f docker-compose.deploy.yml exec -T postgres \
  pg_dump -U postgres leads_db > backup.sql
```

Only Caddy publishes ports (80/443). Postgres, Redis, workers and n8n are on the
private Docker network, so they are not reachable from the internet.

Optional workflow automation is disabled by default. To enable n8n:

```bash
sudo docker compose -f docker-compose.deploy.yml --profile n8n up -d
```

---

## 6. Notes and limits

- Oracle's always-free ARM allowance is 4 OCPU / 24 GB RAM, 200 GB storage.
  This stack uses roughly 4–6 GB RAM and well under the storage quota.
- A credit card is required for Oracle signup/identity verification; there is
  no charge while you remain within the always-free scope. Monitor the Oracle
  "Usage" page if you change shapes or add resources.
- DuckDNS is free; the IP updater cron keeps the hostname current if the VM's
  public IP changes on reboot.
- Caddy obtains and renews Let's Encrypt certificates automatically. If HTTPS
  never comes up, check: DNS resolves to the VM IP, ports 80/443 are open in
  **both** the Oracle security list and `ufw`, and
  `sudo docker compose -f docker-compose.deploy.yml logs caddy`.
- Candidate data lives in the `pgdata` Docker volume — backups and `down`
  without `-v` keep it safe.
