import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import {
  LayoutDashboard, Users, Building2, Contact, GitMerge, TrendingUp,
  Settings as SettingsIcon, LogOut, Search, PanelLeft, BriefcaseBusiness,
  Target, ClipboardList, UserRound, MessageCircle, Bookmark, FileText, X,
  Mic, GraduationCap, Coins, Award, Sparkles, ArrowUpRight, Bot, UsersRound,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/components/ui/cn";
import { Avatar } from "@/components/ui/avatar";

type IconType = typeof Users;
const LEGACY_SECTIONS: { label: string; items: { to: string; label: string; icon: IconType }[] }[] = [
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
const CANDIDATE_SECTIONS = [
  { label: "Career space", items: [
    { to: "/dashboard", label: "Home", icon: LayoutDashboard },
    { to: "/jobs", label: "Discover jobs", icon: BriefcaseBusiness },
    { to: "/recommendations", label: "For you", icon: Target, tour: "nav-for-you" },
    { to: "/saved", label: "Saved jobs", icon: Bookmark },
    { to: "/applications", label: "Applications", icon: ClipboardList },
    { to: "/placements", label: "Placement outcomes", icon: Award },
    { to: "/contacts", label: "Employer contacts", icon: Contact },
    { to: "/resume", label: "Resume studio", icon: FileText },
    { to: "/profile", label: "My profile", icon: UserRound },
  ] },
  { label: "Practice space", items: [
    { to: "/practice", label: "Interview practice", icon: Mic, tour: "nav-practice" },
    { to: "/preparation", label: "Preparation workspace", icon: Sparkles },
    { to: "/learning", label: "Learning tracks", icon: GraduationCap },
    { to: "/credits", label: "Credits & plan", icon: Coins },
  ] },
];
const ADMIN_SECTIONS = [
  { label: "Platform", items: [
    { to: "/dashboard", label: "Home", icon: LayoutDashboard },
    { to: "/jobs", label: "Job review", icon: BriefcaseBusiness, tour: "nav-jobs" },
    { to: "/leads", label: "Lead pipeline", icon: Users },
    { to: "/companies", label: "Companies", icon: Building2 },
    { to: "/contacts", label: "HR contacts & verification", icon: Contact },
  ] },
  { label: "Insights", items: [
    { to: "/duplicates", label: "Duplicates", icon: GitMerge },
    { to: "/analytics", label: "Analytics", icon: TrendingUp },
    { to: "/admin/users", label: "People & activity", icon: UsersRound },
    { to: "/admin/feedback", label: "Candidate feedback", icon: MessageCircle },
    { to: "/admin/placements", label: "Placement outcomes", icon: Award },
    { to: "/admin/practice", label: "Practice subscriptions", icon: Mic, tour: "nav-admin-practice" },
    { to: "/admin/credits", label: "Credits ledger", icon: Coins },
    { to: "/admin/ai", label: "Gemini usage & cost", icon: Bot },
    { to: "/settings", label: "System settings", icon: SettingsIcon },
  ] },
];

const LS_KEY = "HireGen:rail-collapsed";
const EASE = "transition-[width,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";

interface NavItemProps { to: string; label: string; icon: IconType; collapsed: boolean; onNavigate?: () => void; tour?: string }
function NavItem({ to, label, icon: Icon, collapsed, onNavigate, tour }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      title={label}
      data-tour={tour}
      className={({ isActive }) =>
        cn(
          "group relative flex h-10 min-h-10 items-center gap-3 rounded-xl text-[13px] font-medium transition-all duration-150",
          collapsed ? "justify-center px-0 mx-1" : "px-3",
          "text-sidebar-foreground/72 hover:bg-sidebar-muted/70 hover:text-sidebar-foreground",
          isActive && "bg-signal/[0.12] text-sidebar-foreground shadow-[inset_0_0_0_1px_hsl(var(--signal)/0.08)]",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && <span aria-hidden className="absolute left-0 top-2.5 h-5 w-[3px] rounded-r-full bg-[hsl(14,52%,62%)]" />}
          <Icon
            className={cn(
              "h-[18px] w-[18px] shrink-0 transition-colors",
              isActive ? "text-[hsl(14,52%,62%)] opacity-100" : "opacity-65 group-hover:opacity-100",
            )}
            strokeWidth={isActive ? 2 : 1.8}
          />
          <span className={cn("truncate tracking-[-0.01em]", collapsed && "hidden")}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function Nav({ collapsed, isAdmin, isCandidate, onNavigate }: { collapsed: boolean; isAdmin: boolean; isCandidate: boolean; onNavigate?: () => void }) {
  const sections = isCandidate ? CANDIDATE_SECTIONS : isAdmin ? ADMIN_SECTIONS : LEGACY_SECTIONS;
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-3 py-3">
      {sections.map((sec, secIndex) => (
        <div key={sec.label} className={cn(secIndex > 0 && !collapsed && "mt-3")}>
          {!collapsed && <p className={cn("px-3 pb-2 pt-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em]", EASE)} style={{ color: 'hsl(var(--sidebar-foreground) / 0.45)' }}>{sec.label}</p>}
          {collapsed && <div className="mx-2 my-2.5 h-px bg-sidebar-border/80" />}
          <div className="flex flex-col gap-1">
            {sec.items.map((it) => <NavItem key={it.to} {...it} collapsed={collapsed} onNavigate={onNavigate} />)}
          </div>
        </div>
      ))}
    </nav>
  );
}


function Footer({ collapsed, email, role, onLogout, onCommand }: { collapsed: boolean; email?: string | null; role?: string | null; onLogout: () => void; onCommand: () => void }) {
  return (
    <div className="border-t border-sidebar-border/80 p-3">
      <button
        type="button"
        onClick={onCommand}
        title="Command palette (⌘K)"
        className={cn("mb-3 flex h-10 w-full items-center gap-2.5 rounded-xl border border-sidebar-border/80 bg-sidebar-muted/25 text-sidebar-foreground/80 transition-colors hover:border-sidebar-border hover:bg-sidebar-muted/45 hover:text-sidebar-foreground", collapsed ? "justify-center px-0" : "px-3")}
      >
        <Search className="h-4 w-4" />
        <span className={cn("text-[12.5px]", collapsed && "hidden")}>Search</span>
        <kbd className={cn("ml-auto rounded-md border border-sidebar-border/70 px-1.5 py-0.5 font-mono text-[10px] text-sidebar-foreground/55", collapsed && "hidden")}>⌘K</kbd>
      </button>
      <div className={cn("flex items-center gap-2.5 rounded-xl px-1 py-1", collapsed && "justify-center px-0")}>
        <Avatar name={email} size="sm" />
        <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
          <p className="truncate text-[12.5px] font-medium text-sidebar-foreground">{email || "User"}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-sidebar-foreground/55">{role || "user"}</p>
        </div>
        <button type="button" onClick={onLogout} title="Sign out" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sidebar-foreground/65 transition-colors hover:bg-destructive-soft hover:text-destructive", collapsed && "hidden")}><LogOut className="h-4 w-4" /></button>
      </div>
      {collapsed && <button type="button" onClick={onLogout} title="Sign out" className="mx-auto mt-2 grid h-8 w-8 place-items-center rounded-lg text-sidebar-foreground/65 transition-colors hover:bg-destructive-soft hover:text-destructive"><LogOut className="h-4 w-4" /></button>}
    </div>
  );
}

const Sidebar = ({ drawerOpen = false, onDrawerClose }: { drawerOpen?: boolean; onDrawerClose?: () => void }) => {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(LS_KEY, collapsed ? "1" : "0"); } catch { /* noop */ } }, [collapsed]);
  const { user, logout, revokeCurrentToken } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const isCandidate = user?.role === "candidate" || user?.role === "user";
  const onLogout = async () => { await revokeCurrentToken(); await logout(); navigate("/login"); };
  const openPalette = () => window.dispatchEvent(new Event("HireGen:open-palette"));

  const Header = ({ compact }: { compact: boolean }) => (
    <div className={cn("flex h-16 shrink-0 items-center justify-between px-4 text-sidebar-foreground", compact && "justify-center px-0")}>
      {compact ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="grid h-9 w-9 place-items-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-muted hover:text-sidebar-foreground"
        >
          <Logo showText={false} size="sm" />
        </button>
      ) : (
        <>
          <div className="min-w-0 flex-1 overflow-hidden">
            <Logo size="md" />
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-muted hover:text-sidebar-foreground"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside data-tour="sidebar" className={cn("relative z-20 hidden h-full shrink-0 flex-col overflow-hidden border-r border-[hsl(var(--sidebar-border)/0.7)] bg-[hsl(var(--sidebar)/0.72)] backdrop-blur-xl md:flex shadow-[1px_0_0_hsl(var(--sidebar-border)/0.5)]", EASE)} style={{ width: collapsed ? 64 : 240 }}>
        <Header compact={collapsed} />
        <Nav collapsed={collapsed} isAdmin={isAdmin} isCandidate={isCandidate} />
        <Footer collapsed={collapsed} email={user?.email} role={user?.role} onLogout={onLogout} onCommand={openPalette} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-overlay md:hidden">
          <div className="absolute inset-0 bg-zinc-950/60 animate-overlay-in" onClick={onDrawerClose} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-[hsl(var(--sidebar-border)/0.7)] bg-[hsl(var(--sidebar)/0.82)] backdrop-blur-xl shadow-drawer animate-drawer-in">
            <div className="flex h-16 shrink-0 items-center justify-between px-4 text-sidebar-foreground">
              <Logo size="md" />
              <button type="button" onClick={onDrawerClose} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-md text-sidebar-foreground transition-colors hover:bg-sidebar-muted hover:text-sidebar-foreground"><X className="h-4 w-4" /></button>
            </div>
            <Nav collapsed={false} isAdmin={isAdmin} isCandidate={isCandidate} onNavigate={onDrawerClose} />
            <Footer collapsed={false} email={user?.email} role={user?.role} onLogout={onLogout} onCommand={openPalette} />
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
