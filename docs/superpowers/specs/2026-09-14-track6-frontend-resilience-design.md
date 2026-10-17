# Track 6 — Frontend Resilience Design

## Decision
No new dependencies, no CRDT/outbox sync (unjustified for a
single-operator CRM backed by a durable server). Auth already persists
(zustand/persist). This track closes the two real client-side loss paths:

1. **Draft preservation**: unsent draft edits back up to `localStorage`
   per keystroke (`draft-backup:{leadId}:{draftId}`), restore on edit
   start, cleared on save/cancel. Survives reloads and crashes.
2. **Offline awareness**: `navigator.onLine` banner in Layout; queries
   already surface error/empty states and retry on reconnect.

## Testing
`tsc` + jest green; verified live (offline banner via DevTools emulation
is operator-checkable; backup round-trip covered by code review — no
jsdom localStorage race worth a test here).
