import React, { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuthStore } from "@/stores/auth";
import {
  LayoutDashboard, Users, Building2, Contact, GitMerge, TrendingUp,
  Settings as SettingsIcon, LogOut, Search, PanelLeft, BriefcaseBusiness,
  Target, ClipboardList, UserRound, MessageCircle, Bookmark, FileText, X,
  Mic, GraduationCap, Coins, Award, Sparkles,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/components/ui/cn";
import { Avatar } from "@/components/ui/avatar";

type IconType = typeof Users;
type NavItemDef = { to: string; label: string; icon: IconType; tour?: string };

const CANDIDATE_NAV: NavItemDef[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/jobs", label: "Discover Jobs", icon: BriefcaseBusiness },
  { to: "/recommendations", label: "For You", icon: Target, tour: "nav-for-you" },
  { to: "/saved", label: "Saved Jobs", icon: Bookmark },
  { to: "/applications", label: "Applications", icon: ClipboardList },
  { to: "/placements", label: "Placement Outcomes", icon: Award },
  { to: "/resume", label: "Resume Studio", icon: FileText },
  { to: "/learning", label: "Skill Development", icon: GraduationCap },
  { to: "/contacts", label: "Employer Contacts", icon: Contact },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const CANDIDATE_SECONDARY: NavItemDef[] = [
  { to: "/profile", label: "My Profile", icon: UserRound },
  { to: "/practice", label: "Interview Practice", icon: Mic, tour: "nav-practice" },
  { to: "/preparation", label: "Preparation", icon: Sparkles },
  { to: "/credits", label: "Credits & Plan", icon: Coins },
];

const ADMIN_SECTIONS: { label: string; items: NavItemDef[] }[] = [
  { label: "Platform", items: [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/jobs", label: "Job review", icon: BriefcaseBusiness, tour: "nav-jobs" },
    { to: "/leads", label: "Lead pipeline", icon: Users },
    { to: "/companies", label: "Companies", icon: Building2 },
    { to: "/contacts", label: "HR contacts", icon: Contact },
  ] },
  { label: "Insights", items: [
    { to: "/duplicates", label: "Duplicates", icon: GitMerge },
    { to: "/analytics", label: "Analytics", icon: TrendingUp },
    { to: "/admin/feedback", label: "Candidate feedback", icon: MessageCircle },
    { to: "/admin/placements", label: "Placement outcomes", icon: Award },
    { to: "/admin/practice", label: "Practice subscriptions", icon: Mic, tour: "nav-admin-practice" },
    { to: "/admin/credits", label: "Credits ledger", icon: Coins },
    { to: "/settings", label: "System settings", icon: SettingsIcon },
  ] },
];

const LEGACY_SECTIONS: { label: string; items: NavItemDef[] }[] = [
  { label: "Workspace", items: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/leads", label: "Leads", icon: Users },
    { to: "/companies", label: "Companies", icon: Building2 },
    { to: "/contacts", label: "HR Contacts", icon: Contact },
  ] },
  { label: "Insights", items: [
    { to: "/duplicates", label: "Duplicates", icon: GitMerge },
    { to: "/analytics", label: "Analytics", icon: TrendingUp },
  ] },
];

const LS_KEY = "HireGen:rail-collapsed";
const EASE = [0.22, 1, 0.36, 1] as const;

function Tooltip({ label, show }: { label: string; show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -4 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-lg border border-[rgba(73,49,38,0.12)] bg-[rgba(248,242,234,0.96)] px-2.5 py-1.5 text-[12px] font-medium text-[#493126] shadow-[0_8px_24px_rgba(73,49,38,0.12)] backdrop-blur-md dark:border-[rgba(232,213,195,0.14)] dark:bg-[rgba(56,38,30,0.96)] dark:text-[#F0E4D8] z-50"
          role="tooltip"
        >
          {label}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function DockItem({
  item, expanded, onNavigate, layoutGroup,
}: { item: NavItemDef; expanded: boolean; onNavigate?: () => void; layoutGroup: string }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      data-tour={item.tour}
      aria-label={item.label}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={({ isActive }) =>
        cn(
          "group relative flex h-11 items-center rounded-xl transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#C4775F]/40",
          expanded ? "px-3 gap-3" : "justify-center px-0 w-11 mx-auto",
          isActive
            ? "text-[#493126] dark:text-[#F0E4D8]"
            : "text-[#493126]/72 hover:text-[#493126] dark:text-[#F0E4D8]/72 dark:hover:text-[#F0E4D8]"
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId={`dock-active-${layoutGroup}`}
              className="absolute inset-0 rounded-xl bg-[rgba(196,119,95,0.14)] border border-[rgba(196,119,95,0.18)] dark:bg-[rgba(196,119,95,0.22)] dark:border-[rgba(196,119,95,0.2)]"
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            />
          )}
          <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg">
            <Icon
              className={cn(
                "h-[19px] w-[19px] transition-all duration-200 group-hover:scale-110",
                isActive ? "text-[#C4775F]" : "text-current"
              )}
              strokeWidth={isActive ? 2.1 : 1.8}
            />
          </span>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="relative z-10 truncate text-[13px] font-medium tracking-[-0.01em]"
              >
                {item.label}
              </motion.span>
            )}
          </AnimatePresence>
          {!expanded && <Tooltip label={item.label} show={hovered} />}
        </>
      )}
    </NavLink>
  );
}

