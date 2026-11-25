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

type Listener = (event: SSEEvent) => void;
type Connection = { es: EventSource; listeners: Set<Listener> };

// One EventSource per (url, token) shared by every subscriber. Without this,
// each page opened its own stream and a global freshness listener would add a
// duplicate connection on every route change.
const connections = new Map<string, Connection>();

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

function subscribe(url: string, token: string, listener: Listener): () => void {
  const key = `${url}::${token}`;
  let connection = connections.get(key);
  if (!connection) {
    const es = new EventSource(`${SSE_BASE}${url}?token=${encodeURIComponent(token)}`);
    const listeners = new Set<Listener>();
    es.onopen = () => console.info('[SSE] Connected');
    es.onmessage = (event: MessageEvent) => {
      let data: SSEEvent;
      try {
        data = JSON.parse(event.data);
      } catch {
        data = { type: 'raw', data: event.data };
      }
      listeners.forEach((fn) => fn(data));
    };
    es.onerror = (err) => console.warn('[SSE] Connection error:', err);
    connection = { es, listeners };
    connections.set(key, connection);
  }
  const active = connection;
  active.listeners.add(listener);
  return () => {
    active.listeners.delete(listener);
    if (active.listeners.size === 0) {
      try { active.es.close(); } catch { /* noop */ }
      connections.delete(key);
    }
  };
}

export function useSSE(url: string, onEvent?: (event: SSEEvent) => void) {
  const { token } = useAuthStore();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) return;
    return subscribe(url, token, (event) => onEventRef.current?.(event));
  }, [token, url]);

  const connect = useCallback(() => {
    // Kept for API compatibility; the hook subscribes automatically.
  }, []);
  const disconnect = useCallback(() => {
    // Kept for API compatibility; cleanup happens on unmount.
  }, []);

  return { connect, disconnect };
}
