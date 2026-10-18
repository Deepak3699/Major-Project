# JobPilot AI - blueprint alignment and run notes

This repository began as a recruiter-facing lead-generation CRM. The candidate-facing platform now uses the same PostgreSQL, Fastify, React and Python worker stack while adding a separate job seeker workflow. The attached project blueprint describes the intended product; implementation details here record what is currently wired into the code.

## Implemented blueprint phases

| Blueprint capability | Current implementation |
|---|---|
| Job discovery | Existing Python worker fleet; API triggers a new job discovery run. Discovery resolves only the official ATS/public-feed allowlist by default. `SCRAPE_PERMITTED_SOURCES` extends it only after access review. |
| Normalization and deduplication | The default worker path stores candidate job listings, source snapshots and candidate-safe raw payloads without recruiter-contact enrichment or B2B lead creation. It retains location, work setup, employment type, apply URL, posting time, skills and structured salary values where sources provide them. Newly ingested listings enter admin review before candidates can see them. The former recruiter/outreach path is available only with `ENABLE_LEGACY_OUTREACH_PIPELINE=1`. |
| Evidence-based verification | Trust evidence is computed from source type, company-domain match, HTTPS application URL, freshness, optional source-reported contact/cross-source evidence and listing completeness. Bands follow the blueprint thresholds: 94+ very high, 80-93 high, 60-79 review, below 60 low. The score is a confidence signal, not a guarantee. Admin review decisions and evidence snapshots are stored. |
| Candidate profile and resume | Candidate profile stores skills, roles, preferences, education, experience, projects and certifications. PDF/DOCX/TXT parsing returns editable suggestions; the user must save and confirm the profile. The uploaded original is processed in memory and not saved. |
| Explainable matching | Hybrid weighted score: skills 30%, experience 20%, education 10%, location 10%, role fit 15%, projects 5%, salary 5%, preferences 5%. API responses include per-dimension scores, matched skills, missing skills and reasons. |
| Truthful application preparation | Gemini 2.5 Flash is optional through `GEMINI_API_KEY`; if not configured or unavailable, a truthful local template is used. Resume and email drafts persist as application documents. They remain drafts for candidate review. |
| Authorized application workflow | The candidate opens the employer's own apply page and records progress in the app. No auto-submit, CAPTCHA solving or anti-bot bypass is used by default. |
| Application tracking and outcomes | Candidate-scoped status history supports SAVED, RECOMMENDED, READY_TO_APPLY, APPLIED, SCREENING, INTERVIEW, OFFER, REJECTED, WITHDRAWN and JOINED. Dashboard counts show recent jobs and outcomes. |
| Admin view | Platform overview, source health, job review/publish/quarantine/reject controls and existing settings are available to admin users. Candidate feedback is stored as pending moderation. |

## Source-access policy

The worker's default allowlist is defined in `packages/scrapers/scrapers/scrape_consumer.py` as `PERMITTED_DEFAULT_SOURCES`. Admin source toggles and per-run source lists narrow this set; they do not authorize additional sources. An operator must review the source terms and access method, then add an approved connector name to `SCRAPE_PERMITTED_SOURCES` in the environment. New code defaults to plain HTTPX with an identifiable `JobPilotAI/1.0` user-agent. Browser automation, proxy rotation, TLS impersonation and CAPTCHA solving require the explicit `SCRAPER_ALLOW_ADVANCED_FETCH=1` option and must only be used in a workflow where the source permits that method.

## Local setup additions

Keep these settings aligned in the root `.env` so the API can reach the resume parser worker:

```ini
WORKERS_URL=http://localhost:8000
WORKER_INTERNAL_TOKEN=use-the-same-long-random-value-for-api-and-worker
```

Docker Compose overrides `WORKERS_URL` for the internal worker hostname. The API and worker both read the shared token from `.env`. The Python worker now needs `pypdf` and `python-docx`, included in `packages/scrapers/requirements.txt`.

After updating an existing database, run the normal database initialization (`npm run db:init` in `packages/api`, or the project Docker launcher) so candidate tables are applied and existing job listings enter the admin review queue. Start the API, frontend and scraper worker as described in the root README.

Register a candidate from the UI to use the candidate workspace. Admin access continues to use `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`; new self-registrations cannot create administrator accounts.

## Practical boundaries

- Recommendations depend on the coverage and quality of enabled source data; this system cannot promise every job on the internet or guarantee employment.
- Matching currently uses explainable weighted profile and skill matching. The blueprint's pgvector embedding retrieval is not wired yet; recommendations do not use semantic embeddings.
- A trust score is evidence-based confidence, never a claim that a job is certainly genuine.
- Resume extraction is heuristic and may miss or misclassify fields; candidates review all suggestions.
- Gemini outputs are drafts and may require correction. The local template keeps the feature usable without an AI key.
- Final application submission, messaging consent, and any job-board account actions stay with the user or an official integration.
