# HireGen — Frontend Audit

## 1. Routing and access

`packages/web/src/App.tsx` selects one of three route tables after `useAuthStore().init()`:

- Unauthenticated → public `Landing` preview at `/` and `/welcome`; `/login` and `/register` remain direct links; unknown paths show the preview.
- Authenticated `candidate` or `admin` → shared `Layout` shell with candidate/admin routes.
- Other legacy roles (`sales_rep`, `viewer`) → legacy CRM routes.

Admin-only pages are route-guarded on the client **and** protected again on the server. Candidate-only pages redirect admins to `/dashboard`, and vice versa.

## 2. Pages

| Area | Pages |
|---|---|
| Auth | `Landing` (public, illustrative preview), `Login`, `Register` (restyled `AuthShell`, email/password, inline errors) |
| Candidate | `CandidateDashboard`, `Jobs`, `JobDetails`, `Recommendations`, `SavedJobs`, `Applications`, `Profile`, `ResumeStudio`, `CandidateContacts`, `Practice`, `PracticeSession`, `Learning`, `Credits`, `Placements`, `Preparation` |
| Admin | `AdminDashboard`, `AdminJobs`, `AdminFeedback`, `AdminPractice`, `AdminCredits`, `AdminPlacements`, legacy `Dashboard`, `Leads`, `LeadDetail`, `Companies`, `Contacts`, `Duplicates`, `Analytics`, `Settings` |

## 3. Shell and navigation

- `Layout.tsx` — responsive sidebar rail (collapsible, persisted), header, mobile drawer, command palette, onboarding tour, outlet.
- `Sidebar.tsx` — role-aware nav sections: Career space, Practice space, Platform/Insights. `data-tour` anchors for tour.
- `Header.tsx` — breadcrumb/title, search palette trigger, theme toggle, avatar menu with replay tutorial, sign out.
- `CommandPalette.tsx` — role-aware route jump list, `⌘K`/`Ctrl+K`.
- `OnboardingTour.tsx` — spotlight overlay, 8 candidate / 5 admin steps, keyboard support, localStorage completion flag, replay via `hiregen:replay-tour`.

## 4. Design system

Documented in `packages/web/DESIGN_SPEC.md` and implemented with semantic Tailwind tokens:

- Blue Atlas layout: mono eyebrows, tight display type, restrained rules.
- Blue primary buttons with white labels, white cards, navy ink, crisp borders, low elevation.
- Single `signal` blue accent; success/warning/danger/destructive soft variants.
- Light and dark themes through CSS variables (cool paper / navy); no gradients, glassmorphism, neon or emoji.
- Shared primitives under `components/ui`: button, input, textarea, select, badge, card, modal, toast, spinner, empty-state, stat-card, page-header, table, tabs, avatar, skeleton.

## 5. State and data

- react-query for server state; query invalidation after mutations.
- Zustand auth store persists tokens and user; axios interceptor refreshes on 401 and logs out on refresh failure.
- Voice interview uses browser SpeechSynthesis/SpeechRecognition through `components/interview/speech.ts`; animated SVG interviewer in `InterviewerAvatar.tsx`; text fallback everywhere.
- Onboarding completion is stored server-side in `onboarding_progress`; localStorage remains the offline fallback.

## 6. States and accessibility

Implemented: loading spinners/page loaders, empty states, error panels with retry, toasts, disabled/loading buttons, focus styles, aria labels, keyboard-operable modals/tour/palette. Forms use native validation plus server error display.

Gaps:

- No offline/connectivity banner or request retry UI beyond react-query defaults and per-page retry buttons.
- Theme preference handling exists in the header and on the public landing page; contrast verified on new surfaces in both themes.
- Voice recognition realistically works only in Chromium browsers; fallback copy is present but unsupported-browser UX could be more explicit.

## 7. Tests

- Tests in place: `Login.test.tsx`, `Duplicates.test.tsx`, `PracticeSmoke.test.tsx`, `Credits.test.tsx`, `Placements.test.tsx`, `Preparation.test.tsx`, `Landing.test.tsx`, `App.test.tsx`, plus API client auth-recovery and SSE hook tests.
- Login/Duplicates pinned copy still passes; new pages follow the same provider/router setup.
- Jest/jsdom lacks IntersectionObserver and speech APIs; landing motion uses entrance-only animation and voice code is guarded and default off in tests.

## 8. Frontend work required by the master brief

1. Candidate **Credits & plan** screen — done (`/credits`), including catalog, honest disabled checkout and ledger history.
2. Dashboard credit balance + next action — done.
3. Admin **Credits** screen — done (`/admin/credits`) with wallet search, ledger and audited adjustments.
4. Voluntary placement-outcome form and history — done (`/placements`, `/admin/placements`).
5. Server-persisted onboarding progress — done.
6. Reusable plan/credits types and API wrappers — done.
7. Public pre-login preview — done (`Landing.tsx`), with an explicitly labelled illustrative product preview, feature/workflow/plans/trust sections and theme toggle.

## 9. Public preview design notes

`packages/web/src/pages/Landing.tsx` is a premium editorial landing surface built only from semantic tokens. It is shown at `/` and `/welcome` when signed out, and at `/welcome` during an active session (also reachable from the avatar menu) so the preview can be inspected without signing out. It contains a hero with an explicitly labelled sample workspace mockup, four feature cards, a four-step workflow, a preparation artifact example, the four known plan prices (paid entitlements described as administrator-configured), a trust section and a closing call to action. No gradient, glassmorphism, emoji, fabricated company names, fake payment success or invented statistics are used. The mockup carries a visible "Sample" badge and a "not live listings or results" footnote.

`AuthShell.tsx` was restyled to the same flat ink/paper language, with a "Back to preview" link added to both sign-in and registration. All test-visible form copy and handlers are unchanged.

The layout and component patterns were cross-checked against the owner-supplied reference image in `Doccumentation/` (welcome banner, profile completion ring and checklist, compact stat row, recommended-job cards with match badges, application progress stepper, preparation-centre tiles, credits/plan cards, sidebar career tagline). The owner first asked for layout-only adoption, then explicitly approved switching the token palette. The design system is now the owner-approved **Blue Atlas** system: cool paper, navy ink, blue primary/signal, with the reference image's information architecture. The sidebar is deep navy in both themes, the header search is a wide input-like control, and a mobile bottom tab bar mirrors the reference phone layout. The welcome banner uses a flat inline SVG skyline motif; the image-generation service was unavailable, so no photograph was used. Gradients, glassmorphism, emoji and fabricated data remain banned.
