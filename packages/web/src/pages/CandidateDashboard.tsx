import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from 'react-query';
import {
  ArrowRight, ArrowUpRight, Bookmark, BriefcaseBusiness, Check, CheckCircle2,
  CircleUserRound, Coins, FileText, GraduationCap, MapPin, Mic, Presentation,
  Sparkles, Target, Users, TrendingUp, Clock, Flame, Zap,
} from 'lucide-react';
import { candidate, practice, credits } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;
const rise = (delay = 0, y = 14) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: EASE, delay },
});
const fade = (delay = 0) => ({
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.4, ease: EASE, delay },
});

const PREP_MODULES = [
  { title: 'Mock interview', body: 'Practice real questions with adaptive AI follow-ups.', to: '/practice', icon: Mic, accent: 'from-[hsl(14,46%,58%/0.18)] to-transparent' },
  { title: 'Group discussion', body: 'Build confident arguments and clear participation.', to: '/preparation', icon: Users, accent: 'from-[hsl(28,40%,55%/0.16)] to-transparent' },
  { title: 'Presentation', body: 'Structure slides, speaking notes, and Q&A.', to: '/preparation', icon: Presentation, accent: 'from-[hsl(20,36%,52%/0.16)] to-transparent' },
  { title: 'Company research', body: 'Cited insights with honest gaps, never guesses.', to: '/preparation', icon: BriefcaseBusiness, accent: 'from-[hsl(88,20%,45%/0.14)] to-transparent' },
  { title: 'Skill gap analysis', body: 'Map your strengths to real posting requirements.', to: '/recommendations', icon: Target, accent: 'from-[hsl(14,46%,58%/0.14)] to-transparent' },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function CompletionRing({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center">
      <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label={`Profile ${safe}% complete`} className="drop-shadow-sm">
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(14 52% 62%)" />
            <stop offset="100%" stopColor="hsl(20 40% 46%)" />
          </linearGradient>
        </defs>
        <circle cx="46" cy="46" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="7" />
        <motion.circle
          cx="46" cy="46" r={r} fill="none" stroke="url(#ring-grad)" strokeWidth="7"
          strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - safe / 100) }}
          transition={{ duration: 1, ease: EASE, delay: 0.2 }}
          transform="rotate(-90 46 46)"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-mono text-[16px] font-semibold tabular-nums text-foreground">{safe}%</span>
      </div>
    </div>
  );
}

