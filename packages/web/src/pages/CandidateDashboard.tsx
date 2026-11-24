import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from 'react-query';
import { ArrowRight, ArrowUpRight, Bell, Bookmark, BriefcaseBusiness, CheckCircle2, CircleUserRound, Coins, FileText, GraduationCap, MapPin, Mic, Target, TrendingUp } from 'lucide-react';
import { candidate, practice, credits } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/components/ui/cn';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const EASE = [0.22, 1, 0.36, 1] as const;

// Shared entrance: fade + 8px rise.
const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE, delay },
});

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const { data: summary, isLoading } = useQuery('candidate-summary', candidate.summary, { refetchInterval: 30000 });
  const { data: recommendations } = useQuery('candidate-recommendations', candidate.recommendations, { enabled: !!summary?.has_profile, refetchInterval: 30000 });
  const { data: apps } = useQuery('candidate-applications', candidate.applications, { refetchInterval: 30000 });
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { enabled: !!summary?.has_profile, refetchInterval: 60000 });
  // Practice space readout — shares cache keys with the Practice page, so this
  // warms nothing new and stays in sync after a session is graded.
  const { data: subData } = useQuery('practice-subscription', practice.subscription);
  const { data: sessionsData } = useQuery('practice-sessions', practice.sessions);
  const { data: creditsData } = useQuery('credits-overview', credits.overview);
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
  const strengthTone = completion >= 80 ? 'bg-success' : completion >= 50 ? 'bg-info' : 'bg-warning';

  const pCompleted = (sessionsData?.sessions || []).filter((s) => s.status === 'completed');
  const pLastScore = pCompleted[0]?.overall_score ?? null;
  const pSub = subData?.subscription;
  const pQuota = pSub && !pSub.unlimited && pSub.monthly_limit != null
    ? { used: Math.min(pSub.used_this_month, pSub.monthly_limit), limit: pSub.monthly_limit }
    : null;
  const pScoreTone = pLastScore == null
    ? 'text-muted-foreground'
    : pLastScore >= 80 ? 'text-success' : pLastScore >= 55 ? 'text-warning' : 'text-destructive';

  return (
    <div className="space-y-4">
      {/* Page head */}
      <motion.section {...rise(0)} className="min-w-0">
        <p className="eyebrow">Your career space</p>
        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.022em] text-foreground text-balance">Good to see you, {firstName}.</h1>
            <p className="mt-1.5 max-w-phi-body text-sm leading-relaxed text-muted-foreground">Your job search, applications, and preparation tools are together here. Start with roles that fit the experience and skills you have confirmed.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link to="/jobs" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">Explore jobs <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/profile" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60"><CircleUserRound className="h-4 w-4 text-muted-foreground" />Edit profile</Link>
          </div>
        </div>
      </motion.section>

      {/* Stat row */}
      <motion.section {...rise(0.05)} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={BriefcaseBusiness} label="Fresh jobs" value={summary?.fresh_jobs_7d ?? 0} hint="Added in the last 7 days" />
        <StatCard icon={Target} label="Profile strength" value={completion + '%'} hint="Used to personalize matches" />
        <StatCard icon={TrendingUp} label="Applications" value={summary?.application_total ?? 0} hint={activeCount + ' currently active'} />
        <StatCard icon={CheckCircle2} label="Offers & joined" value={(summary?.application_statuses?.OFFER || 0) + (summary?.application_statuses?.JOINED || 0)} hint="Your latest milestones" />
      </motion.section>

      {!summary?.has_profile && (
        <motion.section {...rise(0.1)} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between card border-signal/30">
          <div className="flex gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-dashed border-border-strong text-muted-foreground"><FileText className="h-4 w-4" strokeWidth={1.75} /></div>
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Start with your profile</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">Add your skills and experience, or upload a resume to suggest profile details. You review and confirm everything before it is saved.</p>
            </div>
          </div>
          <Link to="/profile" className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">Set up profile</Link>
        </motion.section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(290px,0.8fr)]">
        <motion.section {...rise(0.15)} className="min-w-0 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Picked for your profile</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.014em] text-foreground">Recommended jobs</h2>
            </div>
            <Link to="/recommendations" className="group inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">See all <ArrowRight className="h-3.5 w-3.5" /></Link>
          </div>
          {topJobs.length ? (
            <div className="space-y-3">
              {topJobs.map((job, i) => (
                <motion.div key={job.id} {...rise(Math.min(i * 0.05, 0.2))}>
                  <JobCard job={job} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="card p-6 text-[13px] leading-relaxed text-muted-foreground">{summary?.has_profile ? 'No roles have reached your profile match threshold yet. Browse all trusted jobs to explore more.' : 'Your tailored recommendations will appear after you save your profile.'}</div>
          )}
        </motion.section>

        <motion.div {...rise(0.2)} className="space-y-4">
          {/* Interview practice */}
          <section className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="eyebrow">Interview practice</p>
              <Mic className="h-4 w-4 text-muted-foreground/60" strokeWidth={1.75} />
            </div>
            <p className={cn('mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums', pScoreTone)}>
              {pLastScore ?? '—'}
            </p>
            <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              {pLastScore != null ? '/100 · last scored session' : 'no scored sessions yet'}
            </p>
            {pQuota ? (
              <div className="mt-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', pQuota.used >= pQuota.limit ? 'bg-warning' : 'bg-foreground')}
                    style={{ width: `${(pQuota.used / pQuota.limit) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                  {pQuota.used >= pQuota.limit
                    ? 'Free quota used up — request Pro to keep rehearsing.'
                    : `${pQuota.limit - pQuota.used} free session${pQuota.limit - pQuota.used === 1 ? '' : 's'} left this month.`}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                {pSub ? 'Pro plan — unlimited rehearsals.' : 'AI mock interviews, graded question by question.'}
              </p>
            )}
            <div className="mt-2 space-y-0.5">
              <QuickAction to="/practice" icon={Mic} label="Rehearse a mock interview" />
              <QuickAction to="/learning" icon={GraduationCap} label="Open learning tracks" />
            </div>
          </section>

          {/* Preparation credits */}
          <section className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="eyebrow">Preparation credits</p>
              <Coins className="h-4 w-4 text-muted-foreground/60" strokeWidth={1.75} />
            </div>
            <p className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums">
              {creditsData?.wallet.balance ?? '—'}
            </p>
            <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
              {creditsData ? `${creditsData.plan.name} plan` : 'loading plan'}
            </p>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
              {creditsData?.wallet.signup_granted
                ? 'Your 2-credit welcome grant is active. Every change is recorded in the ledger.'
                : 'Server-tracked preparation credits with a full transaction history.'}
            </p>
            <div className="mt-2 space-y-0.5">
              <QuickAction to="/credits" icon={Coins} label="Open credits & plan" />
            </div>
          </section>

          {/* Profile strength */}
          <section className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="eyebrow">Profile strength</p>
              <Target className="h-4 w-4 text-muted-foreground/60" strokeWidth={1.75} />
            </div>
            <p className="mt-2 text-[22px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular-nums">{completion}%</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
              <div className={`h-full rounded-full ${strengthTone} transition-all duration-500`} style={{ width: `${completion}%` }} />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">{completion >= 80 ? 'Looking strong' : completion >= 50 ? 'Good progress' : 'Build your profile'}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">More detail, closer matches. {completion >= 100 ? 'Your profile is ready for matching.' : 'Add the missing details when you have a moment.'}</p>
            <Link to="/profile" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">Review profile <ArrowUpRight className="h-3 w-3" /></Link>
          </section>

          {/* Application progress */}
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Your activity</p>
                <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-foreground">Application progress</h2>
              </div>
              <TrendingUp className="mt-0.5 h-4 w-4 text-muted-foreground/60" strokeWidth={1.75} />
            </div>
            <div className="mt-4 h-44 w-full">
              {summary?.application_total ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={progressChart} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis dataKey="stage" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--surface))', fontSize: 12 }} />
                    <Bar dataKey="roles" fill="hsl(var(--foreground))" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-[12px] leading-relaxed text-muted-foreground">When you save or apply to a role, your progress will show here.</div>
              )}
            </div>
            <Link to="/applications" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">Open application tracker <ArrowRight className="h-3 w-3" /></Link>
          </section>

          {/* Quick actions */}
          <section className="card p-5">
            <p className="eyebrow">Quick actions</p>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-foreground">Keep momentum</h2>
            <div className="mt-3 space-y-0.5">
              <QuickAction to="/saved" icon={Bookmark} label="Review saved jobs" />
              <QuickAction to="/resume" icon={FileText} label="Prepare a role-specific resume" />
              <QuickAction to="/applications" icon={Bell} label="Check application updates" />
            </div>
          </section>
        </motion.div>
      </div>

      {/* Recent applications */}
      <motion.section {...rise(0.25)} className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Stay on top of replies</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-0.014em] text-foreground">Recent applications</h2>
          </div>
          <Link to="/applications" className="group inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">Open tracker <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {recentApps.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {recentApps.map((app, i) => (
              <motion.div key={app.id} {...rise(Math.min(i * 0.04, 0.24))} className="h-full">
                <Link to="/applications" className="card group flex h-full flex-col p-4 transition-colors duration-150 hover:border-border-strong">
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-foreground">{app.job_title}</span>
                    <Status status={app.status} />
                  </div>
                  <p className="mt-2 flex items-center gap-1 truncate text-[12px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{app.company_name}</p>
                  <p className="mt-auto pt-4 font-mono text-[10.5px] text-muted-foreground/80">Updated {new Date(app.updated_at).toLocaleDateString()}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="card p-6 text-[13px] leading-relaxed text-muted-foreground">Save a role to start your application tracker.</div>
        )}
      </motion.section>
    </div>
  );
};

function QuickAction({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="group -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-accent/60">
      <span className="flex items-center gap-2.5"><Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" strokeWidth={1.75} />{label}</span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
    </Link>
  );
}

function Status({ status }: { status: string }) {
  const tone = status === 'OFFER' || status === 'JOINED'
    ? 'border-success/25 bg-success-soft text-success'
    : status === 'REJECTED'
      ? 'border-destructive/25 bg-destructive-soft text-destructive'
      : 'border-border bg-muted text-muted-foreground';
  return <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] ${tone}`}>{status.replace(/_/g, ' ')}</span>;
}

export default CandidateDashboard;
