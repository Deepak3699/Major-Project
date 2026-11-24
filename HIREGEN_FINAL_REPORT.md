# HireGen — Final Report

**Date:** 2026-11-24
**Source of truth:** `Doccumentation/HireGen_Complete_AI_Project_Building_Master_Prompt.pdf`
**Repository:** `D:\Major-Project` (branch `main`)
**Commits added in this work:** `b5403ba`, `c4da54e`, `882d486`, `5c92717`. Nothing was pushed.

## 1. Repository changes

| Area | Change | Why |
|---|---|---|
| `packages/api/database/schema/tables/200_candidate_credits.sql`, `migrations/015_candidate_credits.ts` | Plan catalog, subscriptions, wallet, append-only ledger, one-time signup grant guarantee | Required durable, server-authoritative credits |
| `packages/api/database/schema/tables/210_engagement.sql`, `migrations/016_engagement.ts` | Voluntary placement outcomes + server-side onboarding progress | Missing brief items |
| `packages/api/database/schema/tables/220_preparation.sql`, `migrations/017_preparation.ts` | Persisted, resumable preparation artifacts with cited sources | Missing preparation modules |
| `packages/api/src/utils/credits.ts`, `routes/credits.ts`, `routes/credits-admin.ts` | Provisioning, spend/refund/adjust, candidate and admin APIs | Credit wallet + auditability |
| `packages/api/src/routes/auth.ts`, `scripts/{initDb,seedAdmin,promoteAdmin}.ts`, `utils/env.ts` | Transactional registration; explicit `BOOTSTRAP_ADMIN_*`; no hardcoded default credentials | USER role + 2 credits atomically; protected admin bootstrap |
| `packages/api/src/utils/preparation.ts`, `routes/preparation.ts` | Grounded interview/GD/presentation/company-research generation with template fallback, idempotency, configurable cost hook | Brief preparation pipeline |
| `packages/api/src/routes/engagement.ts`, `engagement-admin.ts` | Placement reporting/history and onboarding save/load | Brief engagement items |
| `packages/api/src/routes/practice.ts`, `utils/practice-ai.ts` (earlier commits) | Adaptive follow-ups, intro chaining, cap 3 | Interview bot requirement |
| `packages/web/src/pages/{Credits,AdminCredits,Placements,AdminPlacements,Preparation}.tsx` | New candidate/admin screens | User visibility and admin control |
| Web shell (`App.tsx`, `Sidebar`, `Header`, `CommandPalette`, `Layout`, `CandidateDashboard`, `JobDetails`) | Routes, navigation, dashboard credit card, links into preparation | Complete the journey |
| `packages/web/src/components/onboarding/OnboardingTour.tsx` | Server-side progress persistence with offline fallback | Onboarding continuity |
| `docs/*.md`, `README.md`, `.env.example`, `.gitignore` | Audits, phased plan, honest setup instructions, placeholders only | Required documentation |

## 2. Architecture

Preserved: React/Vite/TypeScript SPA, Fastify API, PostgreSQL (Docker/local/Neon-compatible), Redis queue/blacklist, Python scrapers/workers, n8n, recommendation engine, existing auth (JWT + refresh + Redis blacklist), and the existing Gemini integration pattern. No API contract was removed, no feature was deleted, and no destructive migration was run.

Additive changes only: new tables, new routes, new pages and a configurable phase-gated credit hook. Both schema paths stay in sync (`database/schema/tables` and `database/migrations`).

## 3. Feature status

- **Implemented:** registration as `user`/USER with FREE plan and exactly 2 idempotent credits in one transaction; durable wallet + ledger with nonnegative balance, row locks and idempotency keys; BRO never grants ADMIN; protected bootstrap admin; candidate/admin credit screens and audited adjustments; placement outcome reporting (voluntary) and admin read-only view; server-side onboarding persistence; interview practice with voice avatars, answer capture, grading and adaptive follow-ups; job-specific interview prep, GD, presentation and cited company research; feedback collection/moderation; design-spec UI with light/dark, responsive states.
- **Partial:** global offline/retry banner (per-page retry exists); legacy JSONB string-encoded rows remain as-is and are parsed on read.
- **Blocked (owner decision/config):** paid-plan credit quantities, expiry, renewal, feature caps, billing terms and refund policy; real payment provider and sandbox credentials. Checkout returns `503 PAYMENTS_NOT_CONFIGURED` and never fakes success.
- **Disabled by default:** credit consumption for preparation (`PREPARATION_CREDIT_COST=0`). The configurable hook charges idempotently and refunds on failure only when an owner sets a cost. Practice quota remains independent and unchanged.
- **Not started (explicitly prohibited without approval):** public/production deployment, real payments, destructive data changes.

## 4. Database

Applied to the running Docker database through `docker compose exec -T api npm run migrate` (declarative schema also applied by `pg-migrator`):

- `015_candidate_credits`
- `016_engagement`
- `017_preparation`

