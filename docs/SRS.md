# Software Requirements Specification (SRS)
## HireGen Lead Intelligence Engine — Autonomous Fresher-Job Lead Generation & Outreach Agent

**Document Version:** 1.0
**Status:** Ready for Development
**Scope:** End-to-end system — backend, frontend, data model, scraping fleet, enrichment, verification, AI drafting, outreach, cron orchestration, hosting

---

## 1. Purpose and Vision

Build an autonomous agent that runs **once daily on a cron schedule**, discovers **every active "fresher / 0-1yr / 0-2yr / no-experience" job** posted across the internet in the last 24 hours, extracts the **hiring company + the HR/recruiter who posted it**, builds a **complete, scored lead record**, and hands the sales team a ready-to-work pipeline — with on-demand enrichment, verification, AI-personalized outreach drafts, and one-click sending.

This is a **B2B sales lead-gen agent for a recruitment/hiring SaaS**, not a job board for candidates. The "lead" is the **HR / hiring manager / company**, not the job seeker.

The system must map 1:1 onto the 5-step architecture diagram supplied:

| Step | Name | Function |
|---|---|---|
| 1 | Find Leads | Daily scraping fleet finds new fresher jobs + HR/company data |
| 2 | Scoring + On-Demand Enrichment | Score completeness, manually trigger Snov.io/ContactOut per-row to fill gaps |
| 3 | Verify | Open-source email/WhatsApp validators confirm reachability |
| 4 | Draft Generation | Gemini generates personalized email + WhatsApp copy per lead |
| 5 | Send | One-click / on-demand send via WhatsApp (open-source gateway) and Email API |

Non-negotiable design principles from requirements:
- **Never fail silently.** Every stage has a fallback path (see §9).
- **Free-first stack.** Every default provider must have a genuine free tier; paid APIs (Snov.io, ContactOut, email/WhatsApp send APIs) are **optional, manually-triggered, credit-conscious** — never automatic, never bulk.
- **Scraping is the core IP.** No dependency on Apollo/Hunter for lead sourcing. Multiple redundant open-source/self-hosted scrapers ("scraper army") with rotation and fallback.
- **HR name + contact (official or personal) is the highest-value data point.** Scoring must weight it accordingly.

---

## 2. System Architecture Overview

```
                         ┌─────────────────────────────────────────┐
                         │           ORCHESTRATOR (n8n)             │
                         │   Daily Cron @ 02:00 IST (low-traffic)   │
                         └───────────────┬───────────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────────────────────┐
        │                                │                                │
┌───────▼────────┐            ┌──────────▼─────────┐          ┌──────────▼─────────┐
│ STEP 1          │            │ STEP 2               │          │ STEP 3              │
│ Scraper Fleet    │──leads──▶│ Scoring Engine +      │──leads──▶│ Verification Engine  │
│ (20+ sources)    │  (raw)    │ On-Demand Enrichment  │ (scored) │ (email + WhatsApp)   │
│ → Normalizer     │            │ (Snov.io/ContactOut)  │          │ (open-source, async) │
│ → Dedup Engine    │            │ Manual "Enrich" btn   │          │                      │
└───────┬────────┘            └──────────┬─────────┘          └──────────┬─────────┘
        │                                │                                │
        │                     ┌──────────▼─────────┐          ┌──────────▼─────────┐
        │                     │  PostgreSQL          │          │ STEP 4               │
        │                     │  (Leads DB, source    │◀────────│ AI Draft Generator    │
        │                     │  of truth for all      │          │ (Gemini 1.5/2.0      │
        │                     │  5 steps)               │          │ Flash, per-lead)     │
        │                     └──────────┬─────────┘          └──────────┬─────────┘
        │                                │                                │
        │                                │                     ┌──────────▼─────────┐
        │                                │                     │ STEP 5               │
        │                                │                     │ Outreach Dispatcher   │
        │                                │                     │ (WhatsApp gateway +   │
        │                                │                     │ Email API), on-demand  │
        │                                │                     └──────────┬─────────┘
        │                                │                                │
        └────────────────────────────────┴────────────┬───────────────────┘
                                                        │
                                          ┌─────────────▼──────────────┐
                                          │  REACT FRONTEND (Lead CRM)  │
                                          │  Table + row-level actions: │
                                          │  Enrich | Verify | Draft |  │
                                          │  Send. Full audit trail.    │
                                          └──────────────────────────────┘
```

**Backend:** Fastify (Node.js) API layer + Python worker fleet (scraping/OSINT is Python-native ecosystem: Playwright, Scrapy, requests). Backend is polyglot by design — Node orchestrates and serves the API; Python does the heavy scraping/enrichment/NLP work as a queue-consuming worker pool. They talk through PostgreSQL + Redis, never directly.

**Why not Node-only scraping:** Python has the deepest, most maintained open-source scraping/OSINT ecosystem (Scrapy, Playwright-Python, undetected-chromedriver, `python-holehe`, `linkedin_scraper`, `duckduckgo_search`, spaCy/regex NLP for entity extraction). Reinventing this in Node wastes development time for zero benefit. Node/Fastify is superior for the public API + webhook layer (lighter, faster cold starts on free hosting tiers).

