# HIREGEN — Major Project Presentation

**Deck:** 15 slides · 16:9 widescreen · editable PowerPoint shapes, diagrams and chart · Times New Roman
**Branding:** Presenter-supplied HIREGEN logo on the cover, logo symbol in slide footers and a solid blue–purple palette. Slide text stays black/gray; no new gradients were added.
**Evidence snapshot:** repository commit `0c79bc7`, checked 21 October 2026.
**Status convention:** Implemented, Partially implemented, Proposed / in progress, Future scope.
**Evidence rule:** repository code/docs take precedence over blueprint intent. The supplied architecture infographic informed visual direction only; it is not project evidence. The current code contains a dense 9–14–8–1 ranker, not a CNN. CNN + Transformer text matching is clearly marked as a future experiment. No personal academic details, user-study results, model metrics or product outcomes were invented.

## Slide 1: HIREGEN

**Status:** FROM SEARCH TO A CLEARER NEXT STEP

**Visual:** Illustrated cover with the fresher-first journey: find, understand, prepare and follow up.

**Slide content:**
- From scattered job searches to a clearer first step.
- A fresher-first job intelligence and application preparation platform.
- Find a role → understand the fit → prepare a truthful draft → track what happens next.
- The candidate stays in control of every application.

**Speaker notes:**
Open with the everyday problem: starting a career means moving between job posts, resumes and follow-up notes. HIREGEN is designed to connect those steps in one candidate-guided flow. This deck separates what is in the repository from what is a proposed next step. Bridge: first, let us see why those steps feel fragmented.

**Sources:**
- [S1] HIREGEN GitHub repository — https://github.com/Deepak3699/Major-Project
- [S2] README and local setup — https://github.com/Deepak3699/Major-Project/blob/main/README.md
- [B1] AI Job Automation Platform Blueprint (local PDF) — C:/Users/singh/Downloads/AI_Job_Automation_Platform_Project_Blueprint.pdf

## Slide 2: The fresher job hunt is split across too many steps

**Status:** 01 · THE PROBLEM

**Visual:** Four illustrated moments—search, compare, tailor and track—connected as one broken journey.

**Slide content:**
- Find a promising role across different sources.
- Work out what the description really asks for.
- Translate the same skills into another application.
- Remember where you applied—and whether anyone replied.
- The hard part is carrying context from one step to the next.

**Speaker notes:**
Walk left to right through a familiar first-job search. Do not present this as a user-study result; it is the workflow problem the project sets out to address. Each step needs information from the previous one, but the candidate often has to carry it manually. Bridge: HIREGEN starts by joining those steps while keeping the candidate in charge.

**Sources:**
- [S2] README and local setup — https://github.com/Deepak3699/Major-Project/blob/main/README.md
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [B1] AI Job Automation Platform Blueprint (local PDF) — C:/Users/singh/Downloads/AI_Job_Automation_Platform_Project_Blueprint.pdf

## Slide 3: A connected workflow can replace repeated busywork

**Status:** 02 · WHY A NEW APPROACH

**Visual:** Readable comparison table plus a connected sequence showing what HIREGEN adds and what remains candidate-controlled.

**Slide content:**
- Traditional routine: search each source, compare requirements in your head, rework a general resume and keep a separate status note.
- HIREGEN: browse permitted listings, see explainable fit signals, prepare a reviewable draft and keep application activity together.
- The candidate still chooses whether to apply and submits on the employer’s site.
- Current implementation is partial in places; the next slides show the evidence and boundaries.

**Speaker notes:**
Use the table as a before-and-after workflow, not as a comparison against a named competitor. HIREGEN is meant to reduce repeated context switching. It does not submit applications automatically. Bridge: that idea becomes a five-step candidate journey.

**Sources:**
- [S2] README and local setup — https://github.com/Deepak3699/Major-Project/blob/main/README.md
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S5] Matching and trust scoring — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/job-intelligence.ts
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py

## Slide 4: One guided journey: find, understand, prepare and follow up

**Status:** 03 · THE HIREGEN IDEA

**Visual:** Five connected candidate steps with a parallel admin trust-review lane and a candidate-control checkpoint.

**Slide content:**
- Start with a profile the candidate has reviewed.
- Browse active, published listings that pass the trust gate.
- See the fit dimensions and the reasons behind a recommendation.
- Shape a role-specific draft using confirmed facts, then review it.
- Apply on the employer site and track the response in one place.

