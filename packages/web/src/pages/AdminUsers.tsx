import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  Activity as ActivityIcon,
  ArrowRight,
  BadgeCheck,
  Ban,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock,
  Copy,
  Eye,
  FileText,
  Globe2,
  GraduationCap,
  KeyRound,
  Laptop,
  LogOut,
  Mail,
  MapPin,
  Mic,
  MonitorSmartphone,
  MousePointerClick,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Smartphone,
  Trash2,
  TrendingUp,
  UserCheck,
  UserCog,
  UserRound,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { userAdmin } from '@/lib/api';
import type {
  AdminUserDetail,
  AdminUserOverview,
  AdminUserRow,
  AdminVisitorRow,
} from '@/lib/admin-user-types';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

type Tab = 'overview' | 'users' | 'visitors';
type DetailTab = 'overview' | 'activity' | 'interviews' | 'applications' | 'manage';

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  sales_rep: 'Sales rep',
  viewer: 'Viewer',
  candidate: 'Candidate',
  user: 'Candidate',
};

const ROLE_OPTIONS = ['admin', 'sales_rep', 'viewer', 'candidate', 'user'];

const CHART_COLORS = [
  'hsl(var(--signal))',
  'hsl(var(--info))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--muted-foreground))',
];

const tooltipStyle = {
  borderRadius: 10,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--surface))',
  fontSize: 12,
};