function DockSection({
  title, items, expanded, onNavigate, layoutGroup,
}: { title?: string; items: NavItemDef[]; expanded: boolean; onNavigate?: () => void; layoutGroup: string }) {
  return (
    <div className="flex flex-col gap-1">
      {title && (
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#493126]/45 dark:text-[#F0E4D8]/45"
            >
              {title}
            </motion.p>
          ) : (
            <div className="mx-3 my-2 h-px bg-[rgba(73,49,38,0.1)] dark:bg-[rgba(232,213,195,0.12)]" />
          )}
        </AnimatePresence>
      )}
      {items.map((item) => (
        <DockItem key={item.to} item={item} expanded={expanded} onNavigate={onNavigate} layoutGroup={layoutGroup} />
      ))}
    </div>
  );
}

const Sidebar = ({ drawerOpen = false, onDrawerClose }: { drawerOpen?: boolean; onDrawerClose?: () => void }) => {
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem(LS_KEY) === "0"; } catch { return false; } });
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const { user, logout, revokeCurrentToken } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === "admin";
  const isCandidate = user?.role === "candidate" || user?.role === "user";
  const expanded = pinned || hoverExpanded;

  useEffect(() => { try { localStorage.setItem(LS_KEY, pinned ? "0" : "1"); } catch { /* noop */ } }, [pinned]);
  useEffect(() => { setHoverExpanded(false); }, [location.pathname]);

  const onLogout = async () => { await revokeCurrentToken(); await logout(); navigate("/login"); };
  const openPalette = () => window.dispatchEvent(new Event("HireGen:open-palette"));

  const handleMouseEnter = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    setHoverExpanded(true);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHoverExpanded(false), 180);
  };

  const dockClass = cn(
    "relative flex flex-col overflow-hidden rounded-2xl border backdrop-blur-[20px]",
    "bg-[rgba(232,213,195,0.52)] dark:bg-[rgba(56,38,30,0.62)]",
    "border-[rgba(73,49,38,0.1)] dark:border-[rgba(232,213,195,0.12)]",
    "shadow-[0_12px_40px_rgba(73,49,38,0.1),0_2px_8px_rgba(73,49,38,0.06),inset_0_1px_0_rgba(255,255,255,0.55)]",
    "dark:shadow-[0_12px_40px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)]"
  );

  const navContent = (forMobile = false) => {
    const isExpanded = forMobile || expanded;
    return (
      <>
        <div className={cn("flex h-16 shrink-0 items-center border-b border-[rgba(73,49,38,0.08)] dark:border-[rgba(232,213,195,0.1)]", isExpanded ? "justify-between px-4" : "justify-center px-2")}>
          {isExpanded ? (
            <>
              <div className="min-w-0 flex-1 overflow-hidden"><Logo size="md" /></div>
              {!forMobile && (
                <button type="button" onClick={() => setPinned((v) => !v)} aria-label={pinned ? "Collapse navigation" : "Pin navigation open"} title={pinned ? "Collapse navigation" : "Pin navigation open"} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#493126]/65 transition-colors hover:bg-[rgba(196,119,95,0.12)] hover:text-[#493126] dark:text-[#F0E4D8]/65 dark:hover:text-[#F0E4D8]">
                  <PanelLeft className={cn("h-4 w-4 transition-transform duration-200", !pinned && "rotate-180")} />
                </button>
              )}
              {forMobile && (
                <button type="button" onClick={onDrawerClose} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-lg text-[#493126]/65 transition-colors hover:bg-[rgba(196,119,95,0.12)] hover:text-[#493126] dark:text-[#F0E4D8]/65 dark:hover:text-[#F0E4D8]"><X className="h-4 w-4" /></button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => setPinned(true)} aria-label="Expand navigation" title="Expand navigation" className="grid h-10 w-10 place-items-center rounded-xl transition-colors hover:bg-[rgba(196,119,95,0.12)]">
              <Logo showText={false} size="sm" />
            </button>
          )}
        </div>

        <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden py-3", isExpanded ? "px-3" : "px-2")} aria-label="Primary navigation">
          {isCandidate ? (
            <div className="flex flex-col gap-3">
              <DockSection items={CANDIDATE_NAV} expanded={isExpanded} onNavigate={forMobile ? onDrawerClose : undefined} layoutGroup={forMobile ? "mobile" : "desktop"} />
              <DockSection title="Workspace" items={CANDIDATE_SECONDARY} expanded={isExpanded} onNavigate={forMobile ? onDrawerClose : undefined} layoutGroup={forMobile ? "mobile" : "desktop"} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(isAdmin ? ADMIN_SECTIONS : LEGACY_SECTIONS).map((sec) => (
                <DockSection key={sec.label} title={sec.label} items={sec.items} expanded={isExpanded} onNavigate={forMobile ? onDrawerClose : undefined} layoutGroup={forMobile ? "mobile" : "desktop"} />
              ))}
            </div>
          )}
        </nav>

        <div className={cn("border-t border-[rgba(73,49,38,0.08)] dark:border-[rgba(232,213,195,0.1)] p-3", !isExpanded && "px-2")}>
          <button
            type="button"
            onClick={openPalette}
            aria-label="Open command palette"
            title="Search (⌘K)"
            className={cn(
              "mb-2 flex h-10 w-full items-center rounded-xl text-[#493126]/72 transition-colors hover:bg-[rgba(196,119,95,0.1)] hover:text-[#493126] dark:text-[#F0E4D8]/72 dark:hover:text-[#F0E4D8]",
              isExpanded ? "gap-3 px-3" : "justify-center"
            )}
          >
            <Search className="h-[18px] w-[18px] shrink-0" />
            {isExpanded && <span className="text-[13px] font-medium">Search</span>}
            {isExpanded && <kbd className="ml-auto rounded-md border border-[rgba(73,49,38,0.12)] px-1.5 py-0.5 font-mono text-[10px] text-[#493126]/50 dark:border-[rgba(232,213,195,0.14)] dark:text-[#F0E4D8]/50">⌘K</kbd>}
          </button>

          <div className={cn("flex items-center rounded-xl", isExpanded ? "gap-2.5 px-2 py-2" : "justify-center py-1")}>
            <button type="button" onClick={() => !forMobile && !isExpanded ? setPinned(true) : navigate('/profile')} className="shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-[#C4775F]/40" aria-label="Open profile" title={user?.email || "Profile"}>
              <Avatar name={user?.email} size="sm" />
            </button>
            {isExpanded && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-[#493126] dark:text-[#F0E4D8]">{user?.email || "User"}</p>
                  <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[#493126]/50 dark:text-[#F0E4D8]/50">{user?.role || "user"}</p>
                </div>
                <button type="button" onClick={onLogout} title="Sign out" aria-label="Sign out" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[#493126]/60 transition-colors hover:bg-[rgba(196,119,95,0.12)] hover:text-[#C4775F] dark:text-[#F0E4D8]/60">
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          {!isExpanded && (
            <button type="button" onClick={onLogout} title="Sign out" aria-label="Sign out" className="mx-auto mt-1 grid h-8 w-8 place-items-center rounded-lg text-[#493126]/60 transition-colors hover:bg-[rgba(196,119,95,0.12)] hover:text-[#C4775F] dark:text-[#F0E4D8]/60">
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <div className="hidden md:block">
        <motion.aside
          data-tour="sidebar"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          initial={false}
          animate={{ width: expanded ? 248 : 72 }}
          transition={{ duration: 0.28, ease: EASE }}
          className={cn(dockClass, "fixed left-4 top-1/2 z-30 max-h-[calc(100vh-2rem)] -translate-y-1/2")}
          style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_30%,transparent_70%,rgba(196,119,95,0.05))] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent_30%,transparent_70%,rgba(196,119,95,0.08))]" />
          <div className="relative flex min-h-0 flex-1 flex-col">
            {navContent(false)}
          </div>
        </motion.aside>
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-overlay md:hidden">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#493126]/20 backdrop-blur-sm"
              onClick={onDrawerClose} aria-hidden
            />
            <motion.aside
              initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.24, ease: EASE }}
              className={cn(dockClass, "absolute left-3 top-3 bottom-3 w-[280px] max-w-[calc(100vw-1.5rem)]")}
              style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
            >
              <div aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_30%,transparent_70%,rgba(196,119,95,0.05))]" />
              <div className="relative flex min-h-0 flex-1 flex-col">
                {navContent(true)}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