**Speaker notes:**
Keep the main path candidate-centred: confirm, discover, understand, prepare and track. The admin lane supports source and listing review; it does not replace candidate choice. The matching threshold is a ranking/display rule, not a hiring probability. Bridge: next, see the services that make this path possible.

**Sources:**
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S5] Matching and trust scoring — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/job-intelligence.ts
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py
- [S11] Auto-publish rule migration — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/database/migrations/009_auto_publish_qualified_jobs.ts

## Slide 5: How the platform is put together

**Status:** 04 · SYSTEM DESIGN

**Visual:** Editable vector architecture linking candidate/admin screens, API, matching, Python workers, Redis and PostgreSQL; Gemini is shown as optional draft support.

**Slide content:**
- Candidate and admin screens send authenticated workflow requests to the Fastify API.
- The API connects profiles and jobs to the weighted scorer and the persisted dense ranker.
- Python workers handle permitted job collection and readable resume-text extraction; Redis supports queued work.
- PostgreSQL stores profiles, jobs, recommendation records, applications and events.
- Gemini is an optional writing aid for drafts only; it is not the recommendation engine.

**Speaker notes:**
Trace the architecture from the two user roles through the web app and API. Point out that the recommendation ranker is code-backed, while Gemini is an optional draft-writing path. The default source list is restricted, and wider source access needs explicit review. Bridge: the next slide maps each technology to the job it performs.

**Sources:**
- [S2] README and local setup — https://github.com/Deepak3699/Major-Project/blob/main/README.md
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S6] Ranker model notes and artifact — https://github.com/Deepak3699/Major-Project/tree/main/packages/api/src/models/recommender
- [S7] Recommendation model implementation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/recommendation-model.ts
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py
- [S10] Scraper source access controls — https://github.com/Deepak3699/Major-Project/tree/main/packages/scrapers/scrapers
- [S15] Docker Compose services — https://github.com/Deepak3699/Major-Project/blob/main/docker-compose.yml

## Slide 6: Each technology has a clear job in the workflow

**Status:** 05 · IMPLEMENTATION STACK

**Visual:** Compact technology map with four colored layers and a small vector stack illustration.

**Slide content:**
- Web: React, TypeScript and Vite power candidate and admin screens.
- API: Node.js and Fastify handle authenticated workflow routes and validation.
- Workers and data: Python processes allowed feeds and resume text; Redis queues work; PostgreSQL keeps platform records.
- Matching: a transparent fit scorer is blended with a custom TypeScript dense ranker.
- n8n and Reacher are configured in Compose; configuration alone does not prove an end-to-end integration.

**Speaker notes:**
Explain technology through responsibility rather than listing package names without context. The selected stack separates the web experience, workflow API, data workers and persisted ranking model. The repository also configures additional services, but their presence in Compose is not proof that every workflow uses them. Bridge: these components exchange specific records; the next two diagrams follow those records.

**Sources:**
- [S2] README and local setup — https://github.com/Deepak3699/Major-Project/blob/main/README.md
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S7] Recommendation model implementation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/recommendation-model.ts
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py
- [S15] Docker Compose services — https://github.com/Deepak3699/Major-Project/blob/main/docker-compose.yml
- [T1] React documentation — https://react.dev/
- [T2] Vite guide — https://vite.dev/guide/
- [T3] Fastify documentation — https://fastify.dev/docs/latest/
- [T4] PostgreSQL documentation — https://www.postgresql.org/docs/current/
- [T5] Redis documentation — https://redis.io/docs/latest/
- [T6] Python documentation — https://docs.python.org/3/

## Slide 7: Phase 1 · Build a trusted job supply

**Status:** PYTHON WORKERS · TRUST + RELEASE GATES

**Visual:** Editable source-to-database flow with normalization, trust evidence, deduplication, automatic publication and admin review.

**Slide content:**
- Approved company career pages, ATS endpoints and public feeds are collected by the Python scraper fleet; source access stays allowlisted.
- Scheduled or manual runs enter Redis queues; Scrapy/HTTPX fetchers are used by default, with browser automation only where a source permits it.
- Workers clean and normalize job fields, preserve source evidence and deduplicate repeated listings before they become candidate-facing.
- A listing quality/trust score above 70 can auto-publish; lower or uncertain records remain in the admin review path.
- PostgreSQL stores jobs, company records, source snapshots and trust evidence. Public HR details are optional and appear only when a source exposes usable contact information.

