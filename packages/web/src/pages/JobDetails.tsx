import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { ArrowLeft, ArrowUpRight, Bookmark, Check, Copy, FileText, ShieldCheck, Target, Mail, Phone, ExternalLink } from 'lucide-react';
import { candidate } from '@/lib/api';
import { safeExternalUrl } from '@/lib/safe-url';
import { CandidateJob } from '@/lib/types';
import { PageLoader } from '@/components/ui/spinner';

const JobDetails: React.FC = () => {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const [activeDocument, setActiveDocument] = useState<{ title: string; content: string } | null>(null);
  const query = useQuery(['candidate-job', id], () => candidate.job(id), { enabled: !!id });
  const save = useMutation((status: 'SAVED' | 'APPLIED') => candidate.saveJob(id, status), { onSuccess: () => { client.invalidateQueries('candidate-applications'); client.invalidateQueries('candidate-summary'); } });
  const prepare = useMutation(() => candidate.prepare(id), { onSuccess: (result) => { client.invalidateQueries('candidate-applications'); client.invalidateQueries('candidate-summary'); setActiveDocument(result.documents.find((doc) => doc.document_type === 'tailored_resume') || result.documents[0] || null); } });

  if (query.isLoading) return <PageLoader label="Loading job details…" />;
  if (query.error || !query.data?.job) return <div className="card p-6"><p className="text-sm text-destructive">{(query.error as Error)?.message || 'Job not found'}</p><Link to="/jobs" className="mt-3 inline-flex items-center gap-2 text-sm text-primary"><ArrowLeft className="h-4 w-4" />Back to jobs</Link></div>;
  const job: CandidateJob = query.data.job;
  const description = job.description || job.about_job || 'The source did not provide a job description.';
  const applyUrl = safeExternalUrl(job.apply_url || job.job_url);

  return <div className="mx-auto max-w-5xl space-y-5">
    <Link to="/jobs" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"><ArrowLeft className="h-4 w-4" />All jobs</Link>
    <section className="glow-ring card relative overflow-hidden p-6 sm:p-8"><div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: 'var(--grad-mesh)' }} /><div className="relative">
      <div className="flex flex-wrap items-center gap-2"><TrustBadge job={job} /><span className="text-xs text-muted-foreground">Source: {job.source_site}</span></div>
      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">{job.title}</h1><p className="mt-1 text-base text-muted-foreground">{job.company_name}{job.company_industry ? ` · ${job.company_industry}` : ''}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">{job.location && <span>{job.location}</span>}{job.location_type && <span className="capitalize">{job.location_type}</span>}{job.employment_type && <span>{job.employment_type.replace(/_/g,' ')}</span>}{job.experience_level && <span>{job.experience_level}</span>}{job.salary_range && <span>{job.salary_range}</span>}</div>
      {job.match_score !== undefined && <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary-soft px-3 py-2 text-sm"><Target className="h-4 w-4 text-primary" /><span><b>{job.match_score}% match</b> based on your current profile</span></div>}
      <div className="mt-6 flex flex-wrap gap-2"><button disabled={save.isLoading} onClick={() => save.mutate('SAVED')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface/60 px-4 text-sm font-medium hover:border-primary/40 disabled:opacity-50"><Bookmark className="h-4 w-4" />Save job</button>{applyUrl ? <a href={applyUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">Open application page <ArrowUpRight className="h-4 w-4" /></a> : null}<button disabled={save.isLoading} onClick={() => save.mutate('APPLIED')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-success/30 bg-success-soft px-4 text-sm font-semibold text-success disabled:opacity-50"><Check className="h-4 w-4" />Mark as applied</button></div>
      {(save.error || prepare.error) && <p className="mt-3 text-sm text-destructive">{(save.error as Error)?.message || (prepare.error as Error)?.message}</p>}
    </div></section>

    <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <section className="card p-5 sm:p-6"><h2 className="text-lg font-semibold">About the role</h2><div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{description}</div></section>
      <div className="space-y-4">
        <section className="card p-5"><h2 className="text-base font-semibold">Employer contact</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Public company channels associated with this listing.</p><div className="mt-4 space-y-2">{job.public_hr_name && <p className="text-sm font-medium">{job.public_hr_name}</p>}{job.company_email && <a href={`mailto:${job.company_email}`} className="flex items-center gap-2 text-xs text-primary hover:underline"><Mail className="h-3.5 w-3.5" />{job.company_email}</a>}{job.company_phone && <a href={`tel:${job.company_phone}`} className="flex items-center gap-2 text-xs text-primary hover:underline"><Phone className="h-3.5 w-3.5" />{job.company_phone}</a>}{!job.public_hr_name && !job.company_email && !job.company_phone && <p className="text-xs text-muted-foreground">No named public contact was verified for this listing. Use the official application page above.</p>}</div><div className="mt-3 flex flex-wrap gap-2">{safeExternalUrl(job.public_hr_linkedin) && <a href={safeExternalUrl(job.public_hr_linkedin)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[11px] hover:border-primary/40">Hiring profile <ExternalLink className="h-3 w-3" /></a>}{safeExternalUrl(job.company_website) && <a href={safeExternalUrl(job.company_website)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-[11px] hover:border-primary/40">Company site <ExternalLink className="h-3 w-3" /></a>}</div></section>
        <section className="card p-5"><h2 className="text-base font-semibold">Job trust signals</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Evidence-based confidence, not a guarantee that a role is genuine.</p><div className="mt-4 space-y-3">{job.trust_evidence?.map((item) => <div key={item.signal} className="flex gap-3"><div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-[10px] font-bold">+{item.points}</div><div><p className="text-xs font-semibold">{item.signal}</p><p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{item.detail}</p></div></div>)}</div></section>
        <section className="card p-5"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /><h2 className="text-base font-semibold">Prepare your application</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">Create a role-specific resume draft and email from profile facts you confirmed. If Gemini is configured, your confirmed profile details and this job description are sent to Google to prepare the drafts; otherwise a local template is used. Review every line before using it.</p><button disabled={prepare.isLoading} onClick={() => prepare.mutate()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50"><FileText className="h-4 w-4" />{prepare.isLoading ? 'Preparing…' : 'Prepare materials'}</button><Link to={`/resume?jobId=${job.id}`} className="mt-3 inline-flex w-full justify-center text-xs font-medium text-primary hover:underline">Choose a resume layout and save as PDF</Link><Link to="/profile" className="mt-2 block text-center text-xs text-muted-foreground hover:underline">Edit profile facts</Link></section>
      </div>
    </div>

    {activeDocument && <DocumentPreview title={activeDocument.title} content={activeDocument.content} onClose={() => setActiveDocument(null)} onShowEmail={() => { const email = prepare.data?.documents.find((doc) => doc.document_type === 'email_draft'); if (email) setActiveDocument({ title: email.title, content: email.content }); }} />}
  </div>;
};

function TrustBadge({ job }: { job: CandidateJob }) {
  const tone = job.trust_band === 'low' ? 'border-destructive/30 bg-destructive-soft text-destructive' : 'border-success/30 bg-success-soft text-success';
  const label = job.trust_band === 'very_high' ? 'Trusted · very high confidence' : job.trust_band === 'high' ? 'Trusted · high confidence' : job.trust_band === 'review' ? 'Trust check' : 'Low trust';
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />{label} · {job.trust_score}/100</span>;
}

function DocumentPreview({ title, content, onClose, onShowEmail }: { title: string; content: string; onClose: () => void; onShowEmail: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard?.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Review application material" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-t-2xl border border-border bg-surface shadow-2xl sm:rounded-2xl"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Review before use</p><h2 className="mt-1 font-semibold">{title}</h2></div><button onClick={onClose} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted">Close</button></div><pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 text-sm leading-6 text-foreground">{content}</pre><div className="flex flex-wrap justify-between gap-2 border-t border-border p-4"><button onClick={onShowEmail} className="rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted">View email draft</button><button onClick={copy} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy draft'}</button></div></div></div>;
}

export default JobDetails;
