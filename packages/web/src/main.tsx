import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import App from '@/App';
import { ToastProvider } from '@/components/ui/toast';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

// Keep the HTTP client in step with the persisted session. A token present in
// the store must always be on requests, including right after a client-side
// navigation before a page's first query runs.
useAuthStore.subscribe((state) => {
  if (state.token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
});

// A tab left open across a deploy keeps the previous bundle in memory. Its
// lazy route chunks no longer exist, so client-side navigation renders blank
// until a hard refresh. Detect the new entry chunk and reload once.
const currentBundle = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
let lastBundleCheck = 0;
async function ensureCurrentBundle(): Promise<void> {
  if (!currentBundle || Date.now() - lastBundleCheck < 30_000) return;
  lastBundleCheck = Date.now();
  try {
    const res = await fetch('/index.html', { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    if (!html.includes(currentBundle)) window.location.reload();
  } catch {
    // Offline / flaky network: keep the current page usable.
  }
}
window.addEventListener('focus', ensureCurrentBundle);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void ensureCurrentBundle();
});
import '@fontsource-variable/inter';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A client-side navigation mounts a fresh page: always fetch its data
      // instead of showing an empty/cached shell until the user hard-refreshes.
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
      staleTime: 0,
      cacheTime: 5 * 60 * 1000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);