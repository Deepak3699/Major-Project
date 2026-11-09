import React from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  Cell, PieChart, Pie, BarChart, Bar,
} from 'recharts';
import { dashboard, admin, CreditUsageResponse, RunLog } from '@/lib/api';
import { useSSE, isLeadLifecycleEvent } from '@/hooks/useSSE';
import { useAuthStore } from '@/stores/auth';
import {
  Users, Flame, Sun, Snowflake, ShieldAlert, Zap, Activity, BarChart3,
  CheckCircle2, Clock, AlertTriangle, Sparkles, MailCheck, Radar, Radio,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { Card, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { PageLoader } from '@/components/ui/spinner';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/format';

const STAGE_LABELS: Record<string, string> = {
  discovered: 'Discovered', enriching: 'Enriching', enriched: 'Enriched',
  verifying: 'Verifying', verified: 'Verified', ready_for_outreach: 'Ready',
  message_generated: 'Messaged', drafted: 'Drafted', send_pending: 'Sending',
  contacted: 'Contacted', sent: 'Sent', delivered: 'Delivered', replied: 'Replied',
  converted: 'Converted', bounced: 'Bounced', contact_unavailable: 'No contact',
  suppressed: 'Suppressed', send_failed: 'Send failed', provider_error: 'Provider error',
  retry_pending: 'Retrying', enrichment_failed: 'Enrich failed', verification_failed: 'Verify failed',
};

// Chart series palette built from theme tokens, cycled so every stage keeps
// a distinct fill in both themes.
const TOKEN_PALETTE = [
  'hsl(var(--signal))',
  'hsl(var(--success))',
  'hsl(var(--info))',
  'hsl(var(--warning))',
  'hsl(var(--destructive))',
  'hsl(var(--muted-foreground))',
];

const STAGE_TOKENS: Record<string, number> = {
  discovered: 0, enriching: 1, enriched: 2, verifying: 3, verified: 4,
  ready_for_outreach: 5, message_generated: 0, drafted: 1, send_pending: 2,
  contacted: 3, sent: 4, delivered: 5, replied: 0, converted: 1,
  bounced: 2, contact_unavailable: 3, suppressed: 4, send_failed: 5,
  provider_error: 0, retry_pending: 1, enrichment_failed: 2, verification_failed: 3,
};
const stageColor = (stage: string) => TOKEN_PALETTE[STAGE_TOKENS[stage] ?? 5];

// One bordered tooltip reused by every chart.
function ChartTip(props: any) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-popover">
      {label != null && <p className="mb-1 font-medium capitalize text-muted-foreground">{String(label)}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="font-mono tabular-nums text-foreground">
          <span style={{ color: p.color || p.fill }}>{p.name}: </span>{p.value}
        </p>
      ))}
    </div>
  );
}

// Lead-count breakdown rows: dot, label, mono count.
function LegendList({
  items,
  colors,
}: {
  items: Array<{ name: string; value: number }>;
  colors: Array<{ name: string; fill: string }>;
}) {
  return (
    <div className="w-full space-y-2 text-sm">
      {items.map((d) => {
        const fill = colors.find((c) => c.name === d.name)?.fill;
        return (
          <div key={d.name} className="flex items-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: fill }} />
            <span className="text-muted-foreground">{d.name}</span>
            <span className="ml-auto font-mono text-[13px] font-medium tabular-nums text-foreground">{d.value}</span>
          </div>
        );
      })}
    </div>
  );
}

