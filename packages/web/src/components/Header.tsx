import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { admin } from "@/lib/api";
import { Bell, Menu, ArrowUpRight, CircleSlash2, ChevronDown, Search, Sun, Moon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Logo } from "@/components/Logo";
import { cn } from "@/components/ui/cn";
import { formatDateTime } from "@/lib/format";

const TITLES: Array<{ match: RegExp; title: string; section: string }> = [
  { match: /^\/dashboard/, title: "Home", section: "Home" },
  { match: /^\/jobs\/[^/]+/, title: "Job details", section: "Jobs" },
  { match: /^\/jobs/, title: "Job review", section: "Jobs" },
  { match: /^\/recommendations/, title: "Recommended jobs", section: "For you" },
  { match: /^\/applications/, title: "Application tracker", section: "Pipeline" },
  { match: /^\/saved/, title: "Saved jobs", section: "Pipeline" },
  { match: /^\/resume/, title: "Resume studio", section: "Documents" },
  { match: /^\/practice\/session\/[^/]+/, title: "Interview session", section: "Practice" },
  { match: /^\/practice/, title: "Interview practice", section: "Practice" },
  { match: /^\/learning/, title: "Learning tracks", section: "Practice" },
  { match: /^\/credits/, title: "Credits & plan", section: "Account" },
  { match: /^\/placements/, title: "Placement outcomes", section: "Account" },
  { match: /^\/preparation/, title: "Preparation workspace", section: "Practice" },
  { match: /^\/profile/, title: "Candidate profile", section: "Account" },
  { match: /^\/admin\/feedback/, title: "Candidate feedback", section: "Insights" },
  { match: /^\/admin\/practice/, title: "Practice subscriptions", section: "Insights" },
  { match: /^\/admin\/credits/, title: "Credits ledger", section: "Insights" },
  { match: /^\/leads\/[^/]+/, title: "Lead detail", section: "Pipeline" },
  { match: /^\/leads/, title: "Leads", section: "Pipeline" },
  { match: /^\/companies/, title: "Companies", section: "Data" },
  { match: /^\/contacts/, title: "Contacts", section: "Data" },
  { match: /^\/duplicates/, title: "Duplicates", section: "Insights" },
  { match: /^\/analytics/, title: "Analytics", section: "Insights" },
  { match: /^\/settings/, title: "Settings", section: "System" },
];

function usePageTitle(pathname: string): { title: string; section: string } {
  for (const t of TITLES) {
    if (t.match.test(pathname)) return t;
  }
  return { title: "HireGen", section: "Home" };
}

interface Run {
  id: string;
  run_type: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error?: string | null;
}

