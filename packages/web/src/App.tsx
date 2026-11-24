import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import Layout from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Landing from '@/pages/Landing';

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
const Practice = lazy(() => import('@/pages/Practice'));
const PracticeSession = lazy(() => import('@/pages/PracticeSession'));
const Learning = lazy(() => import('@/pages/Learning'));
const Credits = lazy(() => import('@/pages/Credits'));
const Placements = lazy(() => import('@/pages/Placements'));
const Preparation = lazy(() => import('@/pages/Preparation'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const AdminJobs = lazy(() => import('@/pages/AdminJobs'));
const AdminFeedback = lazy(() => import('@/pages/AdminFeedback'));
const AdminPractice = lazy(() => import('@/pages/AdminPractice'));
const AdminCredits = lazy(() => import('@/pages/AdminCredits'));
const AdminPlacements = lazy(() => import('@/pages/AdminPlacements'));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 animate-fade-in">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-2 border-border" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-signal animate-spin" />
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Loading workspace</p>
      </div>
    </div>
  );
}

function App() {
  const { isAuthenticated, user, init } = useAuthStore();
  const location = useLocation();
  React.useEffect(() => { init(); }, []);

  // The public preview is reachable even from an active session so it can be
  // inspected without signing out. All other routes keep their auth tables.
  if (location.pathname === '/welcome') return <Landing />;

  if (!isAuthenticated) return <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/welcome" element={<Landing />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="*" element={<Landing />} />
  </Routes>;

  const isAdmin = user?.role === 'admin';
  const isCandidate = user?.role === 'candidate' || user?.role === 'user';
  if (!isAdmin && !isCandidate) {
    return (
      <ErrorBoundary><Suspense fallback={<RouteFallback />}><Routes>
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/register" element={<Navigate to="/dashboard" replace />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<LegacyDashboard />} />
          <Route path="leads" element={<Leads />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="companies" element={<Companies />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="duplicates" element={<Duplicates />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Navigate to="/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes></Suspense></ErrorBoundary>
    );
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
      <Route path="practice" element={isCandidate ? <Practice /> : <Navigate to="/dashboard" replace />} />
      <Route path="practice/session/:id" element={isCandidate ? <PracticeSession /> : <Navigate to="/dashboard" replace />} />
      <Route path="learning" element={isCandidate ? <Learning /> : <Navigate to="/dashboard" replace />} />
      <Route path="credits" element={isCandidate ? <Credits /> : <Navigate to="/dashboard" replace />} />
      <Route path="placements" element={isCandidate ? <Placements /> : <Navigate to="/dashboard" replace />} />
      <Route path="preparation" element={isCandidate ? <Preparation /> : <Navigate to="/dashboard" replace />} />
      <Route path="profile" element={isCandidate ? <Profile /> : <Navigate to="/dashboard" replace />} />
      <Route path="settings" element={isAdmin ? <Settings /> : isCandidate ? <Navigate to="/profile" replace /> : <Navigate to="/dashboard" replace />} />
      <Route path="admin/feedback" element={isAdmin ? <AdminFeedback /> : <Navigate to="/dashboard" replace />} />
      <Route path="admin/practice" element={isAdmin ? <AdminPractice /> : <Navigate to="/dashboard" replace />} />
      <Route path="admin/credits" element={isAdmin ? <AdminCredits /> : <Navigate to="/dashboard" replace />} />
      <Route path="admin/placements" element={isAdmin ? <AdminPlacements /> : <Navigate to="/dashboard" replace />} />
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
