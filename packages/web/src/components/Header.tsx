import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { admin } from "@/lib/api";
import { Bell, Menu, CheckCircle2, Loader2, XCircle, ChevronDown, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { formatDateTime } from "@/lib/format";

const TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/dashboard/, title: "Dashboard" },
  { match: /^\/leads\/[^/]+/, title: "Lead detail" },
  { match: /^\/leads/, title: "Leads" },
  { match: /^\/companies/, title: "Companies" },
  { match: /^\/contacts/, title: "Contacts" },
  { match: /^\/duplicates/, title: "Duplicates" },
  { match: /^\/analytics/, title: "Analytics" },
  { match: /^\/settings/, title: "Settings" },
];

function usePageTitle(pathname: string): string {
  for (const t of TITLES) {
    if (t.match.test(pathname)) return t.title;
  }
  return "Take It";
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
  const title = usePageTitle(location.pathname);

  const isAdmin = user?.role === "admin";

  const [runs, setRuns] = useState<Run[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const runningCount = runs.filter((r) => !r.finished_at).length;

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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0">
        <p className="text-gradient text-[15px] font-semibold tracking-tight sm:text-base">
          {title}
        </p>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Lead intelligence &amp; outreach
        </p>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event('hiregen:open-palette'))}
          className="mr-1 hidden items-center gap-2 rounded-lg border border-border bg-surface/60 px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:flex"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search…</span>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>
        </button>
        {isAdmin && (
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Automation runs"
            >
              <Bell className="h-[18px] w-[18px]" />
              {runningCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {runningCount > 9 ? "9+" : runningCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl border border-border bg-surface shadow-popover animate-scale-in">
                <div className="border-b px-4 py-2.5">
                  <p className="text-[13px] font-semibold">Automation runs</p>
                  <p className="text-xs text-muted-foreground">
                    {runningCount > 0 ? `${runningCount} running now` : "All runs complete"}
                  </p>
                </div>
                <div className="max-h-72 overflow-y-auto p-1.5">
                  {runs.length === 0 && (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No runs yet
                    </p>
                  )}
                  {runs.map((run) => {
                    const done = !!run.finished_at;
                    return (
                      <div
                        key={run.id}
                        className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent"
                      >
                        {done ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        ) : (
                          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium capitalize">
                            {run.run_type.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {done
                              ? `Finished ${formatDateTime(run.finished_at)}`
                              : `Started ${formatDateTime(run.started_at)}`}
                          </p>
                        </div>
                        {run.status === "failed" && (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
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
            onClick={() => setUserOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full p-1 pr-2 transition-colors hover:bg-accent"
          >
            <Avatar name={user?.email} size="sm" />
            <span className="hidden max-w-32 truncate text-[13px] font-medium text-foreground lg:block">
              {user?.email}
            </span>
            <ChevronDown className={cn("hidden h-4 w-4 text-muted-foreground transition-transform lg:block", userOpen && "rotate-180")} />
          </button>
          {userOpen && (
            <div className="absolute right-0 mt-2 w-52 origin-top-right rounded-xl border border-border bg-surface shadow-popover animate-scale-in">
              <div className="border-b px-4 py-3">
                <p className="truncate text-[13px] font-semibold text-foreground">{user?.email}</p>
                <p className="text-xs capitalize text-muted-foreground">{user?.role}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-b-xl px-4 py-2.5 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive-soft"
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