function ProgressStepper({ statuses }: { statuses: Record<string, number> }) {
  const stages = [
    { key: 'APPLIED', label: 'Applied' },
    { key: 'INTERVIEW', label: 'Interview' },
    { key: 'OFFER', label: 'Offer' },
    { key: 'JOINED', label: 'Joined' },
  ];
  const reached = stages.reduce((best, stage, i) => (Number(statuses?.[stage.key] || 0) > 0 ? i : best), -1);
  return (
    <ol className="mt-5 flex items-start" aria-label="Application progress">
      {stages.map((stage, index) => {
        const done = index <= reached;
        const active = index === reached;
        return (
          <li key={stage.key} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cn('h-px flex-1', index === 0 ? 'bg-transparent' : done ? 'bg-signal/60' : 'bg-border')} />
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15 + index * 0.07, duration: 0.3, ease: EASE }}
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-[10px] tabular-nums transition-all',
                  done ? 'border-signal/40 bg-signal text-signal-foreground shadow-[0_0_0_4px_hsl(var(--signal)/0.1)]' : 'border-border bg-surface text-muted-foreground',
                  active && 'ring-4 ring-signal/10',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : index + 1}
              </motion.span>
              <span className={cn('h-px flex-1', index === stages.length - 1 ? 'bg-transparent' : done && index < reached ? 'bg-signal/60' : 'bg-border')} />
            </div>
            <span className={cn('mt-2.5 text-[11px] font-medium', done ? 'text-foreground' : 'text-muted-foreground')}>{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function StatTile({ icon: Icon, label, value, hint, delay, tone = 'signal' }: { icon: any; label: string; value: React.ReactNode; hint: string; delay: number; tone?: 'signal' | 'success' | 'primary' | 'muted' }) {
  const tones: Record<string, string> = {
    signal: 'bg-signal-soft text-signal',
    success: 'bg-success-soft text-success',
    primary: 'bg-primary-soft text-primary',
    muted: 'bg-muted text-muted-foreground',
  };
  return (
    <motion.div {...rise(delay)} whileHover={{ y: -4, transition: { duration: 0.2 } }} className="group card hover-lift relative overflow-hidden p-5">
      <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-signal/[0.04] transition-transform duration-300 group-hover:scale-150" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 font-mono text-[28px] font-semibold leading-none tabular-nums tracking-tight text-foreground">{value}</p>
          <p className="mt-2 text-[12px] text-muted-foreground">{hint}</p>
        </div>
        <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform duration-300 group-hover:scale-105', tones[tone])}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </div>
    </motion.div>
  );
}

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
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
  const pCompleted = (sessionsData?.sessions || []).filter((s) => s.status === 'completed');
  const pLastScore = pCompleted[0]?.overall_score ?? null;
  const pSub = subData?.subscription;
  const pQuota = pSub && !pSub.unlimited && pSub.monthly_limit != null
    ? { used: Math.min(pSub.used_this_month, pSub.monthly_limit), limit: pSub.monthly_limit }
    : null;

  const profileChecks = [
    { label: 'Basic details', done: Boolean(profile?.full_name || profile?.headline) },
    { label: 'Education', done: Boolean(profile?.education_level || (profile as any)?.education?.length) },
    { label: 'Skills', done: ((profile?.skills as string[]) || []).length > 0 },
    { label: 'Experience', done: ((profile?.experience as unknown[]) || []).length > 0 },
  ];
  const offerCount = Number(statuses.OFFER || 0) + Number(statuses.JOINED || 0);
  const progressMessage = offerCount > 0
    ? 'You have an offer milestone to review.'
    : Number(statuses.INTERVIEW || 0) > 0
      ? 'An interview is in progress. Keep preparing.'
      : Number(statuses.APPLIED || 0) > 0
        ? 'You are on track. Keep the momentum going.'
        : 'Save a role to start tracking your progress.';

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6 pb-2">
      {/* Hero */}
      <motion.section {...rise(0)} className="relative overflow-hidden rounded-2xl border border-[hsl(22,22%,24%)] bg-grad-hero p-6 text-[hsl(33,34%,94%)] sm:p-8 lg:p-9">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grad-glow" />
        <motion.div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full border border-[hsl(14,46%,58%/0.14)]" animate={{ scale: [1, 1.04, 1], rotate: [0, 6, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div aria-hidden className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full border border-[hsl(14,46%,58%/0.1)]" animate={{ scale: [1, 1.06, 1], rotate: [0, -8, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-[hsl(14,46%,58%/0.25)] to-transparent" />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div className="max-w-3xl">
            <motion.div {...fade(0.05)} className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(14,46%,58%/0.25)] bg-[hsl(14,46%,58%/0.1)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[hsl(14,52%,68%)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(14,52%,62%)] animate-pulse-soft" /> Your career space
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[hsl(30,16%,62%)]">{today}</span>
            </motion.div>
            <motion.p {...rise(0.08)} className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(14,46%,64%)]">{greeting()}</motion.p>
            <motion.h1 {...rise(0.12)} className="mt-2 text-[34px] font-semibold leading-[1.06] tracking-[-0.035em] text-[#EFDECD] sm:text-[44px] lg:text-[48px]">
              Welcome back, {firstName}.
            </motion.h1>
            <motion.p {...rise(0.16)} className="mt-4 max-w-2xl text-[14px] leading-relaxed text-[hsl(30,18%,74%)] sm:text-[15px]">
              Your next opportunity is closer than it looks. Discover roles that fit your strengths, prepare with intent, and move forward with confidence.
            </motion.p>
            <motion.div {...rise(0.2)} className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/recommendations" className="group inline-flex h-11 items-center gap-2 rounded-xl bg-[hsl(14,46%,58%)] px-5 text-[13px] font-semibold text-[hsl(22,32%,12%)] transition-all duration-200 hover:bg-[hsl(14,50%,64%)] hover:shadow-[0_8px_24px_-8px_hsl(14,46%,58%,0.5)]">
                Explore recommended jobs <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/profile" className="inline-flex h-11 items-center gap-2 rounded-xl border border-[hsl(33,34%,94%/0.16)] bg-[hsl(33,34%,94%/0.04)] px-5 text-[13px] font-medium text-[hsl(33,34%,94%)] transition-all duration-200 hover:bg-[hsl(33,34%,94%/0.08)] hover:border-[hsl(33,34%,94%/0.24)]">
                <CircleUserRound className="h-4 w-4 text-[hsl(14,46%,64%)]" /> Edit profile
              </Link>
            </motion.div>
          </div>

          <motion.div {...rise(0.22)} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-[hsl(33,34%,94%/0.1)] bg-[hsl(33,34%,94%/0.04)] p-4 backdrop-blur-[2px]">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(30,16%,66%)]">Fresh roles</p>
              <p className="mt-2 font-mono text-[30px] leading-none tabular-nums text-[#EFDECD]">{summary?.fresh_jobs_7d ?? 0}</p>
              <p className="mt-1 text-[12px] text-[hsl(30,16%,70%)]">new in the last 7 days</p>
            </div>
            <div className="rounded-2xl border border-[hsl(33,34%,94%/0.1)] bg-[hsl(33,34%,94%/0.04)] p-4 backdrop-blur-[2px]">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(30,16%,66%)]">Profile strength</p>
              <div className="mt-2 flex items-end gap-2">
                <p className="font-mono text-[30px] leading-none tabular-nums text-[#EFDECD]">{completion}%</p>
                <span className={cn('mb-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium', completion >= 80 ? 'bg-success/20 text-[hsl(88,40%,72%)]' : 'bg-[hsl(14,46%,58%/0.15)] text-[hsl(14,52%,70%)]')}>{completion >= 80 ? 'Strong' : 'Growing'}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[hsl(33,34%,94%/0.1)]"><motion.div className="h-full rounded-full bg-[linear-gradient(90deg,hsl(14,52%,62%),hsl(28,45%,58%))]" initial={{ width: 0 }} animate={{ width: `${completion}%` }} transition={{ duration: 0.9, ease: EASE, delay: 0.3 }} /></div>
            </div>
            <div className="rounded-2xl border border-[hsl(33,34%,94%/0.1)] bg-[hsl(33,34%,94%/0.04)] p-4 backdrop-blur-[2px]">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(30,16%,66%)]">Credits</p>
              <p className="mt-2 font-mono text-[30px] leading-none tabular-nums text-[#EFDECD]">{creditsData?.wallet.balance ?? '—'}</p>
              <p className="mt-1 text-[12px] text-[hsl(30,16%,70%)]">{creditsData?.plan.name || 'Plan'} available</p>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile icon={BriefcaseBusiness} label="Active jobs" value={summary?.fresh_jobs_7d ?? 0} hint="Fresh in the last 7 days" delay={0.05} tone="signal" />
        <StatTile icon={Target} label="Applied" value={summary?.application_total ?? 0} hint={`${activeCount} currently active`} delay={0.09} tone="primary" />
        <StatTile icon={Coins} label="Credits" value={creditsData?.wallet.balance ?? '—'} hint={creditsData ? `${creditsData.plan.name} plan` : 'Loading plan'} delay={0.13} tone="success" />
        <StatTile icon={TrendingUp} label="Offers & joined" value={offerCount} hint="Your latest milestones" delay={0.17} tone="muted" />
      </section>

      {!summary?.has_profile && (
        <motion.section {...rise(0.1)} className="card hover-lift flex flex-col gap-4 border-signal/25 bg-grad-accent p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-signal-soft text-signal"><Sparkles className="h-5 w-5" /></div>
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Start with your profile</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">Add your skills and experience, or upload a resume. You review and confirm everything before it is saved.</p>
            </div>
          </div>
          <Link to="/profile" className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-glow">Set up profile</Link>
        </motion.section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        {/* Recommended jobs */}
        <motion.section {...rise(0.15)} className="min-w-0 space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Recommended for you</p>
              <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-foreground">Jobs that match your profile</h2>
            </div>
            <Link to="/recommendations" className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              View all <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {topJobs.length ? (
            <div className="space-y-4">
              {topJobs.map((job, i) => (
                <motion.div key={job.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.18 + i * 0.07 }} whileHover={{ y: -2 }} className="transition-shadow">
                  <JobCard job={job} />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="card bg-grad-card p-8 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-signal-soft text-signal"><Target className="h-6 w-6" /></div>
              <p className="mt-4 text-[14px] font-medium text-foreground">{summary?.has_profile ? 'No close matches yet' : 'Your recommendations are waiting'}</p>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{summary?.has_profile ? 'No roles have reached your match threshold yet. Browse trusted jobs to explore more.' : 'Complete your profile and your tailored recommendations will appear here.'}</p>
              <Link to={summary?.has_profile ? '/jobs' : '/profile'} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-signal hover:underline">{summary?.has_profile ? 'Browse jobs' : 'Complete profile'} <ArrowUpRight className="h-3.5 w-3.5" /></Link>
            </div>
          )}
        </motion.section>

        {/* Right column */}
        <div className="space-y-5">
          <motion.section {...rise(0.2)} className="card overflow-hidden">
            <div className="border-b border-border bg-grad-accent px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="eyebrow">Your activity</p>
                  <h2 className="mt-1 text-[15px] font-semibold text-foreground">Application progress</h2>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-signal shadow-sm"><TrendingUp className="h-4 w-4" /></span>
              </div>
            </div>
            <div className="p-5">
              <ProgressStepper statuses={statuses} />
              <div className="mt-5 flex items-center gap-2.5 rounded-xl border border-success/20 bg-success-soft/60 px-3.5 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <p className="text-[12.5px] leading-relaxed text-foreground/85">{progressMessage}</p>
              </div>
              <Link to="/applications" className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline">Open application tracker <ArrowRight className="h-3 w-3" /></Link>
            </div>
          </motion.section>

          <motion.section {...rise(0.24)} className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Profile strength</p>
                <h2 className="mt-1 text-[15px] font-semibold text-foreground">{completion >= 80 ? 'Looking strong' : 'Build your profile'}</h2>
              </div>
              <CompletionRing value={completion} />
            </div>
            <ul className="mt-4 space-y-2.5">
              {profileChecks.map((check, i) => (
                <motion.li key={check.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors', check.done ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-background text-muted-foreground')}>
                    {check.done ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />}
                  </span>
                  <span className={check.done ? 'text-foreground' : 'text-muted-foreground'}>{check.label}</span>
                </motion.li>
              ))}
            </ul>
            <Link to="/profile" className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-signal hover:underline">Complete profile <ArrowUpRight className="h-3 w-3" /></Link>
          </motion.section>

          <motion.section {...rise(0.28)} className="card p-5">
            <p className="eyebrow">Continue preparation</p>
            <h2 className="mt-1 text-[15px] font-semibold text-foreground">Practice, then build for the role.</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              {pQuota ? `${Math.max(0, pQuota.limit - pQuota.used)} free interview session${pQuota.limit - pQuota.used === 1 ? '' : 's'} left this month.` : pSub?.unlimited ? 'Pro plan — unlimited rehearsals.' : 'AI mock interviews, graded question by question.'}
            </p>
            <div className="mt-4 space-y-1">
              <QuickAction to="/preparation" icon={Sparkles} label="Open preparation workspace" />
              <QuickAction to="/practice" icon={Mic} label="Rehearse a mock interview" />
              <QuickAction to="/learning" icon={GraduationCap} label="Open learning tracks" />
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {pLastScore != null ? `Last scored session: ${pLastScore}/100` : 'No scored session yet'}
            </div>
          </motion.section>
        </div>
      </div>

      {/* Preparation center */}
      <motion.section {...rise(0.26)} className="space-y-4" aria-labelledby="prep-center-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Preparation center</p>
            <h2 id="prep-center-heading" className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-foreground">Build for the role, not in general.</h2>
          </div>
          <Link to="/preparation" className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            View all <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PREP_MODULES.map(({ title, body, to, icon: Icon, accent }, index) => (
            <motion.div key={title} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.28 + index * 0.05 }} whileHover={{ y: -5, transition: { duration: 0.2 } }}>
              <Link to={to} className="card group relative flex h-full flex-col overflow-hidden p-5 transition-all duration-200 hover:border-signal/25 hover:shadow-pop">
                <div aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b', accent)} />
                <span className="relative grid h-11 w-11 place-items-center rounded-xl border border-signal/15 bg-surface text-signal shadow-sm transition-all duration-300 group-hover:scale-105 group-hover:bg-signal group-hover:text-signal-foreground">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="relative mt-4 text-[14px] font-semibold text-foreground">{title}</h3>
                <p className="relative mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
                <div className="relative mt-auto flex items-center justify-between pt-5">
                  <span className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground/80">No credits charged</span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:text-signal group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Recent applications */}
      <motion.section {...rise(0.3)} className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Stay on top of replies</p>
            <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-foreground">Recent applications</h2>
          </div>
          <Link to="/applications" className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            Open tracker <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        {recentApps.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {recentApps.map((app, i) => (
              <motion.div key={app.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.32 + i * 0.05 }} whileHover={{ y: -4 }}>
                <Link to="/applications" className="card group flex h-full flex-col p-5 transition-all duration-200 hover:border-signal/20 hover:shadow-pop">
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground">{app.job_title}</span>
                    <Status status={app.status} />
                  </div>
                  <p className="mt-2.5 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />{app.company_name}</p>
                  <div className="mt-auto flex items-center justify-between pt-5">
                    <p className="font-mono text-[10.5px] text-muted-foreground/80">Updated {new Date(app.updated_at).toLocaleDateString()}</p>
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 transition-colors group-hover:text-signal" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="card bg-grad-card p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground"><BriefcaseBusiness className="h-6 w-6" /></div>
            <p className="mt-4 text-[14px] font-medium text-foreground">No applications yet</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">Save a role and start tracking your progress here.</p>
            <Link to="/jobs" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-signal hover:underline">Discover jobs <ArrowUpRight className="h-3.5 w-3.5" /></Link>
          </div>
        )}
      </motion.section>
    </div>
  );
};

function QuickAction({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="group -mx-2 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-foreground transition-all duration-150 hover:bg-accent/70 hover:translate-x-0.5">
      <span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-muted/70 text-muted-foreground transition-colors group-hover:bg-signal-soft group-hover:text-signal"><Icon className="h-4 w-4" strokeWidth={1.75} /></span>{label}</span>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 transition-all group-hover:text-signal group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

function Status({ status }: { status: string }) {
  const tone = status === 'OFFER' || status === 'JOINED'
    ? 'border-success/25 bg-success-soft text-success'
    : status === 'REJECTED'
      ? 'border-destructive/25 bg-destructive-soft text-destructive'
      : 'border-border bg-muted text-muted-foreground';
  return <span className={cn('inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em]', tone)}>{status.replace(/_/g, ' ')}</span>;
}

export default CandidateDashboard;
