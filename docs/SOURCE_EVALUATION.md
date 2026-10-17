# Source Evaluation Record (Track 2)

Every candidate from the master resource list is either integrated or has a
recorded verdict below. Re-probing a declined source requires new evidence,
not a new guess. Evaluated 2026-09-14.

## Integrated (public JSON/XML, verified live, tested)

| Source | Endpoint pattern | Proof |
|---|---|---|
| BambooHR | `https://{slug}.bamboohr.com/careers/list` | `freshworks` → 200 JSON, postings at `/careers/{id}` |
| Personio | `https://{slug}.jobs.personio.com/xml` | `personio` → 200 XML with `yearsOfExperience` |

Plus the 8 pre-existing ATS (Greenhouse, Lever, Ashby, Workday,
SmartRecruiters, Recruitee, Teamtailor, Breezy) and ~35 boards.

## Declined — terms / access (do not build without written permission)

| Source | Evidence |
|---|---|
| QuikrJobs | `robots.txt`: automated access "strictly prohibited" except search-engine indexing |
| Youth4Work | 403 bot wall on listing pages; no public feed found |
| LinkedIn (credentialed automation) | ToS; public-job HTML only, covered via existing OSINT surface |

## Declined — unverifiable pattern (no code without a live proof)

| Source | Evidence |
|---|---|
| Workable | `api/accounts/freshworks/jobs` → 404; pattern unconfirmed |
| Freshteam | `freshteam.com/api/jobs` → 503 |
| Keka | guessed tenant → 302, no JSON surface found |
| Zoho Recruit | portal URL → 302, no stable public feed |
| JobHai | connection failed from two networks (000), nothing to build against |

## Deferred — needs a dedicated browser-automation sub-project

| Source | Evidence / reason |
|---|---|
| NCS (ncs.gov.in) | Azure gateway 301 → JS-gated portal; needs Playwright + session handling + gov-portal review. Own spec, not a 30-line adapter. |
| Darwinbox tenants | 200 HTML shell; same browser-automation class as NCS. |

## Standing rule
A new scraper requires: (1) live `curl` proof of a public data endpoint,
(2) `robots.txt`/terms clearance, (3) fixture + live tests in
`tests/test_<source>.py`, (4) corpus + `SCRAPER_MAP` + defaults wiring.
Guessed URL patterns are fabrication risk and are not merged.

## Agent-Reach channel integration (2026-09-14)
`Panniantong/Agent-Reach` (MIT) evaluated as an OSINT-channel source.
Adopted patterns only — zero copied code, zero new dependencies.

| Channel | Verdict | Reason |
|---|---|---|
| RSS/Atom hiring feeds | **Integrated** (`utils/rss_signals.py`, Tier 2d) | Genuinely new: nobody read company press/blog feeds. Signals-only, robots-honouring, live-tested vs zoho.com |
| Jina Reader page fetch | Already in-repo (`linkedin_osint.py`) | Nothing to add |
| GitHub OSINT | Already in-repo (`github_email_osint.py`) | Nothing to add |
| SERP/dork search | Already in-repo (`serp_dork.py`, free) | Nothing to add |
| Exa semantic search | Declined (code) | Key-gated vendor duplicating the free SERP tier; untestable without a key. Revisit if `EXA_API_KEY` is ever configured — slot reserved after Tier 2a |
| YouTube/Bilibili video | Declined | No B2B HR-enrichment value |
| Twitter/Reddit/Facebook/Instagram authed scraping | Declined | ToS + login-state credential handling incompatible with server-side workers |
| LinkedIn detail enrichment | Declined | Credentialed automation; public-page reads already covered via Jina tier |

## Mega-list batch 2 (2026-09-14): portals, vendors, OSINT, infra
Probed live; only verified-clean items were built.

### Integrated
| Item | Proof |
|---|---|
| Telegram operator digest (`utils/ops_digest.py`, scheduler hook) | Key-gated, operator-only, mocked tests. Daily aggregates, zero PII |

