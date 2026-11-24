# HireGen — Missing Features Against the Master Brief

Status legend: **Done**, **Partial**, **Missing**, **Blocked (decision/config)**.

## Product / identity

| Requirement | Status | Evidence / gap |
|---|---|---|
| Register / login / logout / refresh | Done | JWT access + refresh, Redis blacklist |
| New user gets security role USER | Done | New registrations store the `user` role; legacy candidate accounts remain `candidate`, and every candidate guard accepts both |
| New user gets FREE plan | Done | `candidate_subscriptions` row created in the registration transaction |
| Exactly 2 initial free credits, once, atomically | Done | `credit_wallets` + `credit_ledger`; signup grant idempotency key and partial unique index; tested retry-safe |
| ADMIN separate from paid plans | Done | Role only from `users.role`; credits, plans and practice grants never change role |
| Bootstrap admin via env, idempotent, no default credentials | Done | `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`; login no longer auto-promotes; scripts refuse to promote silently |
| Profile manual edit + resume upload/parse/review | Done | Candidate profile + worker parse + confirm step |
| Resume file limits/private storage/retention | Partial | Size/type checks and worker path exist; malware scanning/retention policy not evident |

## Plans, credits, payments

| Requirement | Status | Evidence / gap |
|---|---|---|
| Plan catalog FREE ₹0 / CLASSIC ₹199 / CLASSIC_PLUS ₹499 / BRO ₹799 | Done | Seeded `plan_catalog`; surfaced in candidate credits UI and admin/API contracts |
| Paid-plan credit allocations configurable (not invented) | Blocked (decision/config) | Columns exist and are NULL for paid plans; no quantity invented |
| Wallet + ledger with every mutation | Done | `credit_wallets` + append-only `credit_ledger`; tested |
| Atomic spend, no negative balance, no double spend | Done | Row-locked wallet, guarded update, CHECK (balance ≥ 0), idempotency keys; tested |
| Refund policy for failed preparation | Blocked (decision/config) | `refundCredits` service + idempotent ledger entry exist; policy/trigger not wired |
| User balance + understandable history | Done | `/credits` page and `/candidate/credits/ledger` |
| Payment order + verified webhook + idempotent activation | Blocked (decision/config) | No provider/credentials; purchase returns `PAYMENTS_NOT_CONFIGURED`, never fake success |
| Admin reconciliation / ledger view / adjustments | Done | `/admin/credits` page + admin API; adjustments audited and idempotent |

## Jobs, recommendations, applications

| Requirement | Status | Evidence |
|---|---|---|
| Job ingestion from permitted sources + normalization + dedup | Done | Python workers + source adapters + review gate |
| Recommended feed + all jobs + search/filter/pagination | Done | Candidate `/jobs`, `/recommendations` |
| Job detail + source evidence + trust explanation | Done | Job details and trust scores |
| Save / interest / application tracking + timeline | Done | Applications + events |
| External application link vs HireGen enrollment distinction | Done | UI/copy distinguishes external apply |
| Recommendation explainability | Done | Persisted breakdown/reasons |

## AI preparation

| Requirement | Status | Evidence / gap |
|---|---|---|
| Interview preparation (role/company-specific) | Done | `/preparation` artifact with question bank, answer frameworks, profile talking points and revision plan |
| Interview bot with follow-ups, answer capture, feedback | Done | Adaptive follow-ups + grading + voice interview |
| Group discussion (GD) preparation | Done | Topics, opening points, balanced arguments, structure, participation tips, evaluation rubric |
| Presentation preparation | Done | Slide-by-slide outline, speaking notes, likely questions, delivery guidance |
| Company research with citations | Done | Source URLs + retrieval timestamps; unverified facts explicitly labelled, no invented developments |
| Provider keys/prompts server-side, untrusted input defense | Done | Server-side Gemini, Zod validation, strict output validation, template fallback, sanitised inputs |
| Credit consumption/refund in preparation | Blocked (decision/config) | `PREPARATION_CREDIT_COST=0` by default: no amount invented. Configurable hook calls `spendCredits` idempotently and refunds on failure when an owner sets a cost |

## Engagement / onboarding / admin

| Requirement | Status | Evidence |
|---|---|---|
| First-time tutorial skippable/replayable | Done | Spotlight tour, localStorage flag, avatar-menu replay |
| Tutorial progress persisted server-side | Done | `onboarding_progress` table, candidate save/load API, tour persists viewed/completed/skipped state; localStorage is the offline fallback |
| Feedback collection/moderation | Done | Candidate feedback + admin moderation + audit |
| Voluntary placement outcome | Done | `placement_outcomes` table, candidate report/history, admin read-only view; explicitly voluntary |
| Admin user/job/feedback/practice operations | Done/Partial | Existing panels plus credit wallet search, ledger view and audited adjustments |
| Admin audit for high-impact actions | Partial | Audit used for moderation, practice grants and credit adjustments; payment operations pending provider |
| System health/metrics/DLQ/source health | Done | Admin metrics, sources, integrity, DLQ |

## Frontend polish

| Requirement | Status |
|---|---|
| Distinctive professional light/dark design | Done | Landing + app + auth shell follow the editorial token system |
| Responsive + accessible | Done | Semantic sections, skip link, labelled controls, visible focus, light/dark tokens |
| Loading/empty/error/success states | Done for existing and new pages |
| Public pre-login preview | Done | `/` shows a premium editorial preview with an explicitly labelled sample workspace and clear sign-in/register paths |
| Credits/plan screen | Done | `/credits` and `/admin/credits` |
| Placement outcome form | Done | `/placements` candidate form/history + `/admin/placements` read-only table |
| Offline/retry banner | Missing (nice-to-have) | Per-page retry buttons exist; global banner not implemented |

## Undefined product decisions (must not be guessed)

1. Credits included with CLASSIC / CLASSIC_PLUS / BRO.
2. Credit expiry, renewal, rollover.
3. Paid-tier feature limits/exclusive benefits.
4. Billing duration/renewal/cancellation rules.
5. Refund policy for failed/cancelled AI preparation.
6. Payment gateway and production deployment target.
7. Whether the existing practice monthly quota should be replaced by credits, or kept alongside.

These remain configurable/blocked. The safe implementation adds the ledger foundation, FREE plan, 2-credit signup grant, catalog prices, and admin/user visibility without inventing paid credit quantities or payment behavior.
