import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth';
// SSE rides the same base as the REST client (/api in prod via nginx, /sse
// dev-proxy in vite). Relative base keeps it working behind any reverse proxy.
import { SSE_URL as SSE_BASE } from '@/lib/env';

type SSEEvent = {
  type: string;
  lead_id?: string;
  [key: string]: unknown;
};

// Single real-time contract (mirrors the event names the API + workers
// publish; see api/src/utils/sse.ts). Heartbeats/connected are transport
// noise and never match.
export const LEAD_LIFECYCLE_EVENTS: ReadonlySet<string> = new Set([
  'enrichment_queued',
  'enrichment_complete',
  'verification_queued',
  'verification_complete',
  'draft_queued',
  'draft_generated',
  'send_queued',
  'send_complete',
  'send_blocked',
  'verify_send_queued',
  'verify_and_send_queued',
  'verify_send_complete',
  'lead_updated',
]);

export function isLeadLifecycleEvent(type: string | undefined): boolean {
  return !!type && LEAD_LIFECYCLE_EVENTS.has(type);
}

/** Detail page refreshes only for ITS lead's lifecycle events (never on
 * heartbeats, connects, or other leads' events — the old handler refetched
 * on everything). */
export function shouldRefreshLeadDetail(event: SSEEvent, leadId: string | undefined): boolean {
  if (!leadId) return false;
  if (!isLeadLifecycleEvent(event.type)) return false;
  return event.lead_id === leadId;
}

export function useSSE(url: string, onEvent?: (event: SSEEvent) => void) {
  const { token } = useAuthStore();
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);

  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!token) return;

    const es = new EventSource(`${SSE_BASE}${url}?token=${encodeURIComponent(token)}`);

    es.onopen = () => {
      console.info('[SSE] Connected');
    };

    es.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        onEventRef.current?.(data);
      } catch {
        onEventRef.current?.({ type: 'raw', data: event.data });
      }
    };

    es.onerror = (err) => {
      console.warn('[SSE] Connection error:', err);
    };

    eventSourceRef.current = es;
  }, [token, url]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { connect, disconnect };
}
