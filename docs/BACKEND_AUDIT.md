# HireGen — Backend Audit

## 1. Services and utilities

| Area | Files | Notes |
|---|---|---|
| Bootstrap / server | `src/server.ts`, `src/watch.ts` | Fastify setup, global rate limit, CORS/Helmet/compression, JWT, websocket, metrics |
| Routing | `src/routes/*.ts` | Auth, candidate, practice, admin, legacy CRM, webhooks, websocket, compliance |
| Auth middleware | `src/middleware/auth.ts` | JWT subject + DB existence check, role authorization |
| Error handling | `src/middleware/error-handler.ts` | normalized error payloads |
| DB | `src/utils/db.ts` | postgres.js singleton, `sql.unsafe` used widely |
| Redis | `src/utils/redis.ts` | lazy client |
| Env | `src/utils/env.ts` | Zod-validated env with local `.env` loading |
| Crypto | `src/utils/crypto.ts` | bcrypt password hashing, AES-256-GCM API-key encryption |
| Audit | `src/utils/audit.ts` | append-only `audit_log` inserts |
| Logging/metrics | `src/utils/logging.ts` | request logging, Prometheus metrics |
| AI practice | `src/utils/practice-ai.ts` | question generation, grading, follow-ups, learning plans; Gemini optional; strict validation + templates |
| Job intelligence | `src/utils/job-intelligence.ts` | match/trust scoring and explanations |
| Recommendation model | `src/utils/recommendation-model.ts` | feed-forward model load/train/infer |
| Application prep | `src/utils/application-prep.ts` | resume/email draft generation |
| Reliability | `src/utils/circuit-breaker.ts`, `httpClient.ts`, `friendlyErrors.ts` | retries/backoff/error display |
| Scrape orchestration | routes/admin + Redis queues | workers run Python scrapers; admin DLQ controls |

## 2. Business logic state

- **Auth:** bcrypt hashing, JWT access/refresh rotation, Redis blacklist. Registration is not transactional and lacks plan/wallet setup. Login contains a default-admin bootstrap path with fallback credentials.
- **Roles:** `admin`, `sales_rep`, `viewer`, `candidate` (DB check constraint). The brief's USER role maps to the product's `candidate` role; no role escalation from plan exists.
- **Jobs:** worker ingestion → normalized `job_postings` → admin review gate → candidate feed. Dedup + source evidence implemented.
- **Recommendations:** explainable weighted score with persisted breakdown/reasons.
- **Applications:** unique per user/job, status transition events, generated documents.
- **Practice:** free/pro practice subscription + monthly quota; answer grading; adaptive follow-ups (intro chaining and end-of-queue probes, cap 3); learning tracks. Credits are not involved.
- **Feedback:** candidate feedback + moderation + audit is implemented.
- **AI safety:** prompts and keys server-side; Zod-validated outputs; template fallback; no job/company facts are fabricated in fallback mode.

## 3. Missing backend modules

1. **Plan catalog service** — FREE/CLASSIC/CLASSIC_PLUS/BRO with known prices and configurable entitlements.
2. **Candidate subscription service** — plan assignment, status, source, dates; independent from security role.
3. **Credit wallet/ledger service** — idempotent signup grant of 2, atomic spend, refund, admin adjustment, history.
4. **Registration transaction** — user + plan + wallet + grant in one commit.
5. **Payment service** — orders, provider webhook verification, idempotency, activation, reconciliation (blocked until provider chosen).
6. **Placement outcomes** — voluntary reporting + admin visibility.
7. **Bootstrap admin hardening** — env-only, idempotent, no hardcoded fallback, explicit audit.
8. **Credit integration into preparation** — policy/cost per module is undefined; must be configurable and disabled by default until decided.

## 4. Failure handling observed

- API has a centralized error handler, request logging, metrics, DLQ tooling and circuit breakers for external calls.
- AI practice routes use best-effort follow-up generation (failure does not break answer grading).
- Redis-dependent auth paths degrade if Redis is unavailable (blacklist checks skipped).
- Payment/webhook signature verification exists for Resend/WhatsApp legacy paths, not for a payment provider.
- No candidate credit-service failure paths yet because the service does not exist.

## 5. Testing state

- API Jest suites cover admin integrity, auth middleware, circuit breaker, contacts audit, dashboard, dedup, HTTP client, leads routes, lifecycle, logging, practice, practice admin, redaction, scoring, security controls, timeline auth.
- Tests mock DB/Redis/auth at module seams; AI tests use real template fallbacks.
- Missing tests for registration transaction, wallet/ledger atomicity, idempotent signup grant, admin credit adjustments, placement outcomes.

## 6. Backend recommendations

- Implement wallet/ledger as a standalone, testable utility (`src/utils/credits.ts`) using transactions and guarded updates.
- Wire registration through the same utility so there is one source of truth.
- Add candidate + admin credit routes with Zod validation, pagination and audit logging.
- Keep the existing practice quota behavior untouched; expose a configurable credit cost (default disabled) so product can decide later.
- Do not add a fake payment success path. Serve catalog and an explicit "payments not configured" state.
