import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowRight, ArrowUpRight, Banknote, Bookmark, BriefcaseBusiness, Check, ChevronDown,
  Clock3, MapPin, Search, ShieldCheck, Sparkles, Target, TrendingUp, X,
} from 'lucide-react';
import { candidate } from '@/lib/api';
import type { CandidateJob } from '@/lib/types';
import { PageLoader } from '@/components/ui/spinner';
import { cn } from '@/components/ui/cn';
import { useToast } from '@/components/ui/toast';
import { JobRoleAvatar, getRoleTheme } from '@/components/candidate/JobRoleAvatar';

const EASE = [0.22, 1, 0.36, 1] as const;
const WEIGHT_LABELS: Record<string, string> = {
  skills: 'Skills', experience: 'Experience', education: 'Education', location: 'Location',
  role: 'Role fit', projects: 'Projects', salary: 'Salary', preferences: 'Preferences',
};

function trustLabel(band: CandidateJob['trust_band']) {
  if (band === 'very_high') return 'Very high confidence';
  if (band === 'high') return 'High confidence';
  if (band === 'low') return 'Low trust';
  if (band === 'review') return 'Trust check';
  return 'Trust';
}

function trustTone(band: CandidateJob['trust_band']) {
  if (band === 'very_high' || band === 'high' || band === 'review') return 'border-success/25 bg-success-soft text-success';
  if (band === 'low') return 'border-destructive/25 bg-destructive-soft text-destructive';
  return 'border-warning/25 bg-warning-soft text-warning';
}

function matchTone(score?: number) {
  if ((score ?? 0) >= 85) return 'border-success/30 bg-success-soft text-success';
  if ((score ?? 0) >= 75) return 'border-signal/30 bg-signal-soft text-signal';
  return 'border-warning/30 bg-warning-soft text-warning';
}

function postedLabel(job: CandidateJob) {
  const raw = job.posted_at || job.first_seen_at;
  if (!raw) return null;
  const date = new Date(raw);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function MatchRing({ score }: { score: number }) {
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const tone = clamped >= 85 ? 'hsl(var(--success))' : clamped >= 75 ? 'hsl(var(--signal))' : 'hsl(var(--warning))';
  return (
    <div className="relative grid h-14 w-14 shrink-0 place-items-center" role="img" aria-label={`${clamped} percent match`}>
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={radius} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)}
        />
      </svg>
      <span className="font-mono text-[12.5px] font-semibold tabular-nums tracking-[-0.03em] text-foreground">{Math.round(clamped)}<span className="text-[9px] text-muted-foreground">%</span></span>
    </div>
  );
}

