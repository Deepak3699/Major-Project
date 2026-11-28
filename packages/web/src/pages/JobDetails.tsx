import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowLeft, ArrowUpRight, Bookmark, Building2, CalendarDays, Check, ChevronDown,
  Clock3, Copy, ExternalLink, FileText, Globe, LoaderCircle, Mail, MapPin, Phone,
  ShieldCheck, Sparkles, Target, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { candidate } from '@/lib/api';
import { safeExternalUrl } from '@/lib/safe-url';
import { CandidateJob } from '@/lib/types';
import { PageLoader } from '@/components/ui/spinner';
import { JobRoleAvatar, getRoleTheme } from '@/components/candidate/JobRoleAvatar';
import { cn } from '@/components/ui/cn';
import { usePracticeFocus } from '@/stores/practiceFocus';

const EASE = [0.22, 1, 0.36, 1] as const;
const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.32, ease: EASE, delay },
});
const WEIGHT_LABELS: Record<string, string> = {
  skills: 'Skills', experience: 'Experience', education: 'Education', location: 'Location',
  role: 'Role fit', projects: 'Projects', salary: 'Salary', preferences: 'Preferences',
};

// Presentation only: descriptions arrive as raw HTML inside plain text.
// Flatten tags so the copy renders as readable lines.
function cleanText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|8217);/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function scoreColor(score: number) {
  if (score >= 85) return 'hsl(var(--success))';
  if (score >= 75) return 'hsl(var(--signal))';
  return 'hsl(var(--warning))';
}