**Speaker notes:**
Tell the story from job supply to a candidate-ready listing. The current code has a restricted source allowlist, a Python scheduler and Redis workers. The pipeline normalizes records and computes evidence-based trust. The auto-publish migration releases records strictly above 70; other records need review, and candidate search still requires an active, published listing above the trust threshold. HR information is not guaranteed: only publicly exposed details with provenance can be attached. Bridge: trusted jobs are only one side of the match; next, the candidate brings a profile the system can safely use.

**Sources:**
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py
- [S10] Scraper source access controls — https://github.com/Deepak3699/Major-Project/tree/main/packages/scrapers/scrapers
- [S11] Auto-publish rule migration — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/database/migrations/009_auto_publish_qualified_jobs.ts
- [S15] Docker Compose services — https://github.com/Deepak3699/Major-Project/blob/main/docker-compose.yml
- [S18] Current implementation boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md

## Slide 8: Phase 2 · Turn a resume into confirmed profile facts

**Status:** CANDIDATE REVIEW · PROFILE SAVED TO POSTGRESQL

**Visual:** Editable candidate path from registration and resume upload through extraction, human confirmation and profile storage.

**Slide content:**
- A candidate registers, signs in and can build a profile manually or upload a PDF, DOCX or TXT resume.
- The Python worker extracts readable text and returns suggested fields such as skills, education, experience, projects and contact details.
- The candidate edits and confirms those suggestions; extracted text is not silently treated as verified truth.
- Confirmed profile fields and resume metadata are stored in PostgreSQL. The uploaded original is processed in memory rather than retained.
- The confirmed profile becomes the input for that candidate’s personalized job search and recommendations.

**Speaker notes:**
Emphasize that extraction is a starting point, not a source of unquestioned truth. The candidate can enter data manually, upload PDF/DOCX/TXT, review the parser suggestions and confirm the fields. Current documentation says the original upload is handled in memory and not stored. The profile is scoped to the signed-in candidate. Bridge: only after those facts are confirmed does HIREGEN score a job against the person.

**Sources:**
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py
- [S18] Current implementation boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md

## Slide 9: Phase 3 · Rank trusted jobs for each candidate

**Status:** CURRENT DNN · MATCH SCORE ≥70/100

**Visual:** Editable personalization path from confirmed profile and trusted jobs through eight fit dimensions, a 9–14–8–1 ranker, blended score and per-user result filter.

**Slide content:**
- The API compares each confirmed profile with active, published listings whose separate job-trust score is above 70.
- Eight explainable dimensions score skills, experience, education, location, role fit, projects, salary and preferences; listing quality supplies the ninth model input.
- The current dense network is 9→14→8→1. Its output is blended with the transparent fit score: 60% neural score + 40% structured fit.
- The candidate feed keeps match scores of at least 70/100, returns up to 50 ranked jobs and stores reasons, matched skills and gaps.
- That 70/100 is a match-score display cutoff—not model accuracy and not a 70% chance of being hired. CNN/Transformer text matching remains a proposed experiment, not the current ranker.

**Speaker notes:**
Walk through profile and published-job inputs, the eight fit dimensions plus listing quality, the dense network and the 60/40 blend. There are two different gates: the job itself must be active, published and trusted; then its candidate-specific match score must meet the 70/100 display cutoff. Neither number is a hiring probability or model-accuracy result. The saved bootstrap ranker uses weak labels and has no held-out outcome evaluation. The supplied CNN/Transformer style is a future experiment to compare with this baseline. Bridge: once a ranking is available, automation can remove repeat work while keeping personal decisions with the candidate.

**Sources:**
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S5] Matching and trust scoring — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/job-intelligence.ts
- [S6] Ranker model notes and artifact — https://github.com/Deepak3699/Major-Project/tree/main/packages/api/src/models/recommender
- [S7] Recommendation model implementation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/recommendation-model.ts
- [S8] Model training entry point — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/scripts/trainRecommendationModel.ts

## Slide 10: Phase 4 · Automate repeat work; keep candidate decisions manual

