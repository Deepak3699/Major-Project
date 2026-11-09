import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  Activity, ArrowRight, BriefcaseBusiness, CheckCircle2, CirclePlay, CircleStop,
  Network, ShieldAlert, UsersRound, Zap,
} from 'lucide-react';
import { admin, candidate } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

const QUALITY_COLORS = ['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))'];

const AdminDashboard: React.FC = () => {
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery('candidate-admin-overview', candidate.adminOverview, { refetchInterval: 30000 });
  const modelQuery = useQuery('recommendation-model-status', candidate.recommendationModelStatus, { refetchInterval: 3000, retry: 1 });
  const discovery = useMutation(() => admin.triggerRun(), { onSuccess: () => client.invalidateQueries('candidate-admin-overview') });
  const modelTraining = useMutation(() => candidate.trainRecommendationModel(), {
    onSuccess: () => { client.invalidateQueries('candidate-admin-overview'); client.invalidateQueries('recommendation-model-status'); },
  });
  const modelRuntime = useMutation((enabled: boolean) => candidate.setRecommendationModelEnabled(enabled), {
    onSuccess: (status) => { client.setQueryData('recommendation-model-status', status); client.invalidateQueries('candidate-admin-overview'); },
  });
  if (isLoading) return <PageLoader label="Loading platform overview…" />;
  if (error) return <div className="card p-5 text-sm text-destructive">{(error as Error).message}</div>;

  const jobs = data?.jobs || {}, sources = data?.sources || [], apps = data?.applications || {};
  const model = modelQuery.data || data?.recommendation_model || {};
  const running = model.state === 'running' && model.enabled;
  const qualityChart = [{ name: 'Published', value: Number(jobs.published || 0) }, { name: 'Pending', value: Number(jobs.pending || 0) }, { name: 'Quarantined', value: Number(jobs.quarantined || 0) }];
  const totalApplications = Object.values(apps).reduce<number>((sum, count) => sum + Number(count), 0);

  const modelState = running ? 'ok' : model.state === 'error' ? 'bad' : 'idle';
  const statePill: Record<string, { label: string; dot: string; pill: string; icon: string }> = {
    ok: { label: 'Running', dot: 'bg-success', pill: 'border-success/25 bg-success-soft text-success', icon: 'bg-success-soft text-success' },
    bad: { label: 'Model error', dot: 'bg-destructive', pill: 'border-destructive/25 bg-destructive-soft text-destructive', icon: 'bg-destructive-soft text-destructive' },
    idle: { label: 'Stopped', dot: 'bg-muted-foreground', pill: 'border-border bg-muted text-muted-foreground', icon: 'bg-muted text-muted-foreground' },
  };
  const state = modelQuery.isFetching ? { ...statePill[modelState], label: 'Updating' } : statePill[modelState];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Platform overview"
        description="Candidate volume, job quality, application outcomes and connector health at a glance."
        actions={
          <Button onClick={() => discovery.mutate()} disabled={discovery.isLoading}>
            <Zap className="h-4 w-4" />
            {discovery.isLoading ? 'Queueing…' : 'Run job discovery'}
          </Button>
        }
      />
      {discovery.error && (
        <p className="text-[13px] text-destructive">{(discovery.error as Error).message}</p>
      )}

      {/* Stat row */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={BriefcaseBusiness}
          label="Active jobs"
          value={jobs.total ?? 0}
          tone="primary"
          hint={`${jobs.fresh_7d ?? 0} fresh in 7 days`}
        />
        <StatCard
          icon={ShieldAlert}
          label="Pending review"
          value={jobs.pending ?? 0}
          tone="warning"
          hint={`${jobs.quarantined ?? 0} quarantined`}
        />
        <StatCard
          icon={UsersRound}
          label="Candidates"
          value={data?.candidates ?? 0}
          tone="info"
          hint="Registered accounts"
        />
        <StatCard
          icon={CheckCircle2}
          label="Tracked applications"
          value={totalApplications}
          tone="success"
          hint={`${apps.INTERVIEW || 0} interviews · ${apps.OFFER || 0} offers`}
        />
      </section>

      {/* Recommendation model */}
      <section className="card p-5" aria-live="polite">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={cn(
                'grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border',
                state.icon,
              )}
            >
              <Network className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="eyebrow">Recommendation model</p>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    state.pill,
                  )}
                >
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', state.dot, running && 'animate-pulse')}
                    aria-hidden
                  />
                  {state.label}
                </span>
              </div>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Live profile-to-role scoring</h2>
              <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground">
                {model.model_name || 'hiregen DNN'} · {model.architecture || '9–16–8–1 neural ranker'} ·{' '}
                {model.training_examples ?? 0} training examples · {model.inference_count ?? 0} successful
                inferences in this API session · {model.fallback_count ?? 0} fallback scores.
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {model.last_inference_at
                  ? `Last inference ${new Date(model.last_inference_at).toLocaleString()}`
                  : 'Waiting for a candidate job match to score.'}
                {model.metrics?.accuracy != null && (
                  <> · Held-out accuracy {(model.metrics.accuracy * 100).toFixed(1)}% · AUC {Number(model.metrics.roc_auc).toFixed(3)}</>
                )}
              </p>
              {model.error && (
                <p className="mt-2 text-[12px] text-destructive">{model.error}</p>
              )}
              {modelQuery.error && (
                <p className="mt-2 text-[12px] text-destructive">Live status unavailable: {(modelQuery.error as Error).message}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Button
              variant={running ? 'outline' : 'default'}
              onClick={() => modelRuntime.mutate(!running)}
              disabled={modelRuntime.isLoading}
            >
              {running ? <CircleStop className="h-4 w-4" /> : <CirclePlay className="h-4 w-4" />}
              {modelRuntime.isLoading ? 'Updating…' : running ? 'Stop model' : 'Start model'}
            </Button>
            <Button variant="outline" onClick={() => modelTraining.mutate()} disabled={modelTraining.isLoading}>
              <Activity className="h-4 w-4" />
              {modelTraining.isLoading ? 'Learning…' : 'Retrain model'}
            </Button>
          </div>
        </div>
        {(modelRuntime.error || modelTraining.error) && (
          <p className="mt-3 text-[13px] text-destructive">
            {((modelRuntime.error || modelTraining.error) as Error).message}
          </p>
        )}
      </section>

      {/* Sources + journey */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ingestion health */}
        <section className="card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="eyebrow">Ingestion health</p>
              <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Job sources</h2>
            </div>
            <Activity className="h-[18px] w-[18px] shrink-0 text-muted-foreground/60" strokeWidth={1.75} />
          </div>
          {sources.length ? (
            <div className="mt-4 divide-y divide-border">
              {sources.slice(0, 10).map((source: any) => (
                <div key={source.source_name} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-foreground">{source.source_name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {source.last_success_at
                        ? `Last success ${new Date(source.last_success_at).toLocaleString()}`
                        : source.last_failure_reason || 'No successful run recorded'}
                    </p>
                  </div>
                  <Badge
                    variant={
                      source.circuit_open_until
                        ? 'danger'
                        : Number(source.consecutive_failures) > 0
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {source.circuit_open_until
                      ? 'Paused'
                      : Number(source.consecutive_failures) > 0
                        ? `${source.consecutive_failures} errors`
                        : 'Healthy'}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-[13px] leading-relaxed text-muted-foreground">
              No connector run history yet. Run the enabled discovery sources to populate this panel.
            </p>
          )}
          <Link
            to="/jobs"
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-foreground underline-offset-4 hover:underline hover:decoration-signal"
          >
            Review jobs
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        {/* Candidate journey */}
        <section className="card p-5">
          <p className="eyebrow">Application outcomes</p>
          <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Candidate journey</h2>
          <div className="mt-4 space-y-2.5">
            {['SAVED', 'READY_TO_APPLY', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'JOINED', 'REJECTED', 'WITHDRAWN'].map(
              (status) => {
                const count = Number(apps[status] || 0);
                return (
                  <div key={status} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      {status.replace(/_/g, ' ')}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/70"
                        style={{ width: `${Math.max(count ? 6 : 0, Math.min(100, (count / Math.max(1, totalApplications)) * 100))}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono text-[11px] tabular-nums text-foreground">{count}</span>
                  </div>
                );
              },
            )}
          </div>
          <Link
            to="/admin/feedback"
            className="mt-5 block rounded-lg border border-border bg-surface px-4 py-3.5 transition-colors duration-150 hover:border-border-strong"
          >
            <p className="eyebrow">Moderation queue</p>
            <p className="mt-1 font-mono text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em]">
              {data?.feedback_pending ?? 0}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">Feedback awaiting review</p>
          </Link>
        </section>
      </div>

      {/* Job quality breakdown */}
      <section className="card p-5">
        <p className="eyebrow">Job quality queue</p>
        <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.014em]">Listing review status</h2>
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={qualityChart}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={88}
                paddingAngle={3}
                stroke="none"
              >
                {QUALITY_COLORS.map((color, index) => (
                  <Cell key={index} fill={color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid hsl(var(--border))',
                  background: 'hsl(var(--surface))',
                  fontSize: 12,
                }}
              />
              <Legend verticalAlign="bottom" height={30} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;
