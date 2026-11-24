# HireGen — Database Audit

## 1. Schema management

Two parallel, additive paths exist and must stay in sync:

1. **Declarative schema** — `packages/api/database/schema/{tables,constraints,functions,triggers,indexes}` applied by `npm run schema:apply`. Files are sorted and idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, guarded constraint blocks).
2. **node-pg-migrate chain** — `packages/api/database/migrations/001…014` applied by `npm run migrate`; Docker's `pg-migrator` runs the declarative path only (see `database/utils/apply_schema.sh`).

Existing records must never be dropped, truncated or reset. All new objects should be created with `IF NOT EXISTS`; destructive `down()` blocks are rollback-only and are not executed by normal startup.

## 2. Core tables

| Table | Purpose | Key relations / constraints |
|---|---|---|
| `users` | Identity, role, encrypted API keys | `email UNIQUE`; role check constraint |
| `companies` | Employer records and contact defaults | referenced by jobs/leads/contacts |
| `hr_contacts` | Legacy recruiter contact person records | company FK, dedup constraints |
| `job_postings` | Normalized job listings | company FK; candidate columns: skills, trust score/band, review status, India confirmed |
| `leads` | Legacy recruiter leads per job/company/contact | job/company/contact FKs, pipeline stage + score constraints |
| `settings`, `suppressions`, `audit_log`, `scrape_runs`, `source_health`, `daily_runs` | Legacy ops/config/observability | audit_log append-only via triggers |
| `candidate_profiles` | Confirmed candidate profile facts | `user_id` PK → users |
| `job_sources` | Source evidence per job | unique (job, site, url) |
| `job_recommendations` | Explainable match results | unique (user, job), score + breakdown + reasons |
| `applications` | Candidate application state | unique (user, job); status field |
| `application_events` | Application status timeline | application FK |
| `application_documents` | Generated resume/email artifacts | application/source job FKs |
| `job_verifications` | Trust evidence records | job FK, verifier FK |
| `candidate_feedback` | Candidate feedback/moderation | user, optional application/company |
| `practice_subscriptions` | Practice `free`/`pro` gate | user PK |
| `practice_upgrade_requests` | Manual Pro upgrade queue | unique (user, status) |
| `interview_sessions` | Mock interview runs | user FK, score/verdict/summary |
| `interview_questions` | Questions, answers, grades | unique (session, idx) |
| `learning_tracks` | Role-specific learning plan JSON | unique (user, role) |
| `learning_module_progress` | Module completion | PK (track, index) |

## 3. Indexes / constraints observed

- Candidate feed indexes on `job_postings (review_status, is_active, first_seen_at)`, India feed, GIN on skills.
- Recommendation index `(user_id, match_score DESC)`.
- Application indexes on `(user_id, updated_at)` and event timeline.
- Practice indexes on session history, question order and pending upgrade requests.
- Audit log is append-only at trigger level (`020_audit_immutability`, `025_audit_no_truncate`) with actor preservation (`012`).
- Lead stage transitions are enforced by trigger (`030`).

## 4. Missing tables for the master brief

| Domain | Missing object | Required behavior |
|---|---|---|
| Plans | Catalog/config for FREE/CLASSIC/CLASSIC_PLUS/BRO | Prices ₹0/₹199/₹499/₹799; paid credit allocations configurable, not invented |
| Plans | Candidate subscription record | Current plan + status + source + dates; must not collide with admin role |
| Credits | Wallet | One per user, non-negative balance, server-authoritative |
| Credits | Ledger | Every grant/purchase/consume/refund/expiry/adjustment, balance-after, idempotency key, actor |
| Credits | Initial grant idempotency | Exactly one 2-credit grant per eligible new user |
| Payments | Orders, provider events, webhook log, refunds | Only after provider is configured; no fake success |
| Engagement | Placement outcomes | Voluntary user-reported employment outcome |
| Onboarding | Server-side onboarding progress | Currently localStorage only |

## 5. Data-integrity requirements for new work

- Wrap registration + plan + wallet + initial grant in a single transaction.
- Enforce uniqueness of the signup grant (unique idempotency key such as `signup:<user_id>` and/or partial unique index).
- Deduct credits through a guarded update (`balance >= amount`) inside a transaction; never allow a negative balance.
- Every balance mutation must insert a ledger row in the same transaction.
- Record `balance_after` to make history readable without replay.
- Use integer credits (no floats). Money uses integer paise (no floats).
- Payment records must store provider IDs uniquely and be idempotent.
- No migration may drop or rewrite existing candidate/practice/legacy records.

## 6. Data-safety notes

- The compose path applies the declarative schema, so any new table needed by runtime code must be added there even if also added to migrations.
- `database/migrations/014_ai_practice.ts` contains a destructive `down()`; it is not run at startup. New migrations should follow the same additive `up()` style.
- Existing enrichment "credits" (`enrichment_log.credits_used`) are provider usage telemetry for the legacy CRM, **not** a candidate wallet. They must not be reused as the candidate credit balance.

## 7. Implementation update — candidate credits (Phase 2)

The following additive objects were implemented after the audit and are live in both schema paths:

- `plan_catalog` — FREE ₹0 (2 credits), CLASSIC ₹199, CLASSIC_PLUS ₹499, BRO ₹799; paid `credits_included` stays NULL.
- `candidate_subscriptions` — one row per candidate (`FREE` by default), independent of `users.role`.
- `credit_wallets` — `balance >= 0`, lifetime granted/used.
- `credit_ledger` — append-only history; `idempotency_key` unique; partial unique index `credit_ledger_signup_once` guarantees one `signup_grant` per user.
- `users_role_check` now accepts `user` in addition to the legacy roles.

Files: `database/schema/tables/200_candidate_credits.sql` and `database/migrations/015_candidate_credits.ts`. Both were applied to the running database; `pgmigrations` records `015_candidate_credits`.

Legacy candidate accounts created before this change are provisioned on their first wallet access and receive the same one-time welcome grant. No existing row was rewritten or deleted.

## 8. Implementation update — engagement (Phase 7)

- `placement_outcomes` — voluntary offer/joined reports; `user_id` FK, optional application/job refs, `joined_on`, `notes`. Indexed by user and creation time.
- `onboarding_progress` — one row per user; JSONB `completed_steps` (must be an array), `last_step`, `completed`, `skipped`, `updated_at`.
- Files: `database/schema/tables/210_engagement.sql` and `database/migrations/016_engagement.ts`. Both applied; `pgmigrations` records `016_engagement`.

Note on JSONB writes: postgres.js infers a `jsonb` parameter type from `$n::jsonb` and serialises strings again. New writes therefore use `sql.json(value)` (with a test-friendly fallback) so arrays/objects are stored as real JSON values rather than JSON strings. Legacy rows with string-encoded JSON are left untouched.

## 9. Implementation update — preparation artifacts (Phase 5)

- `preparation_artifacts` — one row per generated artifact (`interview_prep`, `group_discussion`, `presentation`, `company_research`), with `status`, validated JSONB `payload`, JSONB `sources` (URL + retrieval timestamp + verification status), model, `credits_charged` and a unique `idempotency_key`.
- Files: `database/schema/tables/220_preparation.sql` and `database/migrations/017_preparation.ts`. Both applied; `pgmigrations` records `017_preparation`.
- `PREPARATION_CREDIT_COST` defaults to 0: no credits are consumed until an owner defines the policy. No existing row was changed.
