import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import Layout from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import Login from '@/pages/Login';
import Register from '@/pages/Register';

const LegacyDashboard = lazy(() => import('@/pages/Dashboard'));
const Leads = lazy(() => import('@/pages/Leads'));
const LeadDetail = lazy(() => import('@/pages/LeadDetail'));
const Companies = lazy(() => import('@/pages/Companies'));
const Contacts = lazy(() => import('@/pages/Contacts'));
const Duplicates = lazy(() => import('@/pages/Duplicates'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Settings = lazy(() => import('@/pages/Settings'));

const CandidateDashboard = lazy(() => import('@/pages/CandidateDashboard'));
const Jobs = lazy(() => import('@/pages/Jobs'));
const JobDetails = lazy(() => import('@/pages/JobDetails'));
const Recommendations = lazy(() => import('@/pages/Recommendations'));
const Applications = lazy(() => import('@/pages/Applications'));
const Profile = lazy(() => import('@/pages/Profile'));
const ResumeStudio = lazy(() => import('@/pages/ResumeStudio'));
const SavedJobs = lazy(() => import('@/pages/SavedJobs'));
const CandidateContacts = lazy(() => import('@/pages/CandidateContacts'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const AdminJobs = lazy(() => import('@/pages/AdminJobs'));
const AdminFeedback = lazy(() => import('@/pages/AdminFeedback'));

function RouteFallback() {
  return <div className="flex h-[60vh] items-center justify-center" role="status" aria-live="polite"><div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" /><span className="sr-only">Loading…</span></div>;
}

function App() {
  const { isAuthenticated, user, init } = useAuthStore();
  React.useEffect(() => { init(); }, []);

  if (!isAuthenticated) return <Routes><Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} /><Route path="*" element={<Login />} /></Routes>;

  const isAdmin = user?.role === 'admin';
  const isCandidate = user?.role === 'candidate';
  if (!isAdmin && !isCandidate) {
    return <ErrorBoundary><Suspense fallback={<RouteFallback />}><Routes><Route path="/login" element={<Navigate to="/dashboard" replace />} /><Route path="/register" element={<Navigate to="/dashboard" replace />} /><Route path="/" element={<Layout />}><Route index element={<Navigate to="/dashboard" replace />} /><Route path="dashboard" element={<LegacyDashboard />} /><Route path="leads" element={<Leads />} /><Route path="leads/:id" element={<LeadDetail />} /><Route path="companies" element={<Companies />} /><Route path="contacts" element={<Contacts />} /><Route path="duplicates" element={<Duplicates />} /><Route path="analytics" element={<Analytics />} /><Route path="settings" element={<Navigate to="/dashboard" replace />} /></Route><Route path="*" element={<Navigate to="/dashboard" replace />} /></Routes></Suspense></ErrorBoundary>;
  }

  return <ErrorBoundary><Suspense fallback={<RouteFallback />}><Routes>
    <Route path="/login" element={<Navigate to="/dashboard" replace />} />
    <Route path="/register" element={<Navigate to="/dashboard" replace />} />
    <Route path="/" element={<Layout />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={isAdmin ? <AdminDashboard /> : <CandidateDashboard />} />
      <Route path="jobs" element={isAdmin ? <AdminJobs /> : <Jobs />} />
      <Route path="jobs/:id" element={isAdmin ? <Navigate to="/jobs" replace /> : <JobDetails />} />
      <Route path="recommendations" element={isCandidate ? <Recommendations /> : <Navigate to="/dashboard" replace />} />
      <Route path="applications" element={isCandidate ? <Applications /> : <Navigate to="/dashboard" replace />} />
      <Route path="saved" element={isCandidate ? <SavedJobs /> : <Navigate to="/dashboard" replace />} />
      <Route path="contacts" element={isCandidate ? <CandidateContacts /> : isAdmin ? <Contacts /> : <Navigate to="/dashboard" replace />} />
      <Route path="resume" element={isCandidate ? <ResumeStudio /> : <Navigate to="/dashboard" replace />} />
      <Route path="profile" element={isCandidate ? <Profile /> : <Navigate to="/dashboard" replace />} />
      <Route path="settings" element={isAdmin ? <Settings /> : <Navigate to="/dashboard" replace />} />
      <Route path="admin/feedback" element={isAdmin ? <AdminFeedback /> : <Navigate to="/dashboard" replace />} />
      <Route path="leads" element={isAdmin ? <Leads /> : <Navigate to="/dashboard" replace />} />
      <Route path="leads/:id" element={isAdmin ? <LeadDetail /> : <Navigate to="/dashboard" replace />} />
      <Route path="companies" element={isAdmin ? <Companies /> : <Navigate to="/dashboard" replace />} />
      <Route path="duplicates" element={isAdmin ? <Duplicates /> : <Navigate to="/dashboard" replace />} />
      <Route path="analytics" element={isAdmin ? <Analytics /> : <Navigate to="/dashboard" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></Suspense></ErrorBoundary>;
}

export default App;
