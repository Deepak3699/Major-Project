import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from 'react-query';
import {
  ArrowRight, ArrowUpRight, BriefcaseBusiness, Check, CheckCircle2,
  CircleUserRound, Coins, MapPin, Mic, Presentation,
  Target, Users, TrendingUp, Clock, LayoutGrid, ListChecks, BookOpen,
} from 'lucide-react';
import { candidate, practice, credits } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;
const rise = (delay = 0, y = 14) => ({
  initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: EASE, delay },
});

type Section = 'snapshot' | 'jobs' | 'applications' | 'preparation';
const SECTIONS: { id: Section; label: string; icon: any }[] = [
  { id: 'snapshot', label: 'Snapshot', icon: LayoutGrid },
  { id: 'jobs', label: 'Recommended Jobs', icon: BriefcaseBusiness },
  { id: 'applications', label: 'Applications', icon: ListChecks },
  { id: 'preparation', label: 'Preparation', icon: BookOpen },
];

const PREP_MODULES = [
  { title: 'Mock interview', body: 'Practice real questions with adaptive AI follow-ups.', to: '/practice', icon: Mic },
  { title: 'Group discussion', body: 'Build confident arguments and clear participation.', to: '/preparation', icon: Users },
  { title: 'Presentation', body: 'Structure slides, speaking notes, and Q&A.', to: '/preparation', icon: Presentation },
  { title: 'Company research', body: 'Cited insights with honest gaps, never guesses.', to: '/preparation', icon: BriefcaseBusiness },
  { title: 'Skill gap analysis', body: 'Map your strengths to real posting requirements.', to: '/recommendations', icon: Target },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function CompletionRing({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 34; const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center">
      <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={`Profile ${safe}% complete`}>
        <defs><linearGradient id="home-ring" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="hsl(12 46% 44%)" /><stop offset="100%" stopColor="hsl(24 38% 52%)" /></linearGradient></defs>
        <circle cx="46" cy="46" r={r} fill="none" stroke="hsl(28 20% 86%)" strokeWidth="7" />
        <motion.circle cx="46" cy="46" r={r} fill="none" stroke="url(#home-ring)" strokeWidth="7" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - safe / 100) }} transition={{ duration: 1, ease: EASE, delay: 0.2 }} transform="rotate(-90 46 46)" />
      </svg>
      <div className="absolute inset-0 grid place-items-center"><span className="font-mono text-[16px] font-semibold tabular-nums text-foreground">{safe}%</span></div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, delay }: { icon: any; label: string; value: React.ReactNode; hint: string; delay: number }) {
  return (
    <motion.div {...rise(delay)} whileHover={{ y: -3, transition: { duration: 0.2 } }} className="glass-gloss-soft group relative overflow-hidden rounded-2xl p-5">
      <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-signal/50 via-signal/15 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-foreground/55">{label}</p>
          <p className="mt-2 font-mono text-[28px] font-semibold leading-none tabular-nums tracking-tight text-foreground">{value}</p>
          <p className="mt-2 text-[12px] text-foreground/65">{hint}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-signal/15 bg-signal-soft/70 text-signal transition-all duration-300 group-hover:bg-signal group-hover:text-signal-foreground"><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
      </div>
    </motion.div>
  );
}