**Status:** MIXED FLOW · ON-DEMAND GEMINI DRAFTS

**Visual:** Two editable lanes separate scheduled worker tasks from user-controlled preparation, resume design, external application and tracking.

**Slide content:**
- Python scheduling, Redis queues, scraper workers, normalization, trust checks and repeatable publication rules automate the routine data pipeline.
- n8n is present as a Docker Compose service; a complete n8n workflow is not tracked in the repository. The current scheduled path is the Python worker scheduler and Redis queues.
- The candidate confirms profile facts, saves a job and explicitly clicks Prepare before an optional Gemini 2.5 Flash request; a truthful local draft is used when Gemini is not configured.
- The candidate can choose Classic, Modern or Compact resume layout, review/edit the resume and email draft, and save the resume as PDF.
- The final Apply action opens the employer’s page. The candidate submits and records application stages/replies; there is no automatic application submission.

**Speaker notes:**
Use the split lanes to distinguish machine work from human choices. Schedulers and queues handle repeatable ingestion and worker tasks. The n8n container is configured, but no workflow definition is tracked here, so do not present n8n as a proven end-to-end orchestrator. Gemini is optional and called for an explicitly requested job-preparation draft, not once for every listing. Review is essential for accuracy, consent and API-cost control. Resume Studio exposes Classic, Modern and Compact layouts with print-to-PDF. The user chooses whether and when to apply on the employer’s site; saved jobs and application-stage history remain in HIREGEN. Bridge: this is the complete platform flow in one architecture view.

**Sources:**
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S15] Docker Compose services — https://github.com/Deepak3699/Major-Project/blob/main/docker-compose.yml
- [S16] Optional Gemini application preparation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/application-prep.ts
- [S17] Resume Studio templates and PDF export — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/pages/ResumeStudio.tsx
- [S18] Current implementation boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md

## Slide 11: HIREGEN · End-to-end working architecture

**Status:** EDITABLE OVERVIEW · CURRENT + PROPOSED BOUNDARIES

**Visual:** Original editable architecture rebuilt from the supplied infographic: job ingestion and candidate onboarding converge on the current PostgreSQL-backed ranker, then optional preparation and user-controlled application.

**Slide content:**
- Job path: permitted sources → Python scrapers and scheduler → parse/normalize → trust and deduplicate → PostgreSQL → automatic release above the quality threshold or admin review.
- Candidate path: React/Vite workspace → Fastify API → Python resume parser → candidate edits and confirms → PostgreSQL profile.
- Match path: confirmed profile + trusted published jobs → eight-dimension scorer → dense 9–14–8–1 ranker → 60/40 blend → 70/100 match filter → saved recommendation and reasons.
- Preparation path: explicit user request → optional Gemini 2.5 Flash or local fallback → editable resume/email draft → Classic, Modern or Compact PDF layout.
- Operations and limits: Python scheduler + Redis queues are code-backed; n8n is configured but its orchestration workflow is not in the repository. Apply remains an employer-site action.

**Speaker notes:**
Read the diagram from the two data sources into PostgreSQL and then down through the personalized match path. The boxes and arrows are native editable PowerPoint shapes; the supplied infographic was used only as visual direction. The repo uses React/Vite rather than Next.js and PostgreSQL without a wired pgvector retrieval path. The current model is the dense 9–14–8–1 ranker. The CNN/Transformer branch remains proposed. The n8n Compose service is present, but a tracked end-to-end workflow is not. Close the architecture by tracing Gemini only from the candidate’s Prepare action and the final application action back to the employer website. Bridge: now zoom into the current ranker, then compare it with the proposed text-model experiment.

**Sources:**
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S5] Matching and trust scoring — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/job-intelligence.ts
- [S7] Recommendation model implementation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/recommendation-model.ts
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py
- [S10] Scraper source access controls — https://github.com/Deepak3699/Major-Project/tree/main/packages/scrapers/scrapers
- [S11] Auto-publish rule migration — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/database/migrations/009_auto_publish_qualified_jobs.ts
- [S15] Docker Compose services — https://github.com/Deepak3699/Major-Project/blob/main/docker-compose.yml
- [S16] Optional Gemini application preparation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/application-prep.ts
- [S17] Resume Studio templates and PDF export — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/pages/ResumeStudio.tsx
- [S18] Current implementation boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md