function ScoreRing({ score, label, size = 96 }: { score: number; label: string; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${Math.round(clamped)} out of 100`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={scoreColor(score)} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="font-mono text-[21px] font-semibold leading-none tabular-nums tracking-[-0.04em] text-foreground">{Math.round(clamped)}<span className="text-[11px] text-muted-foreground">%</span></p>
          <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/20 p-3">
      <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />{label}
      </span>
      <p className="mt-1.5 truncate text-[12px] font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const blocks = useMemo(() => text.split(/\n{2,}/).filter(Boolean), [text]);
  const long = text.length > 1400;
  return (
    <div className="relative">
      <div className={cn('space-y-3 overflow-hidden transition-[max-height] duration-500', long && !expanded && 'max-h-[360px]')}>
        {blocks.map((block, index) => {
          const lines = block.split('\n').filter(Boolean);
          if (lines.every((line) => line.trim().startsWith('•'))) {
            return (
              <ul key={index} className="space-y-1.5">
                {lines.map((line, lineIndex) => (
                  <li key={lineIndex} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{line.trim().replace(/^•\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            );
          }
          return <p key={index} className="whitespace-pre-line text-[13px] leading-[1.75] text-muted-foreground">{block}</p>;
        })}
      </div>
      {long && !expanded && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface to-transparent" />}
      {long && (
        <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary transition-colors hover:text-primary-hover">
          {expanded ? 'Show less' : 'Read full description'}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}

const JobDetails: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const setFocus = usePracticeFocus((state) => state.setFocus);
  const [searchParams] = useSearchParams();
  const fromRecommendations = searchParams.get('from') === 'recommendations';
  const backTo = fromRecommendations ? '/recommendations' : '/jobs';
  const backLabel = fromRecommendations ? 'For you' : 'All jobs';
  const client = useQueryClient();
  const [activeDocument, setActiveDocument] = useState<{ title: string; content: string } | null>(null);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const query = useQuery(['candidate-job', id], () => candidate.job(id), { enabled: !!id });
  const applicationsQuery = useQuery('candidate-applications', candidate.applications);
  const save = useMutation((status: 'SAVED' | 'APPLIED') => candidate.saveJob(id, status), {
    onSuccess: () => { client.invalidateQueries('candidate-applications'); client.invalidateQueries('candidate-summary'); },
  });
  const prepare = useMutation(() => candidate.prepare(id), {
    onSuccess: (result) => {
      client.invalidateQueries('candidate-applications');
      client.invalidateQueries('candidate-summary');
      setActiveDocument(result.documents.find((doc) => doc.document_type === 'tailored_resume') || result.documents[0] || null);
    },
  });

  if (query.isLoading) return <PageLoader label="Loading job details…" />;
  if (query.error || !query.data?.job) {
    return (
      <div className="card p-6">
        <p className="text-sm text-destructive">{(query.error as Error)?.message || 'Job not found'}</p>
        <Link to={backTo} className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"><ArrowLeft className="h-4 w-4" />Back to {backLabel}</Link>
      </div>
    );
  }

  const job: CandidateJob = query.data.job;
  const theme = getRoleTheme(job.title, job.company_industry, job.skills);
  const description = cleanText(job.description || job.about_job || 'The source did not provide a job description.');
  const applyUrl = safeExternalUrl(job.apply_url || job.job_url);
  const matched = job.matched_skills || [];
  const missing = job.missing_skills || [];
  const reasons = job.match_reasons || [];
  const breakdown = Object.entries(job.score_breakdown || {}).sort((a, b) => b[1].weight - a[1].weight);
  const evidence = job.trust_evidence || [];
  const visibleEvidence = showAllEvidence ? evidence : evidence.slice(0, 4);
  const overlapTotal = matched.length + missing.length;
  const overlap = overlapTotal ? Math.round((matched.length / overlapTotal) * 100) : (job.match_score ?? 0);
  const application = (applicationsQuery.data?.data || []).find((item) => item.job_id === job.id);
  const isSaved = application?.status === 'SAVED' || application?.status === 'RECOMMENDED' || application?.status === 'READY_TO_APPLY';
  const isApplied = application?.status === 'APPLIED' || application?.status === 'SCREENING' || application?.status === 'INTERVIEW' || application?.status === 'OFFER' || application?.status === 'JOINED';
  const postedDate = job.posted_at || job.first_seen_at;

  return (
    <div className="space-y-5 pb-6">
      <Link to={backTo} className="group inline-flex items-center gap-2 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground hover:underline hover:underline-offset-4"><ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />{backLabel}</Link>

      {/* Hero — identity, trust, and the three actions a candidate cares about. */}
      <motion.section {...rise(0)} className="relative overflow-hidden rounded-[26px] border border-border bg-[linear-gradient(118deg,hsl(var(--surface))_0%,hsl(var(--accent))_58%,hsl(var(--signal-soft))_100%)] p-5 shadow-sm sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-primary/10" />
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary/[0.05] blur-2xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="eyebrow text-primary">Job details</span>
            <TrustBadge job={job} />
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Source · {job.source_site}</span>
          </div>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <JobRoleAvatar title={job.title} industry={job.company_industry} skills={job.skills} size={64} className="rounded-2xl" />
              <div className="min-w-0">
                <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[32px]">{job.title}</h1>
                <p className="mt-1.5 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />{job.company_name}
                  {job.company_industry && <><span className="text-border">·</span><span className="truncate">{job.company_industry}</span></>}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSaved || save.isLoading}
                onClick={() => save.mutate('SAVED')}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface/80 px-3.5 text-[12px] font-semibold text-foreground backdrop-blur transition-colors hover:border-border-strong hover:bg-surface disabled:opacity-60"
              >
                {isSaved ? <Check className="h-4 w-4 text-success" /> : <Bookmark className="h-4 w-4 text-muted-foreground" />}{isSaved ? 'Saved' : 'Save job'}
              </button>
              <button
                type="button"
                disabled={isApplied || save.isLoading}
                onClick={() => save.mutate('APPLIED')}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-success/25 bg-success-soft px-3.5 text-[12px] font-semibold text-success transition-colors hover:border-success/40 disabled:opacity-60"
              >
                <Check className="h-4 w-4" />{isApplied ? 'Applied' : 'Mark as applied'}
              </button>
              {applyUrl && (
                <a href={applyUrl} target="_blank" rel="noreferrer" className="group inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                  Apply now <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              )}
            </div>
          </div>
          {(save.error || prepare.error) && <p className="mt-4 text-[12px] text-destructive">{(save.error as Error)?.message || (prepare.error as Error)?.message}</p>}
        </div>
      </motion.section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px] xl:items-start">
        <div className="min-w-0 space-y-5">
          {/* Visual fit snapshot */}
          <motion.section {...rise(0.06)} className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-primary">Your fit at a glance</p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground">How this role lines up with you</h2>
              </div>
              <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">Profile-based</span>
            </div>
            <div className="mt-4 grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <div className="flex items-center gap-4">
                <ScoreRing score={job.match_score ?? 0} label="Match" size={100} />
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-foreground"><Target className="h-4 w-4 text-primary" />Overall fit</div>
                  <p className="max-w-[190px] text-[11.5px] leading-relaxed text-muted-foreground">
                    {job.match_score === undefined ? 'Complete your profile to see a personalised score.' : (job.match_score >= 85 ? 'A strong match across most dimensions.' : job.match_score >= 75 ? 'A good match with a couple of gaps to note.' : 'A partial match — check the skill gaps below.')}
                  </p>
                </div>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {breakdown.length ? breakdown.map(([key, value]) => (
                  <div key={key}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[10.5px]">
                      <span className="text-muted-foreground">{WEIGHT_LABELS[key] || key}</span>
                      <span className="font-mono tabular-nums text-foreground">{value.score}% <span className="text-muted-foreground/70">· {value.weight}%</span></span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, value.score))}%`, backgroundColor: scoreColor(value.score) }} />
                    </div>
                  </div>
                )) : <p className="text-[11.5px] text-muted-foreground sm:col-span-2">Detailed scoring is available once your profile is confirmed.</p>}
              </div>
            </div>
            {reasons.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                {reasons.map((reason) => (
                  <span key={reason} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary-soft/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground">
                    <Sparkles className="h-3 w-3 text-primary" />{reason}
                  </span>
                ))}
              </div>
            )}
          </motion.section>

          {/* Job description */}
          <motion.section {...rise(0.12)} className="rounded-[24px] border border-border bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="eyebrow">Job description</p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground">About the role</h2>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
                <Clock3 className="h-3 w-3" />{postedDate ? new Date(postedDate).toLocaleDateString() : 'Recent'}
              </span>
            </div>
            <div className="mt-4"><Description text={description} /></div>
          </motion.section>

          {/* Skill alignment */}
          <motion.section {...rise(0.18)} className="rounded-[24px] border border-border bg-surface p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-primary">Skills</p>
                <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground">What you bring, what to learn</h2>
              </div>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{matched.length} matched · {missing.length} to learn</span>
            </div>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Skill overlap</span><span className="font-mono tabular-nums text-foreground">{overlap}%</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <span className="bg-success transition-[width] duration-700" style={{ width: `${overlap}%` }} />
                <span className="bg-warning/70 transition-[width] duration-700" style={{ width: `${100 - overlap}%` }} />
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-success/20 bg-success-soft/40 p-3.5">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-success">You already have</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {matched.length ? matched.map((skill) => <span key={skill} className="rounded-md border border-success/25 bg-surface/70 px-2 py-1 text-[11px] font-medium text-success">{skill}</span>) : <span className="text-[11.5px] text-muted-foreground">No direct overlap detected yet.</span>}
                </div>
              </div>
              <div className="rounded-xl border border-warning/20 bg-warning-soft/40 p-3.5">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-warning">Worth learning</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {missing.length ? missing.map((skill) => <span key={skill} className="rounded-md border border-warning/25 bg-surface/70 px-2 py-1 text-[11px] font-medium text-warning">{skill}</span>) : <span className="text-[11.5px] text-muted-foreground">No major skill gaps flagged.</span>}
                </div>
              </div>
            </div>
          </motion.section>

          {/* Company — placed in the main column to keep both sides balanced. */}
          <motion.section {...rise(0.16)} className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-muted/40 text-primary"><Building2 className="h-5 w-5" strokeWidth={1.7} /></span>
              <div className="min-w-0">
                <p className="eyebrow">About the company</p>
                <h2 className="mt-1 truncate text-[15px] font-semibold text-foreground">{job.company_name}</h2>
                <p className="truncate text-[11.5px] text-muted-foreground">{job.company_industry || 'Industry not listed'}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2.5 border-t border-border pt-4 text-[11.5px] sm:grid-cols-2">
              {job.company_domain && <p className="flex items-center gap-2 text-muted-foreground"><Globe className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{job.company_domain}</span></p>}
              {job.company_email && <a href={`mailto:${job.company_email}`} className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground hover:underline"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{job.company_email}</span></a>}
              {job.company_phone && <a href={`tel:${job.company_phone}`} className="flex items-center gap-2 font-mono text-muted-foreground transition-colors hover:text-foreground hover:underline"><Phone className="h-3.5 w-3.5 shrink-0" />{job.company_phone}</a>}
              {job.public_hr_name && <p className="flex items-center gap-2 text-muted-foreground"><Users className="h-3.5 w-3.5 shrink-0" />{job.public_hr_name}</p>}
              {!job.company_domain && !job.company_email && !job.company_phone && !job.public_hr_name && <p className="leading-relaxed text-muted-foreground sm:col-span-2">Public company channels are not verified for this listing. Use the official application page.</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {safeExternalUrl(job.company_website) && <a href={safeExternalUrl(job.company_website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/50">Company site <ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
              {safeExternalUrl(job.public_hr_linkedin) && <a href={safeExternalUrl(job.public_hr_linkedin)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/50">Hiring profile <ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
            </div>
          </motion.section>
        </div>

        <aside className="min-w-0 space-y-5">
          {/* Prepare — pinned to the top so the next step is always visible. */}
          <motion.section {...rise(0.08)} className="relative overflow-hidden rounded-[24px] border border-primary/25 bg-[linear-gradient(140deg,hsl(var(--primary-soft)),hsl(var(--surface))_82%)] p-5 shadow-sm">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-primary/[0.05] blur-xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface text-primary shadow-sm"><FileText className="h-4 w-4" strokeWidth={1.8} /></span>
                <div className="min-w-0">
                  <p className="eyebrow text-primary">Move forward</p>
                  <h2 className="mt-0.5 text-[15px] font-semibold tracking-[-0.02em] text-foreground">Prepare your application</h2>
                </div>
              </div>
              <span className="hidden shrink-0 rounded-full border border-primary/20 bg-surface/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground sm:inline-flex">4 steps</span>
            </div>
            <p className="relative mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
              Create a role-specific resume draft and email from profile facts you confirmed. Review every line before using it.
            </p>
            <button
              onClick={() => {
                setFocus({
                  jobId: job.id,
                  role: job.title,
                  company: job.company_name,
                  source: fromRecommendations ? 'recommendation' : 'job',
                  matchScore: (job as any).match_score ?? null,
                });
                prepare.mutate();
                navigate(`/practice?job=${job.id}`);
              }}
              className="relative mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Sparkles className="h-4 w-4" /> Prepare in practice workspace
            </button>
            <div className="relative mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-4">
              {[
                { to: `/resume?jobId=${job.id}`, label: 'Resume layouts', icon: FileText },
                { to: '/profile', label: 'Profile facts', icon: Users },
                { to: `/practice/prepare?job=${job.id}`, label: 'Company prep', icon: Globe },
                { to: `/practice?job=${job.id}`, label: 'Interview practice', icon: Sparkles },
              ].map(({ to, label, icon: Icon }) => (
                <Link key={to} to={to} className="group flex min-h-[62px] flex-col justify-between rounded-xl border border-border bg-surface/80 p-2.5 transition-colors hover:border-primary/35 hover:bg-surface">
                  <span className="flex items-center gap-1.5 text-[10.5px] font-semibold leading-tight text-foreground"><Icon className="h-3.5 w-3.5 shrink-0 text-primary" />{label}</span>
                  <span className="flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground">Open <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></span>
                </Link>
              ))}
            </div>
          </motion.section>

          {/* At a glance */}
          <motion.section {...rise(0.1)} className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <p className="eyebrow">At a glance</p>
            <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-foreground">The practical details</h2>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Fact icon={MapPin} label="Location" value={job.location || 'Not stated'} />
              <Fact icon={Users} label="Work setup" value={job.location_type || 'Not stated'} />
              <Fact icon={FileText} label="Employment" value={job.employment_type?.replace(/_/g, ' ') || 'Not stated'} />
              <Fact icon={TrendingUp} label="Experience" value={job.experience_level || 'Not stated'} />
              <Fact icon={Wallet} label="Salary" value={job.salary_range || 'Not stated'} />
              <Fact icon={CalendarDays} label="Posted" value={postedDate ? new Date(postedDate).toLocaleDateString() : 'Recent'} />
            </div>
            {job.skills?.length > 0 && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">Listed skills</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {job.skills.slice(0, 8).map((skill) => <span key={skill} className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-foreground">{skill}</span>)}
                  {job.skills.length > 8 && <span className="font-mono text-[10px] text-muted-foreground">+{job.skills.length - 8}</span>}
                </div>
              </div>
            )}
          </motion.section>

          {/* Trust — compact evidence rows, no dead space beside the score. */}
          <motion.section {...rise(0.22)} className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <ScoreRing score={job.trust_score} label="Trust" size={64} />
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Listing confidence</p>
                <h2 className="mt-0.5 text-[15px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Why we trust this post</h2>
                <span className={cn(
                  'mt-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-medium',
                  job.trust_band === 'low' ? 'border-destructive/25 bg-destructive-soft text-destructive' : 'border-success/25 bg-success-soft text-success',
                )}>
                  <ShieldCheck className="h-2.5 w-2.5" />
                  {job.trust_band === 'very_high' ? 'Very high confidence' : job.trust_band === 'high' ? 'High confidence' : job.trust_band === 'review' ? 'Trust check' : 'Low trust'}
                </span>
              </div>
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground">Evidence-based confidence, not a guarantee the role is genuine.</p>
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {visibleEvidence.length ? visibleEvidence.map((item) => (
                <div key={item.signal} className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 p-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-success/20 bg-success-soft font-mono text-[9.5px] font-semibold tabular-nums text-success">+{item.points}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium leading-tight text-foreground">{item.signal}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              )) : <p className="text-[11.5px] leading-relaxed text-muted-foreground">Trust evidence is unavailable for this source.</p>}
            </div>
            {evidence.length > 4 && (
              <button type="button" onClick={() => setShowAllEvidence((value) => !value)} className="mt-3 w-full rounded-lg border border-border py-1.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
                {showAllEvidence ? 'Show fewer signals' : `Show all ${evidence.length} signals`}
              </button>
            )}
          </motion.section>

          {/* Source — compact inline facts keep the rail aligned with the main column. */}
          <motion.section {...rise(0.28)} className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <p className="eyebrow">Listing source</p>
            <h2 className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-foreground">Where this came from</h2>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-[11px]">
              <span className="min-w-0 truncate text-muted-foreground">Source · <strong className="font-semibold text-foreground">{job.source_site}</strong></span>
              <span className="text-muted-foreground">Sources · <strong className="font-mono font-semibold tabular-nums text-foreground">{Number(job.source_count) || 1}</strong></span>
              <span className="text-muted-foreground">First seen · <strong className="font-mono font-semibold tabular-nums text-foreground">{job.first_seen_at ? new Date(job.first_seen_at).toLocaleDateString() : 'Recent'}</strong></span>
              <span className="text-muted-foreground">Posted · <strong className="font-mono font-semibold tabular-nums text-foreground">{postedDate ? new Date(postedDate).toLocaleDateString() : 'Recent'}</strong></span>
            </div>
            {safeExternalUrl(job.job_url) && (
              <a href={safeExternalUrl(job.job_url)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary transition-colors hover:text-primary-hover">
                View original listing <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </motion.section>
        </aside>
      </div>

      {activeDocument && <DocumentPreview title={activeDocument.title} content={activeDocument.content} onClose={() => setActiveDocument(null)} onShowEmail={() => { const email = prepare.data?.documents.find((doc) => doc.document_type === 'email_draft'); if (email) setActiveDocument({ title: email.title, content: email.content }); }} />}
    </div>
  );
};

function TrustBadge({ job }: { job: CandidateJob }) {
  const tone = job.trust_band === 'low' ? 'border-destructive/25 bg-destructive-soft text-destructive' : 'border-success/25 bg-success-soft text-success';
  const label = job.trust_band === 'very_high' ? 'Trusted · very high confidence' : job.trust_band === 'high' ? 'Trusted · high confidence' : job.trust_band === 'review' ? 'Trust check' : 'Low trust';
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-medium ${tone}`}>
      <ShieldCheck className="mr-1.5 inline h-3.5 w-3.5" />
      {label} · <span className="font-mono tabular-nums">{job.trust_score}/100</span>
    </span>
  );
}

function DocumentPreview({ title, content, onClose, onShowEmail }: { title: string; content: string; onClose: () => void; onShowEmail: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard?.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Review application material" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-t-xl border border-border bg-surface sm:rounded-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="eyebrow">Review before use</p>
            <h2 className="mt-1 truncate text-[14px] font-semibold text-foreground">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">Close</button>
        </div>
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-[12.5px] leading-relaxed text-foreground">{content}</pre>
        <div className="flex flex-wrap justify-between gap-2 border-t border-border p-4">
          <button onClick={onShowEmail} className="rounded-md border border-border px-3 py-2 text-[12px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">View email draft</button>
          <button onClick={copy} className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default JobDetails;
