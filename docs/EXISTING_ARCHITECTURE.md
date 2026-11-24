# HireGen — Existing Architecture

## 1. Runtime topology

```
Browser (React SPA :5174)
        |
        | HTTPS / JSON (VITE_API_URL, default http://localhost:3000/api)
        v
Fastify API (:3000, Docker :3001)
   |        |          |             |
   |        |          |             +--> Gemini API (optional, server-side)
   |        |          +--> Redis (cache, rate limits, token blacklist, queues)
   |        +--> PostgreSQL 16 (system of record)
   +--> Python worker fleet (:8000) — resume parsing, scraping, enrichment
                              |
                              +--> ATS/public job feeds
```

Docker Compose runs `postgres`, `pg-migrator`, `redis`, `api`, `web`, optional `workers` and `n8n`. The web container serves static Vite output through nginx; `/api` is proxied or addressed directly via `VITE_API_URL`.

## 2. Frontend boundaries

- `packages/web/src/App.tsx` — session gate and route table. Two route modes: candidate/admin workspace and legacy CRM (non-admin, non-candidate roles).
- `packages/web/src/stores/auth.ts` — Zustand store; access/refresh tokens persisted, `init()` restores user.
- `packages/web/src/lib/api.ts` — single axios client with auth header, 401 refresh queue, typed API wrappers (`auth`, `candidate`, `practice`, `leads`, `dashboard`, …).
- `packages/web/src/lib/types.ts` — shared response/domain types.
- `packages/web/src/components/Layout.tsx` — app shell: Sidebar, Header, CommandPalette, OnboardingTour, outlet.
- `packages/web/src/components/ui/*` — local design-system primitives (button, input, select, textarea, modal, badge, card, toast, spinner, empty-state, table, page-header, tabs…). Tailwind semantic tokens in `tailwind.config` + CSS variables.
- Data fetching: react-query. Query keys are string-based (`practice-subscription`, `practice-sessions`, `dashboard-credits`, …).
- Auth pages break out of the shell through `AuthShell`; protected routes are guarded in `App.tsx`.
- Onboarding tour uses `data-tour` anchors, localStorage flag `HireGen:tutorial-done`, and window event `hiregen:replay-tour`.

## 3. Backend boundaries

- `packages/api/src/server.ts` — Fastify bootstrap: CORS, Helmet, compression, rate limit (100/min global), JWT, websocket, request logging, no-store header, error handler. Registers all routes under `/api`.
- `packages/api/src/routes/index.ts` — route composition:
  - `/auth` — login/register/logout/refresh
  - `/leads`, `/dashboard`, `/companies`, `/contacts` — legacy recruiter CRM
  - `/admin` — operational admin (runs, sources, settings, users, DLQ, practice approvals, grant, metrics)
  - `/webhooks` — Resend/WhatsApp inbound webhooks
  - `/candidate` — candidate profile, resume parse, jobs, recommendations, applications, feedback, candidate admin sub-routes
  - `/candidate/practice` — subscriptions, sessions, answers, finish, learning
- `packages/api/src/middleware/auth.ts` — `authenticate` and `authorize(roles)`; both resolve the subject against the database.
- `packages/api/src/middleware/error-handler.ts` — centralized error response.
- `packages/api/src/utils/*` — DB, Redis, crypto, env (Zod), logging/metrics, audit, source adapters, practice AI, job intelligence, recommendation model, application prep, resume parsing, circuit breaker, HTTP client.

## 4. Data flow — candidate preparation

1. Candidate completes/confirms profile (`candidate_profiles`).
2. Jobs are ingested by the Python workers into `job_postings` + `job_sources`; admin may review them.
3. Recommendation score is computed from confirmed profile facts and stored in `job_recommendations` with explainable reasons.
4. Applications are tracked in `applications` with an `application_events` timeline.
5. Practice session creation checks practice subscription state + monthly usage; AI generates a question set (Gemini or template), stored in `interview_sessions` + `interview_questions`.
6. Each answer is validated, graded, persisted, and an adaptive follow-up may be appended. Finishing computes a final score/verdict/summary.
7. Learning tracks are generated per role and module progress is tracked.

## 5. Authentication and authorization

- JWT access token (7 days) + refresh token (30 days), signed by `@fastify/jwt`.
- Logout blacklists the access token in Redis for its remaining TTL; refresh tokens are rotated and blacklisted.
- `authenticate` resolves the JWT subject against `users`; missing users are rejected.
- `authorize([...roles])` enforces backend roles. Candidate endpoints accept `candidate`; admin sub-routes use `authorize(['admin'])`.
- The frontend route guard is convenience only; every protected backend route must still authorize.

## 6. Integrations

| Integration | State |
|---|---|
| PostgreSQL | Required, primary store |
| Redis | Required by env; used for blacklist/queues/rate-limit coordination |
| Gemini | Optional; server-side; template fallbacks |
| Python workers | Resume parsing and scrape orchestration; `WORKERS_URL`, internal token |
| Resend / Brevo | Legacy outreach email sending, optional |
| WhatsApp Web bridge | Legacy outreach, optional |
| Snov.io / ContactOut / Reacher | Legacy enrichment/verification, optional |
| Payment gateway | **Absent** |

## 7. Design system

The web app follows `packages/web/DESIGN_SPEC.md`: semantic color tokens, ink/paper button treatment, a single ember `signal` accent, mono eyebrows, square-ish corners, restrained motion, no gradients/glassmorphism/emoji. New screens must reuse this language and must work in both themes and at mobile/tablet/desktop widths.

## 8. Preserved architecture decisions

- Keep Fastify + postgres.js and the existing route composition.
- Keep react-query + Zustand and the current `lib/api.ts` contract style.
- Extend the existing declarative SQL + node-pg-migrate dual path; never reset the database.
- Keep legacy CRM routes and tables intact; candidate features live alongside them.
- Keep AI provider calls server-side and optional, with deterministic template fallbacks.