## Slide 12: The current recommendation model, layer by layer

**Status:** 06 · IMPLEMENTED DENSE RANKER · NOT A CNN

**Visual:** Editable neural-network illustration showing the actual 9→14→8→1 dense model beside the configured structured-fit weights and evaluation boundary.

**Slide content:**
- The repository implements a dense neural ranker with 9 normalized inputs, hidden layers of 14 and 8 units, and one ranking-score output.
- Inputs represent eight fit dimensions plus job-listing quality; the API blends 60% neural score with 40% structured fit.
- Configured fit weights emphasize skills (30%), experience (20%) and role fit (15%).
- The saved bootstrap artifact was trained from 2,400 synthetic weak-label examples; no held-out accuracy or hiring-probability result is reported.
- The supplied CNN-style diagrams guide the visual treatment only: a CNN is not present in the current project code.

**Speaker notes:**
This is the current implementation, not a proposed network. The source code uses fully connected dense layers, so do not call it a CNN. The 9 inputs contain eight structured match dimensions and job listing quality. The final score blends the network output with the transparent structured score. The threshold and score are ranking signals—not the probability of an employer hiring someone. The project artifact has synthetic weak labels and has not been evaluated on held-out applicant outcomes. Bridge: with the current baseline clear, the next slide shows a possible CNN text-matching experiment as future work.

**Sources:**
- [S5] Matching and trust scoring — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/job-intelligence.ts
- [S6] Ranker model notes and artifact — https://github.com/Deepak3699/Major-Project/tree/main/packages/api/src/models/recommender
- [S7] Recommendation model implementation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/recommendation-model.ts
- [S8] Model training entry point — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/scripts/trainRecommendationModel.ts

## Slide 13: A proposed CNN + Transformer can compare resume and job text

**Status:** PROPOSED · NOT IN CURRENT CODE

**Visual:** Two editable text towers for resume and job description feed embedding, Conv1D, pooling, vector fusion with structured fit signals, a scoring head and baseline evaluation; current input gates are shown above.

**Slide content:**
- The current application path supplies a permitted, reviewed job record and a candidate-confirmed profile.
- A future experiment could tokenize both texts, pass them through shared embeddings and Conv1D filters, then use Transformer self-attention to model context.
- Pooling produces resume and job vectors; a scoring head can combine those vectors with transparent fit signals.
- Evaluate against the implemented dense 9–14–8–1 ranker using consent-aware, held-out outcomes before claiming better quality.
- This architecture is a research proposal. The repository currently uses a dense network and has no measured held-out ranking accuracy.

**Speaker notes:**
This is a proposed CNN + Transformer experiment, not an implementation claim. Explain the two text towers: resume tokens and job tokens use shared embeddings and Conv1D filters to capture local phrases; self-attention then relates context within each sequence before pooling. The pooled vectors can be compared and joined with transparent fit signals. The existing product uses a dense 9–14–8–1 ranker with weak bootstrap labels. Compare both approaches on held-out, consent-aware outcomes before stating that one performs better.

**Sources:**
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S6] Ranker model notes and artifact — https://github.com/Deepak3699/Major-Project/tree/main/packages/api/src/models/recommender
- [S7] Recommendation model implementation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/recommendation-model.ts
- [S8] Model training entry point — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/scripts/trainRecommendationModel.ts
- [S18] Current implementation boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md

## Slide 14: What a candidate and admin do in the platform

**Status:** 08 · PRACTICAL WALKTHROUGH

**Visual:** Illustrated candidate journey, vector UI cards and a compact admin support lane; clearly marked as an explanatory map, not a product screenshot.

**Slide content:**
- Candidate: confirm profile details, explore recommendations, save a role and prepare a draft for review.
- Candidate: apply on the employer site, then record application progress and any reply in the platform.
- Admin: review job quality, inspect source health, manage HR-contact evidence and monitor operational trends.
- The route map comes from frontend navigation; the local app and automated tests were not verified for this presentation.

**Speaker notes:**
Use this slide as a practical walkthrough, not a claim that a live demo was available during preparation. The candidate routes include discovery, saved jobs, applications, employer contacts and resume studio. The admin routes include job review, HR contacts and verification, duplicates and analytics. Keep the fictional-free explanation grounded in these code-backed areas; no candidate names or performance numbers are invented. Bridge: close by separating useful design goals from what still needs evidence.

