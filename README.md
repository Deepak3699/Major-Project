# Take It — Lead Intelligence Engine

Full-stack lead generation & outreach system: scrape job postings → enrich leads → verify emails → AI-draft outreach → send.

You can run this project **Without Docker** (pure local setup) or **With Docker** (one-command containerized stack).

---

## ⚡ Quick Start: Running Without Docker (Recommended Local Setup)

Run the services natively on your machine using Node.js, Python, and local or cloud instances of PostgreSQL and Redis.

### Prerequisites

| Tool | Recommended Version | Notes |
|---|---|---|
| **Node.js** | `>= 20.x` | Required for API & Web CRM (`node -v`) |
| **npm** | `>= 10.x` | Comes with Node.js |
| **PostgreSQL** | `15` or `16` | Database on port `5432` (or free cloud DB like Neon / Supabase) |
| **Redis** | `7.x` | Cache & Queues on port `6379` (or free cloud Redis like Upstash) |
| **Python** | `3.11` or `3.12` | For scrapers fleet (`packages/scrapers`) |

> 💡 **No local PostgreSQL or Redis installed?**
> You can use free hosted cloud services instead of installing them locally:
> - **PostgreSQL**: [Neon.tech](https://neon.tech) or [Supabase](https://supabase.com) (free tier)
> - **Redis**: [Upstash](https://upstash.com) (free tier)
> Simply set their connection strings in your `.env` file!

---

### Step 1: Environment Configuration

Copy the example environment file to `.env` in the root folder:

```powershell
# In PowerShell:
Copy-Item .env.example .env
```

Open `.env` and verify your database & redis connection details:
```ini
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/leads_db
REDIS_URL=redis://localhost:6379

JWT_SECRET=change-this-to-a-long-random-string
ENCRYPTION_SECRET=change-this-to-another-long-random-string-min-32-chars

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-please-32
```

---

### Step 2: Database Initialization (1-Command Automated)

1. Make sure your PostgreSQL server is running and the database exists:
   ```sql
   CREATE DATABASE leads_db;
   ```

2. Open your terminal in `packages/api` and run:
   ```bash
   cd packages/api
   npm install
   npm run db:init
   ```

> **What `npm run db:init` does automatically:**
> 1. Runs the declarative base schema (`database/schema/` tables, constraints, functions, triggers, indexes) using a pure Node.js runner.
> 2. Applies all forward migrations (`database/migrations/`).
> 3. Seeds the initial bootstrap admin account from `.env`.

---

### Step 3: Start the Backend API (Terminal 1)

In `packages/api`:
```bash
npm run dev
```
- **API URL:** `http://localhost:3000`
- **Health check:** `http://localhost:3000/health`

---

### Step 4: Start the Frontend Web UI (Terminal 2)

Open a second terminal:
```bash
cd packages/web
npm install
npm run dev
```
- **Web CRM URL:** `http://localhost:5173`
- The Vite dev server automatically proxies `/api` and `/sse` requests to `http://localhost:3000`.

---

### Step 5: Start Python Scraper Workers (Terminal 3 — Optional)

If you want to run live web scrapers, OSINT contact enrichment, and AI draft generation:
```powershell
cd packages\scrapers

# Windows PowerShell:
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python main.py

# Linux / macOS:
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```
- **Workers API URL:** `http://localhost:8000`
- **Health check:** `http://localhost:8000/health`

---

## 🐳 Alternative: Running With Docker (One Command)

If you have **Docker Desktop** installed and running:

| Your OS | Command |
|---|---|
| **Windows 10/11** (PowerShell) | `powershell -ExecutionPolicy Bypass -File .\up.ps1` |
| **Linux / macOS** | `./up.sh` |

Both launchers build the images, spin up all containers (Postgres, Redis, API, Web, Workers, Reacher, n8n), apply database migrations, and bootstrap the admin account automatically.

---

## 🔑 Login & First Access

Sign in at **http://localhost:5173** with the admin credentials from `.env`:

```ini
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-please-32
Or Create a New Account 
```

> ⚠️ **Important:**
> - Do not use the self-registration form (`/register`) for the initial access. Self-registration creates a `sales_rep` account that can only view assigned leads.
> - Use the **admin account** above to see all scraped leads and manage API keys under **Settings**.

---

## 🌐 Services & Ports

| Service | Port / URL | Description |
|---|---|---|
| **Web CRM** | http://localhost:5173 | React 18 + Vite + Tailwind UI |
| **API** | http://localhost:3000 | Fastify REST API + WebSockets |
| **API Health** | http://localhost:3000/health | Health & uptime endpoint |
| **Workers** | http://localhost:8000 | Python FastAPI Scrapers & Queue Consumers |
| **Workers Health** | http://localhost:8000/health | Scraper fleet status |
| **PostgreSQL** | `localhost:5432` | Database (`leads_db`) |
| **Redis** | `localhost:6379` | Message queues & caching |
| **n8n** | http://localhost:5678 | Workflow orchestration (Docker mode) |
| **Reacher** | http://localhost:5050 | Email verification service (Docker mode) |

---

## 🔄 The Pipeline

```text
Step 1  Scrape       Scraper fleet (Naukri, Internshala, Lever, Greenhouse, Adzuna...)
                     → raw leads → Postgres               [cron / manual trigger]

Step 2  Enrich       OSINT enrichment (Snov.io, ContactOut — keys in Settings)
                     → company + HR contact data          [per-lead button in UI]

Step 3  Verify       Email & contact verification (Reacher / SMTP checks)
                     → verification_log                   [per-lead button in UI]

Step 4  Draft        Gemini AI outreach draft generation
                     → outreach_drafts                    [per-lead button in UI]

Step 5  Send         Resend / Brevo email or WhatsApp
                     → outreach_log + webhooks            [per-lead button in UI]
```

---

## 📁 Repository Layout

```text
packages/
  api/                    ← Fastify (Node 20) Backend
    src/routes/           ← auth, leads, companies, contacts, dashboard, admin, ws
    src/scripts/          ← applySchema.ts (cross-platform schema runner), seedAdmin.ts
    database/
      schema/             ← tables, constraints, functions, triggers, indexes
      migrations/         ← node-pg-migrate deltas
  web/                    ← React 18 CRM (Vite, Tailwind, Framer Motion, TanStack Table)
    src/pages/            ← Dashboard, Leads, Contacts, Companies, Analytics, Settings
    src/components/       ← UI components, Header, Sidebar, Logo
  scrapers/               ← Python fleet (FastAPI, Scrapy, Playwright, HTTPX)
    main.py               ← Supervisor + queue consumers
    scrapers/             ← 40+ job board & OSINT scrapers
docker-compose.yml        ← Container orchestration stack
up.ps1 / up.sh            ← One-shot Docker launchers
.env.example              ← Template configuration
```

---

## 🧪 Testing & Verification

Run tests inside each package:

```bash
# Web tests (Jest + React Testing Library)
cd packages/web && npm test

# API tests & Type check
cd packages/api && npm test
cd packages/api && npm run lint

# Scraper fleet tests (pytest)
cd packages/scrapers && pytest tests/
```

---

## 🛡️ Security & Compliance

- **Secrets**: Never commit `.env` to version control.
- **API Keys**: Stored via the web Settings page and encrypted at rest with AES-256-GCM.
- **Admin Endpoints**: Integrity checks, metric streams, and DLQ routes are strictly admin-authenticated.
- **Anti-Spam & Compliance**: Built-in CAN-SPAM footer, unsubscribe endpoints, and cooldown periods.