function formatActiveTime(seconds?: number | null): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function relativeTime(value?: string | null): string {
  if (!value) return '—';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '—';
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

function shortDay(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function roleVariant(role?: string | null): 'primary' | 'info' | 'warning' | 'muted' | 'outline' {
  if (role === 'admin') return 'primary';
  if (role === 'candidate' || role === 'user') return 'info';
  if (role === 'sales_rep') return 'warning';
  return 'muted';
}

function statusVariant(status?: string | null): 'success' | 'danger' {
  return status === 'suspended' ? 'danger' : 'success';
}

function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function Pager({
  offset,
  limit,
  total,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}) {
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing <span className="font-medium text-foreground">{total === 0 ? 0 : offset + 1}</span>–
        <span className="font-medium text-foreground">{Math.min(offset + limit, total)}</span> of{' '}
        <span className="font-medium text-foreground">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="px-1 font-mono text-[11px]">Page {page} / {pages}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onChange(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}

function MiniBar({ value, max, tone = 'signal' }: { value: number; max: number; tone?: 'signal' | 'success' | 'info' }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  const color = tone === 'success' ? 'bg-success' : tone === 'info' ? 'bg-info' : 'bg-signal';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${width}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

const Overview = ({ days, onOpenUser }: { days: number; onOpenUser: (id: string) => void }) => {
  const { data, isLoading, error, refetch, isFetching } = useQuery(
    ['admin-users-overview', days],
    () => userAdmin.overview(days),
    { refetchInterval: 30000, keepPreviousData: true },
  );

  if (isLoading && !data) return <PageLoader label="Loading people analytics…" />;
  if (error && !data) {
    return <ErrorState title="People analytics unavailable" message={(error as Error).message} onRetry={() => refetch()} />;
  }
  if (!data) return null;

  const { totals, platform } = data;
  // `user` and `candidate` are both candidate accounts in this product; merge
  // them so the pie does not show two identical "Candidate" slices.
  const roleTotals = new Map<string, number>();
  data.roles.forEach((role) => {
    const name = ROLE_LABEL[role.role] || role.role;
    roleTotals.set(name, (roleTotals.get(name) || 0) + Number(role.count || 0));
  });
  const roleData = Array.from(roleTotals, ([name, value]) => ({ name, value }));
  const maxPageViews = Math.max(1, ...data.top_pages.map((page) => Number(page.views || 0)));
  const maxDevice = Math.max(1, ...data.devices.map((device) => Number(device.sessions || 0)));
  const maxCountry = Math.max(1, ...data.countries.map((country) => Number(country.visitors || 0)));
  const avgActivePerUser = totals.tracked_users > 0 ? totals.active_seconds / totals.tracked_users : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted-foreground">
          Live usage across accounts, visitors and product activity. Updates every 30 seconds.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total users"
          value={Number(totals.users || 0)}
          tone="primary"
          hint={`${totals.candidates || 0} candidate${Number(totals.candidates) === 1 ? '' : 's'} · ${totals.admins || 0} admin${Number(totals.admins) === 1 ? '' : 's'}`}
        />
        <StatCard
          icon={UserCheck}
          label="Active today"
          value={Number(totals.active_today || 0)}
          tone="success"
          hint={`${totals.active_now || 0} online in the last 5 min`}
        />
        <StatCard
          icon={Clock}
          label="Avg. active time"
          value={formatActiveTime(avgActivePerUser)}
          tone="info"
          hint={`${totals.tracked_users || 0} tracked user${Number(totals.tracked_users) === 1 ? '' : 's'} · last ${days} days`}
        />
        <StatCard
          icon={Eye}
          label="Page views"
          value={Number(totals.page_views || 0)}
          tone="info"
          hint={`${totals.unique_visitors || 0} unique visitors`}
        />
        <StatCard
          icon={MousePointerClick}
          label="Visits"
          value={Number(totals.visits || 0)}
          tone="muted"
          hint={`${formatActiveTime(totals.avg_session_seconds)} average session`}
        />
        <StatCard
          icon={TrendingUp}
          label="New this month"
          value={Number(totals.new_this_month || 0)}
          tone="success"
          hint={`${totals.new_7d || 0} joined in the last 7 days`}
        />
        <StatCard
          icon={Mic}
          label="Interviews"
          value={Number(totals.interviews || 0)}
          tone="warning"
          hint={`${totals.completed_interviews || 0} completed · ${days}d`}
        />
        <StatCard
          icon={BriefcaseBusiness}
          label="Applications"
          value={Number(totals.applications || 0)}
          tone="primary"
          hint={`${totals.suspended || 0} suspended account${Number(totals.suspended) === 1 ? '' : 's'}`}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Audience trend</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Active users and page views</h2>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Distinct people using the product each day, with page views on the right axis.
              </p>
            </div>
            <Badge variant="outline">{days} days</Badge>
          </div>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={shortDay}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={22}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={34}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => formatDate(String(value))} />
                <Bar
                  yAxisId="right"
                  dataKey="page_views"
                  name="Page views"
                  fill="hsl(var(--signal))"
                  opacity={0.16}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={26}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="active_users"
                  name="Active users"
                  stroke="hsl(var(--signal))"
                  strokeWidth={2.4}
                  dot={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="visits"
                  name="Visits"
                  stroke="hsl(var(--info))"
                  strokeWidth={1.6}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal" />Active users</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info" />Visits</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-signal/25" />Page views</span>
          </div>
        </section>

        <section className="card p-5">
          <p className="eyebrow">Account mix</p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Users by role</h2>
          <div className="mt-2 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={roleData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={3}
                  stroke="none"
                >
                  {roleData.map((entry, index) => (
                    <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {roleData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                <span className="truncate">{entry.name}</span>
                <span className="ml-auto font-mono text-foreground">{entry.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Content</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Most visited pages</h2>
            </div>
            <MousePointerClick className="h-[18px] w-[18px] text-muted-foreground/60" />
          </div>
          {data.top_pages.length ? (
            <div className="mt-4 space-y-3">
              {data.top_pages.map((page) => (
                <div key={page.path}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                    <span className="truncate font-medium text-foreground">{page.path}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{Number(page.views).toLocaleString()}</span>
                  </div>
                  <MiniBar value={Number(page.views)} max={maxPageViews} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] text-muted-foreground">Page views will appear here as people browse the site.</p>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Technology</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Devices</h2>
            </div>
            <MonitorSmartphone className="h-[18px] w-[18px] text-muted-foreground/60" />
          </div>
          {data.devices.length ? (
            <div className="mt-4 space-y-3">
              {data.devices.map((device) => (
                <div key={device.device}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                    <span className="inline-flex items-center gap-2 font-medium capitalize text-foreground">
                      {device.device === 'mobile' ? <Smartphone className="h-3.5 w-3.5" /> : device.device === 'tablet' ? <Laptop className="h-3.5 w-3.5" /> : <MonitorSmartphone className="h-3.5 w-3.5" />}
                      {device.device}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">{device.sessions} sessions</span>
                  </div>
                  <MiniBar value={Number(device.sessions)} max={maxDevice} tone="info" />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] text-muted-foreground">Device data appears after the first tracked visit.</p>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Geography</p>
              <Globe2 className="h-4 w-4 text-muted-foreground/60" />
            </div>
            {data.countries.length ? (
              <div className="mt-3 space-y-2.5">
                {data.countries.map((country) => (
                  <div key={country.country}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="font-medium text-foreground">{country.country === 'Unknown' ? 'Unknown / local' : country.country}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{country.visitors}</span>
                    </div>
                    <MiniBar value={Number(country.visitors)} max={maxCountry} tone="success" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12.5px] text-muted-foreground">Country is supplied by the hosting edge when available.</p>
            )}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Platform pulse</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Everything at a glance</h2>
            </div>
            <BarChart3 className="h-[18px] w-[18px] text-muted-foreground/60" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            {[
              { label: 'Active jobs', value: platform.active_jobs, icon: BriefcaseBusiness },
              { label: 'Interviews', value: platform.interviews_total, icon: Mic },
              { label: 'Applications', value: platform.applications_total, icon: FileText },
              { label: 'AI calls', value: platform.ai_calls, icon: ActivityIcon },
              { label: 'Prep artifacts', value: platform.preparation_artifacts, icon: GraduationCap },
              { label: 'Credits used', value: platform.credits_used, icon: Wallet },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-muted/25 px-3 py-2.5">
                <item.icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                <p className="mt-1.5 text-[18px] font-semibold leading-none tracking-[-0.02em]">{Number(item.value || 0).toLocaleString()}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
          {Number(platform.feedback_pending) > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-warning">
              <ShieldAlert className="h-3.5 w-3.5" />
              {platform.feedback_pending} feedback item{Number(platform.feedback_pending) === 1 ? '' : 's'} awaiting moderation
            </p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="eyebrow">Newest accounts</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Recent signups</h2>
            </div>
            <CalendarDays className="h-[18px] w-[18px] text-muted-foreground/60" />
          </div>
          <div className="divide-y divide-border border-t border-border">
            {data.recent_users.length ? data.recent_users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => onOpenUser(user.id)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <Avatar name={user.full_name || user.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-foreground">{user.full_name || user.email}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant={roleVariant(user.role)}>{ROLE_LABEL[user.role] || user.role}</Badge>
                <span className="hidden shrink-0 font-mono text-[10.5px] text-muted-foreground sm:block">{relativeTime(user.created_at)}</span>
              </button>
            )) : <p className="px-5 py-6 text-[12.5px] text-muted-foreground">No accounts yet.</p>}
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Engagement leaders</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Most active users</h2>
            </div>
            <TrendingUp className="h-[18px] w-[18px] text-muted-foreground/60" />
          </div>
          {data.top_users.length ? (
            <div className="mt-4 space-y-3">
              {data.top_users.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => onOpenUser(user.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/40"
                >
                  <span className="w-4 shrink-0 font-mono text-[11px] text-muted-foreground">{index + 1}</span>
                  <Avatar name={user.full_name || user.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">{user.full_name || user.email}</p>
                    <p className="text-[11px] text-muted-foreground">{user.sessions} session{user.sessions === 1 ? '' : 's'}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-foreground">{formatActiveTime(user.active_seconds)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[12.5px] text-muted-foreground">Active-time leaders appear once people start browsing.</p>
          )}
        </section>
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Daily engagement</p>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Signups, interviews and applications</h2>
          </div>
        </div>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={22} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => formatDate(String(value))} />
              <Bar dataKey="signups" name="Signups" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="interviews" name="Interviews" fill="hsl(var(--signal))" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="applications" name="Applications" fill="hsl(var(--info))" radius={[3, 3, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Users directory                                                            */
/* -------------------------------------------------------------------------- */

const UsersTab = ({ onOpenUser }: { onOpenUser: (id: string) => void }) => {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('last_active');
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, role, status, sort]);

  const { data, isLoading, error, refetch, isFetching } = useQuery(
    ['admin-users-list', debouncedSearch, role, status, sort, offset],
    () => userAdmin.list({
      search: debouncedSearch || undefined,
      role: role || undefined,
      status: status || undefined,
      sort,
      limit,
      offset,
    }),
    { keepPreviousData: true },
  );

  const rows = data?.data || [];
  const total = data?.pagination.total || 0;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_11rem_10rem_11rem_auto] xl:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, headline, location…"
            icon={<Search />}
            aria-label="Search users"
          />
          <Select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            <option value="candidate">Candidates</option>
            <option value="admin">Administrators</option>
            <option value="sales_rep">Sales reps</option>
            <option value="viewer">Viewers</option>
          </Select>
          <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort users">
            <option value="last_active">Recently active</option>
            <option value="active_time">Most active time</option>
            <option value="created">Newest accounts</option>
            <option value="name">Name A–Z</option>
            <option value="email">Email A–Z</option>
            <option value="interviews">Most interviews</option>
          </Select>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            <span className="sr-only sm:not-sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      <section className="card overflow-hidden">
        {isLoading && !data ? (
          <PageLoader label="Loading accounts…" />
        ) : error && !data ? (
          <ErrorState title="Accounts unavailable" message={(error as Error).message} onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No matching accounts"
            description="Try a different search term, role or status filter."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Person</th>
                    <th className="px-3 py-3 font-medium">Role</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Last active</th>
                    <th className="px-3 py-3 font-medium">Active time</th>
                    <th className="px-3 py-3 font-medium">Sessions</th>
                    <th className="px-3 py-3 font-medium">Interviews</th>
                    <th className="px-3 py-3 font-medium">Apps</th>
                    <th className="px-4 py-3 font-medium text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((user) => (
                    <tr key={user.id} className="group transition-colors hover:bg-muted/25">
                      <td className="max-w-[280px] px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={user.full_name || user.email} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-medium text-foreground">{user.full_name || user.email}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {user.email}
                              {user.headline ? ` · ${user.headline}` : ''}
                            </p>
                            {user.location && <p className="truncate text-[10.5px] text-muted-foreground/80">{user.location}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><Badge variant={roleVariant(user.role)}>{ROLE_LABEL[user.role] || user.role}</Badge></td>
                      <td className="px-3 py-3"><Badge variant={statusVariant(user.status)}>{user.status === 'suspended' ? 'Suspended' : 'Active'}</Badge></td>
                      <td className="px-3 py-3 text-[11.5px] text-muted-foreground">
                        <span className="font-medium text-foreground">{user.plan_name || user.plan_code || 'Free'}</span>
                        <span className="block font-mono text-[10.5px]">{user.credits ?? 0} credits</span>
                      </td>
                      <td className="px-3 py-3 text-[11.5px] text-muted-foreground" title={formatDateTime(user.last_active)}>{relativeTime(user.last_active)}</td>
                      <td className="px-3 py-3 font-mono text-[11.5px] text-foreground">{formatActiveTime(user.total_active_seconds)}</td>
                      <td className="px-3 py-3 font-mono text-[11.5px] text-muted-foreground">{user.session_count ?? 0}</td>
                      <td className="px-3 py-3 text-[11.5px]">
                        <span className="font-medium text-foreground">{user.interviews_total ?? 0}</span>
                        <span className="text-muted-foreground"> · {user.interviews_completed ?? 0} done</span>
                        {user.avg_score != null && <span className="block font-mono text-[10.5px] text-muted-foreground">{user.avg_score}% avg</span>}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11.5px] text-muted-foreground">{user.applications_total ?? 0}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => onOpenUser(user.id)}>
                          <UserCog className="h-3.5 w-3.5" />
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={offset} limit={limit} total={total} onChange={setOffset} />
          </>
        )}
      </section>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Visitors                                                                   */
/* -------------------------------------------------------------------------- */

const VisitorsTab = () => {
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | 'anonymous' | 'registered'>('all');
  const [offset, setOffset] = useState(0);
  const limit = 25;
  const debouncedSearch = useDebouncedValue(search);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, type]);

  const { data, isLoading, error, refetch, isFetching } = useQuery(
    ['admin-visitors', debouncedSearch, type, offset],
    () => userAdmin.visitors({
      search: debouncedSearch || undefined,
      type,
      limit,
      offset,
    }),
    { keepPreviousData: true },
  );

  const rows = data?.data || [];
  const stats = data?.stats;
  const total = data?.pagination.total || 0;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Globe2} label="Unique visitors" value={Number(stats?.visitors || 0)} tone="primary" hint="Last 30 days" />
        <StatCard icon={MousePointerClick} label="Sessions" value={Number(stats?.sessions || 0)} tone="info" hint="Browser tab sessions" />
        <StatCard icon={UserRound} label="Anonymous" value={Number(stats?.anonymous_visitors || 0)} tone="warning" hint="Not signed in" />
        <StatCard icon={Clock} label="Avg. session" value={formatActiveTime(stats?.avg_seconds)} tone="success" hint="Visible-tab time" />
      </section>

      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_auto] xl:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search visitor, email, page or referrer…"
            icon={<Search />}
            aria-label="Search visitors"
          />
          <Select value={type} onChange={(event) => setType(event.target.value as typeof type)} aria-label="Filter visitor type">
            <option value="all">All visitors</option>
            <option value="anonymous">Anonymous only</option>
            <option value="registered">Signed-in only</option>
          </Select>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <section className="card overflow-hidden">
        {isLoading && !data ? (
          <PageLoader label="Loading visitor sessions…" />
        ) : error && !data ? (
          <ErrorState title="Visitor data unavailable" message={(error as Error).message} onRetry={() => refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Globe2}
            title="No visitor sessions yet"
            description="Anonymous and signed-in sessions appear here as soon as someone opens the site."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Visitor</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Pages</th>
                    <th className="px-3 py-3 font-medium">Active</th>
                    <th className="px-3 py-3 font-medium">Entry / last page</th>
                    <th className="px-3 py-3 font-medium">Device</th>
                    <th className="px-3 py-3 font-medium">Country</th>
                    <th className="px-3 py-3 font-medium">First seen</th>
                    <th className="px-4 py-3 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((visitor) => (
                    <tr key={visitor.session_id} className="transition-colors hover:bg-muted/25">
                      <td className="max-w-[230px] px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={visitor.full_name || visitor.email || visitor.visitor_id} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-medium text-foreground">
                              {visitor.full_name || visitor.email || 'Anonymous visitor'}
                            </p>
                            <p className="truncate font-mono text-[10.5px] text-muted-foreground">{visitor.visitor_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={visitor.user_id ? 'success' : 'muted'}>{visitor.user_id ? 'Signed in' : 'Anonymous'}</Badge>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11.5px] text-foreground">{visitor.page_views}</td>
                      <td className="px-3 py-3 font-mono text-[11.5px] text-foreground">{formatActiveTime(visitor.active_seconds)}</td>
                      <td className="max-w-[230px] px-3 py-3 text-[11px] text-muted-foreground">
                        <p className="truncate" title={visitor.entry_path}>{visitor.entry_path}</p>
                        <p className="truncate text-[10.5px] text-muted-foreground/80" title={visitor.last_path}>{visitor.last_path}</p>
                        {visitor.referrer && <p className="truncate text-[10px] text-muted-foreground/70">from {visitor.referrer}</p>}
                      </td>
                      <td className="px-3 py-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          {visitor.device === 'mobile' ? <Smartphone className="h-3.5 w-3.5" /> : <Laptop className="h-3.5 w-3.5" />}
                          {visitor.device} · {visitor.browser}
                        </span>
                        <span className="block text-[10.5px] text-muted-foreground/80">{visitor.os}</span>
                      </td>
                      <td className="px-3 py-3 text-[11.5px] text-muted-foreground">{visitor.country || '—'}</td>
                      <td className="px-3 py-3 text-[11.5px] text-muted-foreground" title={formatDateTime(visitor.started_at)}>{relativeTime(visitor.started_at)}</td>
                      <td className="px-4 py-3 text-[11.5px] text-muted-foreground" title={formatDateTime(visitor.last_seen_at)}>{relativeTime(visitor.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager offset={offset} limit={limit} total={total} onChange={setOffset} />
          </>
        )}
      </section>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* User detail + account management                                           */
/* -------------------------------------------------------------------------- */

function DetailStat({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-muted/25 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
      <p className="mt-1 text-[16px] font-semibold leading-none tracking-[-0.015em]">{value}</p>
    </div>
  );
}

const ManageTab = ({ detail, onDeleted }: { detail: AdminUserDetail; onDeleted: () => void }) => {
  const client = useQueryClient();
  const { toast } = useToast();
  const user = detail.user;
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState<'active' | 'suspended'>(user.status || 'active');
  const [fullName, setFullName] = useState(user.full_name || '');
  const [headline, setHeadline] = useState(user.headline || '');
  const [location, setLocation] = useState(user.location || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setRole(user.role);
    setStatus(user.status || 'active');
    setFullName(user.full_name || '');
    setHeadline(user.headline || '');
    setLocation(user.location || '');
    setPhone(user.phone || '');
    setTemporaryPassword(null);
    setConfirmEmail('');
    setConfirmDelete(false);
  }, [user.id, user.role, user.status, user.full_name, user.headline, user.location, user.phone]);

  const invalidate = () => {
    client.invalidateQueries('admin-user');
    client.invalidateQueries('admin-users-list');
    client.invalidateQueries('admin-users-overview');
    client.invalidateQueries('admin-visitors');
  };

  const save = useMutation(
    () => userAdmin.update(user.id, {
      role,
      status,
      full_name: fullName,
      headline,
      location,
      phone,
    }),
    {
      onSuccess: () => {
        invalidate();
        toast({ title: 'Account updated', description: 'Role, status and profile details were saved.', variant: 'success' });
      },
      onError: (err: Error) => toast({ title: 'Update failed', description: err.message, variant: 'error' }),
    },
  );

  const revoke = useMutation(
    () => userAdmin.update(user.id, { revoke_sessions: true }),
    {
      onSuccess: () => {
        invalidate();
        toast({ title: 'Sessions revoked', description: `${user.email} must sign in again on every device.`, variant: 'success' });
      },
      onError: (err: Error) => toast({ title: 'Could not revoke sessions', description: err.message, variant: 'error' }),
    },
  );

  const reset = useMutation(
    () => userAdmin.resetPassword(user.id),
    {
      onSuccess: (result) => {
        setTemporaryPassword(result.password);
        invalidate();
        toast({ title: 'Password reset', description: result.message, variant: 'success' });
      },
      onError: (err: Error) => toast({ title: 'Password reset failed', description: err.message, variant: 'error' }),
    },
  );

  const remove = useMutation(
    () => userAdmin.remove(user.id, confirmEmail.trim()),
    {
      onSuccess: () => {
        invalidate();
        toast({ title: 'Account deleted', description: `${user.email} and their candidate data were removed.`, variant: 'success' });
        onDeleted();
      },
      onError: (err: Error) => toast({ title: 'Deletion failed', description: err.message, variant: 'error' }),
    },
  );

  const copyPassword = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      toast({ title: 'Copied', description: 'Temporary password copied to the clipboard.', variant: 'info' });
    } catch {
      toast({ title: 'Copy failed', description: 'Select the password and copy it manually.', variant: 'error' });
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div>
          <p className="eyebrow">Account controls</p>
          <h3 className="mt-1 text-[14px] font-semibold">Role, status and profile</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground" htmlFor="manage-role">Role</label>
            <Select id="manage-role" value={role} onChange={(event) => setRole(event.target.value)}>
              {ROLE_OPTIONS.map((option) => <option key={option} value={option}>{ROLE_LABEL[option] || option}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground" htmlFor="manage-status">Status</label>
            <Select id="manage-status" value={status} onChange={(event) => setStatus(event.target.value as 'active' | 'suspended')}>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground" htmlFor="manage-name">Full name</label>
            <Input id="manage-name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Candidate name" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground" htmlFor="manage-headline">Headline</label>
            <Input id="manage-headline" value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Frontend developer" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground" htmlFor="manage-location">Location</label>
            <Input id="manage-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Bengaluru, India" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground" htmlFor="manage-phone">Phone</label>
            <Input id="manage-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 …" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} loading={save.isLoading}>
            <Check className="h-4 w-4" />Save changes
          </Button>
          <Button variant="outline" onClick={() => revoke.mutate()} loading={revoke.isLoading}>
            <LogOut className="h-4 w-4" />Sign out everywhere
          </Button>
        </div>
      </section>

      <section className="border-t border-border pt-5">
        <p className="eyebrow">Security</p>
        <h3 className="mt-1 text-[14px] font-semibold">Reset password</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Generates a one-time password and signs the account out of every device. Share it through a secure channel.
        </p>
        <Button className="mt-3" variant="outline" onClick={() => reset.mutate()} loading={reset.isLoading}>
          <KeyRound className="h-4 w-4" />Generate temporary password
        </Button>
        {temporaryPassword && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft/50 px-3.5 py-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-warning">One-time password</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all font-mono text-[13px] text-foreground">{temporaryPassword}</code>
              <Button variant="outline" size="icon-sm" onClick={copyPassword} aria-label="Copy temporary password">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">This value is shown once and cannot be retrieved later.</p>
          </div>
        )}
      </section>

      <section className="border-t border-border pt-5">
        <p className="eyebrow text-destructive">Danger zone</p>
        <h3 className="mt-1 text-[14px] font-semibold">Delete account</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          Permanently removes the account, profile, applications, interview history, credits and activity. This cannot be undone.
        </p>
        {!confirmDelete ? (
          <Button className="mt-3" variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-4 w-4" />Delete account
          </Button>
        ) : (
          <div className="mt-3 space-y-2.5 rounded-lg border border-destructive/25 bg-destructive-soft/30 p-3.5">
            <p className="text-[12px] text-foreground">
              Type <span className="font-mono font-semibold">{user.email}</span> to confirm.
            </p>
            <Input
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              placeholder={user.email}
              aria-label="Confirm account email"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={() => remove.mutate()}
                loading={remove.isLoading}
                disabled={confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()}
              >
                <Trash2 className="h-4 w-4" />Permanently delete
              </Button>
              <Button variant="ghost" onClick={() => { setConfirmDelete(false); setConfirmEmail(''); }}>Cancel</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const UserDetailModal = ({ userId, onClose }: { userId: string | null; onClose: () => void }) => {
  const [tab, setTab] = useState<DetailTab>('overview');
  const { data, isLoading, error, refetch } = useQuery(
    ['admin-user', userId],
    () => userAdmin.detail(userId as string),
    { enabled: !!userId },
  );

  useEffect(() => {
    if (userId) setTab('overview');
  }, [userId]);

  const detail = data;
  const user = detail?.user;
  const tabs: Array<{ id: DetailTab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Profile', icon: UserRound },
    { id: 'activity', label: 'Activity', icon: ActivityIcon },
    { id: 'interviews', label: 'Interviews', icon: Mic },
    { id: 'applications', label: 'Applications', icon: FileText },
    { id: 'manage', label: 'Manage', icon: UserCog },
  ];

  return (
    <Modal
      open={!!userId}
      onClose={onClose}
      size="xl"
      title={user ? (user.full_name || user.email) : 'Account details'}
      description={user ? `${user.email} · ${ROLE_LABEL[user.role] || user.role}` : 'Loading account…'}
    >
      {isLoading && !detail ? (
        <PageLoader label="Loading account…" />
      ) : error && !detail ? (
        <ErrorState title="Account unavailable" message={(error as Error).message} onRetry={() => refetch()} />
      ) : !detail || !user ? null : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={user.full_name || user.email} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={roleVariant(user.role)}>{ROLE_LABEL[user.role] || user.role}</Badge>
                <Badge variant={statusVariant(user.status)}>{user.status === 'suspended' ? 'Suspended' : 'Active'}</Badge>
                <Badge variant="outline">{user.plan_name || user.plan_code || 'Free'} plan</Badge>
              </div>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Joined {formatDate(user.created_at)} · last active {relativeTime(user.last_active || user.last_seen_at)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors',
                  tab === item.id
                    ? 'bg-primary-soft text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <DetailStat label="Active time" value={formatActiveTime(detail.activity.active_seconds)} icon={Clock} />
                <DetailStat label="Sessions" value={detail.activity.sessions || 0} icon={MousePointerClick} />
                <DetailStat label="Page views" value={detail.activity.page_views || 0} icon={Eye} />
                <DetailStat label="Credits" value={user.credits ?? 0} icon={Wallet} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3.5">
                  <p className="eyebrow">Contact</p>
                  <div className="mt-2 space-y-2 text-[12.5px]">
                    <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{user.email}</p>
                    <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{user.phone || 'No phone on file'}</p>
                    <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{user.location || 'No location on file'}</p>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3.5">
                  <p className="eyebrow">Career profile</p>
                  <div className="mt-2 space-y-2 text-[12.5px]">
                    <p className="flex items-center gap-2"><BriefcaseBusiness className="h-3.5 w-3.5 text-muted-foreground" />{user.headline || 'No headline'}</p>
                    <p className="flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />{user.education_level || 'Education not set'}</p>
                    <p className="flex items-center gap-2"><BadgeCheck className="h-3.5 w-3.5 text-muted-foreground" />{user.experience_years ?? 0} years experience</p>
                  </div>
                </div>
              </div>
              {user.summary && (
                <div className="rounded-lg border border-border p-3.5">
                  <p className="eyebrow">Summary</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{user.summary}</p>
                </div>
              )}
              {!!user.skills?.length && (
                <div className="rounded-lg border border-border p-3.5">
                  <p className="eyebrow">Skills</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {user.skills.map((skill) => <Badge key={skill} variant="outline">{skill}</Badge>)}
                  </div>
                </div>
              )}
              <div className="grid gap-2 text-[11.5px] text-muted-foreground sm:grid-cols-2">
                <p>Last login: <span className="text-foreground">{formatDateTime(user.last_login_at)}</span></p>
                <p>Last seen: <span className="text-foreground">{formatDateTime(user.last_seen_at)}</span></p>
                <p>Lifetime credits: <span className="text-foreground">{user.lifetime_granted ?? 0} granted · {user.lifetime_used ?? 0} used</span></p>
                <p>Resume: <span className="text-foreground">{user.resume_filename || 'Not uploaded'}</span></p>
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <DetailStat label="Last 30 days" value={formatActiveTime(detail.activity.active_seconds_30d)} icon={Clock} />
                <DetailStat label="Sessions (30d)" value={detail.activity.sessions_30d || 0} icon={MousePointerClick} />
                <DetailStat label="Avg. session" value={formatActiveTime(detail.activity.avg_session_seconds)} icon={TrendingUp} />
                <DetailStat label="Last seen" value={relativeTime(detail.activity.last_seen)} icon={Eye} />
              </div>
              <div className="rounded-lg border border-border p-3.5">
                <p className="eyebrow">Daily active time</p>
                <div className="mt-3 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={detail.daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="userActiveFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--signal))" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(var(--signal))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="day" tickFormatter={shortDay} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} minTickGap={22} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={34} />
                      <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => formatDate(String(value))} />
                      <Area type="monotone" dataKey="active_seconds" name="Active seconds" stroke="hsl(var(--signal))" fill="url(#userActiveFill)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-border p-3.5">
                  <p className="eyebrow">Recent pages</p>
                  <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {detail.recent_pages.length ? detail.recent_pages.map((page, index) => (
                      <div key={`${page.path}-${page.created_at}-${index}`} className="flex items-center gap-2 text-[11.5px]">
                        <span className="truncate font-mono text-foreground">{page.path}</span>
                        <span className="ml-auto shrink-0 text-[10.5px] text-muted-foreground">{relativeTime(page.created_at)}</span>
                      </div>
                    )) : <p className="text-[12px] text-muted-foreground">No page views recorded yet.</p>}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3.5">
                  <p className="eyebrow">Browser sessions</p>
                  <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {detail.sessions.length ? detail.sessions.map((session) => (
                      <div key={session.session_id} className="text-[11.5px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-foreground">{formatActiveTime(session.active_seconds)} · {session.page_views} pages</span>
                          <span className="text-[10.5px] text-muted-foreground">{relativeTime(session.last_seen_at)}</span>
                        </div>
                        <p className="truncate text-[10.5px] text-muted-foreground">{session.device} · {session.browser} · {session.os}{session.country ? ` · ${session.country}` : ''}</p>
                      </div>
                    )) : <p className="text-[12px] text-muted-foreground">No browser sessions recorded yet.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'interviews' && (
            <div className="space-y-2">
              {detail.interviews.length ? detail.interviews.map((interview) => (
                <div key={interview.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">{interview.role_focus}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {interview.difficulty} · {interview.question_count} questions · {formatDate(interview.started_at)}
                    </p>
                  </div>
                  <Badge variant={interview.status === 'completed' ? 'success' : interview.status === 'in_progress' ? 'warning' : 'muted'}>
                    {interview.status.replace('_', ' ')}
                  </Badge>
                  <span className="font-mono text-[12px] font-medium text-foreground">{interview.overall_score != null ? `${interview.overall_score}%` : '—'}</span>
                </div>
              )) : <EmptyState icon={Mic} title="No interviews yet" description="This account has not started a practice interview." />}
            </div>
          )}

          {tab === 'applications' && (
            <div className="space-y-2">
              {detail.applications.length ? detail.applications.map((application) => (
                <div key={application.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-foreground">{application.job_title || 'Untitled role'}</p>
                    <p className="text-[11px] text-muted-foreground">{application.company_name || 'Unknown company'} · updated {formatDate(application.updated_at)}</p>
                  </div>
                  <Badge variant="outline">{application.status.replace(/_/g, ' ')}</Badge>
                </div>
              )) : <EmptyState icon={FileText} title="No applications yet" description="Tracked job applications will appear here." />}
            </div>
          )}

          {tab === 'manage' && <ManageTab detail={detail} onDeleted={onClose} />}
        </div>
      )}
    </Modal>
  );
};

/* -------------------------------------------------------------------------- */
/* Page shell                                                                 */
/* -------------------------------------------------------------------------- */

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'visitors', label: 'Visitors', icon: Globe2 },
];

const AdminUsers: React.FC = () => {
  const [tab, setTab] = useState<Tab>('overview');
  const [days, setDays] = useState(30);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="People & activity"
        description="Manage every account, see who is active, and understand how candidates and visitors use the platform."
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onChange={(event) => setDays(Number(event.target.value))} aria-label="Date range">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </Select>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-colors',
              tab === item.id
                ? 'bg-primary-soft text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview days={days} onOpenUser={setSelectedUser} />}
      {tab === 'users' && <UsersTab onOpenUser={setSelectedUser} />}
      {tab === 'visitors' && <VisitorsTab />}

      <UserDetailModal userId={selectedUser} onClose={() => setSelectedUser(null)} />
    </div>
  );
};

export default AdminUsers;
