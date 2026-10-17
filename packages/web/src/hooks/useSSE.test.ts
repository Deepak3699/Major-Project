// The pure contract below lives alongside the EventSource hook, which pulls in
// the auth store -> axios client -> Vite env chain. This suite only asserts the
// event contract, so stub the transport dependency.
jest.mock('@/stores/auth', () => ({ useAuthStore: { getState: () => ({ token: null }) } }));

import { isLeadLifecycleEvent, shouldRefreshLeadDetail, LEAD_LIFECYCLE_EVENTS } from './useSSE';

describe('SSE event contract (mirrors API + worker publishers)', () => {
  test('every published worker/API event type matches', () => {
    for (const t of [
      'enrichment_queued', 'enrichment_complete',
      'verification_queued', 'verification_complete',
      'draft_queued', 'draft_generated',
      'send_queued', 'send_complete', 'send_blocked',
      'verify_send_queued', 'verify_and_send_queued', 'verify_send_complete',
      'lead_updated',
    ]) {
      expect(isLeadLifecycleEvent(t)).toBe(true);
    }
    expect(LEAD_LIFECYCLE_EVENTS.size).toBeGreaterThanOrEqual(13);
  });

  test('transport noise never matches', () => {
    expect(isLeadLifecycleEvent('heartbeat')).toBe(false);
    expect(isLeadLifecycleEvent('connected')).toBe(false);
    expect(isLeadLifecycleEvent('raw')).toBe(false);
    expect(isLeadLifecycleEvent('')).toBe(false);
    expect(isLeadLifecycleEvent(undefined as any)).toBe(false);
    // Dead names the dashboard used to listen for:
    expect(isLeadLifecycleEvent('stats_updated')).toBe(false);
    expect(isLeadLifecycleEvent('pipeline_stage_changed')).toBe(false);
  });

  test('detail refresh is scoped to its own lead', () => {
    expect(shouldRefreshLeadDetail({ type: 'send_complete', lead_id: 'L1' }, 'L1')).toBe(true);
    expect(shouldRefreshLeadDetail({ type: 'send_complete', lead_id: 'L2' }, 'L1')).toBe(false);
    expect(shouldRefreshLeadDetail({ type: 'heartbeat' }, 'L1')).toBe(false);
    expect(shouldRefreshLeadDetail({ type: 'send_complete', lead_id: 'L1' }, undefined)).toBe(false);
    expect(shouldRefreshLeadDetail({ type: 'send_complete' }, 'L1')).toBe(false);
  });
});