---

## 3. Technology Stack (100% Free-Tier Capable)

| Layer | Technology | Why | Free Hosting |
|---|---|---|---|
| Orchestration / Cron | **n8n** (self-hosted, open-source) | Visual workflow engine that IS the diagram — cron trigger, branching, retries, webhooks, built-in HTTP/error nodes. Matches "Automate, run daily" note exactly. | Self-host on Render/Fly.io free instance, or Railway free tier |
| Scraping Fleet | **Python 3.12 + Scrapy + Playwright (headless Chromium) + `crawl4ai`** | Scrapy for structured/API-like sources (fast, resilient, built-in retry/middleware). Playwright for JS-heavy sites (LinkedIn, Naukri, Internshala). `crawl4ai` (open-source, LLM-friendly scraper) as a fallback extractor for unknown/unstructured pages. | Runs as worker container on Render/Railway free background worker, or GitHub Actions scheduled runner (2,000 free min/month) as backup executor |
| Anti-block layer | **`undetected-chromedriver`**, **rotating free proxies** (`free-proxy` PyPI, ProxyScrape free list), **fake-useragent**, randomized delays | Keeps scraper fleet alive without paid proxy services | N/A (library-level) |
| Job Queue | **Redis (BullMQ for Node side, RQ/Celery for Python side)** | Decouples scraper → normalizer → scorer → verifier → drafter → sender into independent, retryable, fault-isolated stages | Upstash Redis free tier (10K commands/day) or Redis Cloud free 30MB |
| Primary Database | **PostgreSQL** | Relational integrity for Lead↔Company↔HR↔Job↔Enrichment↔Verification↔Outreach graph; JSONB columns for flexible/raw scraped payloads | Supabase free tier (500MB) or Neon free tier (0.5GB, serverless, scales to zero) |
| Backend API | **Fastify (Node.js 20+) + TypeScript, Zod validation** | Rajat's existing stack; fast, low memory footprint, great for free-tier cold starts | Render free web service / Railway free / Fly.io free |
| Python Worker Service | **FastAPI** (thin control API in front of Scrapy/Playwright jobs, triggered by n8n/Redis) | Consistent with existing stack pattern (FastAPI used elsewhere) | Same host as scraper fleet |
| Frontend | **React 18 + TypeScript + Vite + TanStack Table + TailwindCSS** | Fast dev, best-in-class data-grid for the "lead row with action buttons" UI | Vercel free / Netlify free / Cloudflare Pages free |
| AI Drafting | **Gemini 2.0 Flash (or 1.5 Flash) API** | Free tier: 15 RPM / 1M tokens/day — more than sufficient for daily batch of ~50-200 leads | N/A (API) |
| Email Verification | **`check-if-email-exists` (Reacher, open-source Rust CLI/API, self-hostable)** — SMTP handshake + MX + disposable/catch-all detection | Best open-source email verifier available; self-hosted = zero per-verification cost | Deploy as Docker container on Render free / Fly.io free |
| WhatsApp Verification & Send | **`whatsapp-web.js`** or **Baileys** (open-source WhatsApp Web API libraries) | Confirms a number is WhatsApp-registered before sending; also used for actual send in Step 5 | Self-hosted Node microservice (Railway/Render free, must stay warm — see §9.5 for fallback) |
| Email Send | **Resend free tier (3,000 emails/mo) or Brevo free tier (300/day)** | Both have generous free tiers and simple REST APIs | N/A (API) |
| Optional Paid Enrichment | **Snov.io API + ContactOut API** | Manually triggered only, per §5 | Free trial credits; user-supplied key thereafter |
| OSINT/People-search | **`holehe`, `sherlock`, `theHarvester`, `googlethis`, `duckduckgo_search`** (all open-source Python OSINT tools) | Fill HR-personal-contact gaps without paid tools; see §4.5 | N/A (libraries) |
| Auth | **Lucia Auth / better-auth (self-hosted, free)** or Supabase Auth (bundled free with DB) | No paid IdP needed | Bundled |
| Monitoring/Logging | **Grafana Cloud free tier + Loki**, or simple structured logs to Supabase table + n8n error-workflow → email/Slack alert | Observability without cost | Free tier |
| CI/CD | **GitHub Actions** (2,000 free minutes/month) | Test + deploy pipeline | Free |

**Total monthly cost at MVP scale (≤500 leads/day): $0.** All paid APIs (Snov.io, ContactOut, Gemini beyond free tier, email/WhatsApp send beyond free tier) are opt-in, metered, and rate-limited by the on-demand button design in Step 2/5 — this is precisely why those steps are manual, not automatic: it keeps the free-tier ceiling from ever being breached by accident, matching the diagram's explicit note "*searching on contact out and Snov io will be manual (click button) so api credits don't outburst*".

---

## 4. Step 1 — Daily Lead Discovery Engine

