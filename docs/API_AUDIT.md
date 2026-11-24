# HireGen — API Audit

All Fastify routes are mounted under `/api` by `server.ts`. Authentication is a JWT Bearer access token plus refresh token; `authenticate` verifies the signature **and** that the user still exists. `authorize([roles])` performs backend role checks. Error bodies are `{ error: string }` (Zod failures add `details`).

## 1. Auth (`/auth`)

| Method | Path | Auth | Request | Response / behavior |
|---|---|---|---|---|
| POST | `/login` | public, rate-limited | `{ email, password, role? }` | access + refresh token, user `{ id,email,role }`; wrong role → 403. Auto-bootstraps admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` if the account does not exist. |
| POST | `/register` | public, rate-limited | `{ email, password ≥ 8 }` | 201 `{ user: { id,email,role:'candidate' } }`; 409 if existing; currently **no wallet / plan / credits / transaction**. |
| POST | `/logout` | Bearer | — | blacklists token in Redis |
| POST | `/refresh` | refresh token body | `{ refresh_token }` | rotates tokens, blacklists old refresh token |

## 2. Candidate (`/candidate`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/PUT | `/profile` | candidate | read/upsert confirmed profile |
| DELETE | `/account` | candidate | delete account and related data |
| POST | `/resume/parse` | candidate | worker-backed resume parsing |
| GET | `/jobs` | candidate | published jobs, search/filter/pagination |
| GET | `/jobs/:id` | candidate | job detail + source evidence |
| GET | `/contacts` | candidate | employer contact visibility rules |
| GET | `/recommendations` | candidate | explainable recommendations |
| GET | `/summary` | candidate | dashboard counters |
| GET | `/applications` | candidate | tracked applications |
| POST | `/applications` | candidate | create/update application/interest |
| PATCH | `/applications/:id` | candidate | status transition + event |
| POST | `/jobs/:id/prepare` | candidate | generate application documents |
| POST | `/feedback` | candidate | 1–5 rating + text feedback |
| GET | `/admin/overview` | admin | candidate platform counters |
| GET/PUT | `/admin/recommendation-model` | admin | read/toggle model |
| POST | `/admin/recommendations/train` | admin | retrain recommendation model |
| GET/PATCH | `/admin/jobs`, `/admin/jobs/:id/review` | admin | moderation |
| GET/PATCH | `/admin/feedback`, `/admin/feedback/:id` | admin | feedback moderation + audit |

## 3. Practice (`/candidate/practice`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/subscription` | candidate | practice plan, monthly limit, usage, pending upgrade |
| POST | `/upgrade-request` | candidate | create pending Pro request (idempotent) |
| GET | `/sessions` | candidate | recent sessions |
| POST | `/sessions` | candidate | create session; free-plan quota gate |
| GET | `/sessions/:id` | candidate | session + questions |
| POST | `/sessions/:id/answer` | candidate | validate/grade answer; append adaptive follow-up |
| POST | `/sessions/:id/finish` | candidate | final score/verdict/summary |
| DELETE | `/sessions/:id` | candidate | delete/abandon session |
| GET | `/learning` | candidate | active learning track |
| POST | `/learning/refresh` | candidate | generate new track |
| POST | `/learning/:trackId/progress` | candidate | toggle module completion |

## 4. Admin (`/admin`, etc.)

- `GET /admin/runs`, `GET /admin/runs/:id` — scrape runs.
- `GET /admin/providers/status`, `GET /admin/sources/health` — integration/source health.
- `GET /admin/users`, `/admin/settings/api-keys`, `/admin/settings/:key`, `PUT /admin/settings` — user/config.
- `/admin/suppressions` GET/POST/DELETE — suppression list.
- `GET /admin/integrity` — data integrity check.
- `/admin/dlq/:queue` GET/POST(redrive)/DELETE — dead-letter queue tools.
- `GET /admin/practice/upgrades`, `POST /admin/practice/upgrades/:id/{approve,reject}`, `POST /admin/practice/grant` — practice Pro operations (audited).
- `GET /admin/metrics` — Prometheus text metrics.

## 5. Legacy CRM

