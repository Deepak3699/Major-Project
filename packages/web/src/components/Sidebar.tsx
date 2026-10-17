import React, { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import {
  LayoutDashboard, Users, Building2, Contact, GitMerge, TrendingUp,
  Settings as SettingsIcon, LogOut, Search, PanelLeft, Radar,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/components/ui/cn";
import { Avatar } from "@/components/ui/avatar";

type IconType = typeof Users;
const SECTIONS: { label: string; items: { to: string; label: string; icon: IconType }[] }[] = [
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
          "group relative flex h-9 items-center gap-2.5 rounded-lg text-[13px] font-medium",
          collapsed ? "justify-center px-0" : "px-2.5",
          "text-sidebar-foreground hover:text-foreground hover:bg-sidebar-muted",
          isActive && "!bg-primary/15 !text-sidebar-active-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* left accent bar when active */}
          <span className={cn("absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-[image:var(--grad-primary)] transition-opacity", isActive ? "opacity-100" : "opacity-0")} />
          <Icon className={cn("h-[18px] w-[18px] shrink-0", isActive && "text-primary")} strokeWidth={isActive ? 2.3 : 1.9} />
          <span className={cn("truncate", collapsed && "hidden")}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

function Nav({ collapsed, isAdmin, onNavigate }: { collapsed: boolean; isAdmin: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto px-2 py-2">
      {SECTIONS.map((sec) => (
        <div key={sec.label}>
          {!collapsed && <p className={cn("px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60", EASE)}>{sec.label}</p>}
          {collapsed && <div className="mx-1 my-1.5 h-px bg-sidebar-border" />}
          <div className="flex flex-col gap-0.5">
            {sec.items.map((it) => <NavItem key={it.to} {...it} collapsed={collapsed} onNavigate={onNavigate} />)}
          </div>
        </div>
      ))}
      {isAdmin && (
        <div>
          {!collapsed && <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">System</p>}
          {collapsed && <div className="mx-1 my-1.5 h-px bg-sidebar-border" />}
          <NavItem to="/settings" label="Settings" icon={SettingsIcon} collapsed={collapsed} onNavigate={onNavigate} />
        </div>
      )}
    </nav>
  );
}

function Footer({ collapsed, email, role, onLogout, onCommand }: { collapsed: boolean; email?: string | null; role?: string | null; onLogout: () => void; onCommand: () => void }) {
  return (
    <div className="border-t border-sidebar-border p-2">
      <button
        type="button"
        onClick={onCommand}
        title="Command palette (⌘K)"
        className={cn("mb-1.5 flex h-9 w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-muted/40 text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground", collapsed ? "justify-center px-0" : "px-2.5")}
      >
        <Search className="h-4 w-4" />
        <span className={cn("text-[13px]", collapsed && "hidden")}>Search…</span>
        <kbd className={cn("ml-auto rounded border border-sidebar-border bg-surface px-1.5 py-0.5 text-[10px]", collapsed && "hidden")}>⌘K</kbd>
      </button>
      <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
        <Avatar name={email} size="sm" />
        <div className={cn("min-w-0 flex-1 leading-tight", collapsed && "hidden")}>
          <p className="truncate text-[12.5px] font-medium text-foreground">{email || "User"}</p>
          <p className="truncate text-[11px] capitalize text-muted-foreground">{role || "user"}</p>
        </div>
        <button type="button" onClick={onLogout} title="Sign out" className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive", collapsed && "hidden")}><LogOut className="h-4 w-4" /></button>
      </div>
      {collapsed && <button type="button" onClick={onLogout} title="Sign out" className="mx-auto mt-1.5 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"><LogOut className="h-4 w-4" /></button>}
    </div>
  );
}

const Sidebar = ({ drawerOpen = false, onDrawerClose }: { drawerOpen?: boolean; onDrawerClose?: () => void }) => {
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem(LS_KEY, collapsed ? "1" : "0"); } catch { /* noop */ } }, [collapsed]);
  const { user, logout, revokeCurrentToken } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const onLogout = async () => { await revokeCurrentToken(); await logout(); navigate("/login"); };
  const openPalette = () => window.dispatchEvent(new Event("hiregen:open-palette"));

  const Header = ({ compact }: { compact: boolean }) => (
    <div className={cn("flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3", compact && "justify-center px-2")}>
      <button type="button" onClick={() => setCollapsed((c) => !c)} title={compact ? "Expand sidebar" : "Collapse sidebar"} aria-label={compact ? "Expand sidebar" : "Collapse sidebar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-muted hover:text-foreground">
        <PanelLeft className={cn("h-[18px] w-[18px] transition-transform duration-200", compact && "rotate-180")} />
      </button>
      <div className={cn("min-w-0 overflow-hidden", compact && "w-0 opacity-0")}>
        <Logo />
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className={cn("relative z-20 hidden h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar md:flex", EASE)} style={{ width: collapsed ? 68 : 232 }}>
        <Header compact={collapsed} />
        <Nav collapsed={collapsed} isAdmin={isAdmin} />
        <Footer collapsed={collapsed} email={user?.email} role={user?.role} onLogout={onLogout} onCommand={openPalette} />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-overlay md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-overlay-in" onClick={onDrawerClose} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-float animate-drawer-in">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
              <Logo />
              <button type="button" onClick={onDrawerClose} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Radar className="h-4 w-4 opacity-0" /><span className="-ml-4 text-xl leading-none">×</span></button>
            </div>
            <Nav collapsed={false} isAdmin={isAdmin} onNavigate={onDrawerClose} />
            <Footer collapsed={false} email={user?.email} role={user?.role} onLogout={onLogout} onCommand={openPalette} />
          </aside>
        </div>
      )}
    </>
  );
};

export default Sidebar;
