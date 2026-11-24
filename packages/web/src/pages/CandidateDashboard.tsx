import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from 'react-query';
import {
  ArrowRight, ArrowUpRight, Bookmark, BriefcaseBusiness, Check, CheckCircle2,
  CircleUserRound, Coins, FileText, GraduationCap, MapPin, Mic, Presentation,
  Target, Users,
} from 'lucide-react';
import { candidate, practice, credits } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { StatCard } from '@/components/ui/stat-card';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

// Shared entrance: fade + 8px rise.
const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE, delay },
});

const PREP_MODULES = [
  { title: 'Mock interview', body: 'Questions, grading and adaptive follow-ups.', to: '/practice', icon: Mic },
  { title: 'Group discussion', body: 'Topics, arguments and participation tips.', to: '/preparation', icon: Users },
  { title: 'Presentation', body: 'Slide outline, speaking notes and questions.', to: '/preparation', icon: Presentation },
  { title: 'Company research', body: 'Cited sources, with gaps labelled honestly.', to: '/preparation', icon: BriefcaseBusiness },
  { title: 'Skill gap analysis', body: 'See which posting requirements you can evidence.', to: '/recommendations', icon: Target },
];

function CompletionRing({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="76" height="76" viewBox="0 0 76 76" role="img" aria-label={`Profile ${safe}% complete`}>
      <circle cx="38" cy="38" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
      <circle
        cx="38" cy="38" r={radius} fill="none" stroke="hsl(var(--signal))" strokeWidth="6"
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - safe / 100)}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="42" textAnchor="middle" className="font-mono text-[14px] tabular-nums" style={{ fill: 'hsl(var(--foreground))' }}>
        {safe}%
      </text>
    </svg>
  );
}