`pgmigrations` now contains 17 entries. `plan_catalog` has exactly 4 rows (FREE ₹0 with 2 credits; CLASSIC ₹199, CLASSIC_PLUS ₹499, BRO ₹799 with `credits_included = NULL`). No existing user, job, subscription or transaction row was rewritten, truncated or deleted. Temporary verification users created during smoke tests were deleted; all other user data was preserved. No backup was taken because all changes were additive `CREATE TABLE IF NOT EXISTS` / index operations; rollback `down()` definitions exist but were not executed.

JSONB writes in new code use the driver's `sql.json(value)` helper so arrays/objects are stored as real JSON values. Pre-existing rows that contain JSON strings were deliberately left untouched.

## 5. Integrations

- **PostgreSQL:** connected and migrated; 4 plans, 17 migrations persisted after container restart.
- **Redis:** connected, AOF enabled in Docker; JWT blacklist and queues functional.
- **Scrapers/workers:** existing stack preserved; daily catch-up and schedule unchanged.
- **LLM:** Gemini optional. With no key, all preparation and practice features use deterministic, grounded templates; no external spend was incurred.
- **Payments:** no provider configured or credentials supplied. Purchase remains disabled; webhook activation and reconciliation are not implemented.

## 6. Security

- Roles come only from `users.role`; client-supplied roles, balances and payment states are never trusted.
- Bootstrap admin requires `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`; no default credential exists, login no longer auto-promotes, and the script refuses to promote silently.
- Candidate/admin route guards accept legacy `candidate` and new `user` roles for candidates; admin routes stay admin-only.
- Zod validation on all new routes; untrusted profile/job text is sanitised before reaching the LLM; provider keys stay server-side.
- Idempotency keys prevent duplicate charges and duplicate artifact/ledger rows; wallet updates are row-locked.
- Existing webhook signature verification for email/WhatsApp was preserved; no payment webhook was added because no provider exists.
- Secrets were not printed in logs, terminal output or this report.

## 7. Tests

Exact commands and results:

| Command | Result |
|---|---|
| `cd packages/api && npm run lint` (`tsc --noEmit`) | Clean |
| `cd packages/api && npm test -- --runInBand` | **19 suites, 142 tests passed** |
| `cd packages/web && npx tsc --noEmit` | Clean |
| `cd packages/web && npm test -- --runInBand` | **9 suites, 42 tests passed** |
| `cd packages/web && npm run build` | Production build succeeded |

New suites: `test/credits.test.ts` (11), `test/engagement.test.ts` (8), `test/preparation.test.ts` (8), `src/pages/Credits.test.tsx` (4), `src/pages/Placements.test.tsx` (6), `src/pages/Preparation.test.tsx` (4). Existing Login/Duplicates copy and practice smoke tests still pass. No known pre-existing failures remain.

Live HTTP smoke checks passed: registration → `role=user`, `plan=FREE`, `initial_credits=2`, one `signup_grant` ledger row; credits/plans/ledger endpoints; purchase → 503; admin adjustment + audit; candidate/admin 403 guards; placement report and onboarding save/reload; preparation generation, idempotent replay, cited sources and JSONB object/array types; test users removed afterwards.

## 8. Runtime

Running via `docker compose`:

| Service | URL / port | Health |
|---|---|---|
| API | `http://localhost:3001` (`/health`, `/api/...`) | `ok` after restart |
| Web | `http://localhost:5174` | HTTP 200 after restart |
| PostgreSQL | `localhost:5434` (container `postgres:5432`) | healthy |
| Redis | `localhost:6381` (container `redis:6379`) | healthy |

Images rebuilt with `docker compose build api web`, started with `docker compose up -d api web`, and restarted once to confirm persistence. All containers are healthy/running at handoff.

## 9. Manual actions required

1. Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env`, then run `cd packages/api && npm run bootstrap:admin`. No account is created or promoted automatically.
2. Decide CLASSIC / CLASSIC_PLUS / BRO credit quantities, expiry, renewal, rollover, feature caps, billing interval and refund policy; set them through configuration rather than code guesses.
3. Select a payment provider, supply sandbox credentials and webhook secret, and give explicit approval before implementing or testing real payments.
4. Optionally set `PREPARATION_CREDIT_COST` only after item 2 is decided.
5. Optional: add a global offline/retry banner if desired; no approval gate blocks it.
6. Public deployment requires separate explicit approval.

## 10. Risks and next steps

- Checkout and payment verification are intentionally absent; users can review plans but cannot buy them yet. This is the largest remaining product gap and is blocked on provider + policy, not engineering time.
- Paid-plan entitlements remain undefined, so the catalog deliberately shows no invented credit counts.
- Practice credit charging is off; `spendCredits`/`refundCredits` are ready but wiring them would invent a policy.
- Legacy JSONB columns contain some string-encoded values; reads already tolerate this, but a reviewed, opt-in normalisation migration could clean them later.
- Verification used unit/component tests plus live HTTP smoke checks; no browser-driven E2E suite was added in this phase.

All claims above are verified by the commands and runtime checks in sections 7–8. Nothing dependent on unprovided credentials or owner decisions is claimed as complete.
