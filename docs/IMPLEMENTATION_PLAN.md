# HireGen — Implementation Plan

**Source of truth:** `Doccumentation/HireGen_Complete_AI_Project_Building_Master_Prompt.pdf` (text extracted to `Doccumentation/master_prompt.txt`).
**Constraint:** audit first; preserve working architecture/data; no destructive migrations, resets, real payments, external spend or public deployment without approval.

## Phase 0 — Audit (complete)

- [x] Repository, stack, commands and runtime inspected.
- [x] Existing features, schema, APIs, integrations and risks documented.
- [x] Deliverables created: `PROJECT_AUDIT.md`, `EXISTING_ARCHITECTURE.md`, `DATABASE_AUDIT.md`, `API_AUDIT.md`, `FRONTEND_AUDIT.md`, `BACKEND_AUDIT.md`, `MISSING_FEATURES.md`, this plan.
- [x] Baseline checks: web 28/28 tests; practice API 13/13; typechecks and production build pass.

## Phase 1 — Foundation (complete)

Goal: safe runtime/build hygiene and shared contracts without behavior regressions.

- [x] Fix button/Slot crash; add practice smoke tests.
- [x] Keep env validation centralized in `src/utils/env.ts`.
- [x] Add explicit env names for new features (`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `PAYMENT_PROVIDER`) with safe empty values in `.env.example`.
- [x] Document plan/credit contracts in API/types before UI work.
- Exit: baseline checks still pass; no regressions.

## Phase 2 — Identity, plans, wallet, ledger (complete)

Goal: registration creates a USER-equivalent candidate with FREE plan and exactly 2 credits, atomically and idempotently, with an auditable wallet/ledger and user/admin visibility.

### 2.1 Database (additive) — done
- `candidate_subscriptions` (plan code, status, source, dates; independent from security role).
- `plan_catalog` seeded with FREE/CLASSIC/CLASSIC_PLUS/BRO and prices 0/19900/49900/79900 paise; paid credit allocations NULL (configurable).
- `credit_wallets` (balance ≥ 0, lifetime granted/used, updated_at).
- `credit_ledger` (delta, balance_after, kind, reason, ref, idempotency_key UNIQUE, actor, metadata).
- Unique guarantee for the signup grant (`signup:<user_id>` and a partial unique index).
- Landed in both `database/schema/tables/200_candidate_credits.sql` and `database/migrations/015_candidate_credits.ts`.

### 2.2 Backend — done
- `src/utils/credits.ts`: `initializeCandidateAccount` / `provisionCandidateAccount` (plan + wallet + 2-credit grant), `getCreditWallet`, `listPlans`, `spendCredits`, `refundCredits`, `adjustCredits`, ledger and admin wallet listings. Every mutation locks the wallet row and writes a ledger row.
- Registration wrapped in a transaction; plan/wallet/grant commit with the user insert.
- Bootstrap admin hardened: explicit `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, idempotent, never promotes an existing account, no hardcoded default credentials.
- Candidate routes: `GET /candidate/credits`, `GET /candidate/credits/ledger` (paginated), `GET /candidate/plans`.
- Admin routes: `GET /admin/credits/wallets`, `GET /admin/credits/ledger`, `GET /admin/credits/wallet/:userId`, `POST /admin/credits/adjust` (audit-logged, idempotent, no negative balance).
- Payment purchase endpoint returns an explicit `PAYMENTS_NOT_CONFIGURED` 503; no fake success.
- Practice quota behavior unchanged. Optional practice credit charging remains disabled pending the policy decision.

### 2.3 Frontend — done
- `/credits`: plan, balance, signup grant note, ledger history, catalog (₹0/199/499/799), purchase disabled with reason.
- Dashboard credit balance card/link.
- `/admin/credits`: search wallets, ledger table with filters, adjust credits with confirmation + audit note.
- Sidebar/header/command palette/route registrations; design-system compliant, light/dark, responsive.
- API wrappers/types.

### 2.4 Tests — done
- Signup grant exactly once, retry-safe.
- Wallet non-negative under spend attempts.
- Duplicate spend with same idempotency key is a no-op.
- Admin adjust creates ledger + audit and cannot drive balance negative.
- Route authorization: candidate vs admin.
- Frontend: credits page renders plan/balance/history/empty/error states; admin wallet list and adjust dialog.

Verification: API 124/124, web 32/32, typechecks clean, production build green; schema applied to the running database.

## Phase 3 — Jobs (verify existing, close gaps)

- Confirm ingestion/dedup/refresh metadata with tests; add pagination/limits where missing.
- Verify application duplicate prevention and status history.
- Exit: ingestion/discovery tests pass.

## Phase 4 — Recommendations

- Evaluate existing model with known profiles; document quality; keep explainability.
- Exit: known-profile evaluation stable.

## Phase 5 — AI preparation (partial: content modules done, credit policy blocked)

- [x] Preserved interview prep + practice/bot (existing voice interview and adaptive follow-ups unchanged).
- [x] Added job-specific preparation modules: interview prep, group discussion, presentation, company research.
- [x] Source URLs and retrieval timestamps retained; missing evidence is labelled, no fabricated company facts or citations.
- [x] Server-side Gemini with strict validation and complete deterministic fallback; untrusted inputs sanitised.
- [x] Artifacts persisted, listed, fetched and idempotent; UI `/preparation` with loading/empty/error/retry states.
- [ ] Credit consumption/refund stays disabled: `PREPARATION_CREDIT_COST=0` until the owner defines allocation/refund rules. Configurable hook is in place.
- Verification: API 142/142, web 42/42, typechecks and production build pass; live generation + idempotency smoke test green.

## Phase 6 — Payments / admin (blocked: approval gate)

- Provider selection and sandbox credentials required.
- Not implemented: payment orders, signature-verified webhooks, activation and reconciliation. No fake success path exists.
- Admin credit operations with audit are done; payment operations stay pending the provider decision.

## Phase 7 — Frontend polish (partial)

- [x] Placement-outcome UI: `/placements` candidate form/history, `/admin/placements` read-only table, sidebar/command-palette entries.
- [x] Server-side onboarding persistence: `onboarding_progress` + candidate API; tour saves completed/skipped state and replays via local storage offline fallback.
- [x] Preparation workspace, credits screens and new admin screens follow the design spec: light/dark, responsive, loading/empty/error/retry states.
- [ ] Offline/retry banner (nice-to-have, global).
- Verification: web 42/42, API 142/142, typechecks and production build pass; live smoke tests green.

## Phase 8 — Verification (complete)

- Full API suite: 19 suites / 142 tests; web suite: 9 suites / 42 tests; typechecks clean; production build green.
- Live smoke: registration/credits/plans/ledger/purchase 503, admin adjustment + audit, role guards, placement + onboarding, preparation generation + idempotency.
- Restart persistence: 17 migrations, 4 plans and user records retained; API healthy, web HTTP 200.

## Phase 9 — Run handoff (complete)

- Stack running via Docker Compose; URLs/ports and health checks recorded in `HIREGEN_FINAL_REPORT.md`.
- Unresolved credentials/approvals and risks documented there; payment flow and paid-plan policy remain blocked by owner decision.

## Approval gates / blocked decisions

- Paid-plan credit quantities, expiry, renewal, billing terms, refund policy — product owner must decide; implement as config, never hardcode guesses.
- Payment gateway and sandbox credentials — do not implement real payment flow before approval.
- Destructive migrations, database resets, credential changes, public deployment — require explicit approval.
