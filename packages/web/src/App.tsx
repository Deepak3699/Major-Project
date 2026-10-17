import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import Layout from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Auth pages are the true entry point — keep them in the initial chunk.
import Login from '@/pages/Login';
import Register from '@/pages/Register';

// Everything behind auth is lazy-loaded: this keeps recharts, framer-motion and
// the table lib out of the first-paint bundle, so login/dashboard render fast
// and heavier routes stream in on demand.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Leads = lazy(() => import('@/pages/Leads'));
const LeadDetail = lazy(() => import('@/pages/LeadDetail'));
const Companies = lazy(() => import('@/pages/Companies'));
const Contacts = lazy(() => import('@/pages/Contacts'));
const Duplicates = lazy(() => import('@/pages/Duplicates'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Settings = lazy(() => import('@/pages/Settings'));

function RouteFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function App() {
  const { isAuthenticated, user, init } = useAuthStore();

  React.useEffect(() => {
    init();
  }, []);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  const isAdmin = user?.role === 'admin';

  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="leads" element={<Leads />} />
            <Route path="leads/:id" element={<LeadDetail />} />
            <Route path="companies" element={<Companies />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="duplicates" element={<Duplicates />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={isAdmin ? <Settings /> : <Navigate to="/dashboard" replace />} />
          </Route>
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/register" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
