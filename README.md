# JobPilot AI — Job Intelligence & Application Platform

Candidate-first job intelligence platform built on this repository's React, Fastify, PostgreSQL and Python worker stack. Discover recent roles from permitted sources, review evidence-based listing confidence, compare explainable profile matches, prepare truthful application materials, and track application outcomes.

The original recruiter lead-intelligence workflow remains available to administrators as a legacy operations area. New candidate registrations use the candidate workspace.

You can run this project **Without Docker** (pure local setup) or **With Docker** (one-command containerized stack).

## Candidate workflow

1. Register a candidate account or sign in. New registrations open the candidate workspace.
2. Build a profile manually or upload a PDF/DOCX/TXT resume. Extracted fields are suggestions; review and save them before they become the profile used for matching.
3. Discover fresh roles, inspect source evidence, and filter by role, location, work setup and age.
4. Review recommendations with weighted dimensions for skills, experience, education, location, role fit, projects, salary and preferences.
5. Generate role-specific resume and email drafts from confirmed profile facts. Gemini is optional; a local template is used when no API key is configured. Review every draft before use.
6. Open the employer's application page yourself, then track saved, applied, screening, interview, offer, rejection, withdrawal and joining milestones.

The app never submits applications automatically or attempts to bypass CAPTCHA, anti-bot checks, access controls or source terms. Scraping defaults to official ATS connectors and selected public feeds. Other connectors are filtered unless an operator has reviewed access permissions and adds them to `SCRAPE_PERMITTED_SOURCES`. See [the implementation alignment notes](docs/IMPLEMENTATION_ALIGNMENT.md) for the detailed mapping to the project blueprint.

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

If you want live job discovery and resume parsing, start the Python worker:
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

For Docker mode, sign in at **http://localhost:5174** with the admin credentials from `.env`:

```ini
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-please-32
Or Create a New Account 
```

> Candidate sign-up at `/register` creates a candidate account. Use the admin credentials above for job review, source health, settings, and legacy recruiter operations.

---

## 🌐 Services & Ports

| Service | Port / URL | Description |
|---|---|---|
| **JobPilot (Docker)** | http://localhost:5174 | Candidate and admin workspaces |
| **API (Docker)** | http://localhost:3001 | Fastify REST API + WebSockets |
| **API Health (Docker)** | http://localhost:3001/health | Health & uptime endpoint |
| **Workers (Docker)** | http://localhost:8011 | Python FastAPI Scrapers & Queue Consumers |
| **Workers Health (Docker)** | http://localhost:8011/health | Scraper fleet status |
| **PostgreSQL (Docker)** | `localhost:5434` | Database (`leads_db`) |
| **Redis (Docker)** | `localhost:6381` | Message queues & caching |
| **n8n (Docker)** | http://localhost:5679 | Workflow orchestration |
| **Reacher (Docker)** | http://localhost:5051 | Email verification service |

---

## 🔄 Job intelligence pipeline

```text
Permitted sources → ingestion workers → normalization + deduplication
  → evidence-based quality score → PostgreSQL → profile-specific candidate matching
  → user-reviewed resume/email drafts → user-authorized employer application
  → status history, outcomes, feedback and admin monitoring
```

The existing lead enrichment and outreach workers are available for the legacy admin workflow only when `ENABLE_LEGACY_OUTREACH_PIPELINE=1`. Candidate job discovery, recommendations and applications do not depend on them. A listing with an evidence-based quality score above 70 is published automatically; lower-quality listings stay in the admin review queue. Existing pending listings are re-scored by migration 009.

Candidate recommendations use a small feed-forward neural ranker (9 inputs → 14 → 8 → 1). The committed bootstrap artifact is trained on generated weak-label examples; it does not claim to be trained on real applicant outcomes. Admin retraining requires at least 20 usable interview/offer/joined or withdrawn outcomes with both positive and negative examples. Recommendations show only model scores of 70% or higher. Resume Studio provides three fixed PDF layouts and uses profile facts; job tailoring can call Gemini when `GEMINI_API_KEY` is set. Uploaded resumes are processed in memory. Scanned PDFs without selectable text should be uploaded as OCR-enabled PDFs or as DOCX/TXT.

---

## 📁 Repository Layout

```text
packages/
  api/                    ← Fastify (Node 20) Backend
    src/routes/           ← candidate, auth, admin, legacy leads, companies, contacts, dashboard, ws
    src/scripts/          ← applySchema.ts (cross-platform schema runner), seedAdmin.ts
    database/
      schema/             ← tables, constraints, functions, triggers, indexes
      migrations/         ← node-pg-migrate deltas
  web/                    ← React 18 platform (Vite, Tailwind, Framer Motion)
    src/pages/            ← Candidate profile, discovery, recommendations, applications, admin review
    src/components/       ← Candidate cards, shared UI, Header, Sidebar, Logo
  scrapers/               ← Python job discovery and resume parser workers
    main.py               ← FastAPI service + queue consumers
    scrapers/             ← ATS/public-feed connectors and legacy integrations
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
- **Source policy**: discovery filters to permitted ATS/public-feed connectors; browser stealth, proxy rotation and CAPTCHA solving are disabled by default.
- **Candidate data**: profile and application endpoints are account-scoped. Uploaded resumes are parsed in memory; the original file is not stored.
- **Truthful drafting**: the AI prompt limits drafts to confirmed profile facts; all generated materials remain drafts for the candidate to review.
- **Authorized applications**: the user completes final submission on the employer site; status changes are tracked with history.
- **Legacy outreach**: its CAN-SPAM footer, unsubscribe endpoints and cooldown controls remain in place for the recruiter lead workflow.