const Dashboard: React.FC = () => {
  const { data, isLoading, error, refetch } = useQuery('dashboard-stats', () => dashboard.stats(), { refetchInterval: 15000 });
  const { data: creditData } = useQuery('dashboard-credits', () => dashboard.credits(), { refetchInterval: 15000 });
  const { data: armyStatus } = useQuery('army-status', () => admin.armyStatus(), { refetchInterval: 4000 });
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const queryClient = useQueryClient();
  const { data: runsData } = useQuery('dashboard-runs', () => admin.getRuns(8), { refetchInterval: 15000, enabled: isAdmin });

  const armyMutation = useMutation(() => admin.runArmy(), {
    onSuccess: (d: any) => {
      queryClient.invalidateQueries('army-status');
      queryClient.invalidateQueries('dashboard-stats');
    },
  });

  useSSE('/sse/token', (event) => {
    if (isLeadLifecycleEvent(event.type)) {
      refetch();
      queryClient.invalidateQueries('dashboard-credits');
    }
  });

  if (isLoading) return <PageLoader label="Loading dashboard…" />;
  if (error) return <ErrorState title="Error loading dashboard" message={(error as Error).message} onRetry={() => refetch()} />;

  const totals = data?.totals || { total_leads: 0, hot: 0, warm: 0, cold: 0, do_not_contact: 0 };
  const credits: CreditUsageResponse | undefined = creditData as CreditUsageResponse | undefined;
  const runs: RunLog[] = (runsData as any)?.runs || (runsData as any) || [];
  const creditPercent = credits ? Math.min((credits.used / credits.limit) * 100, 100) : 0;
  const creditTone = creditPercent > 80 ? 'bg-destructive' : creditPercent > 50 ? 'bg-warning' : 'bg-success';

  const funnel = (data?.funnel || {}) as Record<string, number>;
  const funnelData = Object.entries(funnel).map(([stage, count]) => ({
    stage: STAGE_LABELS[stage] || stage,
    full: stage,
    count: count as number,
  }));
  const maxCount = Math.max(...funnelData.map((d) => d.count), 1);
  const totalLeads = Object.values(funnel).reduce((a, b) => a + (b as number), 0);

  const bandData = [
    { name: 'Hot', value: totals.hot, fill: 'hsl(var(--hot))' },
    { name: 'Warm', value: totals.warm, fill: 'hsl(var(--warm))' },
    { name: 'Cold', value: totals.cold, fill: 'hsl(var(--cold))' },
  ].filter((d) => d.value > 0);

  // Live enrichment coverage = verified+drafted / total (how complete contacts are).
  const enrichedCount = (funnel.enriched || 0) + (funnel.verified || 0) + (funnel.drafted || 0) + (funnel.contacted || 0);
  const coverage = totalLeads ? Math.round((enrichedCount / totalLeads) * 100) : 0;

  const q = armyStatus || { raw: 0, enrichment: 0, verification: 0, draft: 0 };
  const queued = (q.raw || 0) + (q.enrichment || 0) + (q.verification || 0) + (q.draft || 0);
  const armyLive = queued > 0;

  const new24h = totals.new_24h || 0;
  const trend = ((data as any)?.trend_14d || []) as Array<{ day: string; discovered: string }>;
  const trendData = trend.map((d) => ({
    day: d.day.slice(5).replace('-', '/'),
    discovered: Number(d.discovered),
  }));
  const verif7d = ((data as any)?.verification_7d || []) as Array<{ channel: string; result: string; count: string }>;
  const verifData = verif7d.map((d) => ({
    name: `${d.channel} · ${d.result}`,
    value: Number(d.count),
  }));
  const outreach7d = ((data as any)?.outreach_7d || []) as Array<{ channel: string; delivery_status: string; count: string }>;
  const outreachData = outreach7d.map((d) => ({
    name: `${d.channel} · ${d.delivery_status}`,
    value: Number(d.count),
  }));

  return (
    <div className="space-y-4">
      {/* ---- header ---- */}
      <PageHeader
        title="Lead Intelligence Command"
        description="Autonomous India fresher discovery · HR contact enrichment · outreach drafts."
        actions={
          isAdmin ? (
            <div className="flex flex-col items-stretch gap-2.5 sm:items-end">
              <Button size="lg" onClick={() => armyMutation.mutate()} loading={armyMutation.isLoading}>
                <Zap className="h-4 w-4" />
                {armyMutation.isLoading ? 'Deploying…' : 'Run Full Army'}
              </Button>
              <div
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  armyLive ? 'border-success/40 bg-success-soft text-success' : 'border-border text-muted-foreground',
                )}
              >
                <Radio className={cn('h-3.5 w-3.5', armyLive && 'animate-pulse')} />
                {armyLive ? `Army running · ${queued} leads in flight` : 'Idle — ready to deploy'}
              </div>
            </div>
          ) : undefined
        }
        className="mb-1"
      />

      {!isAdmin && (
        <p className="eyebrow flex items-center gap-2">
          <Radar className={cn('h-3.5 w-3.5', armyLive && 'animate-pulse text-success')} />
          Live intelligence
        </p>
      )}

      {/* ---- stats ---- */}
      <StatCardGrid>
        <StatCard icon={Users} label="Total Leads" value={totals.total_leads} tone="primary" suffix={new24h > 0 ? `+${new24h} today` : undefined} />
        <StatCard icon={Flame} label="Hot Leads" value={totals.hot} tone="danger" />
        <StatCard icon={Sun} label="Warm Leads" value={totals.warm} tone="warning" />
        <StatCard icon={Snowflake} label="Cold Leads" value={totals.cold} tone="info" />
        <StatCard icon={ShieldAlert} label="Do Not Contact" value={totals.do_not_contact || 0} tone="muted" />
      </StatCardGrid>

      {/* ---- discovery trend ---- */}
      <Card>
        <CardContent>
          <p className="eyebrow">Discovery · last 14 days</p>
          <CardTitle className="mt-1">Discovery trend</CardTitle>
          {trendData.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No discovery data yet"
              description="New leads per day will chart here once the army runs."
            />
          ) : (
            <div className="mt-4 h-[190px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ left: -12, right: 12, top: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: 'hsl(var(--border-strong))', strokeOpacity: 0.4 }} />
                  <Area
                    type="monotone"
                    dataKey="discovered"
                    name="Discovered"
                    stroke="hsl(var(--signal))"
                    strokeWidth={2}
                    fill="hsl(var(--signal) / 0.10)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- live pipeline ---- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardContent>
            <p className="eyebrow">Live pipeline</p>
            <CardTitle className="mt-1">Pipeline funnel</CardTitle>
            {funnelData.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No pipeline data yet"
                description="Deploy the army to start discovering India fresher leads."
              />
            ) : (
              <div className="mt-4 space-y-5">
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="stage" width={96} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: 'hsl(var(--accent) / 0.4)' }} />
                      <Bar dataKey="count" name="Leads" radius={[0, 6, 6, 0]}>
                        {funnelData.map((d) => <Cell key={d.full} fill={stageColor(d.full)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {funnelData.map((d) => {
                    const pct = (d.count / maxCount) * 100;
                    return (
                      <div key={d.stage} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 text-[13px] font-medium text-foreground">{d.stage}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: stageColor(d.full) }}
                          />
                        </div>
                        <span className="w-14 shrink-0 text-right font-mono text-[12px] tabular-nums text-muted-foreground">
                          {d.count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* coverage + live queue */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent>
              <p className="eyebrow">Enrichment</p>
              <CardTitle className="mt-1">Coverage</CardTitle>
              <div className="mt-4 flex items-center gap-5">
                <div className="relative h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[{ v: coverage }, { v: 100 - coverage }]}
                        dataKey="v"
                        innerRadius={38}
                        outerRadius={52}
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                      >
                        <Cell fill="hsl(var(--signal))" />
                        <Cell fill="hsl(var(--muted))" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="font-mono text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-foreground">
                      {coverage}%
                    </span>
                  </div>
                </div>
                <div className="text-[13px] text-muted-foreground">
                  <p className="font-mono text-[15px] font-medium tabular-nums text-foreground">
                    {enrichedCount}/{totalLeads}
                  </p>
                  <p className="mt-1">leads enriched → verified → drafted by the fallback army.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <p className="eyebrow">Army queues</p>
              <CardTitle className="mt-1">Live queue depth</CardTitle>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { k: 'Scrape→Normalize', v: q.raw, icon: Sparkles },
                  { k: 'Enrichment', v: q.enrichment, icon: Zap },
                  { k: 'Verification', v: q.verification, icon: Activity },
                  { k: 'Drafting', v: q.draft, icon: MailCheck },
                ].map((row) => (
                  <div
                    key={row.k}
                    className={cn(
                      'rounded-lg border p-3 transition-colors duration-150',
                      row.v > 0 ? 'border-signal/40' : 'border-border',
                    )}
                  >
                    <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      <row.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {row.k}
                    </p>
                    <p className="mt-1 font-mono text-[18px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-foreground">
                      {row.v < 0 ? '—' : row.v}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---- bands + source health + credits ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardContent>
            <p className="eyebrow">Lead quality</p>
            {bandData.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No leads scored yet"
                description="Scores appear once leads are enriched."
              />
            ) : (
              <div className="mt-4 flex items-center gap-4">
                <div className="h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={bandData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={58} paddingAngle={3} stroke="none">
                        {bandData.map((d) => <Cell key={d.name} fill={d.fill} />)}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <LegendList items={bandData} colors={bandData} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="eyebrow">Connectors</p>
            <CardTitle className="mt-1">Source health</CardTitle>
            {data?.source_health && data.source_health.length > 0 ? (
              <div className="mt-4 space-y-2">
                {data.source_health.map((s: any) => (
                  <div
                    key={s.source_name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 transition-colors duration-150 hover:border-border-strong"
                  >
                    <span className="truncate text-[13px] font-medium capitalize text-foreground">{s.source_name}</span>
                    <Badge variant={s.is_open ? 'danger' : 'success'}>
                      {s.is_open ? `${s.consecutive_failures} fails` : 'Healthy'}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-muted-foreground">Health appears once scrapers run.</p>
            )}
          </CardContent>
        </Card>

        {credits && (
          <Card>
            <CardContent>
              <p className="eyebrow">Quota</p>
              <CardTitle className="mt-1">Credit usage</CardTitle>
              <div className="mt-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] text-muted-foreground">
                    <span className="font-mono font-semibold tabular-nums text-foreground">{credits.used.toLocaleString()}</span>
                    {' / '}
                    <span className="font-mono tabular-nums">{credits.limit.toLocaleString()}</span>
                  </span>
                  <span className="font-mono text-[13px] tabular-nums text-foreground">{creditPercent.toFixed(1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-2 rounded-full transition-all duration-500', creditTone)}
                    style={{ width: `${creditPercent}%` }}
                  />
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">{credits.remaining.toLocaleString()} credits remaining</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ---- verification + outreach outcomes (7d, live) ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <p className="eyebrow">Verification · 7d</p>
            {verifData.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No verifications yet"
                description="Email/WhatsApp results will break down here."
              />
            ) : (
              <div className="mt-4 flex items-center gap-4">
                <div className="h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={verifData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={58} paddingAngle={3} stroke="none">
                        {verifData.map((d, i) => (
                          <Cell key={d.name} fill={TOKEN_PALETTE[i % TOKEN_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <LegendList
                  items={verifData}
                  colors={verifData.map((d, i) => ({ name: d.name, fill: TOKEN_PALETTE[i % TOKEN_PALETTE.length] }))}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <p className="eyebrow">Outreach · 7d</p>
            {outreachData.length === 0 ? (
              <EmptyState
                icon={MailCheck}
                title="No outreach yet"
                description="Send states will break down here once messages go out."
              />
            ) : (
              <div className="mt-4 flex items-center gap-4">
                <div className="h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={outreachData} dataKey="value" nameKey="name" innerRadius={34} outerRadius={58} paddingAngle={3} stroke="none">
                        {outreachData.map((d, i) => (
                          <Cell key={d.name} fill={TOKEN_PALETTE[(i + 2) % TOKEN_PALETTE.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <LegendList
                  items={outreachData}
                  colors={outreachData.map((d, i) => ({ name: d.name, fill: TOKEN_PALETTE[(i + 2) % TOKEN_PALETTE.length] }))}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- recent runs ---- */}
      <Card>
        <CardContent className="p-0">
          <div className="px-5 pt-5">
            <p className="eyebrow">Run history · last 8</p>
          </div>
          {runs.length === 0 ? (
            <div className="p-5 pt-3">
              <EmptyState icon={BarChart3} title="No run history" description="Trigger the army to see runs appear here." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="table-th">Status</th>
                    <th className="table-th">Leads Found</th>
                    <th className="table-th">Attempted</th>
                    <th className="table-th">Succeeded</th>
                    <th className="table-th">Started</th>
                    <th className="table-th">Circuit Broken</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-accent/60"
                    >
                      <td className="table-td">
                        {run.finished_at ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : run.started_at ? (
                          <Clock className="h-4 w-4 animate-pulse text-info" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="table-td font-mono text-[13px] font-medium tabular-nums">{run.leads_found}</td>
                      <td className="table-td font-mono text-[13px] tabular-nums text-muted-foreground">{run.sources_attempted}</td>
                      <td className="table-td font-mono text-[13px] tabular-nums text-muted-foreground">{run.sources_succeeded}</td>
                      <td className="table-td font-mono text-[12px] text-muted-foreground">{formatDateTime(run.started_at)}</td>
                      <td className="table-td max-w-[160px] truncate font-mono text-[11px] text-destructive">
                        {run.sources_circuit_broken?.join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
