// Lead lifecycle transition machine — TS mirror of
// database/schema/functions/020_leads_stage_transition.sql (keep in sync).
// The DB trigger is the final boundary; this helper lets app code fail fast
// with a readable error instead of waiting for a constraint violation.
//
// DIRECTIONAL semantics: stages are progress markers and writers jump straight
// to outcome stages, so any FORWARD jump is legal; backward jumps, wrong
// failure entries, and terminal exits are illegal. Send-time gates (verified
// contact, suppression) are enforced separately at send time.

const RANK: Record<string, number> = {
  discovered: 0,
  enriching: 1,
  enriched: 2,
  verifying: 3,
  verified: 4,
  ready_for_outreach: 5,
  message_generated: 6,
  drafted: 7,
  send_pending: 8,
  sent: 9,
  contacted: 9,
  delivered: 10,
  replied: 11,
  converted: 12,
};

const FAILURE_ENTRY: Record<string, string[]> = {
  enrichment_failed: ['discovered', 'enriching'],
  verification_failed: ['enriched', 'verifying'],
  contact_unavailable: ['discovered', 'enriching', 'enriched', 'verifying'],
  send_failed: ['verified', 'ready_for_outreach', 'message_generated', 'drafted', 'send_pending'],
  provider_error: ['verified', 'ready_for_outreach', 'message_generated', 'drafted', 'send_pending'],
  bounced: ['sent', 'contacted', 'delivered'],
  retry_pending: ['bounced', 'send_failed', 'provider_error', 'verification_failed', 'enrichment_failed', 'drafted', 'send_pending'],
};

const RECOVERY: Record<string, string[]> = {
  enrichment_failed: ['enriching', 'enriched', 'retry_pending'],
  verification_failed: ['verifying', 'verified', 'retry_pending'],
  contact_unavailable: ['enriching', 'enriched'],
  send_failed: ['retry_pending', 'send_pending', 'drafted'],
  provider_error: ['retry_pending', 'send_pending', 'drafted'],
  bounced: ['retry_pending'],
  retry_pending: ['enriching', 'enriched', 'verifying', 'verified', 'drafted', 'send_pending'],
};

export function isLegalTransition(from: string, to: string): boolean {
  if (from === to) return true;
  if (from === 'suppressed' || from === 'converted') return false;
  if (to === 'suppressed') return true;
  const oldRank = RANK[from];
  const newRank = RANK[to];
  if (oldRank !== undefined && newRank !== undefined) return newRank > oldRank;
  if (newRank === undefined && oldRank !== undefined) {
    return (FAILURE_ENTRY[to] || []).includes(from);
  }
  if (oldRank === undefined && newRank !== undefined) {
    return (RECOVERY[from] || []).includes(to);
  }
  // failure -> failure: only via retry_pending entry list
  if (to === 'retry_pending') return (FAILURE_ENTRY.retry_pending || []).includes(from);
  return false;
}

export function assertStageTransition(from: string, to: string): void {
  if (!isLegalTransition(from, to)) {
    throw new Error(`illegal lead stage transition: ${from} -> ${to}`);
  }
}

export function legalSuccessors(from: string): string[] {
  const out = new Set<string>();
  const oldRank = RANK[from];
  if (oldRank !== undefined) {
    for (const [stage, rank] of Object.entries(RANK)) {
      if (rank > oldRank) out.add(stage);
    }
  }
  for (const [to, entries] of Object.entries(FAILURE_ENTRY)) {
    if (entries.includes(from)) out.add(to);
  }
  for (const to of RECOVERY[from] || []) out.add(to);
  if (from !== 'suppressed' && from !== 'converted') out.add('suppressed');
  return [...out];
}
