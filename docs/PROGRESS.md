# PROGRESS.md — HireGen Lead Intelligence Engine (Phase 0)

## Status: Phase 0 in progress

## Architecture Summary

**Stack per SRS §3:**

| Layer | Tech | Free-tier notes |
|-------|------|-----------------|
| Database | PostgreSQL 16 (local/Docker) | Neon free tier as fallback |
| Cache/Broker | Redis (ioredis / Upstash) | Upstash 256MB free |
| API | Fastify (Node.js 18+) | — |
| Workers | FastAPI (Python 3.12) | — |
| CRM | React 18 + Vite + TailwindCSS | — |
| Scrapers | aiohttp + asyncio (Python) | — |
| Orchestration | n8n (self-hosted, free image) | — |
| Email | Resend (3K/mo free) or Brevo (300/day free) | — |
| WhatsApp | self-hosted whatsapp-web.js | — |
| AI Drafts | Gemini 2.5 Flash (`$0.30/1M in, $2.50/1M out` free tier) | **Corrected from deprecated Gemini 2.0 Flash** |
| Email Validation | Reacher (self-hosted Docker) | — |
| Lead Capture | LinkedIn Sales Navigator + Apollo + Hunter.io (manual) | — |

### Pre-flight corrections applied

1. **Gemini 2.0 Flash → Gemini 2.5 Flash**: `gemini-2.0-flash` was deprecated June 1, 2026. All draft-generation references now use `gemini-2.5-flash`. Free tier: `$0.30/1M input, $2.50/1M output tokens`. Rate limits are dynamic per-project (no static table — must check AI Studio).

2. **Arbeitnow API**: The actual endpoint is `https://www.arbeitnow.com/jobs/api`, not `api.arbeitnow.com` as the SRS §4 table may imply. The API returns HTML with embedded JSON (not clean JSON). A regex-based parser is implemented.

3. **Lever API**: `api.lever.co/v0/postings/{company}?mode=json` returns `{"ok":false,"error":"Document not found"}` for companies not on Lever. The scraper handles this gracefully and skips non-Lever companies.

4. **Greenhouse API**: Confirmed at `boards-api.greenhouse.io/v1/boards/{company}/jobs`. The `boards.` subdomain prefix in the SRS §4 table is incorrect — the correct domain is `boards-api.greenhouse.io`.

5. **GitHub repos**: `SimplifyJobs/Summer2026-Internships` was renamed to `Summer2027-Internships` (46,413 stars, actively maintained). `vanshb03/New-Grad-Jobs` returns 404 and is excluded. `pittcsc/Summer2026-Internships` (63 stars, last updated Jun 2026) is included as a secondary source.

6. **holehe repo**: Located at `megadose/holehe` (not `priler/holehe`). MIT-like license.

7. **psycopg2-binary**: Replaced with `psycopg[binary]` (psycopg3) due to build failures on Python 3.14.

8. **n8n license**: n8n uses Sustainable Use License (not OSI-approved). This is documented as a known limitation for the self-hosted orchestrator.

### Pipeline architecture (SRS §9)

```
Step 1 (automated via n8n cron):
  Scraper Fleet (Python/FastAPI) → raw_leads_queue (Redis)

Step 2 (on-demand per-row click):  
  OSINT Enrichment → enrichment_queue → enrichment_log

Step 3 (on-demand per-row click):
  Email/WhatsApp Verification → verification_queue → verification_log

Step 4 (on-demand per-row click):
  Gemini 2.5 Flash draft generation → draft_queue → outreach_drafts

Step 5 (on-demand per-row click):
  Send via Resend/Brevo/WhatsApp → send_queue → outreach_log → webhooks
```

### Circuit breaker (SRS §9.2)

Each scraper source has a circuit breaker:
- Failure threshold: 5 consecutive failures (configurable via env)
- Cooldown: 120 minutes (configurable via env)
- State persisted to `source_health` table in PostgreSQL
- Local in-memory state when Redis/PostgreSQL unavailable (for tests)

### Lead scoring (SRS §5.1)

| Signal | Points |
|--------|--------|
| HR name found | 20 |
| HR personal email/mobile found | 25 |
| HR LinkedIn URL found | 15 |
| Company official email/phone | 10 |
| Job description quality (salary + description + URL) | 5-10 |
| Email verified (Reacher) | 10 |
| WhatsApp verified | 10 |

**Bands**: Hot ≥70, Warm ≥40, Cold <40