### 4.1 Trigger
n8n Cron node fires daily at a fixed off-peak time (configurable; default 02:00 IST). Triggers the Python scraper-fleet controller via internal webhook. A **manual "Run Now" trigger** is also exposed in the frontend for ad-hoc runs, per the diagram's "Automate, run daily / Find last 24 hrs new leads" note.

### 4.2 Filter Criteria (hard-coded, diagram-specified)
Jobs must match at least one of: `Fresher`, `0-1 years experience`, `0-2 years experience`, `No experience required`, `Entry level`, `Graduate trainee`, `Campus hire`. Filtering happens twice: (a) query-level (search terms passed to each source), (b) post-scrape NLP re-validation (regex + keyword classifier on the scraped experience field) to reject false positives from sources that don't support native experience filters.

### 4.3 Source Catalog — "The Scraper Army"

Sources are tiered by reliability and legal/ToS risk. Each source has its **own dedicated scraper module**, its **own rate limiter**, and its **own circuit breaker** (see §9.2) so one blocked source never stalls the pipeline.

**Tier 1 — Structured / API-friendly (highest reliability, run first):**
| Source | Method | Notes |
|---|---|---|
| RemoteOK | Public JSON API (`remoteok.com/api`) | Free, no auth, structured JSON — zero scraping risk |
| Arbeitnow | Public JSON API | Free, EU/global entry-level jobs |
| Remotive | Public JSON API | Free, has experience-level tagging |
| Adzuna | Free-tier REST API (1,000 calls/mo) | India-region entry-level search supported |
| Jooble | Free partner API | Aggregator, broad coverage |
| USAJobs / India Government portals (NCS - National Career Service) | Public API/open data | Government fresher listings, zero block risk |
| GitHub Jobs-style repos (`SimplifyJobs/Summer2026-Internships`, `pittcsc/Summer2026-Internships`, `vanshb03/New-Grad-Jobs` etc.) | Git clone + parse README/JSON | **Open-source community-maintained new-grad job lists** — extremely high signal-to-noise for "fresher" roles, updated by contributors daily, git-diffable for delta detection |

**Tier 2 — Major job boards (headless-browser scraping, medium risk, proxy-rotated):**
| Source | Method |
|---|---|
| LinkedIn Jobs | Playwright + `linkedin_scraper` (open-source) with logged-in session pool, heavy rate-limiting, residential-style rotation |
| Naukri.com | Playwright, India's largest fresher job market |
| Internshala | Playwright/Scrapy — dedicated fresher/internship platform, high yield |
| Indeed India | Scrapy + rotating headers |
| Foundit (Monster India) | Playwright |
| Instahyre | Playwright |
| Freshersworld.com | Scrapy — purpose-built fresher job board, top-priority source |
| AngelList/Wellfound | Playwright — startup entry-level roles |
| Glassdoor | Playwright (jobs section) |
| Shine.com | Scrapy |
| CutShort | Scrapy |

**Tier 3 — Company career pages (direct, highest data quality, crawler-per-domain):**
- Generic `careers.<company>.com` / Greenhouse / Lever / Workday / SmartRecruiters / Zoho Recruit boards.
- **ATS-pattern scrapers**: most companies use one of a handful of ATS platforms with predictable URL/JSON structures — build **one scraper per ATS platform**, not per company:
  - Greenhouse: `boards-api.greenhouse.io/v1/boards/{company}/jobs` (public JSON, undocumented but stable, widely used by OSINT community)
  - Lever: `api.lever.co/v0/postings/{company}` (public JSON)
  - Workday: predictable REST endpoints per tenant
  - SmartRecruiters: public `api.smartrecruiters.com/v1/companies/{company}/postings`
  This means the fleet can crawl **thousands of company career pages for free** just by iterating known company slugs against 4-5 ATS API patterns — extremely high ROI, near-zero block risk since these are public documented-by-convention JSON endpoints.

**Tier 4 — Social & hidden sources (OSINT-style discovery, high signal for freshly posted roles):**
| Source | Method |
|---|---|
| Twitter/X search | `snscrape` (open-source, no API key) for `#hiring #fresher #0-1yrs` etc. |
| Reddit | `praw` (free API) on r/developersIndia, r/csCareerQuestions, r/forhire |
| Telegram job-alert channels | `telethon` (open-source) subscribed to public fresher-job channels (e.g., regional "Jobs Alert India" channels) |
| Facebook Jobs / Groups | Playwright, low-priority/fallback (fragile, ToS-sensitive — flagged as **optional, disabled by default**, operator opt-in) |
| WhatsApp broadcast job-alert channels | Via `whatsapp-web.js` listening on subscribed public channels (opt-in) |
| Google Search / "hidden" listings | `googlethis`/`duckduckgo_search` + site-restricted dorks (`site:boards.greenhouse.io "fresher"`) to surface postings not indexed by aggregators |
| College placement cell portals | Scrapy, for campus-hire postings (public listings on university sites) |

### 4.4 Extraction Schema (per diagram's "What to find")
Each scraped posting is normalized to this intermediate record before it becomes a `Lead`:

