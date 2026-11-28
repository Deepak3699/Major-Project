import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowRight, BriefcaseBusiness, ChevronLeft, ChevronRight, Contact, MapPin, RotateCcw,
  Search, ShieldCheck, SlidersHorizontal, Sparkles,
} from 'lucide-react';
import { candidate } from '@/lib/api';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { EmployerContactsPanel } from '@/components/candidate/EmployerContactsPanel';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;
const DAY_OPTIONS = [7, 14, 30] as const;
const WORK_SETUPS = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
] as const;

// Presentation only: the backend stores descriptions as raw HTML inside plain
// text. Flatten tags to readable lines before previewing on cards.
function cleanText(raw: string | null | undefined): string {
  if (!raw) return '';
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

function Stat({ value, label, icon: Icon }: { value: React.ReactNode; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="min-w-[112px] rounded-xl border border-border bg-surface/80 px-3 py-2.5 text-center backdrop-blur">
      <Icon className="mx-auto h-3.5 w-3.5 text-primary" />
      <p className="mt-1.5 font-mono text-[18px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">{value}</p>
      <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
    </div>
  );
}

const Jobs: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'contacts' ? 'contacts' : 'jobs';
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<Record<string, unknown>>({ days: 7, page: 1, limit: 20, sort: 'newest' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery(['candidate-jobs', filters], () => candidate.jobs(filters), { keepPreviousData: true });
  const { data: summary } = useQuery('candidate-summary', candidate.summary, { staleTime: 30_000 });
  const saveMutation = useMutation((id: string) => candidate.saveJob(id), {
    onMutate: (id) => setSavingId(id),
    onSettled: () => {
      setSavingId(null);
      queryClient.invalidateQueries('candidate-applications');
      queryClient.invalidateQueries('candidate-summary');
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: input.trim() || undefined, page: 1 }));
  };
  // Changing a search filter starts again at page 1. Moving between pages must
  // keep the requested page instead of being reset by setFilter.
  const setFilter = (key: string, value: unknown) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const goToPage = (page: number) => setFilters((current) => ({ ...current, page }));
  const resetFilters = () => {
    setInput('');
    setFilters({ days: 7, page: 1, limit: 20, sort: 'newest' });
  };
  const activeFilterCount = [filters.q, filters.location, filters.work_type].filter(Boolean).length + (Number(filters.days) !== 7 ? 1 : 0);

  return (
    <div className="space-y-5 pb-4">
      {/* Warm, editorial hero with live collection stats. */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="relative overflow-hidden rounded-[26px] border border-border bg-[linear-gradient(118deg,hsl(var(--surface))_0%,hsl(var(--accent))_54%,hsl(var(--signal-soft))_100%)] p-5 shadow-sm sm:p-7"
      >
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-primary/10" />
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-primary/[0.05] blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-[38%] h-52 w-52 rounded-full border border-primary/[0.06]" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Discover jobs
            </p>
            <h1 className="mt-2 text-[30px] font-semibold leading-[1.06] tracking-[-0.04em] text-foreground sm:text-[38px]">
              Explore roles worth your time.
            </h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground sm:text-[13.5px]">
              A focused feed of recent, India-confirmed listings from trusted sources. Every card shows what matters before you open it.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a href="#job-filters" className="group inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                Start searching <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/70 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground backdrop-blur">
                <ShieldCheck className="h-3.5 w-3.5 text-success" /> Trusted sources only
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat value={data?.pagination.total ?? 0} label="In view" icon={BriefcaseBusiness} />
            <Stat value={summary?.fresh_jobs_7d ?? 0} label="Fresh · 7d" icon={Sparkles} />
            <Stat value="70+" label="Trust score" icon={ShieldCheck} />
          </div>
        </div>
      </motion.section>

      {/* Sub-sections inside Discover jobs. */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
        {[
          { key: 'jobs', label: 'Job listings', icon: BriefcaseBusiness },
          { key: 'contacts', label: 'Employer contacts', icon: Contact },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setSearchParams(key === 'contacts' ? { view: 'contacts' } : {}, { replace: false })}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-[12px] font-semibold transition-colors',
              view === key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
        <span className="ml-auto hidden pr-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground sm:block">One workspace · two views</span>
      </div>

      <div className={cn('space-y-5', view === 'contacts' && 'hidden')}>
      {/* Search workspace */}
      <motion.section
        id="job-filters"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE, delay: 0.05 }}
        className="scroll-mt-4 rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5"
      >
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_170px_auto] md:items-end">
          <label className="relative block md:col-span-1">
            <span className="label">Search</span>
            <Search className="pointer-events-none absolute left-3.5 top-[34px] h-4 w-4 text-muted-foreground" />
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Role, company, or skill" className="input h-11 pl-10" />
          </label>
          <label className="block">
            <span className="label">Location</span>
            <input value={String(filters.location || '')} onChange={(e) => setFilter('location', e.target.value || undefined)} placeholder="City or region" className="input h-11" />
          </label>
          <label className="block">
            <span className="label">Sort by</span>
            <select value={String(filters.sort)} onChange={(e) => setFilter('sort', e.target.value)} className="input h-11">
              <option value="newest">Newest first</option>
              <option value="trust">Highest trust</option>
            </select>
          </label>
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.45)]">
            <Search className="h-4 w-4" /> Search
          </button>
        </form>

        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-1 inline-flex items-center gap-1.5 text-muted-foreground">
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} /> Posted within
            </span>
            {DAY_OPTIONS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setFilter('days', days)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px] tabular-nums transition-all',
                  filters.days === days
                    ? 'border-primary/30 bg-primary-soft text-primary shadow-sm'
                    : 'border-border text-muted-foreground hover:border-border-strong hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {days} days
              </button>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
            <span className="eyebrow mr-1 hidden items-center gap-1.5 text-muted-foreground sm:inline-flex">
              <MapPin className="h-3.5 w-3.5" strokeWidth={1.75} /> Work setup
            </span>
            {WORK_SETUPS.map((setup) => (
              <button
                key={setup.value}
                type="button"
                aria-pressed={filters.work_type === setup.value}
                onClick={() => setFilter('work_type', filters.work_type === setup.value ? undefined : setup.value)}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-[10.5px] font-medium transition-all',
                  filters.work_type === setup.value
                    ? 'border-primary/30 bg-primary-soft text-primary shadow-sm'
                    : 'border-border text-muted-foreground hover:border-border-strong hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {setup.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={resetFilters}
            disabled={activeFilterCount === 0}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 self-start rounded-lg border border-border px-2.5 text-[10.5px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" /> Reset filters{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
        </div>
      </motion.section>

      {/* Result summary */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          <span className="text-[15px] font-semibold text-foreground">{data?.pagination.total ?? 0}</span> matching roles
          <span className="mx-2 text-border">·</span> newest first
        </p>
        {error && <span className="text-xs text-destructive">{(error as Error).message}</span>}
      </motion.div>

      {isLoading ? (
        <PageLoader label="Finding recent jobs…" />
      ) : data?.data?.length ? (
        <div className="space-y-3">
          {data.data.map((job, i) => {
            const preview = cleanText(job.description || job.about_job);
            return (
              <motion.div key={job.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.035, 0.21) }}>
                <JobCard job={job} saving={savingId === job.id} onSave={(item) => saveMutation.mutate(item.id)} />
                {preview && <p className="mt-1 whitespace-pre-line px-5 text-[12px] leading-relaxed text-muted-foreground/90 line-clamp-2">{preview}</p>}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon={BriefcaseBusiness} title="No roles found in this window" description="Try a broader search, a longer date window, or clear a filter. New listings appear when an enabled source run completes." />
        </div>
      )}

      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={Number(filters.page) <= 1}
            onClick={() => goToPage(Number(filters.page) - 1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/50 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </button>
          <span className="px-2 font-mono text-[10.5px] tabular-nums text-muted-foreground">
            Page <span className="font-semibold text-foreground">{Number(filters.page)}</span> of <span className="text-foreground">{data.pagination.pages}</span>
          </span>
          <button
            disabled={Number(filters.page) >= data.pagination.pages}
            onClick={() => goToPage(Number(filters.page) + 1)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/50 disabled:opacity-40"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      </div>

      {view === 'contacts' && (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="eyebrow text-primary">Career space</p>
              <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-foreground">Employer contacts</h2>
              <p className="mt-0.5 text-[11.5px] text-muted-foreground">Public company channels and hiring links attached to published listings.</p>
            </div>
            <button type="button" onClick={() => setSearchParams({}, { replace: false })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-accent/50">
              <ChevronLeft className="h-3.5 w-3.5" /> Back to job listings
            </button>
          </div>
          <EmployerContactsPanel />
        </motion.section>
      )}
    </div>
  );
};

export default Jobs;