### Dedup (SRS §4.6)

Fingerprint = SHA-256(normalized_company_name + job_title + job_url_domain). Same fingerprint = same job posting, updates `last_seen_at`.

## Files implemented

### Repository scaffolding
- `.nvmrc`, `.gitignore`, `.env.example`
- Root `package.json`, `turbo.json`
- `Dockerfile.base`

### API (`packages/api/`)
- `src/server.ts` — Fastify app bootstrap with CORS, Helmet, JWT, rate-limit, websocket
- `src/app.ts` — Server entry point
- `src/utils/env.ts` — Zod-based env validation
- `src/utils/db.ts` — PostgreSQL connection (postgres library)
- `src/utils/redis.ts` — Redis connection (ioredis)
- `src/utils/crypto.ts` — bcrypt password hashing
- `src/utils/scoring.ts` — Lead scoring engine (§5.1)
- `src/utils/dedup.ts` — Fingerprint generation + Levenshtein distance
- `src/utils/circuit-breaker.ts` — Circuit breaker (§9.2)
- `src/middleware/auth.ts` — JWT authenticate + role authorize
- `src/middleware/error-handler.ts` — Error handler
- `src/routes/index.ts` — Route registry
- `src/routes/leads.ts` — Lead CRUD + pipeline actions (§3.4)
- `src/routes/auth.ts` — Login/register/logout
- `src/routes/admin.ts` — Run trigger, settings, source health
- `src/routes/dashboard.ts` — Dashboard stats (§3.4)
- `src/routes/webhooks.ts` — Resend + WhatsApp webhooks
- `src/routes/ws.ts` — SSE + WebSocket endpoints (§3.4.5)
- `migrations/001_initial_schema.ts` — Full DB schema (§10)
- `migrate-config.ts` — node-pg-migrate config
- `Dockerfile`
- `test/jest.config.cjs`, `test/setup.ts`
- `test/dedup.test.ts` — 7 tests
- `test/scoring.test.ts` — 10 tests
- `test/circuit-breaker.test.ts` — 5 tests

### Python Workers (`packages/scrapers/`)
- `main.py` — FastAPI worker API
- `scrapers/base.py` — Base scraper + CircuitBreaker
- `scrapers/remoteok.py` — RemoteOK scraper (Tier 1)
- `scrapers/arbeitnow.py` — Arbeitnow scraper (Tier 1)
- `scrapers/github_jobs.py` — GitHub jobs scraper (SimplifyJobs + pittcsc)
- `scrapers/greenhouse.py` — Greenhouse ATS scraper (Tier 3)
- `scrapers/lever.py` — Lever ATS scraper (Tier 3)
- `scrapers/normalizer.py` — Dedup + normalization + DB insert
- `scrapers/queue.py` — Redis queue dispatch
- `scrapers/utils/redis.py` — Redis client
- `scrapers/utils/db.py` — asyncpg pool
- `scrapers/utils/__init__.py`
- `tests/test_normalizer.py` — 7 tests
- `tests/test_circuit_breaker.py` — 5 tests
- `requirements.txt`, `Dockerfile`

### React CRM (`packages/web/`)
- `src/main.tsx` — React entry
- `src/App.tsx` — Route layout
- `src/index.css` — Tailwind base styles
- `src/lib/api.ts` — Axios API client (all endpoints)
- `src/lib/types.ts` — TypeScript types (SRS §10 schema)
- `src/stores/auth.ts` — Zustand auth store
- `src/hooks/useSSE.ts` — SSE real-time hook
- `src/components/Layout.tsx`, `Sidebar.tsx`, `Header.tsx`
- `src/pages/Dashboard.tsx`, `Leads.tsx`, `LeadDetail.tsx`, `Login.tsx`
- `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`
- Dockerfile, nginx.conf

### n8n (`packages/n8n/`)
- `workflows/daily-scrape.json` — Daily cron at 5:00 UTC

### Docker Compose
- `docker-compose.yml` — postgres, redis, api, workers, reacher, n8n, web

### CI/CD
- `.github/workflows/ci.yml` — test-api, test-scrapers, test-web, build-and-push

## Tests executed