```
company_name, about_company, hr_name, hr_email, company_email,
hr_mobile, company_mobile, hr_linkedin_url, job_title,
about_job, experience_required, salary_range, job_url,
source_site, scraped_at, raw_payload (JSONB, full original for audit/replay)
```

### 4.5 HR Name & Contact Extraction Logic (highest priority field)
1. **Direct extraction**: many job postings list "Posted by <Name>" or include a recruiter LinkedIn link directly — regex + DOM-position heuristics extract this first.
2. **LinkedIn cross-reference** (matches diagram note: *"Using Hr name, additionally try to find linkedin of hr, if found using it on contact out get email or mobile. if linkedin not found, using contact out and snov io get name and mobile"*):
   - If HR name found but no LinkedIn → search `site:linkedin.com/in "<HR name>" "<Company>"` via `googlethis`/`duckduckgo_search` to resolve LinkedIn profile URL.
   - This LinkedIn URL is stored on the lead but is **not auto-enriched** — enrichment (getting email/phone FROM the LinkedIn URL) is the Step 2 on-demand action, per the diagram's explicit manual-trigger requirement.
3. **Fallback cascade** if HR name is not found at all (diagram: *"if nothing found then fallback to this case" → "Try to find any other hr or company's default Email id and mobile number in same company"*):
   - Query company's Greenhouse/Lever/career page for **any other open posting** by the same company and reuse that recruiter's identity if present.
   - Fall back to company-level generic contact: `careers@company.com`, `hr@company.com` pattern-guessing + MX validation, or the "Contact Us"/footer number scraped from the company's official site.
   - Fall back to WHOIS/company registry lookup for a registered official contact (last resort, lowest confidence score).
4. **OSINT personal-contact augmentation** (optional, operator-toggle, respects rate limits): `holehe` (checks which platforms an email is registered on — validity signal) can be run against a guessed email pattern to confirm it's a real, active address before it's stored as verified-candidate.

### 4.6 Normalization, Dedup & Persistence
- All Tier 1-4 scrapers push raw extracted records onto a Redis queue (`raw_leads_queue`).
- A single **Normalizer worker** consumes the queue, applies the schema in §4.4, runs NLP experience-level re-validation (§4.2b), and computes a **dedup fingerprint** = hash(normalized company_name + job_title + job_url_domain).
- Dedup check against `leads` table (last 30 days) — exact fingerprint match → merge/update `last_seen_at`, don't duplicate. Fuzzy match (Levenshtein on company+title, threshold 0.85) → flag as `possible_duplicate`, surfaced in UI, not auto-merged (avoid silent data loss).
- Clean, deduped record inserted into PostgreSQL `leads` table with `pipeline_stage = 'discovered'`.

---

## 5. Step 2 — Scoring Engine + On-Demand Enrichment

### 5.1 Lead Scoring Model
Every lead gets a `lead_score` (0-100) computed immediately after normalization, and **recomputed after every enrichment/verification event**. Weighted per diagram's branches (`email id or phone no` / `hr name found` / `hr name not found`):

| Field present | Points |
|---|---|
| HR name found | +20 |
| HR personal contact (email or mobile) found | +25 |
| HR LinkedIn URL found | +15 |
| Company official email/mobile found (fallback tier) | +10 |
| Job description quality (salary, full JD, valid job_url) | +10 |
| Email verified deliverable (Step 3) | +10 (bonus, only after verification) |
| WhatsApp number verified active (Step 3) | +10 (bonus, only after verification) |

Score bands drive UI sort/filter and are recalculated live: `Hot (≥70)`, `Warm (40-69)`, `Cold (<40)`. This directly operationalizes the diagram's 2nd-Step branches (`hr name found` vs `hr name not found` vs `email id or phone no` present) into a single ranked, actionable number instead of a manual triage.

### 5.2 On-Demand Enrichment (the diagram's core Step-2 requirement)
Per the diagram note (*"searching on contact out and Snov io will be manual (Click button) so api credits don't outburst"*), enrichment is **strictly row-level and user-initiated. Never batch, never automatic.**

- Frontend: each lead row has an **"Enrich" action button**, enabled only when the lead has a gap (missing email or phone) AND has a resolvable input (HR name + company, or HR LinkedIn URL).
- On click → Fastify API endpoint `POST /api/leads/:id/enrich` → enqueues a single job on `enrichment_queue` → Python worker calls, **in order of preference**:
  1. **ContactOut API** (if HR LinkedIn URL known — ContactOut is LinkedIn-URL-first, highest accuracy for this exact use case).
  2. **Snov.io API** (domain-search / email-finder using company_name + HR name, or email-verifier if only email guessed).
  3. If both fail or keys not configured → falls back to the OSINT cascade in §4.5.3 automatically (never a dead end).
- Every enrichment call is logged in an `enrichment_log` table (provider, request payload, response, credits_used, timestamp) — full audit trail, and a running **credit counter** is shown in the UI per provider so the user always sees remaining free-trial/paid balance before clicking.
- Result merges into the `leads` row, `lead_score` recomputes, `pipeline_stage → 'enriched'`.
- **User must supply their own Snov.io/ContactOut API keys** in Settings — the system never bundles or pays for these; this keeps the platform's own cost at $0 always, exactly matching "should be optional... I am not going to use apollo or hunter for lead generation."