function RecommendationCard({
  job, saved, saving, onSave,
}: {
  job: CandidateJob;
  saved: boolean;
  saving: boolean;
  onSave: (job: CandidateJob) => void;
}) {
  const [open, setOpen] = useState(false);
  const matched = job.matched_skills || [];
  const missing = job.missing_skills || [];
  const reasons = job.match_reasons || [];
  const breakdown = Object.entries(job.score_breakdown || {});
  const posted = postedLabel(job);
  const score = Math.round(job.match_score ?? 0);
  const theme = getRoleTheme(job.title, job.company_industry, job.skills);

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition duration-200 hover:border-border-strong hover:shadow-card-hover">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] opacity-40" style={{ backgroundColor: theme.color }} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <JobRoleAvatar title={job.title} industry={job.company_industry} skills={job.skills} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium', trustTone(job.trust_band))}>
                <ShieldCheck className="mr-1 h-2.5 w-2.5" />{trustLabel(job.trust_band)} · {job.trust_score}
              </span>
              {posted && <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground"><Clock3 className="h-2.5 w-2.5" />{posted}</span>}
              {Number(job.source_count) > 1 && <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">{job.source_count} sources</span>}
            </div>
            <Link
              to={`/jobs/${job.id}?from=recommendations`}
              className="mt-1.5 block text-[16px] font-semibold leading-snug tracking-[-0.018em] text-foreground transition-colors hover:text-primary hover:underline hover:decoration-primary/50 hover:underline-offset-4"
            >
              {job.title}
            </Link>
            <p className="mt-0.5 truncate text-[12px] font-medium text-muted-foreground">
              {job.company_name}{job.company_industry ? ` · ${job.company_industry}` : ''}
            </p>
          </div>
          <MatchRing score={score} />
        </div>

        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-muted-foreground">
          {job.location && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{job.location}{job.location_type ? ` · ${job.location_type}` : ''}</span></span>}
          {job.employment_type && <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3 w-3" />{job.employment_type.replace(/_/g, ' ')}</span>}
          {job.experience_level && <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" />{job.experience_level}</span>}
          {job.salary_range && <span className="inline-flex items-center gap-1"><Banknote className="h-3 w-3" />{job.salary_range}</span>}
        </div>

        <div className="mt-3.5 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="eyebrow">Skill match</p>
            <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-medium', matchTone(score))}>{matched.length} matched</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matched.slice(0, 6).map((skill) => (
              <span key={skill} className="inline-flex items-center gap-1 rounded-md border border-success/25 bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                <Check className="h-2.5 w-2.5" />{skill}
              </span>
            ))}
            {matched.length > 6 && <span className="font-mono text-[10px] text-success">+{matched.length - 6}</span>}
            {!matched.length && <span className="text-[10.5px] text-muted-foreground">No direct skill overlap yet — your role and location still line up.</span>}
          </div>
          {missing.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-2">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-warning">To learn</span>
              {missing.slice(0, 3).map((skill) => (
                <span key={skill} className="rounded border border-warning/25 bg-warning-soft/70 px-1.5 py-0.5 text-[10px] font-medium text-warning">{skill}</span>
              ))}
              {missing.length > 3 && <span className="font-mono text-[10px] text-warning">+{missing.length - 3}</span>}
            </div>
          )}
        </div>

        {reasons.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {reasons.slice(0, 2).map((reason) => (
              <li key={reason} className="flex gap-2 text-[11.5px] leading-relaxed text-foreground/85">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />{reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-foreground transition-colors hover:text-primary"
        >
          Why this fits <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSave(job)}
            disabled={saved || saving}
            aria-label={saved ? `${job.title} is saved` : `Save ${job.title}`}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-semibold transition-colors',
              saved
                ? 'border-success/30 bg-success-soft text-success'
                : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
              saving && 'opacity-60',
            )}
          >
            {saved ? <Check className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
          <Link
            to={`/jobs/${job.id}?from=recommendations`}
            className="group inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            View role <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.28, ease: EASE }}
          className="overflow-hidden border-t border-border bg-muted/10"
        >
          <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <p className="eyebrow">Full reasoning</p>
              <ul className="mt-2.5 space-y-2">
                {reasons.length ? reasons.map((reason) => (
                  <li key={reason} className="flex gap-2 text-[11.5px] leading-relaxed text-foreground/85">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />{reason}
                  </li>
                )) : <li className="text-[11.5px] text-muted-foreground">This role scored on role, location and trust signals.</li>}
              </ul>
              {missing.length > 0 && (
                <div className="mt-4 rounded-lg border border-warning/25 bg-warning-soft/50 p-3">
                  <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-warning">Skills to add</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {missing.map((skill) => <span key={skill} className="rounded border border-warning/30 bg-surface/70 px-1.5 py-0.5 text-[10px] font-medium text-warning">{skill}</span>)}
                  </div>
                </div>
              )}
            </div>
            <div>
              <p className="eyebrow">Score breakdown</p>
              <div className="mt-2.5 space-y-2.5">
                {breakdown.length ? breakdown.map(([key, value]) => (
                  <div key={key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[10.5px]">
                      <span className="text-muted-foreground">{WEIGHT_LABELS[key] || key}</span>
                      <span className="font-mono tabular-nums text-foreground">{value.score}% <span className="text-muted-foreground/80">· {value.weight}% weight</span></span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-info" style={{ width: `${Math.max(0, Math.min(100, value.score))}%` }} />
                    </div>
                  </div>
                )) : <p className="text-[11.5px] text-muted-foreground">No detailed breakdown is available for this role.</p>}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </article>
  );
}

function HeroStat({ value, label, small = false }: { value: React.ReactNode; label: string; small?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-surface/80 px-3 py-2.5 text-center backdrop-blur">
      <p className={cn('truncate font-semibold leading-none tracking-[-0.03em] text-foreground', small ? 'text-[13px]' : 'font-mono text-[20px] tabular-nums')}>{value}</p>
      <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    </div>
  );
}

function SetupProfile() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-primary-soft/70" />
        <span className="relative grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-primary"><Target className="h-5 w-5" strokeWidth={1.8} /></span>
        <h2 className="relative mt-3 text-[17px] font-semibold tracking-[-0.02em] text-foreground">Add your profile to unlock matches</h2>
        <p className="relative mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">
          Recommendations use the skills, preferred roles, experience and location you confirm. Every score includes its reason and missing skills.
        </p>
        <ul className="relative mt-4 grid gap-2 sm:grid-cols-2">
          {['Core skills', 'Preferred roles', 'Experience level', 'Location or remote preference'].map((item) => (
            <li key={item} className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-[11.5px] font-medium text-foreground">
              <Check className="h-3.5 w-3.5 text-success" />{item}
            </li>
          ))}
        </ul>
        <Link to="/profile" className="relative mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
          Complete your profile <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <p className="eyebrow text-primary">How matching works</p>
        <ol className="mt-3 space-y-3">
          {[
            ['Skills overlap', 'The skills on your profile are compared with every trusted listing.'],
            ['Role and experience', 'Titles, seniority and preferred roles shape the ranking.'],
            ['Location and salary', 'Your work setup and minimum salary filter weak fits.'],
            ['Trust and freshness', 'Only published, India-confirmed roles with strong source trust are scored.'],
          ].map(([title, copy], index) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border bg-muted/40 font-mono text-[10px] font-semibold text-muted-foreground">{index + 1}</span>
              <span className="text-[11.5px] leading-relaxed text-muted-foreground"><strong className="font-semibold text-foreground">{title}.</strong> {copy}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

const Recommendations: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const recommendationsQuery = useQuery('candidate-recommendations', candidate.recommendations, { refetchInterval: 10000 });
  const applicationsQuery = useQuery('candidate-applications', candidate.applications);
  const [search, setSearch] = useState('');
  const [minimum, setMinimum] = useState<'all' | '90' | '80' | '70'>('all');
  const [sort, setSort] = useState<'match' | 'newest' | 'trust'>('match');
  const [optimisticSaved, setOptimisticSaved] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  const saveMutation = useMutation((job: CandidateJob) => candidate.saveJob(job.id, 'SAVED'), {
    onSuccess: (_data, job) => {
      setOptimisticSaved((current) => new Set(current).add(job.id));
      toast({ title: 'Job saved', description: `${job.title} is now in your saved jobs.`, variant: 'success' });
      queryClient.invalidateQueries('candidate-applications');
      queryClient.invalidateQueries('candidate-summary');
    },
    onError: (error: Error, job) => {
      toast({ title: 'Could not save job', description: error.message, variant: 'error' });
      setSavingId((current) => current === job.id ? null : current);
    },
  });

  const jobs = recommendationsQuery.data?.data ?? [];
  const savedIds = useMemo(
    () => new Set((applicationsQuery.data?.data ?? []).map((application) => application.job_id)),
    [applicationsQuery.data],
  );

  const averageMatch = jobs.length
    ? Math.round(jobs.reduce((total, job) => total + Number(job.match_score || 0), 0) / jobs.length)
    : 0;
  const topSkill = useMemo(() => {
    const counts = new Map<string, number>();
    jobs.forEach((job) => (job.matched_skills || []).forEach((skill) => counts.set(skill, (counts.get(skill) || 0) + 1)));
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const input = search.trim().toLowerCase();
    let list = jobs.filter((job) => {
      if (!input) return true;
      return `${job.title} ${job.company_name} ${job.location ?? ''} ${(job.skills || []).join(' ')}`.toLowerCase().includes(input);
    });
    if (minimum === '90') list = list.filter((job) => Number(job.match_score || 0) >= 90);
    if (minimum === '80') list = list.filter((job) => Number(job.match_score || 0) >= 80);
    if (minimum === '70') list = list.filter((job) => Number(job.match_score || 0) >= 70 && Number(job.match_score || 0) < 80);
    return [...list].sort((left, right) => {
      if (sort === 'trust') return Number(right.trust_score || 0) - Number(left.trust_score || 0);
      if (sort === 'newest') return new Date(right.posted_at || right.first_seen_at || 0).getTime() - new Date(left.posted_at || left.first_seen_at || 0).getTime();
      return Number(right.match_score || 0) - Number(left.match_score || 0);
    });
  }, [jobs, minimum, search, sort]);

  const saveJob = (job: CandidateJob) => {
    setSavingId(job.id);
    saveMutation.mutate(job, { onSettled: () => setSavingId((current) => current === job.id ? null : current) });
  };

  if (recommendationsQuery.isLoading) return <PageLoader label="Matching jobs to your profile…" />;

  if (recommendationsQuery.error) {
    return (
      <div className="card p-5">
        <p className="text-[13px] font-semibold text-destructive">Recommendations could not be loaded.</p>
        <p className="mt-1 text-[12px] text-muted-foreground">{(recommendationsQuery.error as Error).message}</p>
        <button type="button" onClick={() => recommendationsQuery.refetch()} className="mt-3 rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-foreground transition-colors hover:border-border-strong">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="relative overflow-hidden rounded-[26px] border border-border bg-[linear-gradient(115deg,hsl(var(--surface))_0%,hsl(var(--accent))_56%,hsl(var(--primary-soft))_100%)] p-5 shadow-sm sm:p-7"
      >
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-primary/10" />
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary/[0.06] blur-2xl" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="eyebrow flex items-center gap-2 text-primary"><Sparkles className="h-3.5 w-3.5" /> For you · personalised</p>
            <h1 className="mt-2 text-[30px] font-semibold leading-[1.05] tracking-[-0.04em] text-foreground sm:text-[38px]">Your best-fit roles, ranked.</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Every role is scored against your skills, preferred roles, experience and location. See exactly what matches, what to learn next, and why each role made the cut.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link to="/profile" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface/80 px-4 text-[12.5px] font-semibold text-foreground backdrop-blur transition-colors hover:border-border-strong hover:bg-surface">
                Refine profile
              </Link>
              <Link to="/jobs" className="group inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                Browse all jobs <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
          <div className="grid min-w-[260px] grid-cols-3 gap-2">
            <HeroStat value={jobs.length} label="Matches" />
            <HeroStat value={`${averageMatch}%`} label="Avg. match" />
            <HeroStat value={topSkill || '—'} label="Top skill" small />
          </div>
        </div>
      </motion.section>

      {recommendationsQuery.data?.needs_profile ? <SetupProfile /> : jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-border bg-muted/30 text-muted-foreground"><Target className="h-5 w-5" strokeWidth={1.7} /></span>
          <h2 className="mt-3 text-[15px] font-semibold text-foreground">No scored matches right now</h2>
          <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">New roles are scored as sources refresh. Browse all trusted listings in the meantime, or check back shortly.</p>
          <Link to="/jobs" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">Browse jobs <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-surface p-3 shadow-sm sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search recommendations"
                  placeholder="Search by role, company or skill"
                  className="input h-10 pl-10 text-[12.5px]"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="recommendation-score">Minimum match</label>
                <select id="recommendation-score" value={minimum} onChange={(event) => setMinimum(event.target.value as typeof minimum)} className="input h-10 w-auto text-[12px]">
                  <option value="all">All matches</option>
                  <option value="90">90% and above</option>
                  <option value="80">80% and above</option>
                  <option value="70">70–79%</option>
                </select>
                <label className="sr-only" htmlFor="recommendation-sort">Sort matches</label>
                <select id="recommendation-sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="input h-10 w-auto text-[12px]">
                  <option value="match">Best match</option>
                  <option value="newest">Newest first</option>
                  <option value="trust">Highest trust</option>
                </select>
                <span className="rounded-lg border border-border bg-muted/30 px-2.5 py-2 font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  {filteredJobs.length} of {jobs.length}
                </span>
              </div>
            </div>
          </section>

          {filteredJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-border bg-muted/30 text-muted-foreground"><Search className="h-4 w-4" /></span>
              <h2 className="mt-2 text-[14px] font-semibold text-foreground">No roles match those filters</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">Try a broader search or reset the score filter.</p>
              <button type="button" onClick={() => { setSearch(''); setMinimum('all'); }} className="mt-3 rounded-lg border border-border px-3 py-2 text-[12px] font-semibold text-foreground transition-colors hover:border-border-strong">Reset filters</button>
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredJobs.map((job, index) => {
                const saved = optimisticSaved.has(job.id) || savedIds.has(job.id);
                return (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE, delay: Math.min(index * 0.035, 0.21) }}
                    className="h-full"
                  >
                    <RecommendationCard
                      job={job}
                      saved={saved}
                      saving={savingId === job.id}
                      onSave={saveJob}
                    />
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Recommendations;