**Sources:**
- [S12] Frontend sidebar and route labels — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/components/Sidebar.tsx
- [S13] Candidate dashboard and chart — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/pages/CandidateDashboard.tsx
- [S14] CI workflow — https://github.com/Deepak3699/Major-Project/blob/main/.github/workflows/ci.yml

## Slide 15: Useful today; stronger after real-world validation

**Status:** 09 · TAKEAWAY AND NEXT MILESTONE

**Visual:** A closing journey from current capability to validation: candidate value, known limits, and next evidence checkpoints, with compact source references.

**Slide content:**
- HIREGEN connects job discovery, explainable fit, candidate-reviewed preparation and application tracking in one fresher-first workflow.
- That is a product contribution—not a measured improvement in interview or placement outcomes.
- Current limits include uneven source coverage, resume-extraction review, synthetic-label model training and no held-out evaluation.
- Next: audit parsing quality, compare current and proposed rankers on consent-aware data, and improve source-health and accessibility checks.
- A clear next step is better evidence: show what works, where it fails and what should improve.

**Speaker notes:**
Close with the project’s practical value and its honest boundary. HIREGEN offers a joined workflow and a prototype ranker, but no user study, deployment metric, model accuracy or placement outcome is reported. The right next milestone is measured evaluation with consent-aware data and a clear baseline comparison. The companion notes include the implementation and technical references. Design images supplied with the request were used as visual references only; the diagrams are original, editable vector drawings. This deck’s source register keeps those design references separate from project evidence.

**Sources:**
- [S1] HIREGEN GitHub repository — https://github.com/Deepak3699/Major-Project
- [S2] README and local setup — https://github.com/Deepak3699/Major-Project/blob/main/README.md
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S5] Matching and trust scoring — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/job-intelligence.ts
- [S6] Ranker model notes and artifact — https://github.com/Deepak3699/Major-Project/tree/main/packages/api/src/models/recommender
- [S7] Recommendation model implementation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/recommendation-model.ts
- [S8] Model training entry point — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/scripts/trainRecommendationModel.ts
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py
- [S10] Scraper source access controls — https://github.com/Deepak3699/Major-Project/tree/main/packages/scrapers/scrapers
- [S11] Auto-publish rule migration — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/database/migrations/009_auto_publish_qualified_jobs.ts
- [S12] Frontend sidebar and route labels — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/components/Sidebar.tsx
- [S13] Candidate dashboard and chart — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/pages/CandidateDashboard.tsx
- [S14] CI workflow — https://github.com/Deepak3699/Major-Project/blob/main/.github/workflows/ci.yml
- [S15] Docker Compose services — https://github.com/Deepak3699/Major-Project/blob/main/docker-compose.yml
- [B1] AI Job Automation Platform Blueprint (local PDF) — C:/Users/singh/Downloads/AI_Job_Automation_Platform_Project_Blueprint.pdf
- [T1] React documentation — https://react.dev/
- [T2] Vite guide — https://vite.dev/guide/
- [T3] Fastify documentation — https://fastify.dev/docs/latest/
- [T4] PostgreSQL documentation — https://www.postgresql.org/docs/current/
- [T5] Redis documentation — https://redis.io/docs/latest/
- [T6] Python documentation — https://docs.python.org/3/
- [T7] Sentence Transformers semantic similarity — https://sbert.net/docs/sentence_transformer/usage/semantic_textual_similarity.html
- [T8] TypeSafe Jev official quick start — https://docs.typesafe.ai/introduction/quickstart

## Source register