---

## 6. Step 3 — Verification Engine

### 6.1 Email Verification
- Self-hosted **Reacher** (`check-if-email-exists`, Rust, open-source, Apache-2.0 licensed) — performs syntax check, MX record lookup, SMTP handshake (RCPT TO probe without sending), catch-all/disposable/role-account detection. No email is ever actually sent during verification.
- Triggered on-demand via **"Verify" button** per row (matches diagram's `"For verify click button"` note under Email), or optionally auto-triggered right after a successful Step-2 enrichment (configurable toggle — default OFF to preserve the manual-first philosophy).
- Result stored: `email_status ∈ {valid, invalid, catch_all, disposable, unknown}`, `verified_at`.

### 6.2 WhatsApp Verification
- Self-hosted **`whatsapp-web.js`** microservice (open-source, MIT license) maintains an authenticated WhatsApp Web session (QR-code linked once by the operator). Exposes an internal `checkNumberExists(phone)` call which uses WhatsApp's own number-lookup to confirm the number is WhatsApp-registered — before any message is sent.
- Matches diagram's "Whatsapp — Open Source GitHub tool" box exactly.
- Triggered by the same row-level **"Verify" button**; both email and WhatsApp checks fire together server-side and update the row asynchronously (WebSocket/SSE push to frontend, no polling).
- Result stored: `whatsapp_status ∈ {registered, not_registered, unknown}`, `verified_at`.

### 6.3 Fallback
If the self-hosted WhatsApp session is disconnected/rate-limited (WhatsApp Web sessions are the fragile point in this stack — see §9.5), verification gracefully degrades: the lead is marked `whatsapp_status = 'unknown'` (never blocks the pipeline), and email-only outreach remains fully available.

---

## 7. Step 4 — AI-Personalized Draft Generation

- Triggered per-lead (button) or in a reviewable batch (checkbox-select rows → "Generate Drafts") once `pipeline_stage ≥ 'verified'` (or `enriched`, if user chooses to draft before verifying).
- Backend calls **Gemini 2.0 Flash** (free tier: 15 RPM, 1M TPD — comfortably covers a 50-200 lead/day pipeline) with a structured prompt built from: `job_title, about_job, about_company, hr_name, salary_range, company_name`.
- Two outputs generated per lead in a single structured JSON response (`response_mime_type: application/json` + schema) to guarantee parseable output:
  - `email_draft { subject, body }`
  - `whatsapp_draft { body }` (shorter, casual register, WhatsApp-appropriate length/formatting)
- Drafts are **editable in the UI before sending** — never auto-sent. Stored in `outreach_drafts` table, versioned (regenerate creates a new version, prior versions retained for audit/learning).
- Prompt template lives in a dedicated, version-controlled prompt file (not hardcoded inline) so tone/strategy can be iterated without a backend redeploy.

---

## 8. Step 5 — Outreach Dispatch

- Row-level **"Send Email" / "Send WhatsApp"** buttons (matches diagram exactly), each independently gated behind `email_status = 'valid'` / `whatsapp_status = 'registered'` respectively — the UI disables send if verification failed, preventing wasted sends/reputation damage.
- **Email send:** Resend or Brevo free-tier REST API — transactional endpoint, from a domain-verified sender (SPF/DKIM configured) to protect deliverability.
- **WhatsApp send:** same self-hosted `whatsapp-web.js` service used for verification, now used to dispatch the approved draft.
- Every send is logged in `outreach_log` (channel, draft_version_id, sent_at, delivery_status, provider_message_id) and `pipeline_stage → 'contacted'`.
- Diagram's note *"will provide api for email and WhatsApp later" / "On demand: press button to verify email and message and send"* is implemented as a **single combined "Verify & Send" action** available as a convenience shortcut, in addition to the granular per-stage buttons — both paths write to the same audit log.
- Reply/bounce webhooks (Resend webhook, WhatsApp incoming-message webhook) update `pipeline_stage → 'replied'` or `'bounced'` automatically, closing the loop back into the CRM view.

---

## 9. Fault Tolerance, Fallback & Reliability (System-Wide)

Reliability is treated as a first-class requirement, not an afterthought — "leads generation should never fail" is implemented structurally:

### 9.1 Queue-based stage isolation
Every stage (scrape → normalize → score → enrich → verify → draft → send) is a separate Redis-queue consumer. A failure in one stage (e.g., LinkedIn scraper blocked) **cannot cascade** — it only stops jobs on its own queue; every other source/stage keeps running independently.

### 9.2 Per-source circuit breaker
Each scraper module tracks its own consecutive-failure count. After N failures (default 5) it **trips open** for a cool-down window (default 2 hours), skips itself in the current run, logs an alert, and auto-resumes next cycle — so one dead/blocked source degrades total daily lead volume slightly instead of crashing the whole run.

### 9.3 Retry with exponential backoff
All HTTP/scrape calls use a standard retry policy (3 attempts, exponential backoff + jitter) before falling to the circuit breaker. Applied uniformly via a shared HTTP-client wrapper (Node: `undici` + `p-retry`; Python: `tenacity`).

### 9.4 Proxy/anti-block fallback chain
Direct request → rotate User-Agent → rotate free proxy → switch from `requests`/Scrapy to full Playwright headless render (handles JS-challenge pages) → if still blocked, source is circuit-broken for the day and flagged in the run report. Never hard-crashes the job.

### 9.5 WhatsApp session fragility fallback
Self-hosted `whatsapp-web.js` sessions can disconnect (device unlinked, WhatsApp policy change). Health-check ping every 15 min; on disconnect, n8n error-workflow sends an alert (email) to the operator to re-scan the QR code, and the system automatically falls back to **email-only outreach** for all pending sends until the session is restored — WhatsApp is never a single point of failure for the whole outreach step.

### 9.6 Partial-run resilience
Each daily cron run writes a `run_report` row (sources attempted, sources succeeded, sources circuit-broken, leads found, leads deduped, errors[]) — visible in the frontend dashboard. A run that only completes 15/20 sources is still a **successful partial run**, not a failed run; nightly summary is emailed regardless (n8n).

### 9.7 Data integrity fallback
If the Normalizer cannot confidently extract a required field, the record is **still persisted** with `data_quality = 'incomplete'` and the missing fields flagged — never silently dropped. Nothing that was successfully scraped is discarded; incompleteness becomes a scoring/UI signal (§5.1), not a rejection reason. This guarantees "highest data on daily basis" is honored even for messy sources.

### 9.8 API-key / credit exhaustion fallback
If Snov.io/ContactOut/Gemini keys are missing, invalid, or credit-exhausted, the relevant button is disabled with a clear tooltip (not a silent failure), and Step 4 (drafting) falls back to a **template-based draft generator** (Handlebars-style templates using scraped fields only) so outreach is never fully blocked by a third-party outage.

---

## 10. Data Model (PostgreSQL, Scalable & Normalized)

```sql
-- Companies: deduplicated company registry
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT,
  about TEXT,
  industry TEXT,
  size_estimate TEXT,
  default_email TEXT,
  default_phone TEXT,
  website_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(domain)
);

-- HR / recruiter contacts: can be linked to multiple companies over time (job changes)
CREATE TABLE hr_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  linkedin_url TEXT UNIQUE,
  personal_email TEXT,
  personal_mobile TEXT,
  current_company_id UUID REFERENCES companies(id),
  confidence_score SMALLINT DEFAULT 0,        -- how sure we are this is a real, current HR
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Jobs: the actual posting, many-to-one with companies
CREATE TABLE job_postings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) NOT NULL,
  hr_contact_id UUID REFERENCES hr_contacts(id),
  title TEXT NOT NULL,
  description TEXT,
  experience_level TEXT,          -- 'fresher','0-1','0-2','no-experience'
  salary_range TEXT,
  job_url TEXT NOT NULL,
  source_site TEXT NOT NULL,
  fingerprint TEXT NOT NULL,      -- dedup hash
  raw_payload JSONB,              -- full original scrape, for audit/replay
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(fingerprint)
);
CREATE INDEX idx_jobposting_active ON job_postings(is_active, last_seen_at);
CREATE INDEX idx_jobposting_fingerprint ON job_postings(fingerprint);

-- Leads: the sales-facing unit of work — one lead per (job_posting) primarily,
-- carries pipeline state and score. Kept separate from job_postings so pipeline
-- state/history doesn't pollute the raw-data table.
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_posting_id UUID REFERENCES job_postings(id) NOT NULL UNIQUE,
  company_id UUID REFERENCES companies(id) NOT NULL,
  hr_contact_id UUID REFERENCES hr_contacts(id),
  lead_score SMALLINT DEFAULT 0,
  score_band TEXT GENERATED ALWAYS AS (
    CASE WHEN lead_score >= 70 THEN 'hot'
         WHEN lead_score >= 40 THEN 'warm'
         ELSE 'cold' END
  ) STORED,
  pipeline_stage TEXT DEFAULT 'discovered',
    -- discovered -> enriched -> verified -> drafted -> contacted -> replied/bounced
  data_quality TEXT DEFAULT 'complete',   -- complete | incomplete
  email_status TEXT,                      -- valid | invalid | catch_all | disposable | unknown
  whatsapp_status TEXT,                   -- registered | not_registered | unknown
  possible_duplicate_of UUID REFERENCES leads(id),
  assigned_to UUID REFERENCES users(id),  -- sales rep ownership
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_leads_score ON leads(lead_score DESC);
CREATE INDEX idx_leads_stage ON leads(pipeline_stage);
CREATE INDEX idx_leads_created ON leads(created_at DESC);

-- Enrichment audit log
CREATE TABLE enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) NOT NULL,
  provider TEXT NOT NULL,             -- 'snovio' | 'contactout' | 'osint_fallback'
  requested_by UUID REFERENCES users(id),
  request_payload JSONB,
  response_payload JSONB,
  credits_used INT DEFAULT 1,
  status TEXT,                        -- success | failed | no_match
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Verification audit log
CREATE TABLE verification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) NOT NULL,
  channel TEXT NOT NULL,              -- 'email' | 'whatsapp'
  result TEXT NOT NULL,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AI-generated drafts, versioned
CREATE TABLE outreach_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) NOT NULL,
  channel TEXT NOT NULL,              -- 'email' | 'whatsapp'
  version INT NOT NULL DEFAULT 1,
  subject TEXT,                       -- email only
  body TEXT NOT NULL,
  generated_by TEXT DEFAULT 'gemini-2.0-flash',
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Outreach / send log
CREATE TABLE outreach_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) NOT NULL,
  draft_id UUID REFERENCES outreach_drafts(id),
  channel TEXT NOT NULL,
  sent_by UUID REFERENCES users(id),
  provider_message_id TEXT,
  delivery_status TEXT DEFAULT 'sent',  -- sent | delivered | bounced | replied | failed
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- Daily run reporting (fault-tolerance visibility, §9.6)
CREATE TABLE scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  sources_attempted INT,
  sources_succeeded INT,
  sources_circuit_broken TEXT[],
  leads_found INT,
  leads_deduped INT,
  errors JSONB
);

-- Per-source circuit breaker state (§9.2)
CREATE TABLE source_health (
  source_name TEXT PRIMARY KEY,
  consecutive_failures INT DEFAULT 0,
  circuit_open_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_reason TEXT
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'sales_rep',      -- admin | sales_rep | viewer
  api_keys JSONB,                     -- encrypted, user-supplied Snov.io/ContactOut/Resend keys
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Scalability notes:**
- `companies` / `hr_contacts` normalized out of `leads` — prevents duplicate storage as the same company posts multiple fresher roles, and lets the system build a **compounding company/HR knowledge graph** over time (each new scrape enriches an existing company/HR record rather than starting fresh).
- JSONB `raw_payload` on `job_postings` means **no scraped data is ever lost**, even if the structured schema evolves later — full replay/reprocessing is always possible.
- All high-traffic query paths (`score_band`, `pipeline_stage`, `created_at`) are indexed for the frontend table to stay fast at 10K+ leads.
- Partitioning-ready: `job_postings` and `leads` can be partitioned by month once volume grows beyond Supabase/Neon free-tier row counts — schema requires no redesign, only a partition key addition.

---

## 11. Backend API Design (Fastify, REST, Zod-validated)

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/runs/trigger` | Manually trigger Step-1 scraper fleet (admin only) |
| `GET` | `/api/runs/:id` | Get run report (§9.6) |
| `GET` | `/api/leads` | Paginated, filterable (`score_band`, `pipeline_stage`, `source_site`, date range), sortable lead table |
| `GET` | `/api/leads/:id` | Full lead detail incl. company, HR, logs, draft history |
| `POST` | `/api/leads/:id/enrich` | Row-level enrichment trigger (Step 2) |
| `POST` | `/api/leads/:id/verify` | Row-level email + WhatsApp verification (Step 3) |
| `POST` | `/api/leads/:id/draft` | Generate/regenerate AI drafts (Step 4) |
| `PATCH` | `/api/leads/:id/draft/:draftId` | Edit a draft before sending |
| `POST` | `/api/leads/:id/send` | Dispatch email and/or WhatsApp (Step 5) |
| `POST` | `/api/leads/:id/verify-and-send` | Combined convenience action |
| `GET` | `/api/leads/:id/timeline` | Full audit trail across all logs (single unified view) |
| `POST` | `/api/leads/bulk-draft` | Batch draft generation for selected rows |
| `GET` | `/api/dashboard/stats` | Daily volume, score distribution, source health, funnel conversion |
| `PUT` | `/api/settings/api-keys` | Store user's own Snov.io/ContactOut/Resend keys (encrypted at rest, AES-256) |
| `GET` | `/api/sources/health` | Circuit-breaker status per source (§9.2) |
| Webhooks | `/webhooks/resend`, `/webhooks/whatsapp` | Delivery/reply/bounce status updates |

All endpoints require JWT auth (role-checked via `users.role`), Zod-validated request/response schemas, and are rate-limited per-user via `@fastify/rate-limit` to protect free-tier hosting from abuse.

---

## 12. Frontend Design (React + TypeScript)

### 12.1 Core screen: Lead Table (CRM view)
- **TanStack Table** with server-side pagination/filter/sort against `/api/leads`.
- Columns: Score (color-coded badge: hot/warm/cold), Company, Job Title, HR Name, HR Contact (email/phone icons, greyed if missing), LinkedIn icon (link out), Verification status icons, Pipeline stage chip, Source site tag, Discovered date.
- **Row-level action bar** (exactly mirrors the diagram's per-step buttons): `Enrich` | `Verify` | `Draft` | `Send Email` | `Send WhatsApp` — each disabled/enabled based on current lead state, with tooltip explaining why if disabled.
- Real-time updates via WebSocket/SSE — no manual refresh needed when a background job (enrichment/verification) completes.
- Bulk-select for batch draft generation only (never batch enrich/send — preserves the manual-per-lead philosophy for anything that costs money or reputation).

### 12.2 Lead Detail Drawer
Click a row → slide-over panel with: full company profile, HR profile, complete audit timeline (`/api/leads/:id/timeline`), editable draft preview (email + WhatsApp side-by-side), send history.

### 12.3 Dashboard
Daily funnel chart (discovered → enriched → verified → drafted → contacted → replied), source-health grid (green/amber/red per scraper), credit-usage meters for Snov.io/ContactOut/Gemini/email-send, run-report log (§9.6).

### 12.4 Settings
API key management (own Snov.io/ContactOut/Resend/WhatsApp session QR), cron schedule editor, source enable/disable toggles (e.g., disable Facebook scraping if org policy requires), scoring-weight editor (§5.1 weights configurable, not hardcoded).

### 12.5 Design system
TailwindCSS + shadcn/ui components (free, open-source) for a clean, enterprise data-tool aesthetic — dense information display prioritized over decorative UI, consistent with a sales-ops tool used daily by reps.

---

## 13. Security & Compliance
- All third-party API keys encrypted at rest (AES-256-GCM), never logged in plaintext.
- Scraping respects `robots.txt` disallow rules where technically and legally material; Tier-4 fragile sources (Facebook) are opt-in and off by default.
- PII (HR personal email/mobile) access restricted by RBAC (`sales_rep` sees only assigned leads; `admin` sees all); full access is logged in an `audit_log` for compliance review.
- Outbound email includes unsubscribe/opt-out handling and honors CAN-SPAM/India IT Act basics — bounced/opt-out contacts auto-flagged `do_not_contact = true` and excluded from future sends.
- Rate limiting on all outbound scrape/enrich/send actions protects both the target sites' ToS posture and the platform's own free-tier ceilings.

---

## 14. Deployment Architecture (Free-Tier Topology)

```
Vercel (Frontend, free)
   │
   ▼
Render/Railway/Fly.io Web Service (Fastify API, free)
   │
   ├──▶ Neon/Supabase PostgreSQL (free)
   ├──▶ Upstash Redis (free)
   │
   ├──▶ Render/Railway Background Worker (Python FastAPI + Scrapy/Playwright fleet, free)
   │        └── GitHub Actions (scheduled backup runner for overflow/failed sources)
   │
   ├──▶ Self-hosted Reacher (Docker, Render/Fly.io free)
   ├──▶ Self-hosted whatsapp-web.js service (Railway/Render free, needs persistent-ish uptime)
   │
   └──▶ n8n (self-hosted, Render/Railway free) — cron orchestrator + error-alert workflows
```

All services communicate over internal HTTPS/webhooks; secrets managed via each platform's free environment-variable store. This topology has been chosen specifically because every node has a genuine, sustainable free tier — no service here requires a credit card to start, and the architecture scales vertically (upgrade the single bottleneck host) rather than requiring a rearchitect when volume grows.

---

## 15. Development Roadmap (Phased)

| Phase | Deliverable |
|---|---|
| **Phase 0** | Infra setup: Postgres schema (§10), Redis, n8n instance, repo scaffolding (Fastify + Python FastAPI + React), CI/CD |
| **Phase 1** | Step 1 MVP: Tier-1 + Tier-3 (ATS JSON) scrapers only (fastest, safest, highest ROI) + Normalizer + Dedup → leads visible in a basic table |
| **Phase 2** | Full Scraper Army: Tier-2 (Playwright job boards) + Tier-4 (OSINT/social) sources, circuit breakers (§9.2), scoring engine (§5.1) |
| **Phase 3** | Step 2: On-demand enrichment (Snov.io/ContactOut integration + OSINT fallback), credit-usage UI |
| **Phase 4** | Step 3: Reacher email verification + whatsapp-web.js verification, WebSocket live-update UI |
| **Phase 5** | Step 4: Gemini draft generation, editable draft UI, template fallback |
| **Phase 6** | Step 5: Resend/Brevo email send + WhatsApp send, webhook-based reply/bounce tracking, full audit timeline |
| **Phase 7** | Dashboard, RBAC, settings, source health monitoring, load-test at 500+ leads/day, hardening |

---

## 16. Success Criteria
- Daily automated run discovers new fresher/entry-level leads from **≥15 active sources** without manual intervention.
- **Zero full-pipeline failures** attributable to a single source going down (validated by §9.2-9.4 circuit-breaker behavior).
- ≥70% of discovered leads carry an HR name; ≥40% carry a directly-found (non-enriched) contact method, per §4.5 extraction cascade.
- On-demand enrichment/verification/send actions never trigger unbounded API cost — every paid call is one explicit user click, fully audited.
- Total infrastructure cost at MVP scale: **$0/month**, confirmed by design in §3 and §14.

---

*End of SRS. This document is the complete build specification — a development agent can implement Phases 0-7 sequentially using §10 (schema), §11 (API contract), and §3 (stack) as the ground truth for all technical decisions.*