`/leads` (list, detail, duplicates, enrich, verify, draft, send, score), `/dashboard` (stats, credits telemetry, source health, runs), `/companies`, `/contacts`, `/compliance/optout`, `/webhooks/resend`, `/webhooks/whatsapp`, `/ws` (websocket), `/health`, `/metrics`.

## 6. Frontend consumers

`packages/web/src/lib/api.ts` is the only axios wrapper. It adds the access token, transparently refreshes on 401, and rejects with a normalized `Error`. Candidate pages consume `candidate.*` and `practice.*`; admin pages consume `admin.*`, `candidate.admin*`, and legacy wrappers. Types live in `packages/web/src/lib/types.ts` and must be updated with any contract change.

## 7. API gaps / risks

1. **Credits:** no `/candidate/credits`, no ledger history, no admin credit adjustment. New endpoints required.
2. **Plans:** no plan catalog endpoint; plan prices/entitlements are not served anywhere.
3. **Registration:** not transactional; no FREE plan/wallet/grant; role is `candidate` rather than the brief's `USER`.
4. **Bootstrap admin:** fallback credentials are hardcoded; should require explicit `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD`, be idempotent, and never overwrite an existing non-admin account's role silently.
5. **Payments:** no order/webhook endpoints. Must stay disabled until a provider is chosen and sandbox credentials exist.
6. **Placement outcome:** no endpoint.
7. **Pagination:** candidate jobs/feedback are paginated; some legacy lists cap at fixed limits. New admin ledger endpoints must paginate server-side.
8. **Idempotency:** practice answer/upgrade routes have some protection; payment/credit-sensitive operations need explicit idempotency keys.

## 8. Implementation update — credits and bootstrap (Phase 2)

- `POST /auth/register` now runs in one transaction and returns `{ user: { role: 'user' }, security_role: 'USER', plan: 'FREE', initial_credits: 2 }`; the FREE subscription, wallet and one-time 2-credit grant commit with the user insert.
- Candidate routes: `GET /candidate/plans`, `GET /candidate/credits`, `GET /candidate/credits/ledger` (paginated). `POST /candidate/credits/purchase` returns `503 PAYMENTS_NOT_CONFIGURED` until billing is configured.
- Admin routes: `GET /admin/credits/wallets` (search + pagination), `GET /admin/credits/ledger` (candidate/kind filters + pagination), `GET /admin/credits/wallet/:userId`, `POST /admin/credits/adjust` (idempotency key optional, audited, cannot go negative).
- Login bootstrap now requires explicit `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`; it never promotes an existing account and has no hardcoded default. `ADMIN_*` remains a legacy alias.
- Candidate guards accept both `candidate` (legacy accounts) and `user` (new accounts). Admin routes remain `admin`-only.
- Tests: `packages/api/test/credits.test.ts` covers the grant, ledger, idempotency, overdraw, admin adjustment/audit and route authorization.

## 9. Implementation update — engagement (Phase 7)

- Candidate (candidate/user only): `GET/POST /candidate/placements` (voluntary reports, paginated history), `GET/PUT /candidate/onboarding` (load/save tutorial progress).
- Admin: `GET /admin/placements` (read-only, searchable, paginated).
- A linked application must belong to the caller; company/role are derived from the application when not supplied. Placement reports never change role, plan, credits or application status.
- Tests: `packages/api/test/engagement.test.ts` (8 tests) and `packages/web/src/pages/Placements.test.tsx` (6 tests).

## 10. Implementation update — preparation (Phase 5)

- Candidate-only: `POST /candidate/preparation/generate` (`job_id`, `module`, optional `idempotency_key`), `GET /candidate/preparation/artifacts` (job/module filters + pagination), `GET /candidate/preparation/artifacts/:id` (owner-scoped).
- Only published, trusted jobs from the candidate feed can be prepared for. Candidate profile facts and job/company records are sanitised before reaching the provider.
- Artifacts are resumable and idempotent; replaying a key returns the stored artifact without a second charge or generation. Credit cost is 0 by default and is refunded idempotently on failure only when explicitly configured.
- Tests: `packages/api/test/preparation.test.ts` (8 tests) and `packages/web/src/pages/Preparation.test.tsx` (4 tests).
