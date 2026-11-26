import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { API_URL } from '@/lib/env';

/**
 * Lightweight first-party activity tracker.
 *
 * - One random session id per browser tab, one random visitor id per browser.
 * - Sends a page view on every client-side navigation.
 * - Sends a heartbeat every 30 seconds only while the tab is visible, so
 *   "active time" means time actually spent looking at the product.
 * - Uses fetch(keepalive) and never blocks navigation or shows errors.
 */

const SESSION_KEY = 'hiregen.activity.session';
const VISITOR_KEY = 'hiregen.activity.visitor';
const HEARTBEAT_MS = 30_000;

function randomId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = randomId('s');
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return randomId('s');
  }
}

function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = randomId('v');
    localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return randomId('v');
  }
}

function post(payload: Record<string, unknown>, token: string | null): void {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(`${API_URL}/activity/heartbeat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      /* analytics must never surface an error to the candidate */
    });
  } catch {
    /* ignore */
  }
}

export function ActivityTracker() {
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const tokenRef = useRef<string | null>(token);
  const lastTickRef = useRef(Date.now());
  const lastPageViewRef = useRef<{ path: string; at: number }>({ path: '', at: 0 });
  const previousPathRef = useRef<string | null>(null);
  const idsRef = useRef<{ session: string; visitor: string } | null>(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    if (!idsRef.current) {
      idsRef.current = { session: getSessionId(), visitor: getVisitorId() };
    }
    const ids = idsRef.current;
    const path = location.pathname;
    const previousPath = previousPathRef.current;

    const send = (
      event: 'page_view' | 'heartbeat' | 'leave',
      activeSeconds = 0,
      pathOverride?: string,
      referrer?: string,
    ) => {
      post(
        {
          session_id: ids.session,
          visitor_id: ids.visitor,
          event,
          path: pathOverride ?? path,
          title: document.title,
          referrer,
          active_seconds: activeSeconds,
        },
        tokenRef.current,
      );
    };

    // Capture the seconds spent on the previous page before resetting the clock.
    const elapsed = Math.min(120, Math.max(0, Math.round((Date.now() - lastTickRef.current) / 1000)));
    lastTickRef.current = Date.now();

    // Attribute the time to the page it was actually spent on, then record the
    // new page view. The page view itself carries no active time.
    if (previousPath && previousPath !== path && elapsed > 0) {
      send('heartbeat', elapsed, previousPath);
    }

    const isDuplicate =
      lastPageViewRef.current.path === path && Date.now() - lastPageViewRef.current.at < 1500;
    if (!isDuplicate) {
      send('page_view', 0, undefined, document.referrer || undefined);
      lastPageViewRef.current = { path, at: Date.now() };
    }
    previousPathRef.current = path;

    const heartbeat = window.setInterval(() => {
      if (document.hidden) return;
      const seconds = Math.min(120, Math.max(0, Math.round((Date.now() - lastTickRef.current) / 1000)));
      lastTickRef.current = Date.now();
      if (seconds > 0) send('heartbeat', seconds);
    }, HEARTBEAT_MS);

    const leave = () => {
      const seconds = Math.min(120, Math.max(0, Math.round((Date.now() - lastTickRef.current) / 1000)));
      lastTickRef.current = Date.now();
      send('leave', seconds);
    };

    const onVisibility = () => {
      if (document.hidden) leave();
      else lastTickRef.current = Date.now();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', leave);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', leave);
    };
  }, [location.pathname]);

  return null;
}

export default ActivityTracker;
