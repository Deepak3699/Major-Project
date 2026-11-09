import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { dashboard, admin, CreditUsageResponse, RunLog } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAuthStore } from '@/stores/auth';
import { useSSE, isLeadLifecycleEvent } from '@/hooks/useSSE';
import {
  Users,
  Flame,
  Sun,
  Snowflake,
  TrendingUp,
  Zap,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
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

const Analytics: React.FC = () => {
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useQuery('dashboard-stats', () => dashboard.stats(), { refetchInterval: 15000 });
  const { data: credits, isLoading: creditsLoading } = useQuery('dashboard-credits', () => dashboard.credits(), { refetchInterval: 15000 });
  // /runs is admin-only: don't fire it as sales_rep (was a 403 + a false "no runs" empty state).
  const { data: runs, isLoading: runsLoading } = useQuery('dashboard-runs', () => admin.getRuns(20), {
    enabled: isAdmin,
    retry: false,
  });

  useSSE('/sse/token', (event) => {
    if (isLeadLifecycleEvent(event.type)) {
      queryClient.invalidateQueries('dashboard-stats');
      queryClient.invalidateQueries('dashboard-credits');
      if (isAdmin) queryClient.invalidateQueries('dashboard-runs');
    }
  });

  const funnelEntries = useMemo(() => {
    if (!stats?.funnel) return [];
    return Object.entries(stats.funnel).sort((a, b) => (b[1] as number) - (a[1] as number));
  }, [stats]);

  const totalFunnel = useMemo(
    () => funnelEntries.reduce((sum, [, count]) => sum + (count as number), 0),
    [funnelEntries],
  );

  const creditUsage: CreditUsageResponse | undefined = credits as CreditUsageResponse | undefined;
  const runList: RunLog[] = (runs as any)?.runs || [];

  // Verification success + outreach delivery from the same stats payload.
  const verifRows = ((stats as any)?.verification_7d || []) as Array<{ channel: string; result: string; count: string }>;
  const verifTotal = verifRows.reduce((a, r) => a + Number(r.count), 0);
  const verifOk = verifRows
    .filter((r) => r.result === 'valid' || r.result === 'registered')
    .reduce((a, r) => a + Number(r.count), 0);
  const verifRate = verifTotal > 0 ? Math.round((verifOk / verifTotal) * 100) : null;
  const outreachRows = ((stats as any)?.outreach_7d || []) as Array<{ channel: string; delivery_status: string; count: string }>;
  const outTotal = outreachRows.reduce((a, r) => a + Number(r.count), 0);
  const outSent = outreachRows
    .filter((r) => ['sent', 'delivered'].includes(r.delivery_status))
    .reduce((a, r) => a + Number(r.count), 0);
  const outRate = outTotal > 0 ? Math.round((outSent / outTotal) * 100) : null;

  // Stage-to-stage conversion along the happy path (shares, not transitions —
  // honest about what a snapshot funnel can say).
  const funnelMap = Object.fromEntries(funnelEntries.map(([s, c]) => [s, c as number])) as Record<string, number>;
  const PATH = ['discovered', 'enriched', 'verified', 'drafted', 'contacted', 'replied'] as const;
  const conversions = PATH.slice(1).map((stage, i) => {
    const prev = funnelMap[PATH[i]] || 0;
    const cur = funnelMap[stage] || 0;
    return { stage, pct: prev > 0 ? Math.round((cur / prev) * 100) : null };
  });

  const runStatusIcon = (run: RunLog) => {
    if (run.finished_at) return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (run.started_at && !run.finished_at) return <Clock className="h-4 w-4 animate-pulse text-info" />;
    return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  };

  if (statsLoading || creditsLoading || runsLoading) {
    return <PageLoader label="Loading analytics…" />;
  }

  if (statsError) {
    return (
      <ErrorState
        title="Failed to load analytics"
        message={(statsError as Error).message}
        onRetry={() => refetchStats()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Analytics" description="Pipeline performance, conversion and resource usage — measured, not estimated" />

      <StatCardGrid>
        <StatCard icon={Users} label="Total Leads" value={stats?.totals?.total_leads ?? 0} tone="primary" />
        <StatCard icon={Flame} label="Hot Leads" value={stats?.totals?.hot ?? 0} tone="danger" />
        <StatCard icon={Sun} label="Warm Leads" value={stats?.totals?.warm ?? 0} tone="warning" />
        <StatCard icon={Snowflake} label="Cold Leads" value={stats?.totals?.cold ?? 0} tone="info" />
        <StatCard icon={CheckCircle2} label="Verify Success · 7d" value={verifRate === null ? '—' : `${verifRate}%`} tone="success" hint={verifTotal > 0 ? `${verifOk}/${verifTotal} checks` : 'no checks yet'} />
        <StatCard icon={Zap} label="Send Success · 7d" value={outRate === null ? '—' : `${outRate}%`} tone="info" hint={outTotal > 0 ? `${outSent}/${outTotal} sends` : 'no sends yet'} />
      </StatCardGrid>

      {/* Pipeline funnel */}
      <Card>
        <CardHeader>
          <p className="eyebrow">Funnel</p>
          <CardTitle>Pipeline Conversion</CardTitle>
          <CardDescription>Leads per stage, largest stage first.</CardDescription>
        </CardHeader>
        <CardContent>
          {totalFunnel === 0 ? (
            <EmptyState icon={TrendingUp} title="No pipeline data yet." description="Funnel metrics will appear once leads are discovered." />
          ) : (
            <div className="space-y-3.5">
              {funnelEntries.map(([stage, count]) => {
                const pct = totalFunnel > 0 ? ((count as number) / totalFunnel) * 100 : 0;
                const stageLabel = STAGE_LABELS[stage] || stage.replace(/_/g, ' ');
                return (
                  <div key={stage} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[13px] font-medium">{stageLabel}</span>
                      <span className="font-mono text-[13px] tabular-nums text-muted-foreground">
                        {(count as number).toLocaleString()}
                        <span className="text-muted-foreground/70"> · {pct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage-to-stage ratios */}
      <Card>
        <CardHeader>
          <p className="eyebrow">Stage flow</p>
          <CardTitle>Stage Conversion</CardTitle>
          <CardDescription>Share of each stage relative to the previous one (snapshot shares, not tracked transitions).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {conversions.map((c) => (
              <div
                key={c.stage}
                className="rounded-lg border border-border bg-muted/40 p-3 text-center transition-colors duration-150 hover:border-border-strong"
              >
                <p className="text-[11px] text-muted-foreground">→ {STAGE_LABELS[c.stage] || c.stage.replace(/_/g, ' ')}</p>
                <p className="mt-1 font-mono text-[18px] font-semibold tabular-nums tracking-[-0.02em]">
                  {c.pct === null ? '—' : `${c.pct}%`}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Credit usage */}
      {creditUsage && (
        <Card>
          <CardHeader>
            <p className="eyebrow">Quota</p>
            <CardTitle>Credit Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="eyebrow">Used</p>
                <p className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em]">
                  {creditUsage.used.toLocaleString()}
                </p>
                <p className="mt-1.5 text-[12px] text-muted-foreground">of {creditUsage.limit.toLocaleString()} total</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="eyebrow">Remaining</p>
                <p className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em]">
                  {creditUsage.remaining.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <p className="eyebrow">Billing period</p>
                <p className="mt-1.5 font-mono text-[13px] font-medium leading-snug tabular-nums">
                  {formatDateTime(creditUsage.period_start)} – {formatDateTime(creditUsage.period_end)}
                </p>
              </div>
            </div>

            {creditUsage.by_provider && Object.keys(creditUsage.by_provider).length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(creditUsage.by_provider).map(([provider, usage]) => {
                  const pct = usage.limit > 0 ? Math.min((usage.used / usage.limit) * 100, 100) : 0;
                  return (
                    <div key={provider} className="rounded-lg border border-border bg-muted/40 p-3">
                      <p className="text-[11px] capitalize text-muted-foreground">{provider}</p>
                      <p className="mt-0.5 font-mono text-[13px] font-medium tabular-nums">
                        {usage.used}/{usage.limit}
                      </p>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-1.5 rounded-full ${pct > 80 ? 'bg-destructive' : pct > 50 ? 'bg-warning' : 'bg-success'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Run history */}
      <Card>
        <CardHeader>
          <p className="eyebrow">Scrape runs · last 20</p>
          <CardTitle>Run History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!isAdmin ? (
            <div className="px-5 pb-5">
              <EmptyState icon={BarChart3} title="Run history is admin-only." description="Ask an admin for scrape run details." />
            </div>
          ) : runList.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={BarChart3} title="No runs recorded yet." description="Scrape runs will appear here once triggered." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="table-th">Status</th>
                    <th className="table-th">Run ID</th>
                    <th className="table-th">Attempted</th>
                    <th className="table-th">Succeeded</th>
                    <th className="table-th">Leads Found</th>
                    <th className="table-th">New</th>
                    <th className="table-th">Started</th>
                    <th className="table-th">Finished</th>
                    <th className="table-th">Circuit Broken</th>
                  </tr>
                </thead>
                <tbody>
                  {runList.map((run: RunLog) => (
                    <tr
                      key={run.id}
                      className="border-b border-border transition-colors last:border-0 hover:bg-accent/60"
                    >
                      <td className="table-td">{runStatusIcon(run)}</td>
                      <td className="table-td font-mono text-[12px] text-muted-foreground">{run.id}</td>
                      <td className="table-td font-mono text-[13px] tabular-nums">{run.sources_attempted}</td>
                      <td className="table-td font-mono text-[13px] tabular-nums">{run.sources_succeeded}</td>
                      <td className="table-td font-mono text-[13px] font-medium tabular-nums">{run.leads_found}</td>
                      <td className="table-td font-mono text-[13px] tabular-nums">{run.leads_deduped}</td>
                      <td className="table-td font-mono text-[12px] text-muted-foreground">{formatDateTime(run.started_at)}</td>
                      <td className="table-td font-mono text-[12px] text-muted-foreground">
                        {run.finished_at ? formatDateTime(run.finished_at) : '—'}
                      </td>
                      <td
                        className="table-td max-w-[200px] truncate font-mono text-[12px] text-destructive"
                        title={run.sources_circuit_broken?.join(', ') || ''}
                      >
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

export default Analytics;
