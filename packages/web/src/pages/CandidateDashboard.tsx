import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ArrowRight, ArrowUpRight, Bell, Bookmark, BriefcaseBusiness, CheckCircle2, CircleUserRound, Compass, FileText, MapPin, Target, TrendingUp, WandSparkles } from 'lucide-react';
import { candidate } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const { data: summary, isLoading } = useQuery('candidate-summary', candidate.summary, { refetchInterval: 30000 });
  const { data: recommendations } = useQuery('candidate-recommendations', candidate.recommendations, { enabled: !!summary?.has_profile, refetchInterval: 30000 });
  const { data: apps } = useQuery('candidate-applications', candidate.applications, { refetchInterval: 30000 });
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { enabled: !!summary?.has_profile, refetchInterval: 60000 });
  if (isLoading) return <PageLoader label="Loading your job workspace…" />;

  const profile = profileData?.profile;
  const firstName = profile?.full_name?.trim()?.split(/\s+/)[0] || (user?.email || 'there').split('@')[0].split(/[._-]/)[0];
  const topJobs = recommendations?.data?.slice(0, 3) || [];
  const recentApps = apps?.data?.slice(0, 4) || [];
  const completion = Number(summary?.profile_completion || 0);
  const activeCount = Object.entries(summary?.application_statuses || {}).filter(([status]) => !['REJECTED', 'WITHDRAWN', 'JOINED'].includes(status)).reduce((sum, [, count]) => sum + count, 0);
  const progressChart = [
    { stage: 'Saved', roles: summary?.application_statuses?.SAVED || 0 },
    { stage: 'Applied', roles: summary?.application_statuses?.APPLIED || 0 },
    { stage: 'Screening', roles: summary?.application_statuses?.SCREENING || 0 },
    { stage: 'Interview', roles: summary?.application_statuses?.INTERVIEW || 0 },
    { stage: 'Offers', roles: summary?.application_statuses?.OFFER || 0 },
  ];

  return <div className="candidate-dashboard space-y-6">
    <section className="candidate-hero relative overflow-hidden rounded-[1.4rem] border border-primary/15 p-6 sm:p-8">
      <div className="candidate-hero-shape candidate-hero-shape-one" aria-hidden="true" />
      <div className="candidate-hero-shape candidate-hero-shape-two" aria-hidden="true" />
      <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-surface/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary"><Compass className="h-3.5 w-3.5" />Your career space</div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-[2.6rem]">Good to see you, {firstName}.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Your job search, applications, and preparation tools are together here. Start with roles that fit the experience and skills you have confirmed.</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link to="/jobs" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-hover">Explore jobs <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/profile" className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface/85 px-4 text-sm font-semibold transition hover:border-primary/35"><CircleUserRound className="h-4 w-4 text-primary" />Edit profile</Link>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[250px] rounded-2xl border border-primary/15 bg-surface/90 p-5 shadow-sm lg:mx-0">
          <div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Profile strength</p><p className="mt-1 text-xs text-muted-foreground">More detail, closer matches</p></div><Target className="h-5 w-5 text-primary" /></div>
          <div className="mt-5 flex items-center gap-4">
            <div className="candidate-progress-ring relative grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full" style={{ background: 'conic-gradient(hsl(var(--primary)) ' + (completion * 3.6) + 'deg, hsl(var(--muted)) 0deg)' }}><div className="grid h-[62px] w-[62px] place-items-center rounded-full bg-surface text-lg font-bold tabular-nums">{completion}%</div></div>
            <div><p className="text-sm font-semibold">{completion >= 80 ? 'Looking strong' : completion >= 50 ? 'Good progress' : 'Build your profile'}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{completion >= 100 ? 'Your profile is ready for matching.' : 'Add the missing details when you have a moment.'}</p></div>
          </div>
          <Link to="/profile" className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">Review profile <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat icon={BriefcaseBusiness} label="Fresh jobs" value={summary?.fresh_jobs_7d ?? 0} hint="Added in the last 7 days" />
      <Stat icon={Target} label="Profile strength" value={completion + '%'} hint="Used to personalize matches" />
      <Stat icon={TrendingUp} label="Applications" value={summary?.application_total ?? 0} hint={activeCount + ' currently active'} />
      <Stat icon={CheckCircle2} label="Offers & joined" value={(summary?.application_statuses?.OFFER || 0) + (summary?.application_statuses?.JOINED || 0)} hint="Your latest milestones" />
    </section>

    {!summary?.has_profile && <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary-soft/45 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface text-primary"><FileText className="h-5 w-5" /></div><div><h2 className="font-semibold">Start with your profile</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">Add your skills and experience, or upload a resume to suggest profile details. You review and confirm everything before it is saved.</p></div></div><Link to="/profile" className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Set up profile</Link></section>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(290px,0.8fr)]">
      <section className="min-w-0 space-y-3">
        <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Picked for your profile</p><h2 className="mt-1 text-xl font-semibold">Recommended jobs</h2></div><Link to="/recommendations" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">See all <ArrowRight className="h-4 w-4" /></Link></div>
        {topJobs.length ? <div className="space-y-3">{topJobs.map((job) => <JobCard key={job.id} job={job} />)}</div> : <div className="card rounded-2xl p-6 text-sm text-muted-foreground">{summary?.has_profile ? 'No roles have reached your profile match threshold yet. Browse all trusted jobs to explore more.' : 'Your tailored recommendations will appear after you save your profile.'}</div>}
      </section>

      <div className="space-y-5">
        <section className="card rounded-2xl p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Your activity</p><h2 className="mt-1 text-lg font-semibold">Application progress</h2></div><span className="rounded-lg bg-primary-soft p-2 text-primary"><TrendingUp className="h-4 w-4" /></span></div><div className="mt-4 h-48 w-full">{summary?.application_total ? <ResponsiveContainer width="100%" height="100%"><BarChart data={progressChart} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}><CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" /><XAxis dataKey="stage" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', fontSize: 12 }} /><Bar dataKey="roles" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} maxBarSize={36} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-xs leading-5 text-muted-foreground">When you save or apply to a role, your progress will show here.</div>}</div><Link to="/applications" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">Open application tracker <ArrowRight className="h-3.5 w-3.5" /></Link></section>
        <section className="card rounded-2xl p-5"><div className="flex items-center gap-2"><span className="rounded-lg bg-success-soft p-2 text-success"><WandSparkles className="h-4 w-4" /></span><div><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success">Quick actions</p><h2 className="text-base font-semibold">Keep momentum</h2></div></div><div className="mt-4 divide-y divide-border"><QuickAction to="/saved" icon={Bookmark} label="Review saved jobs" /><QuickAction to="/resume" icon={FileText} label="Prepare a role-specific resume" /><QuickAction to="/applications" icon={Bell} label="Check application updates" /></div></section>
      </div>
    </div>

    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Stay on top of replies</p><h2 className="mt-1 text-xl font-semibold">Recent applications</h2></div><Link to="/applications" className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline">Open tracker <ArrowRight className="h-4 w-4" /></Link></div>
      {recentApps.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{recentApps.map((app) => <Link key={app.id} to="/applications" className="card group rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-primary/35"><div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-sm font-semibold leading-5 group-hover:text-primary">{app.job_title}</span><Status status={app.status} /></div><p className="mt-2 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{app.company_name}</p><p className="mt-4 text-[10px] text-muted-foreground">Updated {new Date(app.updated_at).toLocaleDateString()}</p></Link>)}</div> : <div className="card rounded-2xl p-6 text-sm text-muted-foreground">Save a role to start your application tracker.</div>}
    </section>
  </div>;
};

function Stat({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string | number; hint: string }) {
  return <div className="candidate-stat card rounded-2xl p-4"><div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">{label}</span><span className="rounded-lg bg-primary-soft p-2 text-primary"><Icon className="h-4 w-4" /></span></div><p className="mt-3 text-2xl font-bold tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{hint}</p></div>;
}

function QuickAction({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return <Link to={to} className="flex items-center justify-between gap-3 py-3 text-xs font-medium text-muted-foreground transition hover:text-primary"><span className="flex items-center gap-2.5"><Icon className="h-4 w-4 text-primary" />{label}</span><ArrowUpRight className="h-3.5 w-3.5" /></Link>;
}

function Status({ status }: { status: string }) {
  const color = status === 'OFFER' || status === 'JOINED' ? 'text-success bg-success-soft' : status === 'REJECTED' ? 'text-destructive bg-destructive-soft' : 'text-primary bg-primary-soft';
  return <span className={'shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ' + color}>{status.replace(/_/g, ' ')}</span>;
}

export default CandidateDashboard;