function Status({ status }: { status: string }) {
  const tone = status === 'OFFER' || status === 'JOINED' ? 'border-success/25 bg-success-soft text-success'
    : status === 'REJECTED' ? 'border-destructive/25 bg-destructive-soft text-destructive'
    : 'border-border bg-muted text-foreground/65';
  return <span className={cn('inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em]', tone)}>{status.replace(/_/g, ' ')}</span>;
}

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const [active, setActive] = useState<Section>('snapshot');
  const { data: summary, isLoading } = useQuery('candidate-summary', candidate.summary, { refetchInterval: 30000 });
  const { data: recommendations } = useQuery('candidate-recommendations', candidate.recommendations, { enabled: !!summary?.has_profile, refetchInterval: 30000 });
  const { data: apps } = useQuery('candidate-applications', candidate.applications, { refetchInterval: 30000 });
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { enabled: !!summary?.has_profile, refetchInterval: 60000 });
  const { data: subData } = useQuery('practice-subscription', practice.subscription);
  const { data: sessionsData } = useQuery('practice-sessions', practice.sessions);
  const { data: creditsData } = useQuery('credits-overview', credits.overview);
  if (isLoading) return <PageLoader label="Loading your workspace…" />;

  const profile = profileData?.profile;
  const firstName = profile?.full_name?.trim()?.split(/\s+/)[0] || (user?.email || 'there').split('@')[0].split(/[._-]/)[0];
  const topJobs = recommendations?.data?.slice(0, 3) || [];
  const recentApps = apps?.data?.slice(0, 4) || [];
  const completion = Number(summary?.profile_completion || 0);
  const statuses = summary?.application_statuses || {};
  const activeCount = Object.entries(statuses).filter(([s]) => !['REJECTED', 'WITHDRAWN', 'JOINED'].includes(s)).reduce((sum, [, c]) => sum + c, 0);
  const offerCount = Number(statuses.OFFER || 0) + Number(statuses.JOINED || 0);
  const pCompleted = (sessionsData?.sessions || []).filter((s) => s.status === 'completed');
  const pLastScore = pCompleted[0]?.overall_score ?? null;
  const pSub = subData?.subscription;
  const pQuota = pSub && !pSub.unlimited && pSub.monthly_limit != null ? { used: Math.min(pSub.used_this_month, pSub.monthly_limit), limit: pSub.monthly_limit } : null;
  const profileChecks = [
    { label: 'Basic details', done: Boolean(profile?.full_name || profile?.headline) },
    { label: 'Education', done: Boolean(profile?.education_level || (profile as any)?.education?.length) },
    { label: 'Skills', done: ((profile?.skills as string[]) || []).length > 0 },
    { label: 'Experience', done: ((profile?.experience as unknown[]) || []).length > 0 },
  ];
  const progressMessage = offerCount > 0 ? 'You have an offer milestone to review.'
    : Number(statuses.INTERVIEW || 0) > 0 ? 'An interview is in progress. Keep preparing.'
    : Number(statuses.APPLIED || 0) > 0 ? 'You are on track. Keep the momentum going.'
    : 'Save a role to start tracking your progress.';

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-5 pb-2">
      <motion.section {...rise(0)} className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(180deg,hsl(36,42%,99%),hsl(33,34%,95%))] p-6 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.1),transparent_45%),radial-gradient(ellipse_at_bottom_left,rgba(73,49,38,0.04),transparent_45%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-signal/20 bg-signal-soft/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-signal">
                <span className="h-1.5 w-1.5 rounded-full bg-signal animate-pulse-soft" /> Home
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-foreground/55">{today}</span>
            </div>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-signal/85">{greeting()}</p>
            <h1 className="mt-2 text-[32px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[42px]">
              Welcome back, <span className="text-[hsl(20,40%,14%)]">{firstName}</span>.
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-foreground/75">
              Your career workspace, organized in one place. Track progress, discover roles, and prepare with focus.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/recommendations" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-all hover:bg-primary-hover">Explore jobs <ArrowRight className="h-4 w-4" /></Link>
            <Link to="/profile" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface/80 px-4 text-[13px] font-medium text-foreground transition-all hover:bg-accent"><CircleUserRound className="h-4 w-4 text-signal" /> Profile</Link>
          </div>
        </div>
      </motion.section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={BriefcaseBusiness} label="Fresh jobs" value={summary?.fresh_jobs_7d ?? 0} hint="New in last 7 days" delay={0.04} />
        <StatCard icon={Target} label="Applications" value={summary?.application_total ?? 0} hint={`${activeCount} active`} delay={0.07} />
        <StatCard icon={Coins} label="Credits" value={creditsData?.wallet.balance ?? '—'} hint={creditsData ? `${creditsData.plan.name} plan` : 'Loading plan'} delay={0.1} />
        <StatCard icon={TrendingUp} label="Profile strength" value={`${completion}%`} hint={completion >= 80 ? 'On track' : 'Needs attention'} delay={0.13} />
      </section>

      <section className="glass-gloss-soft rounded-2xl p-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Home sections">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(id)}
                className={cn(
                  "relative inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-medium transition-all duration-200",
                  isActive ? "text-primary-foreground" : "text-foreground/70 hover:bg-accent hover:text-foreground"
                )}
              >
                {isActive && <motion.span layoutId="home-tab" className="absolute inset-0 rounded-xl bg-primary shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.5)]" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <Icon className="relative z-10 h-4 w-4" />
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: EASE }}
        >
          {active === 'snapshot' && (
            <div className="grid gap-5 xl:grid-cols-3">
              <div className="glass-gloss-soft rounded-2xl p-5 xl:col-span-1">
                <div className="flex items-center justify-between">
                  <div><p className="eyebrow text-signal/85">Profile strength</p><h2 className="mt-1 text-[17px] font-semibold text-foreground">{completion >= 80 ? 'Looking strong' : 'Build your profile'}</h2></div>
                  <CompletionRing value={completion} />
                </div>
                <ul className="mt-5 space-y-3">
                  {profileChecks.map((c) => (
                    <li key={c.label} className="flex items-center gap-2.5 text-[13px]">
                      <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', c.done ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-surface text-foreground/40')}>
                        {c.done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />}
                      </span>
                      <span className={c.done ? 'text-foreground' : 'text-foreground/65'}>{c.label}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/profile" className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-signal hover:underline">Complete profile <ArrowUpRight className="h-3.5 w-3.5" /></Link>
              </div>

              <div className="glass-gloss-soft rounded-2xl p-5 xl:col-span-1">
                <p className="eyebrow text-signal/85">Application progress</p>
                <h2 className="mt-1 text-[17px] font-semibold text-foreground">Where you stand</h2>
                <div className="mt-5 space-y-3">
                  {[{ k: 'APPLIED', l: 'Applied' }, { k: 'INTERVIEW', l: 'Interview' }, { k: 'OFFER', l: 'Offer' }, { k: 'JOINED', l: 'Joined' }].map((s, i) => {
                    const count = Number(statuses[s.k] || 0);
                    return (
                      <div key={s.k} className="flex items-center gap-3">
                        <span className="w-20 text-[12px] text-foreground/65">{s.l}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><motion.div initial={{ width: 0 }} animate={{ width: `${count > 0 ? Math.max(12, Math.min(100, count * 20)) : 4}%` }} transition={{ duration: 0.5, delay: i * 0.05 }} className={cn('h-full rounded-full', count > 0 ? 'bg-signal' : 'bg-border')} /></div>
                        <span className="w-6 text-right font-mono text-[12px] tabular-nums text-foreground/70">{count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-success/20 bg-success-soft/60 px-3.5 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /><p className="text-[12.5px] leading-relaxed text-foreground/85">{progressMessage}</p>
                </div>
              </div>

              <div className="glass-gloss-soft rounded-2xl p-5 xl:col-span-1">
                <p className="eyebrow text-signal/85">Recent activity</p>
                <h2 className="mt-1 text-[17px] font-semibold text-foreground">What’s happening</h2>
                <div className="mt-5 space-y-4">
                  {recentApps.length ? recentApps.slice(0, 4).map((app) => (
                    <div key={app.id} className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-signal-soft/70 text-signal"><BriefcaseBusiness className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-foreground">{app.job_title}</p>
                        <p className="text-[12px] text-foreground/60">{app.company_name} · {new Date(app.updated_at).toLocaleDateString()}</p>
                      </div>
                      <Status status={app.status} />
                    </div>
                  )) : <p className="text-[13px] leading-relaxed text-foreground/65">Your recent job activity will appear here as you save and apply.</p>}
                </div>
                <Link to="/applications" className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-signal hover:underline">Open tracker <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </div>
          )}

          {active === 'jobs' && (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div><p className="eyebrow text-signal/85">Recommended for you</p><h2 className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-foreground">Jobs that match your profile</h2></div>
                <Link to="/recommendations" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/70 hover:text-foreground">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
              {topJobs.length ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {topJobs.map((job) => <JobCard key={job.id} job={job} />)}
                </div>
              ) : (
                <div className="glass-gloss-soft rounded-2xl p-10 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signal-soft text-signal"><Target className="h-6 w-6" /></div>
                  <p className="mt-4 text-[15px] font-medium text-foreground">{summary?.has_profile ? 'No close matches yet' : 'Your recommendations are waiting'}</p>
                  <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-foreground/72">{summary?.has_profile ? 'Browse trusted jobs while we find closer matches.' : 'Complete your profile to get tailored recommendations.'}</p>
                  <Link to={summary?.has_profile ? '/jobs' : '/profile'} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-signal hover:underline">{summary?.has_profile ? 'Browse jobs' : 'Complete profile'} <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                </div>
              )}
            </div>
          )}

          {active === 'applications' && (
            <div className="space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div><p className="eyebrow text-signal/85">Your pipeline</p><h2 className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-foreground">Recent applications</h2></div>
                <Link to="/applications" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/70 hover:text-foreground">Open tracker <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
              {recentApps.length ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {recentApps.map((app) => (
                    <Link key={app.id} to="/applications" className="glass-gloss-soft group flex h-full flex-col rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-signal/25">
                      <div className="flex items-start justify-between gap-2"><span className="line-clamp-2 text-[14px] font-semibold leading-snug text-foreground">{app.job_title}</span><Status status={app.status} /></div>
                      <p className="mt-3 flex items-center gap-1.5 truncate text-[12px] text-foreground/65"><MapPin className="h-3.5 w-3.5 shrink-0 text-foreground/45" />{app.company_name}</p>
                      <div className="mt-auto flex items-center justify-between pt-5"><p className="font-mono text-[10.5px] text-foreground/55">Updated {new Date(app.updated_at).toLocaleDateString()}</p><ArrowUpRight className="h-3.5 w-3.5 text-foreground/35 group-hover:text-signal" /></div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="glass-gloss-soft rounded-2xl p-10 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted text-foreground/60"><BriefcaseBusiness className="h-6 w-6" /></div>
                  <p className="mt-4 text-[15px] font-medium text-foreground">No applications yet</p>
                  <p className="mt-2 text-[13px] text-foreground/72">Save a role and start tracking your progress here.</p>
                  <Link to="/jobs" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-signal hover:underline">Discover jobs <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                </div>
              )}
            </div>
          )}

          {active === 'preparation' && (
            <div className="space-y-5">
              <div className="flex items-end justify-between gap-3">
                <div><p className="eyebrow text-signal/85">Preparation center</p><h2 className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-foreground">Build for the role, not in general.</h2></div>
                <Link to="/preparation" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground/70 hover:text-foreground">Open workspace <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {PREP_MODULES.map(({ title, body, to, icon: Icon }) => (
                  <Link key={title} to={to} className="glass-gloss-soft group relative flex h-full flex-col overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-signal/25">
                    <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-signal/55 via-signal/20 to-transparent" />
                    <span className="grid h-11 w-11 place-items-center rounded-xl border border-signal/15 bg-signal-soft/70 text-signal transition-all duration-300 group-hover:bg-signal group-hover:text-signal-foreground"><Icon className="h-5 w-5" strokeWidth={1.75} /></span>
                    <h3 className="mt-4 text-[14px] font-semibold text-foreground">{title}</h3>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/72">{body}</p>
                    <div className="mt-auto pt-5 flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[0.05em] text-foreground/55">Open</span><ArrowUpRight className="h-3.5 w-3.5 text-foreground/35 group-hover:text-signal" /></div>
                  </Link>
                ))}
              </div>
              <div className="glass-gloss-soft rounded-2xl p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-signal-soft text-signal"><Clock className="h-5 w-5" /></span>
                  <div>
                    <p className="text-[14px] font-medium text-foreground">{pLastScore != null ? `Last scored session: ${pLastScore}/100` : 'No scored session yet'}</p>
                    <p className="text-[12px] text-foreground/65">{pQuota ? `${Math.max(0, pQuota.limit - pQuota.used)} free interview session${pQuota.limit - pQuota.used === 1 ? '' : 's'} left this month.` : pSub?.unlimited ? 'Pro plan — unlimited rehearsals.' : 'Practice and track your readiness.'}</p>
                  </div>
                </div>
                <Link to="/practice" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary-hover">Start practice</Link>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default CandidateDashboard;