### Already present (no duplicate work)
Naukri–Wellfound portals, Greenhouse→Breezy ATS, Hunter/Apollo/Skrapp/Lusha/
RocketReach/ContactOut/Snov/Clearbit/PDL/Prospeo/Findymail waterfall, Holehe/
Maigret/Sherlock/crt.sh/Wayback/GitHub/Gravatar OSINT, MX+SMTP validation,
E.164 validation, pattern inference, SERP dorking, proxy/CAPTCHA plumbing,
n8n workflows, Postgres+Redis, Scrapy+Playwright+Selenium+Crawl4AI deps,
fake-useragent, career-page extraction, RSS tier (this session).

### Declined — dead/unverifiable
FresherHub (520), FresHire (conn failed), CampusConnect URL (404),
JoinSaarthi (marketing page only; real API robots-disallowed),
Jobrix (114-byte JS shell, no data surface), HackerRank jobs (307 chain).

### Declined — terms/access
UPSC/SSC/bank/railway portals (no HR-contact surface — wrong audience for
this product), AmbitionBox review scraping, resume databases, Common Crawl
crawling (Wayback tier covers archives), GitHub org-member scraping beyond
commit emails (rate-limit economics), OpenCorporates/Keybase/Epieos/HIBP
(no join key without credentials — re-evaluate with a key in hand),
DeHashed/IntelX/Phonebook.cz (**breach-data marketplaces — never**),
Sales Navigator exports, Chrome-extension scrapers.

### Declined — duplicates/restatements of in-repo capability
JobSpy (duplicates 3 scrapers + LinkedIn ToS), linkedin_scraper/Linkedin-Jobs-
Api/naukri-scraper-Apify (credentialed or duplicative), new vendor adapters
without keys (Wiza, Evaboot, GetProspect, Voila Norbert, SalesQL, Icypeas,
LeadMagic, Clay, Enrich.so, Kaspr, Surfe, FullContact — extension point
exists in `email_providers.py`; adapters land with a key + live test),
pandas/Polars/DuckDB batch (cleaning runs dependency-free),
MongoDB/SQLite (Postgres is the store), Make/Zapier (n8n present),
Browserless/Browserbase/ScrapingBee/Apify Actors (no credentials),
residential/mobile proxies + stealth browsers + CAPTCHA-evasion beyond
existing plumbing (evasion policy stands), MongoDB-style document store.

## Full-arsenal batch 3 (2026-09-14): 150-item list triage

### Integrated
| Item | Proof |
|---|---|
| AmbitionBox Jobs (`scrapers/ambitionbox.py`, defaults) | `/jobs` 200, server-rendered `__NEXT_DATA__` with minExp/maxExp; robots-clean; capped at page 1 (filtered URLs hit a verification wall — never fought) |

### Already present (selected confirmations)
Fuzzy Levenshtein dedup, hand-rolled email-format + MX + SMTP validation,
E.164 validation, proxy/CAPTCHA config plumbing, Celery/RQ-equivalent Redis
queues, rate limiters/backoff/circuit breakers, Docker+cron+n8n automation.

### Declined — unverifiable pattern
iCIMS (portal slugs guessed → 404/"gone"; no confirmed customer board —
re-evaluate with one), OLX Jobs (connection failed from here).