function ProgressStepper({ statuses }: { statuses: Record<string, number> }) {
  const stages = [
    { key: 'APPLIED', label: 'Applied' },
    { key: 'INTERVIEW', label: 'Interview' },
    { key: 'OFFER', label: 'Offer' },
    { key: 'JOINED', label: 'Joined' },
  ];
  const reached = stages.reduce((best, stage, index) => (Number(statuses?.[stage.key] || 0) > 0 ? index : best), -1);
  return (
    <ol className="mt-4 flex items-start" aria-label="Application progress">
      {stages.map((stage, index) => {
        const done = index <= reached;
        return (
          <li key={stage.key} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={cn('h-px flex-1', index === 0 ? 'bg-transparent' : done ? 'bg-signal' : 'bg-border')} />
              <span
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full border font-mono text-[10px] tabular-nums',
                  done ? 'border-signal bg-signal text-signal-foreground' : 'border-border bg-background text-muted-foreground',
                )}
                aria-current={index === reached + 1 ? 'step' : undefined}
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
              </span>
              <span className={cn('h-px flex-1', index === stages.length - 1 ? 'bg-transparent' : done && index < reached ? 'bg-signal' : 'bg-border')} />
            </div>
            <span className={cn('mt-2 text-[11px]', done ? 'font-medium text-foreground' : 'text-muted-foreground')}>{stage.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

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
  const statuses = summary?.application_statuses || {};
  const activeCount = Object.entries(statuses).filter(([status]) => !['REJECTED', 'WITHDRAWN', 'JOINED'].includes(status)).reduce((sum, [, count]) => sum + count, 0);
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

  return (
    <div className="space-y-4">
      {/* Welcome banner + profile completion */}
      <motion.section {...rise(0)} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative overflow-hidden rounded-2xl border border-[hsl(22,22%,24%)] bg-[hsl(22,32%,15%)] p-6 text-[hsl(33,34%,94%)] sm:p-8">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-[hsl(14,46%,58%/0.16)]" />
          <div aria-hidden className="pointer-events-none absolute -bottom-20 right-20 h-48 w-48 rounded-full border border-[hsl(14,46%,58%/0.1)]" />
          <div aria-hidden className="pointer-events-none absolute right-0 top-0 h-full w-1/3 bg-[hsl(14,46%,58%/0.04)]" />
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 max-w-2xl">
              <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[hsl(14,46%,64%)]">Your career space</p>
              <h1 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.032em] sm:text-[40px]">
                Welcome back, {firstName}.
              </h1>
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-[hsl(30,18%,74%)]">
                Your next opportunity is closer than it looks. Pick a role that fits your confirmed skills, prepare with intent, and track every step with confidence.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link to="/recommendations" className="inline-flex h-11 items-center gap-2 rounded-lg bg-[hsl(14,46%,58%)] px-5 text-[13px] font-semibold text-[hsl(22,32%,12%)] transition-colors hover:bg-[hsl(14,50%,64%)]">
                  Explore recommended jobs <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/profile" className="inline-flex h-11 items-center gap-2 rounded-lg border border-[hsl(33,34%,94%/0.18)] bg-[hsl(33,34%,94%/0.04)] px-5 text-[13px] font-medium text-[hsl(33,34%,94%)] transition-colors hover:bg-[hsl(33,34%,94%/0.08)]">
                  <CircleUserRound className="h-4 w-4 text-[hsl(14,46%,64%)]" /> Edit profile
                </Link>
              </div>
            </div>
            <div className="hidden shrink-0 sm:block">
              <div className="rounded-2xl border border-[hsl(33,34%,94%/0.12)] bg-[hsl(33,34%,94%/0.04)] p-4 backdrop-blur-[1px]">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(30,18%,68%)]">Today&apos;s focus</p>
                <p className="mt-2 font-mono text-[30px] tabular-nums leading-none text-[hsl(33,34%,94%)]">{summary?.fresh_jobs_7d ?? 0}</p>
                <p className="mt-1 text-[12px] text-[hsl(30,18%,72%)]">fresh roles this week</p>
                <div className="mt-4 flex items-center gap-2 border-t border-[hsl(33,34%,94%/0.1)] pt-3">
                  <span className="h-2 w-2 rounded-full bg-[hsl(14,46%,58%)]" aria-hidden />
                  <span className="text-[11px] text-[hsl(30,18%,72%)]">Profile {completion}% complete</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className="card flex flex-col p-5 sm:p-6" aria-labelledby="profile-completion-heading">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-primary-soft p-1">
              <CompletionRing value={completion} />
            </div>
            <div className="min-w-0">
              <p id="profile-completion-heading" className="eyebrow">Profile completion</p>
              <p className="mt-1.5 text-[14px] font-semibold text-foreground">{completion >= 80 ? 'Looking strong' : completion >= 50 ? 'Good progress' : 'A few details left'}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Complete your profile for closer, higher-confidence matches.</p>
            </div>
          </div>
          <ul className="mt-5 space-y-2.5 border-t border-border pt-4">
            {profileChecks.map((check) => (
              <li key={check.label} className="flex items-center gap-2.5 text-[12.5px]">
                <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-full border', check.done ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-background text-muted-foreground')}>
                  {check.done ? <Check className="h-3 w-3" aria-hidden /> : null}
                </span>
                <span className={check.done ? 'text-foreground' : 'text-muted-foreground'}>{check.label}</span>
              </li>
            ))}
          </ul>
          <Link to="/profile" className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-signal transition-colors hover:text-primary-hover hover:underline hover:decoration-signal hover:underline-offset-4">
            Complete profile <ArrowUpRight className="h-3 w-3" />
          </Link>
        </section>
      </motion.section>

      {/* Stat row */}
      <motion.section {...rise(0.05)} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={BriefcaseBusiness} label="Active jobs" value={summary?.fresh_jobs_7d ?? 0} hint="Fresh in the last 7 days" />
        <StatCard icon={Target} label="Applied" value={summary?.application_total ?? 0} hint={activeCount + ' currently active'} />
        <StatCard icon={Coins} label="Preparation credits" value={creditsData?.wallet.balance ?? '—'} hint={creditsData ? `${creditsData.plan.name} plan` : 'Loading plan'} />
        <StatCard icon={CheckCircle2} label="Offers & joined" value={offerCount} hint="Your latest milestones" />
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
              <p className="eyebrow">Recommended for you</p>
              <h2 className="mt-1 text-lg font-semibold tracking-[-0.014em] text-foreground">Jobs that match your profile</h2>
            </div>
            <Link to="/recommendations" className="group inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
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
          {/* Application progress */}
          <section className="card p-5" aria-labelledby="application-progress-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Your activity</p>
                <h2 id="application-progress-heading" className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-foreground">Application progress</h2>
              </div>
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-muted-foreground/60" strokeWidth={1.75} />
            </div>
            <ProgressStepper statuses={statuses} />
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-3 py-2.5">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
              <p className="text-[12px] leading-relaxed text-foreground/85">{progressMessage}</p>
            </div>
            <Link to="/applications" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">Open application tracker <ArrowRight className="h-3 w-3" /></Link>
          </section>

          {/* Continue preparation */}
          <section className="card p-5" aria-labelledby="continue-prep-heading">
            <p className="eyebrow">Continue your preparation</p>
            <h2 id="continue-prep-heading" className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-foreground">Practice, then build for the role.</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              {pQuota
                ? `${pQuota.limit - pQuota.used} free interview session${pQuota.limit - pQuota.used === 1 ? '' : 's'} left this month.`
                : pSub?.unlimited ? 'Pro plan — unlimited rehearsals.' : 'AI mock interviews, graded question by question.'}
            </p>
            <div className="mt-3 space-y-0.5">
              <QuickAction to="/preparation" icon={FileText} label="Open preparation workspace" />
              <QuickAction to="/practice" icon={Mic} label="Rehearse a mock interview" />
              <QuickAction to="/learning" icon={GraduationCap} label="Open learning tracks" />
            </div>
            <p className="mt-3 border-t border-border pt-3 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
              {pLastScore != null ? `Last scored session: ${pLastScore}/100` : 'No scored session yet'}
            </p>
          </section>

          {/* Career stats */}
          <section className="card p-5" aria-labelledby="career-stats-heading">
            <p id="career-stats-heading" className="eyebrow">Your career stats</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Stat value={summary?.application_total ?? 0} label="Applications" />
              <Stat value={Number(statuses.SCREENING || 0) + Number(statuses.INTERVIEW || 0)} label="In process" />
              <Stat value={offerCount} label="Offers" />
              <Stat value={creditsData?.wallet.balance ?? 0} label="Credits" />
            </div>
            <Link to="/credits" className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">
              View credits & ledger <ArrowUpRight className="h-3 w-3" />
            </Link>
          </section>
        </motion.div>
      </div>

      {/* Preparation center */}
      <motion.section {...rise(0.23)} className="space-y-3" aria-labelledby="prep-center-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Preparation center</p>
            <h2 id="prep-center-heading" className="mt-1 text-lg font-semibold tracking-[-0.014em] text-foreground">Build for the role, not in general.</h2>
          </div>
          <Link to="/preparation" className="group inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">View all <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PREP_MODULES.map(({ title, body, to, icon: Icon }, index) => (
            <motion.div key={title} {...rise(Math.min(0.24 + index * 0.04, 0.36))}>
              <Link to={to} className="card group flex h-full flex-col p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-signal/25 hover:shadow-pop">
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl border border-signal/15 bg-signal-soft text-signal transition-colors group-hover:bg-signal group-hover:text-signal-foreground">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-[13.5px] font-semibold text-foreground">{title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
                <p className="mt-auto pt-4 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">No credits charged</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Recent applications */}
      <motion.section {...rise(0.28)} className="space-y-3">
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

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
      <p className="font-mono text-[20px] tabular-nums leading-none text-foreground">{value}</p>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">{label}</p>
    </div>
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
