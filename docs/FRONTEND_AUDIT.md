# HireGen — Frontend Audit

## 1. Routing and access

`packages/web/src/App.tsx` selects one of three route tables after `useAuthStore().init()`:

- Unauthenticated → `/login`, `/register`, everything else → login.
- Authenticated `candidate` or `admin` → shared `Layout` shell with candidate/admin routes.
- Other legacy roles (`sales_rep`, `viewer`) → legacy CRM routes.

Admin-only pages are route-guarded on the client **and** protected again on the server. Candidate-only pages redirect admins to `/dashboard`, and vice versa.

## 2. Pages

| Area | Pages |
|---|---|
| Auth | `Login`, `Register` (AuthShell, email/password, inline errors) |
| Candidate | `CandidateDashboard`, `Jobs`, `JobDetails`, `Recommendations`, `SavedJobs`, `Applications`, `Profile`, `ResumeStudio`, `CandidateContacts`, `Practice`, `PracticeSession`, `Learning` |
| Admin | `AdminDashboard`, `AdminJobs`, `AdminFeedback`, `AdminPractice`, legacy `Dashboard`, `Leads`, `LeadDetail`, `Companies`, `Contacts`, `Duplicates`, `Analytics`, `Settings` |

## 3. Shell and navigation

- `Layout.tsx` — responsive sidebar rail (collapsible, persisted), header, mobile drawer, command palette, onboarding tour, outlet.
- `Sidebar.tsx` — role-aware nav sections: Career space, Practice space, Platform/Insights. `data-tour` anchors for tour.
- `Header.tsx` — breadcrumb/title, search palette trigger, theme toggle, avatar menu with replay tutorial, sign out.
- `CommandPalette.tsx` — role-aware route jump list, `⌘K`/`Ctrl+K`.
- `OnboardingTour.tsx` — spotlight overlay, 8 candidate / 5 admin steps, keyboard support, localStorage completion flag, replay via `hiregen:replay-tour`.

## 4. Design system

Documented in `packages/web/DESIGN_SPEC.md` and implemented with semantic Tailwind tokens:

- Editorial instrument-panel layout: mono eyebrows, tight display type, restrained rules.
- Ink/paper buttons, square-ish corners, crisp borders, low elevation.
- Single `signal` ember accent; success/warning/danger/destructive soft variants.
- Light and dark themes through CSS variables; no gradients, glassmorphism, neon or emoji.
- Shared primitives under `components/ui`: button, input, textarea, select, badge, card, modal, toast, spinner, empty-state, stat-card, page-header, table, tabs, avatar, skeleton.

## 5. State and data

- react-query for server state; query invalidation after mutations.
- Zustand auth store persists tokens and user; axios interceptor refreshes on 401 and logs out on refresh failure.
- Voice interview uses browser SpeechSynthesis/SpeechRecognition through `components/interview/speech.ts`; animated SVG interviewer in `InterviewerAvatar.tsx`; text fallback everywhere.
- Onboarding completion is localStorage-only.

## 6. States and accessibility

Implemented: loading spinners/page loaders, empty states, error panels with retry, toasts, disabled/loading buttons, focus styles, aria labels, keyboard-operable modals/tour/palette. Forms use native validation plus server error display.

Gaps:

- No offline/connectivity banner or request retry UI beyond react-query defaults.
- No server-persisted onboarding progress (localStorage only).
- Theme preference handling exists in the header; verify contrast on every new surface.
- Voice recognition realistically works only in Chromium browsers; fallback copy is present but unsupported-browser UX could be more explicit.
- No candidate credits/plan page, ledger history, or purchase status surface.
- No placement-outcome form.

## 7. Tests

- `Login.test.tsx` and `Duplicates.test.tsx` pin copy/behavior and must keep passing.
- `PracticeSmoke.test.tsx` covers Practice, PracticeSession and Learning across loading/empty/profile-null/all-answered states.
- Jest/jsdom lacks speech APIs; new voice code must be guarded and default off in tests.
- No dedicated tests yet for credits, plan catalog, ledger rendering, feedback, or placement.

## 8. Frontend work required by the master brief

1. Candidate **Credits & plan** screen: current plan, balance, transaction history, catalog with ₹0/₹199/₹499/₹799, purchase disabled/reason when payment is not configured.
2. Dashboard credit balance + understandable next action.
3. Admin **Credits** screen: search wallets, view ledger, adjust/refund with confirmation, audit trail visibility.
4. Voluntary placement-outcome form (probably under Applications) and history.
5. Server-persisted onboarding progress (optional follow-up).
6. Reusable plan/credits types in `lib/types.ts` and wrappers in `lib/api.ts`.
