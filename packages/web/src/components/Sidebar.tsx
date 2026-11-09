import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import {
  LayoutDashboard, Users, Building2, Contact, GitMerge, TrendingUp,
  Settings as SettingsIcon, LogOut, Search, PanelLeft, BriefcaseBusiness,
  Target, ClipboardList, UserRound, MessageCircle, Bookmark, FileText, X,
  Mic, GraduationCap,
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
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/jobs", label: "Discover jobs", icon: BriefcaseBusiness },
    { to: "/recommendations", label: "For you", icon: Target },
    { to: "/saved", label: "Saved jobs", icon: Bookmark },
    { to: "/applications", label: "Applications", icon: ClipboardList },
    { to: "/contacts", label: "Employer contacts", icon: Contact },
    { to: "/resume", label: "Resume studio", icon: FileText },
    { to: "/profile", label: "My profile", icon: UserRound },
  ] },
  { label: "Practice space", items: [
    { to: "/practice", label: "Interview practice", icon: Mic },
    { to: "/learning", label: "Learning tracks", icon: GraduationCap },
  ] },
];
const ADMIN_SECTIONS = [
  { label: "Platform", items: [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { to: "/jobs", label: "Job review", icon: BriefcaseBusiness },
    { to: "/leads", label: "Lead pipeline", icon: Users },
    { to: "/companies", label: "Companies", icon: Building2 },
    { to: "/contacts", label: "HR contacts & verification", icon: Contact },
  ] },
  { label: "Insights", items: [
    { to: "/duplicates", label: "Duplicates", icon: GitMerge },
    { to: "/analytics", label: "Analytics", icon: TrendingUp },
    { to: "/admin/feedback", label: "Candidate feedback", icon: MessageCircle },
    { to: "/settings", label: "System settings", icon: SettingsIcon },
  ] },
];

const LS_KEY = "hiregen:rail-collapsed";
const EASE = "transition-[width,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]";

interface NavItemProps { to: string; label: string; icon: IconType; collapsed: boolean; onNavigate?: () => void }
function NavItem({ to, label, icon: Icon, collapsed, onNavigate }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      title={label}
      className={({ isActive }) =>
        cn(
          "group relative flex h-9 min-h-9 items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors duration-150",
          collapsed ? "justify-center px-0" : "px-2.5",
          "text-sidebar-foreground hover:bg-sidebar-muted hover:text-foreground",
          // Active state: solid ink pill with paper label — unmistakable, quiet.
          isActive && "!bg-sidebar-active !text-sidebar-active-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-4 w-4 shrink-0 transition-colors",
              isActive ? "opacity-90" : "opacity-75 group-hover:opacity-100",
            )}
            strokeWidth={isActive ? 2 : 1.75}
          />
          <span className={cn("truncate", collapsed && "hidden")}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function Nav({ collapsed, isAdmin, isCandidate, onNavigate }: { collapsed: boolean; isAdmin: boolean; isCandidate: boolean; onNavigate?: () => void }) {
  const sections = isCandidate ? CANDIDATE_SECTIONS : isAdmin ? ADMIN_SECTIONS : LEGACY_SECTIONS;
  return (
    <nav className="flex flex-1 flex-col gap-px overflow-x-hidden overflow-y-auto px-2.5 py-2">
      {sections.map((sec) => (
        <div key={sec.label}>
          {!collapsed && <p className={cn("eyebrow px-2.5 pb-1.5 pt-4", EASE)}>{sec.label}</p>}
          {collapsed && <div className="mx-1.5 my-2 h-px bg-sidebar-border" />}
          <div className="flex flex-col gap-px">
            {sec.items.map((it) => <NavItem key={it.to} {...it} collapsed={collapsed} onNavigate={onNavigate} />)}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Footer({ collapsed, email, role, onLogout, onCommand }: { collapsed: boolean; email?: string | null; role?: string | null; onLogout: () => void; onCommand: () => void }) {
  return (
    <div className="border-t border-sidebar-border p-2.5">
      <button
        type="button"
        onClick={onCommand}
        title="Command palette (⌘K)"
        className={cn("mb-2 flex h-8 w-full items-center gap-2.5 rounded-md border border-sidebar-border bg-transparent text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground", collapsed ? "justify-center px-0" : "px-2.5")}
      >
        <Search className="h-3.5 w-3.5" />
        <span className={cn("text-[12.5px]", collapsed && "hidden")}>Search</span>
        <kbd className={cn("ml-auto font-mono text-[10px] text-muted-foreground/70", collapsed && "hidden")}>⌘K</kbd>
      </button>
      <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
        <Avatar name={email} size="sm" />
        <div className={cn("min-w-0 flex-1 leading-tight", collapsed && "hidden")}>
          <p className="truncate text-[12.5px] font-medium text-foreground">{email || "User"}</p>
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{role || "user"}</p>
        </div>
        <button type="button" onClick={onLogout} title="Sign out" className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive", collapsed && "hidden")}><LogOut className="h-3.5 w-3.5" /></button>
      </div>
      {collapsed && <button type="button" onClick={onLogout} title="Sign out" className="mx-auto mt-2 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"><LogOut className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

const Sidebar = ({ drawerOpen = false, onDrawerClose }: { drawerOpen?: boolean; onDrawerClose?: () => void }) => {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(LS_KEY, collapsed ? "1" : "0"); } catch { /* noop */ } }, [collapsed]);
  const { user, logout, revokeCurrentToken } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const isCandidate = user?.role === "candidate";
  const onLogout = async () => { await revokeCurrentToken(); await logout(); navigate("/login"); };
  const openPalette = () => window.dispatchEvent(new Event("hiregen:open-palette"));

  const Header = ({ compact }: { compact: boolean }) => (
    <div className={cn("flex h-14 shrink-0 items-center justify-between px-4", compact && "justify-center px-0")}>
      {compact ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="Expand sidebar"
          aria-label="Expand sidebar"
          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-muted hover:text-foreground"
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
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-muted hover:text-foreground"
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
      <aside className={cn("relative z-20 hidden h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar md:flex", EASE)} style={{ width: collapsed ? 64 : 232 }}>
        <Header compact={collapsed} />
        <Nav collapsed={collapsed} isAdmin={isAdmin} isCandidate={isCandidate} />
        <Footer collapsed={collapsed} email={user?.email} role={user?.role} onLogout={onLogout} onCommand={openPalette} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-overlay md:hidden">
          <div className="absolute inset-0 bg-zinc-950/60 animate-overlay-in" onClick={onDrawerClose} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-drawer animate-drawer-in">
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <Logo size="md" />
              <button type="button" onClick={onDrawerClose} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
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
