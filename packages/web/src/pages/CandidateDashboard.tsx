import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ArrowRight, BriefcaseBusiness, CheckCircle2, CircleUserRound, Compass, FileText, Target } from 'lucide-react';
import { candidate } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const { data: summary, isLoading } = useQuery('candidate-summary', candidate.summary);
  const { data: recommendations } = useQuery('candidate-recommendations', candidate.recommendations, { enabled: !!summary?.has_profile });
  const { data: apps } = useQuery('candidate-applications', candidate.applications);
  if (isLoading) return <PageLoader label="Loading your job workspace…" />;

  const firstName = (user?.email || 'there').split('@')[0].split(/[._-]/)[0];
  const topJobs = recommendations?.data?.slice(0, 3) || [];
  const recentApps = apps?.data?.slice(0, 3) || [];
  const activeCount = Object.entries(summary?.application_statuses || {}).filter(([status]) => !['REJECTED', 'WITHDRAWN', 'JOINED'].includes(status)).reduce((sum, [, count]) => sum + count, 0);
  const progressChart = [
    { stage: 'Saved', roles: summary?.application_statuses?.SAVED || 0 },
    { stage: 'Applied', roles: summary?.application_statuses?.APPLIED || 0 },
    { stage: 'Screening', roles: summary?.application_statuses?.SCREENING || 0 },
    { stage: 'Interview', roles: summary?.application_statuses?.INTERVIEW || 0 },
    { stage: 'Offers', roles: summary?.application_statuses?.OFFER || 0 },
  ];

  return (
    <div className="space-y-6">
      <section className="glow-ring card relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-35" style={{ background: 'var(--grad-mesh)' }} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Compass className="h-4 w-4" />Your next opportunity</div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Good to see you, {firstName}.</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Fresh roles, explainable matches, and every application in one place. Your choices stay in your hands.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/jobs" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover">Explore jobs <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/profile" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface/60 px-4 text-sm font-medium hover:bg-accent"><CircleUserRound className="h-4 w-4" />Complete profile</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Compass} label="Fresh jobs · 7 days" value={summary?.fresh_jobs_7d ?? 0} hint="From active sources" />
        <Stat icon={Target} label="Profile strength" value={`${summary?.profile_completion ?? 0}%`} hint="Improves match quality" />
        <Stat icon={BriefcaseBusiness} label="Applications" value={summary?.application_total ?? 0} hint={`${activeCount} in progress`} />
        <Stat icon={CheckCircle2} label="Offers & joined" value={(summary?.application_statuses?.OFFER || 0) + (summary?.application_statuses?.JOINED || 0)} hint="Milestones you track" />
      </section>

      <section className="card p-5"><div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Application progress</p><h2 className="mt-1 text-lg font-semibold">Your job search at a glance</h2></div><div className="h-52 w-full">{summary?.application_total ? <ResponsiveContainer width="100%" height="100%"><BarChart data={progressChart} margin={{ top: 4, right: 12, bottom: 4, left: -16 }}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" /><XAxis dataKey="stage" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', fontSize: 12 }} /><Bar dataKey="roles" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} maxBarSize={44} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Save or apply to jobs to see your progress here.</div>}</div></section>

      {!summary?.has_profile && <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><FileText className="h-5 w-5" /></div><div><h2 className="font-semibold">Build your candidate profile</h2><p className="mt-1 text-sm text-muted-foreground">Add skills, experience, projects and preferences. You can also upload a PDF or DOCX resume and review the extracted fields.</p></div></div><Link to="/profile" className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">Set up profile</Link></section>}

      <section className="space-y-3">
        <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Matched to you</p><h2 className="mt-1 text-xl font-semibold">Recommended jobs</h2></div><Link to="/recommendations" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">See all <ArrowRight className="h-4 w-4" /></Link></div>
        {topJobs.length ? <div className="space-y-3">{topJobs.map((job) => <JobCard key={job.id} job={job} />)}</div> : <div className="card p-6 text-sm text-muted-foreground">{summary?.has_profile ? 'No active listings match your filters yet. Browse recent jobs to find new roles.' : 'Recommendations appear once you save your profile.'}</div>}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-info">Your progress</p><h2 className="mt-1 text-xl font-semibold">Recent applications</h2></div><Link to="/applications" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Open tracker <ArrowRight className="h-4 w-4" /></Link></div>
        {recentApps.length ? <div className="grid gap-3 md:grid-cols-3">{recentApps.map((app) => <Link key={app.id} to="/applications" className="card p-4 transition hover:border-primary/40"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{app.job_title}</span><Status status={app.status} /></div><p className="mt-1 text-xs text-muted-foreground">{app.company_name}</p><p className="mt-4 text-[11px] text-muted-foreground">Updated {new Date(app.updated_at).toLocaleDateString()}</p></Link>)}</div> : <div className="card p-6 text-sm text-muted-foreground">Save a role to start your application tracker.</div>}
      </section>
    </div>
  );
};

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint: string }) {
  return <div className="card p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{hint}</p></div>;
}

function Status({ status }: { status: string }) {
  const color = status === 'OFFER' || status === 'JOINED' ? 'text-success bg-success-soft' : status === 'REJECTED' ? 'text-destructive bg-destructive-soft' : 'text-primary bg-primary-soft';
  return <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${color}`}>{status.replace(/_/g, ' ')}</span>;
}

export default CandidateDashboard;
