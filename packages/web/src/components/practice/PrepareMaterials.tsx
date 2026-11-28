import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowRight, BookOpen, BriefcaseBusiness, Building2, Check, FileText,
  Layers3, Lightbulb, RefreshCw, Search, Sparkles, Users,
} from 'lucide-react';
import { candidate, preparation } from '@/lib/api';
import type { PreparationArtifact, PreparationModule } from '@/lib/types';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { usePracticeFocus } from '@/stores/practiceFocus';

const MODULES: Array<{ value: PreparationModule; label: string; hint: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { value: 'interview_prep', label: 'Interview prep', hint: 'Questions and answer frameworks', icon: BriefcaseBusiness },
  { value: 'group_discussion', label: 'Group discussion', hint: 'Balanced arguments and participation tips', icon: Users },
  { value: 'presentation', label: 'Presentation', hint: 'Slide-by-slide structure and delivery notes', icon: BookOpen },
  { value: 'company_research', label: 'Company research', hint: 'Products, developments and evidence', icon: Building2 },
];

const LABEL: Record<PreparationModule, string> = Object.fromEntries(MODULES.map((m) => [m.value, m.label])) as Record<PreparationModule, string>;

function prettyKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function ValueView({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (!value.length) return null;
    if (value.every((item) => typeof item === 'string')) {
      return <ul className="mt-2 space-y-1.5">{value.map((item, index) => <li key={index} className="flex gap-2 text-[11.5px] leading-relaxed text-muted-foreground"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />{item}</li>)}</ul>;
    }
    return (
      <div className="mt-2 space-y-2">
        {value.map((item: any, index) => (
          <div key={index} className="rounded-xl border border-border bg-muted/20 p-2.5">
            {item?.question && <p className="text-[11.5px] font-medium text-foreground">{item.question}</p>}
            {item?.framework && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.framework}</p>}
            {item?.title && <p className="text-[11.5px] font-semibold text-foreground">{item.title}</p>}
            {item?.detail && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>}
            {item?.criterion && <p className="text-[11px] text-muted-foreground"><strong className="text-foreground">{item.criterion}:</strong> {item.question}</p>}
          </div>
        ))}
      </div>
    );
  }
  if (value && typeof value === 'object') {
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {Object.entries(value as Record<string, unknown>).map(([key, inner]) => (
          <div key={key} className="rounded-xl border border-border bg-muted/20 p-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{prettyKey(key)}</p>
            <div className="mt-1"><ValueView value={inner} /></div>
          </div>
        ))}
      </div>
    );
  }
  return <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/90">{String(value)}</p>;
}

function ArtifactView({ artifact }: { artifact: PreparationArtifact }) {
  const payload = (artifact.payload || {}) as Record<string, unknown>;
  const sections = Object.entries(payload).filter(([key, value]) => key !== 'disclaimer' && value != null && value !== '' && (!Array.isArray(value) || value.length > 0));
  return (
    <div className="overflow-hidden rounded-[22px] border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-[linear-gradient(120deg,hsl(var(--surface)),hsl(var(--primary-soft)))] px-4 py-3">
        <div>
          <p className="eyebrow text-primary">Generated preparation</p>
          <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
            {artifact.model === 'template' ? 'Grounded template' : `AI-assisted · ${artifact.model}`}
          </p>
        </div>
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Saved artifact</span>
      </div>
      <div className="space-y-2.5 p-4">
        {sections.length === 0 && <p className="text-[11.5px] text-muted-foreground">This artifact has no readable sections.</p>}
        {sections.map(([key, value]) => (
          <section key={key} className="rounded-xl border border-border bg-muted/15 p-3">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-primary">{prettyKey(key)}</p>
            <ValueView value={value} />
          </section>
        ))}
        {(artifact.sources || []).length > 0 && (
          <section className="rounded-xl border border-border bg-muted/15 p-3">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">Sources</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {artifact.sources.map((source, index) => (
                <a key={index} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:border-border-strong">
                  {source.title || new URL(source.url).hostname} <ArrowRight className="h-2.5 w-2.5" />
                </a>
              ))}
            </div>
          </section>
        )}
        {payload.disclaimer && <p className="rounded-lg bg-muted/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">{String(payload.disclaimer)}</p>}
      </div>
    </div>
  );
}