### Declined — duplicates/restatements
rapidfuzz/fuzzywuzzy (hand-rolled Levenshtein is tuned + tested; C speed
irrelevant at this volume), email-validator lib (covered by format+MX+Reacher
chain), phonenumbers (stdlib rule covers), nameparser/cleanco (existing
tokenizer + suffix rules suffice), dedupe/recordlinkage/Splink (trigger:
100k+ leads or measured dedup failure), theHarvester/Recon-ng/SpiderFoot/
Maltego/WhatsMyName/Social-Analyzer/philINT/user-email-enrichment/EmailOSINT
(operator tools or marginal micro-tools — no pipeline join key),
MailAccess, Scout-Apify (token-gated), Google Jobs (aggregator; discovery
already runs via SERP dorks), YourStory/Inc42 (news, not job boards),
Sales Navigator exports, Chrome extensions (can't run in workers),
Common Crawl crawls, resume/alumni trawling.

## Iceberg batch 4 (2026-09-14): 90+ hidden sources triage

### Integrated
| Item | Proof |
|---|---|
| Off-campus drive aggregators (`scrapers/offcampus_aggregators.py`, defaults) | ONE sitemap-driven flow covers freshershunt.in + offcampusjobs4u.com (live: Goldman Sachs, Siemens EDA, Accenture, Volvo 2026 drives). Terms-driven design: freshershunt disallows `/feed/`, so sitemap + article URLs only. 48h window, 15 posts/site, taxonomy URLs excluded, entities decoded |

### Already present
Classicjobs scraper, Telegram/WhatsApp/Reddit/Facebook scrapers (extend
channel rosters there, not new modules), Greenhouse/Lever/Ashby boards,
SERP-discovered career pages, AmbitionBox (batch 3), RSS career feeds,
batch-year + walk-in + city filters, Google-indexed profiles.

### Evaluated, cut with evidence
job4freshers.co.in (dormant — newest posts July 2026), jobbinge.in (hollow
sitemaps — 0 post URLs across 4 sampled sitemaps), FresHire/FresherHub
(dead origins), CampusConnect URL (404), Jobrix (114-byte JS shell),
HackerRank jobs (307 deflection chain), HiringHopes (JS shell, zero links),
JoinSaarthi (marketing page; real API robots-disallowed), NCS (auth-walled
APIs — fake gov accounts out of bounds), UPSC/SSC/bank/railway (no HR
surface), TPO private lists / alumni groups / referral forms / founder
DM-slides (private access — no legitimate automation path),
VC/funding-spike tracking (no job data; Inc42/YourStory are news).

### Pending probes (no verdict yet)
Weekday.works, Hirect, Instahire, HasGeek/Hasjob, Product Folks,
StartupJobs Asia, F6S, Expertia AI, company direct portals (TCS NQT,
InfyTQ, TechBee, Amazon.jobs API, Razorpay/Flipkart/Swiggy ATS detection),
OLX Jobs, iCIMS (no confirmable portal), Telegram handle roster refresh,
fresher-specific X search (auth-walled — expected decline).

## Iceberg batch 5 (2026-09-14): 90+ hidden sources triage

### Integrated
| Item | Proof |
|---|---|
| Hasjob tech board (`scrapers/hasjob.py`, defaults) | `/feed` 200 Atom with per-entry location; robots-clean; company from entry path |
| Amazon Jobs India (`scrapers/amazon_jobs.py`, defaults) | `search.json` 200, 2333 India hits; intern/fresher/graduate queries; site-code locations kept |
| Telegram roster refresh | 8 exact iceberg handles added to `FRESHER_CHANNELS` (guessed handles excluded) |

### Already present (confirmed in code)
r/developersIndia + r/Indian_Jobs + r/cscareerquestionsIN-class subs
(`reddit_jobs.FRESHER_SUBREDDITS`), Facebook city/skill groups (opt-in via
`FACEBOOK_GROUPS` env — operator config, no build), CRED on Lever (shared
corpus already sweeps it), WhatsApp/Telegram listeners, RSS career feeds,
batch-year + walk-in + city filters, Google-indexed career discovery.

### Evaluated, cut with evidence
Weekday.works (senior-skewed referral wall), Hirect/ProductFolks/
StartupJobs.asia/FresherHub/FresHire (dead origins), Expertia.ai (vendor
page, not a board), F6S (405), HackerRank jobs (bot deflection),
JoinSaarthi (marketing page), exam platforms NQT/InfyTQ/NLTH/TechBee
(registration-walled assessments — no legitimate unattended access),
enterprise custom portals (Accenture/Cognizant/IBM/Deloitte/Siemens —
JS-walled, non-ATS; deferred with NCS), Razorpay/Flipkart/Swiggy/PhonePe
(not on Lever/Greenhouse/Ashby; custom portals — flywheel watches them),
X advanced search (auth-walled), TPO private lists / alumni groups /
referral forms / founder DMs (private access — no automation path),
VC/funding tracking (no job data), Telugu-only channels (English pipeline).