const Header = ({ onMenuClick }: { onMenuClick?: () => void }) => {
  const { user, logout, revokeCurrentToken } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === "admin";
  const isPlatformUser = isAdmin || user?.role === "candidate" || user?.role === "user";
  const pageTitle = isAdmin && /^\/jobs/.test(location.pathname) ? { title: 'Job review', section: 'Jobs' } : usePageTitle(location.pathname);

  const [runs, setRuns] = useState<Run[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('hiregen-theme') === 'dark'; } catch { return false; }
  });
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const runningCount = runs.filter((r) => !r.finished_at).length;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    try { localStorage.setItem('hiregen-theme', isDark ? 'dark' : 'light'); } catch { /* storage can be disabled */ }
  }, [isDark]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    const fetchRuns = async () => {
      try {
        const res = (await admin.getRuns(10)) as { runs?: Run[] };
        setRuns(res.runs ?? []);
      } catch {
        setRuns([]);
      }
    };
    fetchRuns();
    const interval = setInterval(fetchRuns, 30000);
    return () => clearInterval(interval);
  }, [user, isAdmin]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleLogout = async () => {
    await revokeCurrentToken();
    await logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo size="sm" />
      </div>

      {/* Breadcrumb identity */}
      <div className="hidden min-w-0 items-baseline gap-3 sm:flex">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
          {pageTitle.section}
        </span>
        <span aria-hidden className="h-3 w-px bg-border" />
        <p className="truncate text-[14px] font-semibold tracking-[-0.014em] text-foreground">
          {pageTitle.title}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => setIsDark((value) => !value)} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`} title={`Switch to ${isDark ? 'light' : 'dark'} theme`} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          type="button"
          data-tour="palette"
          onClick={() => window.dispatchEvent(new Event('HireGen:open-palette'))}
          className="mr-1 hidden min-w-[18rem] items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:flex"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search jobs, roles, or companies…</span>
          <kbd className="font-mono text-[10px] text-muted-foreground/70">⌘K</kbd>
        </button>
        {isAdmin && (
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Automation runs"
            >
              <Bell className="h-4 w-4" />
              {runningCount > 0 && (
                <span className="absolute -right-px -top-px h-2 w-2 rounded-full bg-signal ring-2 ring-background" aria-hidden />
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 origin-top-right overflow-hidden rounded-lg border border-border bg-surface shadow-popover animate-scale-in">
                <div className="border-b px-4 py-2.5">
                  <p className="eyebrow">Automation runs</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {runningCount > 0 ? `${runningCount} running now` : "All runs complete"}
                  </p>
                </div>
                <div className="max-h-72 overflow-y-auto p-1.5">
                  {runs.length === 0 && (
                    <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                      No runs yet
                    </p>
                  )}
                  {runs.map((run) => {
                    const done = !!run.finished_at;
                    return (
                      <div
                        key={run.id}
                        className="flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-accent"
                      >
                        {done ? (
                          <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-signal" aria-hidden />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium capitalize text-foreground">
                            {run.run_type.replace(/_/g, " ")}
                          </p>
                          <p className="font-mono text-[10.5px] text-muted-foreground">
                            {done
                              ? `done ${formatDateTime(run.finished_at)}`
                              : `started ${formatDateTime(run.started_at)}`}
                          </p>
                        </div>
                        {run.status === "failed" && (
                          <CircleSlash2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="relative" ref={userRef}>
          <button
            type="button"
            data-tour="user-menu"
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full p-1 pr-1.5 transition-colors hover:bg-accent"
          >
            <Avatar name={user?.email} size="sm" />
            <span className="hidden max-w-32 truncate text-[12.5px] font-medium text-foreground lg:block">
              {user?.email}
            </span>
            <ChevronDown className={cn("hidden h-3.5 w-3.5 text-muted-foreground transition-transform lg:block", userOpen && "rotate-180")} />
          </button>
          {userOpen && (
            <div className="absolute right-0 mt-2 w-52 origin-top-right overflow-hidden rounded-lg border border-border bg-surface shadow-popover animate-scale-in">
              <div className="border-b px-4 py-3">
                <p className="truncate text-[12.5px] font-medium text-foreground">{user?.email}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{user?.role}</p>
              </div>
              <button
                type="button"
                onClick={() => { setUserOpen(false); navigate('/welcome'); }}
                className="w-full px-4 py-2.5 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                View public preview
              </button>
              <button
                type="button"
                onClick={() => { setUserOpen(false); window.dispatchEvent(new Event("HireGen:replay-tour")); }}
                className="w-full px-4 py-2.5 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                Replay tutorial
              </button>
              <button
                type="button"
                onClick={() => { setUserOpen(false); window.dispatchEvent(new Event("HireGen:open-subscription")); }}
                className="w-full px-4 py-2.5 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                Subscription plans
              </button>
              <button
                type="button"
                onClick={() => { setUserOpen(false); window.dispatchEvent(new Event("HireGen:open-feedback")); }}
                className="w-full px-4 py-2.5 text-left text-[12.5px] font-medium text-foreground transition-colors hover:bg-accent"
              >
                Send feedback
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full px-4 py-2.5 text-left text-[12.5px] font-medium text-destructive transition-colors hover:bg-destructive-soft"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