### Repository evidence
- [S1] HIREGEN GitHub repository — https://github.com/Deepak3699/Major-Project
- [S2] README and local setup — https://github.com/Deepak3699/Major-Project/blob/main/README.md
- [S3] Implementation alignment and boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [S4] Candidate API routes — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/routes/candidate.ts
- [S5] Matching and trust scoring — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/job-intelligence.ts
- [S6] Ranker model notes and artifact — https://github.com/Deepak3699/Major-Project/tree/main/packages/api/src/models/recommender
- [S7] Recommendation model implementation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/recommendation-model.ts
- [S8] Model training entry point — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/scripts/trainRecommendationModel.ts
- [S9] Python worker and resume parser — https://github.com/Deepak3699/Major-Project/blob/main/packages/scrapers/main.py
- [S10] Scraper source access controls — https://github.com/Deepak3699/Major-Project/tree/main/packages/scrapers/scrapers
- [S11] Auto-publish rule migration — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/database/migrations/009_auto_publish_qualified_jobs.ts
- [S12] Frontend sidebar and route labels — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/components/Sidebar.tsx
- [S13] Candidate dashboard and chart — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/pages/CandidateDashboard.tsx
- [S14] CI workflow — https://github.com/Deepak3699/Major-Project/blob/main/.github/workflows/ci.yml
- [S15] Docker Compose services — https://github.com/Deepak3699/Major-Project/blob/main/docker-compose.yml
- [S16] Optional Gemini application preparation — https://github.com/Deepak3699/Major-Project/blob/main/packages/api/src/utils/application-prep.ts
- [S17] Resume Studio templates and PDF export — https://github.com/Deepak3699/Major-Project/blob/main/packages/web/src/pages/ResumeStudio.tsx
- [S18] Current implementation boundaries — https://github.com/Deepak3699/Major-Project/blob/main/docs/IMPLEMENTATION_ALIGNMENT.md
- [B1] AI Job Automation Platform Blueprint (local PDF) — C:/Users/singh/Downloads/AI_Job_Automation_Platform_Project_Blueprint.pdf

### Official technical references
- [T1] React documentation — https://react.dev/
- [T2] Vite guide — https://vite.dev/guide/
- [T3] Fastify documentation — https://fastify.dev/docs/latest/
- [T4] PostgreSQL documentation — https://www.postgresql.org/docs/current/
- [T5] Redis documentation — https://redis.io/docs/latest/
- [T6] Python documentation — https://docs.python.org/3/
- [T7] Sentence Transformers semantic similarity — https://sbert.net/docs/sentence_transformer/usage/semantic_textual_similarity.html
- [T8] TypeSafe Jev official quick start — https://docs.typesafe.ai/introduction/quickstart

### Presenter-supplied visual direction
- The HIREGEN logo was supplied by the presenter and is reproduced on the cover with its original brand artwork; the logo symbol is repeated in slide footers.
- The attached architecture infographic was treated as design reference. Its data flow was rebuilt using editable native PowerPoint shapes; the image itself is not presented as HIREGEN implementation evidence.

## Verification and limitations

