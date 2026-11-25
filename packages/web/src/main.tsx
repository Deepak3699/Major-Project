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