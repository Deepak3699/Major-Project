import React from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Activity, ArrowRight, BriefcaseBusiness, CheckCircle2, CirclePlay, CircleStop, Network, ShieldAlert, UsersRound, Zap } from 'lucide-react';
import { admin, candidate } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

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

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><PageHeader title="Platform overview" description="Candidate, job quality, application outcomes and connector health at a glance." /><button onClick={() => discovery.mutate()} disabled={discovery.isLoading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"><Zap className="h-4 w-4" />{discovery.isLoading ? 'Queueing…' : 'Run job discovery'}</button></div>
    {discovery.error && <p className="text-sm text-destructive">{(discovery.error as Error).message}</p>}
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={BriefcaseBusiness} label="Active jobs" value={jobs.total ?? 0} detail={`${jobs.fresh_7d ?? 0} fresh in 7 days`} /><Stat icon={ShieldAlert} label="Pending review" value={jobs.pending ?? 0} detail={`${jobs.quarantined ?? 0} quarantined`} /><Stat icon={UsersRound} label="Candidates" value={data?.candidates ?? 0} detail="Registered accounts" /><Stat icon={CheckCircle2} label="Tracked applications" value={totalApplications} detail={`${apps.INTERVIEW || 0} interviews · ${apps.OFFER || 0} offers`} /></section>
    <section className="card overflow-hidden p-5 sm:p-6" aria-live="polite">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${running ? 'bg-success-soft text-success' : model.state === 'error' ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground'}`}><Network className="h-5 w-5" /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Recommendation model</p><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${running ? 'bg-success-soft text-success' : model.state === 'error' ? 'bg-destructive-soft text-destructive' : 'bg-muted text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${running ? 'animate-pulse bg-success' : model.state === 'error' ? 'bg-destructive' : 'bg-muted-foreground'}`} />{modelQuery.isFetching ? 'Updating' : model.state === 'error' ? 'Model error' : running ? 'Running' : 'Stopped'}</span></div>
            <h2 className="mt-1 text-lg font-semibold">Live profile-to-role scoring</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">{model.model_name || 'hiregen DNN'} · {model.architecture || '9–16–8–1 neural ranker'} · {model.training_examples ?? 0} training examples · {model.inference_count ?? 0} successful inferences in this API session · {model.fallback_count ?? 0} fallback scores.</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{model.last_inference_at ? `Last inference ${new Date(model.last_inference_at).toLocaleString()}` : 'Waiting for a candidate job match to score.'}{model.metrics?.accuracy != null && <> · Held-out accuracy {(model.metrics.accuracy * 100).toFixed(1)}% · AUC {Number(model.metrics.roc_auc).toFixed(3)}</>}</p>
            {model.error && <p className="mt-2 text-xs text-destructive">{model.error}</p>}
            {modelQuery.error && <p className="mt-2 text-xs text-destructive">Live status unavailable: {(modelQuery.error as Error).message}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
          <button onClick={() => modelRuntime.mutate(!running)} disabled={modelRuntime.isLoading} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50 ${running ? 'border border-border bg-surface text-foreground hover:border-destructive/40 hover:text-destructive' : 'bg-success text-success-foreground hover:opacity-90'}`}>
            {running ? <CircleStop className="h-4 w-4" /> : <CirclePlay className="h-4 w-4" />}{modelRuntime.isLoading ? 'Updating…' : running ? 'Stop model' : 'Start model'}
          </button>
          <button onClick={() => modelTraining.mutate()} disabled={modelTraining.isLoading} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:border-primary/40 disabled:opacity-50"><Activity className="h-4 w-4" />{modelTraining.isLoading ? 'Learning…' : 'Retrain model'}</button>
        </div>
      </div>
      {(modelRuntime.error || modelTraining.error) && <p className="mt-3 text-sm text-destructive">{((modelRuntime.error || modelTraining.error) as Error).message}</p>}
    </section>
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="card p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Ingestion health</p><h2 className="mt-1 text-lg font-semibold">Job sources</h2></div><Activity className="h-5 w-5 text-primary" /></div>{sources.length ? <div className="mt-4 divide-y divide-border">{sources.slice(0, 10).map((source: any) => <div key={source.source_name} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{source.source_name}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{source.last_success_at ? `Last success ${new Date(source.last_success_at).toLocaleString()}` : source.last_failure_reason || 'No successful run recorded'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${source.circuit_open_until ? 'bg-destructive-soft text-destructive' : Number(source.consecutive_failures) > 0 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'}`}>{source.circuit_open_until ? 'Paused' : Number(source.consecutive_failures) > 0 ? `${source.consecutive_failures} errors` : 'Healthy'}</span></div>)}</div> : <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">No connector run history yet. Run the enabled discovery sources to populate this panel.</p>}<Link to="/jobs" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">Review jobs <ArrowRight className="h-4 w-4" /></Link></section>
      <section className="card p-5"><p className="text-xs font-semibold uppercase tracking-widest text-info">Application outcomes</p><h2 className="mt-1 text-lg font-semibold">Candidate journey</h2><div className="mt-4 space-y-3">{['SAVED', 'READY_TO_APPLY', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'JOINED', 'REJECTED', 'WITHDRAWN'].map((status) => { const count = Number(apps[status] || 0); return <div key={status} className="flex items-center gap-3"><span className="w-32 text-xs text-muted-foreground">{status.replace(/_/g, ' ')}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.max(count ? 6 : 0, Math.min(100, count / Math.max(1, totalApplications) * 100))}%` }} /></div><span className="w-8 text-right text-xs tabular-nums">{count}</span></div>; })}</div><Link to="/admin/feedback" className="mt-5 block rounded-lg border border-border bg-surface/50 p-4 transition hover:border-primary/40"><p className="text-xs font-semibold">Feedback awaiting moderation</p><p className="mt-1 text-2xl font-bold">{data?.feedback_pending ?? 0}</p><p className="text-[11px] text-muted-foreground">Open the review queue</p></Link></section>
    </div>
    <section className="card p-5"><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Job quality queue</p><h2 className="mt-1 text-lg font-semibold">Listing review status</h2><div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={qualityChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={88} paddingAngle={3}>{['hsl(var(--success))', 'hsl(var(--warning))', 'hsl(var(--destructive))'].map((color, index) => <Cell key={index} fill={color} />)}</Pie><Tooltip contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', fontSize: 12 }} /><Legend verticalAlign="bottom" height={30} /></PieChart></ResponsiveContainer></div></section>
  </div>;
};

function Stat({ icon: Icon, label, value, detail }: { icon: any; label: string; value: number | string; detail: string }) { return <div className="card p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div>; }
export default AdminDashboard;
