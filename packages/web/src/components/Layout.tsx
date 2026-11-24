import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { CommandPalette } from "@/components/CommandPalette";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import { useAuthStore } from "@/stores/auth";

const Layout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const location = useLocation();
  const isCandidate = useAuthStore((state) => state.user?.role === "candidate" || state.user?.role === "user");

  useEffect(() => {
    const goOffline = () => setOnline(false);
    const goOnline = () => setOnline(true);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
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
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-content space-y-phi2 p-4 sm:p-6"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette />
      <OnboardingTour />
    </div>
  );
};

export default Layout;