- Local presentation finalizer: {"finalPath":"D:\\Major-Project\\presentation\\HIREGEN_Major_Project_Presentation.pptx","receiptPath":"D:\\Major-Project\\.presentation-build\\validation.json","schemaVersion":"presentation-finalization.v1","finalSha256":"3a985456195c179b5974d5df32af07656e2359b520accff848e25b0ace95e761","byteCount":3158716,"packageIntegrity":{"chart_count":1,"claim_boundary":"Structural package checks only; no slide text, notes, formulas, chart values, or native PowerPoint execution were inspected.","finding_count":0,"findings":[],"notes_parts_skipped":15,"relationship_part_count":41,"slide_count":15,"status":"pass","exitCode":0,"findingCount":0,"warnings":[]},"presentationLayout":{"finding_count":0,"findings":[],"font_policy":{"checked_text_script_count":541,"native_font_rendering_verified":false,"observed_font_families":["Times New Roman"],"observed_font_use_counts":{"Times New Roman":541},"passed":true,"performed":true},"slide_count":15,"slide_size_in":[13.3333,7.5],"warning_count":0,"warnings":[],"exitCode":0,"findingCount":0,"fontPolicy":{"checked_text_script_count":541,"native_font_rendering_verified":false,"observed_font_families":["Times New Roman"],"observed_font_use_counts":{"Times New Roman":541},"passed":true,"performed":true}},"fontSelection":{"basis":"user_request","approvedFamilies":["Times New Roman"],"scriptFonts":{},"referenceSha256":null,"referenceFontsVerifiedInEncodedText":false,"checked_text_script_count":541,"native_font_rendering_verified":false,"observed_font_families":["Times New Roman"],"observed_font_use_counts":{"Times New Roman":541},"passed":true,"performed":true},"firstPartyImport":{"performed":true,"passed":true,"slideCount":15,"sha256":"3a985456195c179b5974d5df32af07656e2359b520accff848e25b0ace95e761","nodeExecutable":"C:\\Users\\singh\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe"},"nativeTableArithmetic":{"performed":true,"checked_column_count":0,"checks":[],"claim_boundary":"Displayed-value arithmetic with rounding tolerance; not source-data verification.","eligible_table_count":0,"finding_count":0,"findings":[],"native_table_count":2,"passed":true,"schema_version":"presentation-native-table-arithmetic.v1","skipped_tables":[{"reason":"no_numeric_amounts","slide":3,"table":1},{"reason":"no_numeric_amounts","slide":6,"table":1}],"slide_count":15,"warning_count":0,"warnings":[]},"nativeChartTitles":{"performed":true,"checks":[{"chart":1,"slide":12,"status":"absent"}],"finding_count":0,"findings":[],"native_chart_count":1,"native_powerpoint_verified":false,"passed":true,"presentation_sha256":"3a985456195c179b5974d5df32af07656e2359b520accff848e25b0ace95e761","schema_version":"presentation-native-chart-titles.v1","slide_count":15,"source_text_emitted":false,"unresolved_linked_title_count":0},"sourceDerivedPolicyFlags":["--expected-slide-size-emu","12192000,6858000","--validate-bullet-geometry","--validate-heading-fit","--require-native-table-slide","3","--require-native-table-slide","6","--cover-role","none","--expected-slide-count","15","--approved-font-family","Times New Roman"],"nativeChartValidation":{"detectedOwnerSlides":[12],"detectedChartCount":1,"targetApplication":"portable","sourceChartOwnersExplicitlyDeclared":true,"validatorRan":true,"passed":true},"nativeQuantitativeCharts":{"report":{"claim_boundary":"OOXML/workbook structural validation only; source provenance and native PowerPoint opening remain separate checks.","expected_quantitative_chart_slides":[12],"failed_slide_count":0,"failed_slides":[],"formal_human_reviewed":false,"native_application_open_verified":false,"package_sha256":"3a985456195c179b5974d5df32af07656e2359b520accff848e25b0ace95e761","passed":true,"results":[{"approved_source_figure_exception":false,"charts":[{"cache_reference_ranges_verified":true,"embedded_workbook_count":1,"embedded_workbook_sheet_count":1,"native_chart_types":["barChart"],"numeric_cache_point_count":8,"series_formula_count":2,"workbook_numeric_cell_count":8}],"failure_codes":[],"native_chart_count":1,"raster_picture_count":1,"required_native_chart_count":1,"slide_number":12,"status":"passed"}],"schema_version":"owner-private.quantitative-chart-native-gate.v1","slide_count":15,"source_attachments_accessed":false,"validated_slide_count":1},"exitCode":0,"validatedSlideCount":1,"requiredOwnerSlides":[12],"approvedSourceFigureExceptionSlides":[]},"chartDataPackaging":{"conversion":"chart_data_snapshot","converted_chart_count":1,"converted_charts":[{"chart_part":"ppt/slides/charts/chart1.xml","owner_slide":12,"point_count":8,"series_count":1,"workbook_part":"ppt/embeddings/chart-data-snapshot-001.xlsx"}],"detected_chart_owner_slides":[12],"experimental":true,"input_sha256":"6a5e98f0591077b661714dbdb84513d66faeb536f6a10af04ebca4b14e28fc2a","new_formulas_describe_snapshot_only":true,"output_bytes":3158716,"output_sha256":"3a985456195c179b5974d5df32af07656e2359b520accff848e25b0ace95e761","portable_chart_validation_passed":true,"portable_validated_owner_slides":[12],"preserved_existing_workbook_chart_count":0,"preserved_existing_workbook_charts":[],"schema_version":"experimental.literal-chart-workbook-snapshot.v1","source_formula_required_slides":[],"source_formulas_preserved":false,"source_workbook_preserved":false,"source_workbook_required_slides":[]}}
- The local app was not verified during this deck pass; slide 14 is an editable illustrative route map, not a product screenshot.
- API and web `node_modules` folders were absent, so application tests and builds were not run. The CI workflow was read, but no hosted CI run was inspected.
- The deck was exported, imported back, and passed local PPTX package/layout checks. Individual slide PNG renders were produced for visual QA.