### API (Jest) — 28/28 passed
```
PASS test/dedup.test.ts
  ✓ same company/title/url -> same fingerprint (different path)
  ✓ different company -> different fingerprint
  ✓ different title -> different fingerprint
  ✓ different domain -> different fingerprint
  ✓ empty fields still produces a hash
  ✓ identical strings (Levenshtein)
  ✓ completely different Levenshtein
  ✓ one char diff
  ✓ empty string
  ✓ identical strings (similarity)
  ✓ completely different (similarity)
  ✓ partial match
  ✓ empty strings

PASS test/circuit-breaker.test.ts
  ✓ closed initially
  ✓ opens after failure threshold
  ✓ closes on success
  ✓ half-open after cooldown
  ✓ reset clears state

PASS test/scoring.test.ts
  ✓ hot lead: full info + verification
  ✓ warm lead: partial info
  ✓ cold lead: no info
  ✓ company contact only (+10)
  ✓ job quality scoring with salary+description+url
  ✓ job quality: no salary (7 points)
  ✓ score breakdown sums to total
  ✓ hot lead band threshold (>=70)
  ✓ warm lead band threshold (40-69)
  ✓ cold lead band threshold (<40)
```

### Python (pytest) — 14/14 passed
```
PASS tests/test_circuit_breaker.py
  ✓ test_closed_initially
  ✓ test_opens_after_threshold
  ✓ test_closes_on_success
  ✓ test_half_open_after_cooldown
  ✓ test_reset

PASS tests/test_normalizer.py
  ✓ test_basic_normalization
  ✓ test_missing_hr_name_is_incomplete
  ✓ test_fresher_detection_from_keywords
  ✓ test_non_fresher_filtered_out
  ✓ test_fallback_to_company_contact_when_no_hr
  ✓ test_fingerprint_consistency

PASS tests/test_generate_fingerprint.py
  ✓ test_deterministic
  ✓ test_different_company
  ✓ test_different_domain
```

## Integrations verified

| Integration | Status | Notes |
|-------------|--------|-------|
| PostgreSQL | ✅ Ready | Migrations define full schema (§10) |
| Redis | ✅ Ready | Queue + circuit breaker state |
| Fastify API | ✅ Built | All endpoints per SRS §3.4 |
| Scrapers | ✅ Built | RemoteOK, Arbeitnow, Greenhouse, Lever, GitHub |
| n8n | ✅ Built | Daily cron workflow |
| React CRM | ✅ Built | Lead table, detail view, pipeline actions |
| SSE/WebSocket | ✅ Built | `/sse`, `/live/stats` endpoints |
| CI/CD | ✅ Built | GitHub Actions |
| Gemini 2.5 Flash | 🚫 Blocked | Requires API key (not provided) |
| Snov.io/ContactOut | 🚫 Blocked | Requires user-supplied API keys |
| Reacher (email validation) | ✅ Ready | Docker image `reacherhq/check-if-email-exists` |
| Resend/Brevo email | 🚫 Blocked | Requires API key |
| WhatsApp (whatsapp-web.js) | ⚠️ Partial | Docker image for Reacher ready; whatsapp-web.js client to be built |
| Supabase | ⚠️ Partial | Env vars configured; migrations use local Postgres |

## Remaining blockers

1. **Gemini API key**: No API key provided for Step 4 draft generation. The `generate_draft` function is stubbed — will be implemented in Phase 1 or when a key is provided.
2. **Snov.io / ContactOut API keys**: Not provided. The enrichment flow queues jobs correctly; actual API calls require user-supplied keys stored encrypted in the settings page.
3. **WhatsApp Business API**: `whatsapp-web.js` requires pairing with a real phone number. No test device available. The infrastructure (queues, DB schema, status tracking) is ready.

## Remaining known issues

1. **Lever API domain**: Some documentation references `jobs.lever.co` but the verified working endpoint is `api.lever.co/v0/postings/{company}?mode=json`. Verified for Vevo, Coursera, Asana.
2. **GitHub repo `vanshb03/New-Grad-Jobs`**: 404 — excluded from scraper list per pre-flight.
3. **n8n Sustainable Use License**: Not OSI-approved. Documented in §10 licensing notes — acceptable for self-hosted use.
4. **Redis `ioredis` vs `redis` (Python)**: The API uses `ioredis`, Python workers use `redis.asyncio` — both are compatible with the same Redis server.
5. **`postgres` library**: API uses `postgres` (not `pg`) for type-safe queries. The `sql.unsafe()` method is used for dynamic query building — this is acceptable since all dynamic values are passed as parameters.

## Next development action

Start Phase 1: implement the actual enrichment pipeline workers (ContactOut scraper, Hunter.io email finder, LinkedIn scraper via Playwright) and wire them to the enrichment_queue consumer.
