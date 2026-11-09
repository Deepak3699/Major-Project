import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { ArrowLeft, ArrowUpRight, Bookmark, Check, Copy, FileText, LoaderCircle, ShieldCheck, Target, Mail, Phone, ExternalLink } from 'lucide-react';
import { candidate } from '@/lib/api';
import { safeExternalUrl } from '@/lib/safe-url';
import { CandidateJob } from '@/lib/types';
import { PageLoader } from '@/components/ui/spinner';

const EASE = [0.22, 1, 0.36, 1] as const;
const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE, delay },
});

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

const JobDetails: React.FC = () => {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const [activeDocument, setActiveDocument] = useState<{ title: string; content: string } | null>(null);
  const query = useQuery(['candidate-job', id], () => candidate.job(id), { enabled: !!id });
  const save = useMutation((status: 'SAVED' | 'APPLIED') => candidate.saveJob(id, status), { onSuccess: () => { client.invalidateQueries('candidate-applications'); client.invalidateQueries('candidate-summary'); } });
  const prepare = useMutation(() => candidate.prepare(id), { onSuccess: (result) => { client.invalidateQueries('candidate-applications'); client.invalidateQueries('candidate-summary'); setActiveDocument(result.documents.find((doc) => doc.document_type === 'tailored_resume') || result.documents[0] || null); } });

  if (query.isLoading) return <PageLoader label="Loading job details…" />;
  if (query.error || !query.data?.job) {
    return (
      <div className="card p-6">
        <p className="text-sm text-destructive">{(query.error as Error)?.message || 'Job not found'}</p>
        <Link to="/jobs" className="mt-3 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4"><ArrowLeft className="h-4 w-4" />Back to jobs</Link>
      </div>
    );
  }
  const job: CandidateJob = query.data.job;
  const description = job.description || job.about_job || 'The source did not provide a job description.';
  const applyUrl = safeExternalUrl(job.apply_url || job.job_url);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to="/jobs" className="group inline-flex items-center gap-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4"><ArrowLeft className="h-4 w-4" />All jobs</Link>

      <motion.section {...rise(0)} className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <TrustBadge job={job} />
          <span className="font-mono text-[11px] text-muted-foreground">Source: {job.source_site}</span>
        </div>
        <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-[-0.022em] text-foreground text-balance sm:text-[28px]">{job.title}</h1>
        <p className="mt-1 text-[14px] font-medium text-muted-foreground">{job.company_name}{job.company_industry ? ` · ${job.company_industry}` : ''}</p>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px] text-muted-foreground">
          {job.location && <span>{job.location}</span>}
          {job.location_type && <span className="capitalize">{job.location_type}</span>}
          {job.employment_type && <span>{job.employment_type.replace(/_/g, ' ')}</span>}
          {job.experience_level && <span>{job.experience_level}</span>}
          {job.salary_range && <span className="font-mono text-[12.5px] tabular-nums">{job.salary_range}</span>}
        </div>
        {job.match_score !== undefined && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-signal/25 bg-signal-soft px-3 py-1.5 text-[13px]">
            <Target className="h-4 w-4 text-signal" strokeWidth={1.75} />
            <span className="text-muted-foreground"><span className="font-mono font-semibold tabular-nums text-signal">{job.match_score}%</span> match based on your current profile</span>
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <button disabled={save.isLoading} onClick={() => save.mutate('SAVED')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60 disabled:opacity-50"><Bookmark className="h-4 w-4 text-muted-foreground" />Save job</button>
          {applyUrl ? <a href={applyUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">Open application page <ArrowUpRight className="h-4 w-4" /></a> : null}
          <button disabled={save.isLoading} onClick={() => save.mutate('APPLIED')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-4 text-sm font-semibold text-success transition-colors hover:border-success/40 disabled:opacity-50"><Check className="h-4 w-4" />Mark as applied</button>
        </div>
        {(save.error || prepare.error) && <p className="mt-3 text-[13px] text-destructive">{(save.error as Error)?.message || (prepare.error as Error)?.message}</p>}
      </motion.section>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <motion.section {...rise(0.08)} className="card p-5 sm:p-6">
          <p className="eyebrow">About the role</p>
          <div className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-muted-foreground">{cleanText(description)}</div>
        </motion.section>

        <motion.div {...rise(0.14)} className="space-y-4">
          <section className="card p-5">
            <p className="eyebrow">Employer contact</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">Public company channels associated with this listing.</p>
            <div className="mt-4 space-y-2.5 border-t border-border pt-4">
              {job.public_hr_name && <p className="text-[13px] font-medium text-foreground">{job.public_hr_name}</p>}
              {job.company_email && <a href={`mailto:${job.company_email}`} className="inline-flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4"><Mail className="h-3.5 w-3.5 shrink-0" />{job.company_email}</a>}
              {job.company_phone && <a href={`tel:${job.company_phone}`} className="inline-flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4"><Phone className="h-3.5 w-3.5 shrink-0" /><span className="font-mono tabular-nums">{job.company_phone}</span></a>}
              {!job.public_hr_name && !job.company_email && !job.company_phone && <p className="text-[12px] leading-relaxed text-muted-foreground">No named public contact was verified for this listing. Use the official application page above.</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {safeExternalUrl(job.public_hr_linkedin) && <a href={safeExternalUrl(job.public_hr_linkedin)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">Hiring profile <ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
              {safeExternalUrl(job.company_website) && <a href={safeExternalUrl(job.company_website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">Company site <ExternalLink className="h-3 w-3 text-muted-foreground" /></a>}
            </div>
          </section>

          <section className="card p-5">
            <p className="eyebrow">Job trust signals</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">Evidence-based confidence, not a guarantee that a role is genuine.</p>
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              {job.trust_evidence?.map((item) => (
                <div key={item.signal} className="flex gap-3">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-muted font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">+{item.points}</div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-foreground">{item.signal}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              <p className="eyebrow">Prepare your application</p>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">Create a role-specific resume draft and email from profile facts you confirmed. If Gemini is configured, your confirmed profile details and this job description are sent to Google to prepare the drafts; otherwise a local template is used. Review every line before using it.</p>
            <button disabled={prepare.isLoading} onClick={() => prepare.mutate()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50">
              {prepare.isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {prepare.isLoading ? 'Preparing…' : 'Prepare materials'}
            </button>
            <Link to={`/resume?jobId=${job.id}`} className="mt-3 inline-flex w-full justify-center text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">Choose a resume layout and save as PDF</Link>
            <Link to="/profile" className="mt-2 block text-center text-[12px] text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4">Edit profile facts</Link>
          </section>
        </motion.div>
      </div>

      {activeDocument && <DocumentPreview title={activeDocument.title} content={activeDocument.content} onClose={() => setActiveDocument(null)} onShowEmail={() => { const email = prepare.data?.documents.find((doc) => doc.document_type === 'email_draft'); if (email) setActiveDocument({ title: email.title, content: email.content }); }} />}
    </div>
  );
};

function TrustBadge({ job }: { job: CandidateJob }) {
  const tone = job.trust_band === 'low' ? 'border-destructive/25 bg-destructive-soft text-destructive' : 'border-success/25 bg-success-soft text-success';
  const label = job.trust_band === 'very_high' ? 'Trusted · very high confidence' : job.trust_band === 'high' ? 'Trusted · high confidence' : job.trust_band === 'review' ? 'Trust check' : 'Low trust';
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
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
