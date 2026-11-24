import React, { Suspense, useState, useEffect } from "react";
import { Outlet, useLocation, NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff, LayoutDashboard, BriefcaseBusiness, Sparkles, UserRound } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { CommandPalette } from "@/components/CommandPalette";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { SubscriptionDialog } from "@/components/SubscriptionDialog";
import { useAuthStore } from "@/stores/auth";

function PageSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in" aria-hidden>
      <div className="space-y-3">
        <div className="skeleton h-3 w-28 rounded-full" />
        <div className="skeleton h-9 w-72 max-w-full rounded-xl" />
        <div className="skeleton h-4 w-[28rem] max-w-full rounded-lg" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5 space-y-3" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between"><div className="skeleton h-3 w-20 rounded-full" /><div className="skeleton h-10 w-10 rounded-xl" /></div>
            <div className="skeleton h-8 w-24 rounded-lg" />
            <div className="skeleton h-3 w-32 rounded-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="card p-5 space-y-4"><div className="skeleton h-5 w-40 rounded-lg" /><div className="skeleton h-40 w-full rounded-xl" /><div className="skeleton h-24 w-full rounded-xl" /></div>
        <div className="card p-5 space-y-4"><div className="skeleton h-5 w-36 rounded-lg" /><div className="skeleton h-20 w-full rounded-xl" /><div className="skeleton h-20 w-full rounded-xl" /></div>
      </div>
    </div>
  );
}

const Layout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const location = useLocation();
  const isCandidate = useAuthStore((state) => state.user?.role === "candidate" || state.user?.role === "user");

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => setOnline(true);
    const openFeedback = () => setFeedbackOpen(true);
    const openSubscription = () => setSubscriptionOpen(true);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    window.addEventListener("HireGen:open-feedback", openFeedback);
    window.addEventListener("HireGen:open-subscription", openSubscription);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("HireGen:open-feedback", openFeedback);
      window.removeEventListener("HireGen:open-subscription", openSubscription);
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar drawerOpen={drawerOpen} onDrawerClose={() => setDrawerOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setDrawerOpen(true)} />
        {!online && (
          <div role="alert" className="flex items-center justify-center gap-2 border-b border-warning/25 bg-warning-soft px-4 py-2 text-[12.5px] font-medium text-warning">
            <WifiOff className="h-3.5 w-3.5" />
            You are offline — showing cached data. Actions will retry when you reconnect.
          </div>
        )}
        <main className="flex-1 overflow-y-auto scroll-smooth bg-[radial-gradient(ellipse_at_top,hsl(var(--signal)/0.04),transparent_45%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: { duration: 0.12 } }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-content space-y-5 p-4 pb-20 sm:p-5 sm:space-y-5 md:pb-6 lg:p-6"
            >
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {isCandidate && (
        <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t border-border bg-surface md:hidden">
          {[
            { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
            { to: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
            { to: '/preparation', label: 'Prep', icon: Sparkles },
            { to: '/profile', label: 'Profile', icon: UserRound },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
      <CommandPalette />
      <OnboardingTour />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <SubscriptionDialog open={subscriptionOpen} onClose={() => setSubscriptionOpen(false)} />
    </div>
  );
};

export default Layout;