/** Fresh preparation room — does not reuse the old standalone page. */
export function PrepareMaterials() {
  const client = useQueryClient();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const focusJobId = usePracticeFocus((state) => state.focus?.jobId || '');
  const [jobId, setJobId] = useState(searchParams.get('job') || focusJobId);
  const [module, setModule] = useState<PreparationModule>('interview_prep');
  const [selectedId, setSelectedId] = useState('');

  const jobs = useQuery('preparation-jobs', () => candidate.jobs({ days: 90, limit: 50, sort: 'newest' }), { staleTime: 5 * 60_000 });
  const artifacts = useQuery(['preparation-artifacts', jobId, module], () => preparation.artifacts({ job_id: jobId || undefined, module, limit: 50 }), { enabled: Boolean(jobId), keepPreviousData: true });
  const selected = useQuery(['preparation-artifact', selectedId], () => preparation.artifact(selectedId), { enabled: Boolean(selectedId) });
  const jobOptions = useMemo(() => jobs.data?.data || [], [jobs.data]);
  const visible = selected.data?.artifact || artifacts.data?.data.find((item) => item.id === selectedId) || artifacts.data?.data[0];

  const generate = useMutation(() => preparation.generate(jobId, module, `workspace:${jobId}:${module}:${Date.now()}`), {
    onSuccess: ({ artifact, already_processed }) => {
      client.invalidateQueries('preparation-artifacts');
      setSelectedId(artifact.id);
      toast({ title: already_processed ? 'Preparation loaded' : 'Preparation ready', description: `${LABEL[artifact.module]} is ready to review.`, variant: 'success' });
    },
    onError: (error: Error) => toast({ title: 'Generation failed', description: error.message, variant: 'error' }),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Build your material</p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground">Choose a job and a room</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">Every artifact is saved to your workspace and stays available for later rooms.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success-soft px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-success"><Check className="h-3 w-3" /> No credits charged</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="label" htmlFor="prepare-job">Target job</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <select id="prepare-job" value={jobId} onChange={(event) => { setJobId(event.target.value); setSelectedId(''); }} className="input h-11 pl-9 text-[12px]">
                <option value="">Select a published job</option>
                {jobOptions.map((job) => <option key={job.id} value={job.id}>{job.title} — {job.company_name}</option>)}
              </select>
            </div>
            {jobs.isError && <p className="mt-1 text-[11px] text-destructive">Jobs could not be loaded.</p>}
          </div>
          <button type="button" disabled={!jobId || generate.isLoading} onClick={() => generate.mutate()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50">
            {generate.isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generate.isLoading ? 'Generating…' : 'Generate material'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {MODULES.map(({ value, label, hint, icon: Icon }) => {
            const active = module === value;
            return (
              <button key={value} type="button" aria-pressed={active} onClick={() => { setModule(value); setSelectedId(''); }} className={cn('group flex min-h-[88px] flex-col rounded-xl border p-3 text-left transition-all', active ? 'border-primary/40 bg-primary-soft shadow-sm' : 'border-border bg-muted/20 hover:border-border-strong hover:bg-surface')}>
                <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} strokeWidth={1.8} />
                <p className={cn('mt-2 text-[11.5px] font-semibold', active ? 'text-primary' : 'text-foreground')}>{label}</p>
                <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-muted-foreground">{hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/25 px-4 py-3 text-[11px] text-muted-foreground">
        <Layers3 className="h-3.5 w-3.5 text-primary" />
        <span>{artifacts.data?.pagination.total ?? 0} saved {LABEL[module].toLowerCase()} artifacts for this job.</span>
        <span className="ml-auto inline-flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5 text-warning" /> Review generated facts before using them in a live room.</span>
      </section>

      <div className="room-main-grid grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
        <section className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-sm">
          <div className="border-b border-border px-3.5 py-3">
            <p className="eyebrow">Saved artifacts</p>
          </div>
          {!jobId ? (
            <p className="p-4 text-[11px] leading-relaxed text-muted-foreground">Select a job to see saved material.</p>
          ) : artifacts.isLoading ? (
            <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-11 w-full" />)}</div>
          ) : artifacts.data?.data.length ? (
            <div>
              {artifacts.data.data.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={cn('flex w-full flex-col border-b border-border px-3.5 py-3 text-left last:border-0 transition-colors hover:bg-accent/40', visible?.id === item.id ? 'bg-accent/50' : '')}>
                  <span className="text-[11.5px] font-medium text-foreground">{LABEL[item.module]}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{item.model} · {new Date(item.created_at).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="p-4 text-[11px] leading-relaxed text-muted-foreground">Nothing saved yet. Generate your first artifact.</p>
          )}
        </section>

        <div aria-live="polite">
          {selected.isLoading ? (
            <div className="rounded-[20px] border border-border bg-surface p-5"><div className="skeleton h-40 w-full" /></div>
          ) : visible ? (
            <ArtifactView artifact={visible} />
          ) : (
            <div className="rounded-[20px] border border-dashed border-border bg-muted/20 px-6 py-14 text-center">
              <FileText className="mx-auto h-5 w-5 text-muted-foreground" />
              <p className="mt-2 text-[13px] font-semibold text-foreground">No material to display</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">Choose a job, pick a module and generate preparation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
