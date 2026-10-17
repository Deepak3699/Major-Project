import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { WifiOff } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { CommandPalette } from "@/components/CommandPalette";

const Layout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const location = useLocation();

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
          <div role="alert" className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-[13px] font-medium text-warning">
            <WifiOff className="h-4 w-4" />
            You are offline — showing cached data. Actions will retry when you reconnect.
          </div>
        )}
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="mx-auto w-full max-w-content space-y-phi4 p-phi2 sm:p-phi3 lg:p-phi4"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
};

export default Layout;
