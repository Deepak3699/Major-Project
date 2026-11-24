import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useSearchParams } from 'react-router-dom';
import {
  BookOpen, Building2, ExternalLink, FileText, MessagesSquare, Presentation,
  RefreshCw, Search, Sparkles,
} from 'lucide-react';
import { candidate, preparation } from '@/lib/api';
import type { PreparationArtifact, PreparationModule, PreparationSource } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';

const MODULES: Array<{ value: PreparationModule; label: string; hint: string; icon: React.ElementType }> = [
  { value: 'interview_prep', label: 'Interview preparation', hint: 'Questions, frameworks, revision', icon: BookOpen },
  { value: 'group_discussion', label: 'Group discussion', hint: 'Topics, arguments, evaluation', icon: MessagesSquare },
  { value: 'presentation', label: 'Presentation', hint: 'Slides, notes, delivery', icon: Presentation },
  { value: 'company_research', label: 'Company research', hint: 'Verified facts and sources', icon: Building2 },
];

const MODULE_LABEL: Record<PreparationModule, string> = {
  interview_prep: 'Interview preparation',
  group_discussion: 'Group discussion',
  presentation: 'Presentation',
  company_research: 'Company research',
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border px-5 py-4 last:border-0">
      <p className="eyebrow">{title}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-[13px] text-muted-foreground">Not specified.</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item.slice(0, 24)}-${index}`} className="flex gap-2 text-[13px] leading-relaxed text-foreground/90">
          <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-signal" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Sources({ sources }: { sources: PreparationSource[] }) {
  if (!sources.length) {
    return <p className="text-[13px] leading-relaxed text-muted-foreground">No source URLs were available for this job.</p>;
  }
  return (
    <ul className="space-y-2">
      {sources.map((source) => (
        <li key={`${source.url}-${source.title}`} className="flex flex-wrap items-start justify-between gap-2">
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-foreground underline decoration-border-strong underline-offset-2 hover:decoration-foreground"
          >
            {source.title}
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
            {source.status} · {formatDateTime(source.retrieved_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ArtifactView({ artifact }: { artifact: PreparationArtifact }) {
  const p = artifact.payload || {};
  const argumentsBlock = p.balanced_arguments || {};
  return (
    <div className="card overflow-hidden" aria-label={`${MODULE_LABEL[artifact.module]} result`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-5 py-3">
        <div>
          <p className="eyebrow">Generated preparation</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {artifact.model === 'template' ? 'Grounded template' : `AI-assisted (${artifact.model})`} · {formatDateTime(artifact.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{MODULE_LABEL[artifact.module]}</Badge>
          {artifact.credits_charged === 0
            ? <Badge variant="muted">No credits charged</Badge>
            : <Badge variant="signal">{artifact.credits_charged} credits</Badge>}
        </div>
      </div>

      {p.role && (
        <Section title="Role">
          <p className="text-[14px] font-medium text-foreground">{p.role}{p.company ? ` · ${p.company}` : ''}</p>
        </Section>
      )}
      {p.topic && (
        <Section title="Topic">
          <p className="text-[14px] font-medium text-foreground">{p.topic}</p>
        </Section>
      )}
      {p.summary && (
        <Section title="Summary"><p className="text-[13px] leading-relaxed text-foreground/90">{p.summary}</p></Section>
      )}
      {p.role_context && (
        <Section title="Role context (from the posting)"><p className="text-[13px] leading-relaxed text-foreground/90">{p.role_context}</p></Section>
      )}
      {p.products_note && (
        <Section title="Products and services"><p className="text-[13px] leading-relaxed text-muted-foreground">{p.products_note}</p></Section>
      )}
      {strings(p.products_or_services).length > 0 && (
        <Section title="Products and services"><Bullets items={strings(p.products_or_services)} /></Section>
      )}
      {Array.isArray(p.recent_developments) && p.recent_developments.length > 0 && (
        <Section title="Recent developments">
          {p.recent_developments.map((item: any, index: number) => (
            <p key={index} className="text-[13px] leading-relaxed text-muted-foreground">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.05em]">{item.status || 'unverified'} · </span>
              {item.detail || 'No verified development available.'}
            </p>
          ))}
        </Section>
      )}
      {strings(p.answer_framework).length > 0 && (
        <Section title="Answer framework"><Bullets items={strings(p.answer_framework)} /></Section>
      )}
      {Array.isArray(p.questions) && p.questions.length > 0 && (
        <Section title="Questions and frameworks">
          <ol className="space-y-2">
            {p.questions.map((item: any, index: number) => (
              <li key={index} className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
                <p className="text-[13px] font-medium text-foreground">
                  <span className="mr-2 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{index + 1}</span>
                  {item.question}
                </p>
                {item.framework && <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{item.framework}</p>}
                {item.category && <span className="mt-1.5 inline-block font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{item.category}</span>}
              </li>
            ))}
          </ol>
        </Section>
      )}
      {strings(p.opening_points).length > 0 && (
        <Section title="Opening points"><Bullets items={strings(p.opening_points)} /></Section>
      )}
      {(strings(argumentsBlock.in_favour).length > 0 || strings(argumentsBlock.against).length > 0) && (
        <Section title="Balanced arguments">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[12px] font-medium text-foreground">In favour</p>
              <div className="mt-1.5"><Bullets items={strings(argumentsBlock.in_favour)} /></div>
            </div>
            <div>
              <p className="text-[12px] font-medium text-foreground">Against</p>
              <div className="mt-1.5"><Bullets items={strings(argumentsBlock.against)} /></div>
            </div>
          </div>
        </Section>
      )}
      {Array.isArray(p.slides) && p.slides.length > 0 && (
        <Section title="Slide-by-slide structure">
          <div className="space-y-3">
            {p.slides.map((slide: any, index: number) => (
              <div key={index} className="rounded-lg border border-border bg-background/60 px-3.5 py-3">
                <p className="text-[13px] font-medium text-foreground">
                  <span className="mr-2 font-mono text-[10.5px] tabular-nums text-muted-foreground">{slide.index || index + 1}</span>
                  {slide.title}
                </p>
                <div className="mt-2"><Bullets items={strings(slide.bullets)} /></div>
                {slide.speaking_notes && (
                  <p className="mt-2 border-l-2 border-signal/60 pl-2.5 text-[12.5px] leading-relaxed text-muted-foreground">{slide.speaking_notes}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      {strings(p.structure).length > 0 && (
        <Section title="Structure"><Bullets items={strings(p.structure)} /></Section>
      )}
      {strings(p.participation_tips).length > 0 && (
        <Section title="Participation tips"><Bullets items={strings(p.participation_tips)} /></Section>
      )}
      {Array.isArray(p.practice_evaluation) && p.practice_evaluation.length > 0 && (
        <Section title="Practice evaluation">
          <ul className="space-y-1.5">
            {p.practice_evaluation.map((item: any, index: number) => (
              <li key={index} className="text-[13px] leading-relaxed text-foreground/90">
                <span className="font-medium">{item.criterion || 'Criterion'}:</span> {item.question}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {strings(p.resume_talking_points).length > 0 && (
        <Section title="Talking points from your profile"><Bullets items={strings(p.resume_talking_points)} /></Section>
      )}
      {strings(p.revision_plan).length > 0 && (
        <Section title="Revision plan"><Bullets items={strings(p.revision_plan)} /></Section>
      )}
      {strings(p.likely_questions).length > 0 && (
        <Section title="Likely questions"><Bullets items={strings(p.likely_questions)} /></Section>
      )}
      {strings(p.delivery_guidance).length > 0 && (
        <Section title="Delivery guidance"><Bullets items={strings(p.delivery_guidance)} /></Section>
      )}
      {strings(p.evidence_notes).length > 0 && (
        <Section title="Evidence notes">
          <ul className="space-y-1.5">
            {strings(p.evidence_notes).map((note, index) => (
              <li key={index} className="text-[12.5px] leading-relaxed text-muted-foreground">{note}</li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Sources and retrieval timestamps"><Sources sources={artifact.sources || []} /></Section>
      {p.disclaimer && (
        <div className="px-5 py-3.5">
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">{p.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

const Preparation: React.FC = () => {
  const client = useQueryClient();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [jobId, setJobId] = useState(searchParams.get('job') || '');
  const [module, setModule] = useState<PreparationModule>('interview_prep');
  const [selectedId, setSelectedId] = useState('');

  const jobs = useQuery('preparation-jobs', () => candidate.jobs({ days: 90, limit: 50, sort: 'newest' }));
  const artifacts = useQuery(
    ['preparation-artifacts', jobId, module],
    () => preparation.artifacts({ job_id: jobId || undefined, module, limit: 50 }),
    { enabled: Boolean(jobId), keepPreviousData: true },
  );
  const selected = useQuery(
    ['preparation-artifact', selectedId],
    () => preparation.artifact(selectedId),
    { enabled: Boolean(selectedId) },
  );

  const jobOptions = useMemo(() => jobs.data?.data || [], [jobs.data]);
  const visibleArtifact = selected.data?.artifact
    || artifacts.data?.data.find((item) => item.id === selectedId)
    || artifacts.data?.data[0];

  const generate = useMutation(
    () => preparation.generate(jobId, module, `prep:${jobId}:${module}:${Date.now()}`),
    {
      onSuccess: ({ artifact, already_processed }) => {
        client.invalidateQueries('preparation-artifacts');
        setSelectedId(artifact.id);
        toast({
          title: already_processed ? 'Existing preparation loaded' : 'Preparation ready',
          description: `${MODULE_LABEL[artifact.module]} for ${jobOptions.find((item) => item.id === jobId)?.title || 'the selected job'}.`,
          variant: 'success',
        });
      },
      onError: (error: Error) => toast({ title: 'Preparation could not be generated', description: error.message, variant: 'error' }),
    },
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Preparation workspace"
        description="Job- and company-specific material built from your confirmed profile, the posting and cited sources. Generated content is a preparation aid, not employer endorsement."
      />

      <section className="card p-5" aria-labelledby="preparation-setup-heading">
        <p id="preparation-setup-heading" className="eyebrow">Choose a job and module</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-1.5">
            <label htmlFor="preparation-job" className="text-[12.5px] font-medium text-foreground">Job</label>
            <Select id="preparation-job" value={jobId} onChange={(event) => { setJobId(event.target.value); setSelectedId(''); }}>
              <option value="">Select a job</option>
              {jobOptions.map((job) => (
                <option key={job.id} value={job.id}>{job.title} — {job.company_name}</option>
              ))}
            </Select>
            {jobs.isLoading && <p className="text-[12px] text-muted-foreground">Loading jobs…</p>}
            {jobs.isError && <p className="text-[12px] text-destructive">Jobs could not be loaded. Reload the page to retry.</p>}
            {!jobs.isLoading && jobOptions.length === 0 && (
              <p className="text-[12px] text-muted-foreground">No jobs are available yet. Discover jobs first.</p>
            )}
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-[12.5px] font-medium text-foreground">Module</legend>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {MODULES.map(({ value, label, hint, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={module === value}
                  title={hint}
                  onClick={() => { setModule(value); setSelectedId(''); }}
                  className={`flex flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    module === value
                      ? 'border-signal bg-signal-soft text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  <span className="text-[11.5px] font-medium leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <Button type="button" onClick={() => generate.mutate()} disabled={!jobId} loading={generate.isLoading}>
            {generate.isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </Button>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          Generated artifacts are saved to your workspace so you can resume later. No credits are charged until a credit policy is configured by the owner.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(15rem,0.28fr)_minmax(0,0.72fr)]">
        <section className="card overflow-hidden" aria-labelledby="preparation-history-heading">
          <div className="border-b border-border px-4 py-3">
            <p id="preparation-history-heading" className="eyebrow">Saved artifacts</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {artifacts.data?.pagination.total ?? 0} for this job and module.
            </p>
          </div>
          {!jobId ? (
            <EmptyState icon={Search} title="Select a job" description="Choose a job above to see saved preparation artifacts." />
          ) : artifacts.isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-12 w-full" />)}</div>
          ) : artifacts.isError ? (
            <div className="space-y-2 p-4">
              <p className="text-[13px] text-destructive">{(artifacts.error as Error)?.message || 'Artifacts could not be loaded.'}</p>
              <Button variant="outline" size="sm" onClick={() => artifacts.refetch()}>Retry</Button>
            </div>
          ) : artifacts.data?.data.length === 0 ? (
            <EmptyState icon={FileText} title="No preparation yet" description="Generate a module to see it here." />
          ) : (
            <div>
              {artifacts.data?.data.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left last:border-0 transition-colors hover:bg-accent/40 ${
                    visibleArtifact?.id === item.id ? 'bg-accent/50' : ''
                  }`}
                >
                  <span className="text-[13px] font-medium text-foreground">{MODULE_LABEL[item.module]}</span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
                    {item.model} · {formatDateTime(item.created_at)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div aria-live="polite">
          {selected.isLoading && selectedId ? (
            <div className="card space-y-2 p-5">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-10 w-full" />)}</div>
          ) : selected.isError ? (
            <div className="card flex items-center justify-between gap-3 p-5">
              <p className="text-[13px] text-destructive">{(selected.error as Error)?.message || 'This artifact could not be loaded.'}</p>
              <Button variant="outline" size="sm" onClick={() => selected.refetch()}>Retry</Button>
            </div>
          ) : visibleArtifact ? (
            <ArtifactView artifact={visibleArtifact} />
          ) : (
            <div className="card">
              <EmptyState
                icon={Sparkles}
                title="Nothing to display"
                description="Select a job, choose a module and generate preparation to see the result here."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Preparation;
