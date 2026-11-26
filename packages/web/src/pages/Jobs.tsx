import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { BriefcaseBusiness, Search, SlidersHorizontal } from 'lucide-react';
import { candidate } from '@/lib/api';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
/* PageHeader replaced by premium hero */
import { EmptyState } from '@/components/ui/empty-state';

const EASE = [0.22, 1, 0.36, 1] as const;

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

const Jobs: React.FC = () => {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [filters, setFilters] = useState<Record<string, unknown>>({ days: 7, page: 1, limit: 20, sort: 'newest' });
  const [savingId, setSavingId] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery(['candidate-jobs', filters], () => candidate.jobs(filters), { keepPreviousData: true });
  const saveMutation = useMutation((id: string) => candidate.saveJob(id), {
    onMutate: (id) => setSavingId(id),
    onSettled: () => { setSavingId(null); queryClient.invalidateQueries('candidate-applications'); queryClient.invalidateQueries('candidate-summary'); },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, q: input.trim() || undefined, page: 1 }));
  };
  // Changing a search filter starts again at page 1. Moving between pages must
  // keep the requested page instead of being reset by setFilter.
  const setFilter = (key: string, value: unknown) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const goToPage = (page: number) => setFilters((current) => ({ ...current, page }));

  return (
    <div className="space-y-6">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="relative overflow-hidden rounded-2xl border border-border bg-grad-surface p-6 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.08),transparent_50%)]" />
        <div className="relative">
          <p className="eyebrow text-signal">Discover opportunities</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[36px]">Find your next role.</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">Search trusted recent listings. Your profile match score appears on each job when your profile is ready.</p>
        </div>
      </motion.section>

      <motion.form initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.05 }} onSubmit={submit} className="card grid gap-3 p-4 sm:p-5 md:grid-cols-[minmax(0,1fr)_200px_170px_auto] md:items-end">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Role, company, or skill" className="input pl-10" />
        </label>
        <label className="relative">
          <span className="sr-only">Location</span>
          <input value={String(filters.location || '')} onChange={(e) => setFilter('location', e.target.value || undefined)} placeholder="City or region" className="input" />
        </label>
        <label>
          <span className="sr-only">Work setup</span>
          <select value={String(filters.work_type || '')} onChange={(e) => setFilter('work_type', e.target.value || undefined)} className="input">
            <option value="">Any work setup</option>
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
          </select>
        </label>
        <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.45)]"><Search className="h-4 w-4" />Search</button>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 md:col-span-4">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
          <span className="eyebrow">Posted within</span>
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setFilter('days', days)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] tabular-nums transition-all ${filters.days === days ? 'border-signal/30 bg-signal-soft text-signal shadow-sm' : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground hover:bg-accent/50'}`}
            >
              {days} days
            </button>
          ))}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground/80">Sorted by recent</span>
        </div>
      </motion.form>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="flex items-center justify-between">
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground"><span className="text-foreground">{data?.pagination.total ?? 0}</span> matching jobs</p>
        {error && <span className="text-xs text-destructive">{(error as Error).message}</span>}
      </motion.div>
      {isLoading ? (
        <PageLoader label="Finding recent jobs…" />
      ) : data?.data?.length ? (
        <div className="space-y-4">
          {data.data.map((job, i) => {
            const preview = cleanText(job.description || job.about_job);
            return (
              <motion.div key={job.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.04, 0.24) }}>
                <JobCard job={job} saving={savingId === job.id} onSave={(item) => saveMutation.mutate(item.id)} />
                {preview && <p className="mt-1.5 whitespace-pre-line px-5 text-[12.5px] leading-relaxed text-muted-foreground/90 line-clamp-3">{preview}</p>}
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState icon={BriefcaseBusiness} title="No roles found in this window" description="Try a broader search or a longer date window. New listings appear when an enabled source run completes." />
        </div>
      )}
      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button disabled={Number(filters.page) <= 1} onClick={() => goToPage(Number(filters.page) - 1)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong disabled:opacity-40">Previous</button>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">Page <span className="text-foreground">{Number(filters.page)}</span> of <span className="text-foreground">{data.pagination.pages}</span></span>
          <button disabled={Number(filters.page) >= data.pagination.pages} onClick={() => goToPage(Number(filters.page) + 1)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-border-strong disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  );
};

export default Jobs;
