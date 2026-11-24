# HireGen — Project Audit

**Audit date:** 2026-11-24
**Repository:** `D:\Major-Project`
**Audit basis:** source inspection, existing documentation, test/build runs, Docker health checks.
**Rule followed:** audit first, preserve working systems, no database resets or destructive changes.

## 1. What this repository is

HireGen (formerly JobPilot AI / `sales-agent`) is a candidate-first job-intelligence and career-preparation platform built on top of an existing recruiter lead-intelligence CRM. The candidate workspace discovers jobs, explains match scores, tracks applications, prepares role-specific documents, runs an AI mock interview with voice interaction, and generates learning tracks. The original recruiter CRM remains available to administrators as a legacy operations area.

## 2. Actual stack

| Layer | Technology | Notes |
|---|---|---|
| Web client | React 18, TypeScript, Vite 5, Tailwind CSS 3 | SPA, react-router-dom 6, react-query 3, Zustand auth store |
| API | Node.js ≥20, Fastify 4, TypeScript | postgres.js client, Zod validation, JWT auth, rate limiting |
| Database | PostgreSQL 16 | Dual schema path: declarative SQL (`database/schema`) + node-pg-migrate chain (`database/migrations`) |
| Cache / queues | Redis 7 (ioredis) | Rate limits, token blacklist, queue coordination, circuit breaker state |
| Workers / scraping | Python (FastAPI, aiohttp, Scrapy), n8n optional | ATS/public-feed adapters, normalization, deduplication |
| AI | Google Gemini (optional) | Strict server-side prompts, template fallbacks when `GEMINI_API_KEY` is unset |
| Payments | **None implemented** | No gateway, order, webhook or reconciliation tables found |
| Deployment | Docker Compose | `postgres`, `pg-migrator`, `redis`, `api`, `web`, optional workers/n8n |

## 3. Commands discovered

| Purpose | Command | Location |
|---|---|---|
| Apply declarative schema | `npm run schema:apply` | `packages/api` |
| Apply migration chain | `npm run migrate` | `packages/api` |
| Seed/bootstrap database | `npm run db:init` | `packages/api` |
| API dev server | `npm run dev` | `packages/api` |
| API build / typecheck | `npm run build` / `npm run lint` | `packages/api` |
| API tests | `npm test` | `packages/api` |
| Web dev server | `npm run dev` | `packages/web` |
| Web tests | `npm test` | `packages/web` |
| Web production build | `npm run build` | `packages/web` |
| Full container stack | `docker compose up -d --build` | repository root |

The web client reads `VITE_API_URL` (default `http://localhost:3000/api`). Docker maps web `5174 → 80`, API `3001 → 3000`, PostgreSQL `5434 → 5432`, Redis `6381 → 6379`.

## 4. Verified working state at audit time

- Web test suite: **28/28 passing** (6 suites), including Login, Duplicates and practice smoke tests.
- Practice API tests: **13/13 passing**, covering subscription gate, grading, adaptive follow-ups and learning tracks.
- Web typecheck and production build pass.
- API typecheck passes.
- Docker stack previously verified: web HTTP 200 on `http://localhost:5174`, API HTTP 200 on `http://localhost:3001/health`.
- Candidate journey implemented end to end: register → profile/resume → jobs/recommendations → applications → preparation → practice/learning.

## 5. Pages and major capabilities present

- Auth: Login, Register.
- Candidate: dashboard, jobs, job details, recommendations, saved jobs, applications, profile, resume studio, employer contacts, interview practice, practice session (voice interviewer), learning tracks.
- Admin: dashboard, job review, feedback moderation, practice subscriptions, legacy leads/companies/contacts/duplicates/analytics, settings.
- First-run onboarding tour (8 candidate steps, 5 admin steps), replayable from the header avatar menu.
- Design system: semantic tokens, light/dark themes, editorial instrument-panel styling documented in `packages/web/DESIGN_SPEC.md`.

## 6. Product-rule gaps against the master brief

These are the material mismatches found during audit:

1. **No credit wallet/ledger.** The only "credits" concept in the UI is enrichment-usage telemetry for the legacy CRM; it is not a candidate wallet, has no balance, and cannot be spent.
2. **No FREE/CLASSIC/CLASSIC_PLUS/BRO subscription catalog.** Practice has a separate `free`/`pro` subscription used only for monthly interview quota. Prices ₹0/₹199/₹499/₹799 and paid entitlements are absent.
3. **Registration does not grant 2 free credits.** `POST /auth/register` inserts a user with role `candidate`; no wallet, plan row or ledger entry is created, and it is not wrapped in a transaction.
4. **Role naming mismatch.** Brief requires security roles `ADMIN`/`USER`; the current candidate-facing role is `candidate` (used throughout auth, routes and UI). Must be mapped explicitly rather than silently renamed.
5. **No payment gateway.** No orders, payment records, webhook processing, signature verification or provider configuration. Purchase flow must remain disabled/configurable rather than faked.
6. **No placement-outcome record.** Candidate feedback exists (`candidate_feedback`), but voluntary placement reporting is missing.
7. **Admin credit operations missing.** No wallet/ledger views, no adjust/refund controls, no audit-logged credit changes.
8. **Onboarding persistence is localStorage-only.** It is replayable and skippable, but not server-persisted per account.
9. **Resume parsing path exists** (`POST /candidate/resume/parse` → Python worker), but no malware scan/retention policy implementation was found.
10. **AI prep modules are partial.** Interview prep, practice/bot and learning exist. Group discussion (GD), presentation preparation and dedicated company-research artifacts are not implemented as first-class modules.

## 7. Security and operational risks

- `POST /auth/login` auto-creates an admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and falls back to hardcoded `admin@example.com` / `change-me-please-32`. This violates the brief's requirement that admin bootstrap use explicit env variables, be idempotent, and never carry a hardcoded default credential.
- Registration availability check followed by insert is not atomic; two concurrent registrations can race (unique constraint protects data, but error contract is unclear).
- No payment surface exists, so no payment-specific risks yet; also no payment readiness.
- AI provider keys are server-side and optional. Template fallbacks prevent fabricated external facts, but there is no provider-cost/token telemetry.
- Logs redact authorization headers in non-development mode; `logAuditEvent` exists and is used for admin moderation/grants.
- Uploaded resumes are sent to the worker; MIME/size checks exist on the route but malware scanning and retention enforcement are not evident.
- Database migrations are additive and forward-safe in the inspected files; `down()` in `014_ai_practice.ts` drops practice tables (only for explicit rollback, never auto-run).

## 8. Audit conclusion

The candidate product is materially built and tested. The biggest missing foundation against the master brief is the **plan + wallet + ledger + registration grant** slice, followed by **payment verification** and **admin credit operations**. The next phase should add those without disturbing existing auth, practice quota, jobs or UI behavior. Paid-plan credit quantities, expiry, billing periods and refund policy are explicitly undefined and will remain configurable or blocked pending owner approval.
