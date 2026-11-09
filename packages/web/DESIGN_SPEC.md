# Hiregen UI Design Spec — "Editorial Instrument Panel"

This is the binding design language for the full UI redesign. The foundation
(`src/index.css`, `tailwind.config.js`) and all `components/ui/*` primitives +
chrome (`Sidebar`, `Header`, `Layout`, `AuthShell`, `Logo`, `CommandPalette`,
`JobCard`) are ALREADY rewritten. Your job is to restyle pages to match.

## Golden rules (non-negotiable)

1. **Do not change behavior.** Handlers, hooks, API calls, routing, state,
   effects, props, types stay exactly as they are. You restyle JSX/className and
   may restructure layout/presentation JSX, but every element carrying data or
   wiring (buttons, links, inputs, toasts) keeps its behavior and accessible name.
2. **Keep test-visible copy.** `Login.test.tsx` requires: labels matching /email/i
   and /password/i, a button matching /sign in/i, and error text /invalid credentials/i.
   `Duplicates.test.tsx` requires: "No duplicate candidates found.", "Failed to load
   duplicates", "Retry", "Merge into this", "Merge these leads?", "Merge leads".
3. **Semantic tokens only.** Never `bg-white`, `text-black`, `text-gray-*`,
   `bg-gray-*`, or blue-based hexes. Use: `bg-surface`, `bg-background`,
   `text-foreground`, `text-muted-foreground`, `bg-muted`, `border-border`,
   `border-border-strong`, `bg-accent`, status tokens (`success`, `warning`,
   `info`, `destructive`, `signal` + their `-soft` forms, `hot/warm/cold`).
   Everything must look intentional in BOTH light and dark themes — verify your
   classes do not hardcode light values; `dark:` overrides are unnecessary because
   index.css tokens flip for you.
4. **Banned (AI-slop tells):** `rounded-2xl`/`rounded-3xl` on cards (use `rounded-lg`
   / `rounded-xl` max), gradients (`bg-gradient-*`, `bg-[image:var(--grad-*)]`,
   `.glass` classes), glow shadows (`shadow-glow*`, `shadow-card-hover`,
   `shadow-float` except on real popovers), emoji, `text-gradient`,
   `bg-primary/15` text-on-tinted active states, decorative blobs/rings,
   exclamation-mark marketing copy, "Powered by AI" style phrases.
5. **The one saturated accent is `signal` (ember).** Use it surgically: links on
   hover underline (`decoration-signal`), focus cues, a single primary metric or
   CTA emphasis, active filter ticks. Never large fills. Primary buttons are the
   ink/paper `Button` default variant.

## Vocabulary

- **Page scaffold:** mean order is (1) `PageHeader` (title + description + actions),
  (2) stat row (`StatCardGrid`/`StatCard`), (3) main content in `Card`s. Vertical
  rhythm `space-y-4`, cards internally `p-5`.
- **Section headings inside cards:** use `.eyebrow` (mono, uppercase, tracking)
  above the content — e.g. "Ingestion · last 24 h". Body text 13.5–14px,
  `leading-relaxed`, `text-muted-foreground` for secondary copy.
- **Instrument typography:** numbers/data get `font-mono tabular-nums`
  (`text-[11px]`–`text-[26px]` range). Table headers keep `.table-th`.
- **Chips/badges:** `<Badge>` (already restyled). Status pills: solid-soft bg +
  25% border, text = status color. IDs/dates/scores → mono.
- **Tables:** wrap in `Card` with no extra padding between table and card edge;
  row hover `hover:bg-accent/60`; sticky header optional; actions column right-aligned.
- **Forms:** `label` class + `Input`/`Select`/`Textarea`; group tight fields with
  `grid gap-3 sm:grid-cols-2`; helper text `text-[12px] text-muted-foreground`.
- **Empty states:** `EmptyState`; loading: `skeleton` blocks matching final shape
  (not spinners, unless page-edge refresh).
- **Buttons hierarchy:** primary = default Button; secondary = outline; tertiary =
  ghost (icon-only where the row is busy); destructive = red. Drop `variant="soft"`
  for active/filters — use `outline` with `border-signal/40 text-foreground` when
  an option is selected.
- **Motion:** entrance = `motion` fade+8px rise with ease `[0.22, 1, 0.36, 1]`,
  ≤0.35s; stagger children 40–60ms where a list renders on load. Hover = border
  color shift only (no translate, no scale on cards). Keep existing motion imports
  if present, remove swirl/float effects.
- **Cards on dark:** `bg-surface` handles it; never add inner shadows.

## Voice

Confident, human, concrete. Sentence case almost everywhere; headings may be
Title Case.Short sentences. No exclamation marks, no buzzwords, no "AI-powered",
no sparkle metaphors. Numbers speak: "37 sources connected", "2 pull requests
behind" style specificity beats adjectives.
