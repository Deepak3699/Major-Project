import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { ArrowUpRight, Clock3, FileText, MessageSquareText, Star } from 'lucide-react';
import { candidate } from '@/lib/api';
import { safeExternalUrl } from '@/lib/safe-url';
import { CandidateApplication, ApplicationStatus } from '@/lib/types';
/* hero replaces PageHeader */
import { PageLoader } from '@/components/ui/spinner';

const EASE = [0.22, 1, 0.36, 1] as const;

const STATUSES: ApplicationStatus[] = ['SAVED','RECOMMENDED','READY_TO_APPLY','APPLIED','SCREENING','INTERVIEW','OFFER','REJECTED','WITHDRAWN','JOINED'];
const STATUS_TONE: Record<string,string> = {
  OFFER:'border border-success/25 bg-success-soft text-success',
  JOINED:'border border-success/25 bg-success-soft text-success',
  INTERVIEW:'border border-info/25 bg-info-soft text-info',
  REJECTED:'border border-destructive/25 bg-destructive-soft text-destructive',
  WITHDRAWN:'border border-border bg-muted text-muted-foreground',
  APPLIED:'border border-primary/25 bg-primary-soft text-primary',
  SCREENING:'border border-primary/25 bg-primary-soft text-primary',
  READY_TO_APPLY:'border border-primary/25 bg-primary-soft text-primary',
  SAVED:'border border-border bg-muted text-muted-foreground',
  RECOMMENDED:'border border-info/25 bg-info-soft text-info'
};

const Applications: React.FC = () => {
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery('candidate-applications', candidate.applications);
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [companyReplies, setCompanyReplies] = useState<Record<string,string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [document, setDocument] = useState<{ title:string; content:string } | null>(null);
  const [feedback, setFeedback] = useState({ application_id:'', rating:5, feedback:'' });
  const update = useMutation(({ id, values }: { id:string; values:{ status?:ApplicationStatus; notes?:string; note?:string } }) => candidate.updateApplication(id, values), { onSuccess: (_, variables) => { client.invalidateQueries('candidate-applications'); client.invalidateQueries('candidate-summary'); if (variables.values.note?.startsWith('Company response:')) setCompanyReplies((current) => ({ ...current, [variables.id]: '' })); } });
  const sendFeedback = useMutation(() => candidate.feedback({ application_id: feedback.application_id || undefined, rating: feedback.rating, feedback: feedback.feedback }), { onSuccess: () => setFeedback({ application_id:'', rating:5, feedback:'' }) });
  const applications: CandidateApplication[] = data?.data || [];

  return (
    <div className="space-y-6">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="relative overflow-hidden rounded-2xl border border-border bg-grad-surface p-6 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.08),transparent_50%)]" />
        <div className="relative">
          <p className="eyebrow text-signal">Track your journey</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[36px]">Application tracker.</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">From saved role to offer and joining - every step, status, and note in one clear place.</p>
        </div>
      </motion.section>
      {isLoading ? (
        <PageLoader label="Loading application history…" />
      ) : error ? (
        <div className="card p-5 text-[13px] text-destructive">{(error as Error).message}</div>
      ) : applications.length ? (
        <div className="space-y-3">
          {applications.map((app, i) => (
            <motion.article key={app.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.04, 0.24) }} className="card overflow-hidden">
              <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] ${STATUS_TONE[app.status] || 'border border-border bg-muted text-muted-foreground'}`}>{app.status.replace(/_/g,' ')}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground/80">Updated {new Date(app.updated_at).toLocaleDateString()}</span>
                  </div>
                  <h2 className="mt-2 truncate text-[16px] font-semibold tracking-[-0.01em] text-foreground">{app.job_title}</h2>
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{app.company_name}{app.location ? ` · ${app.location}` : ''}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label={`Update status for ${app.job_title}`} value={app.status} onChange={(e) => update.mutate({ id:app.id, values:{ status:e.target.value as ApplicationStatus, note:'Status updated by candidate' } })} className="input h-9 w-44 text-xs">
                    {STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g,' ')}</option>)}
                  </select>
                  {safeExternalUrl(app.apply_url || app.job_url) ? <a href={safeExternalUrl(app.apply_url || app.job_url)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60">Open listing <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" /></a> : null}
                </div>
              </div>
              <div className="border-t border-border px-5 py-3">
                <button onClick={() => setOpenId(openId === app.id ? null : app.id)} className="inline-flex items-center gap-2 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <Clock3 className="h-3.5 w-3.5" />{openId === app.id ? 'Hide activity' : `Activity & materials (${(app.events?.length || 0) + (app.documents?.length || 0)})`}
                </button>
              </div>
              {openId === app.id && (
                <div className="grid gap-5 border-t border-border bg-muted/30 p-5 md:grid-cols-2">
                  <div>
                    <h3 className="eyebrow">Status history</h3>
                    <div className="mt-3 space-y-3">
                      {app.events?.map((event,index) => (
                        <div key={`${event.created_at}-${index}`} className="flex gap-3">
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" />
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-foreground">{event.from_status ? `${event.from_status.replace(/_/g,' ')} → ` : ''}{event.to_status.replace(/_/g,' ')}</p>
                            {event.note && <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{event.note}</p>}
                            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">{new Date(event.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5">
                      <label className="label">Private note</label>
                      <div className="flex gap-2">
                        <input value={notes[app.id] ?? app.notes ?? ''} onChange={(e) => setNotes((current) => ({ ...current, [app.id]: e.target.value }))} maxLength={4000} placeholder="Add a reminder for yourself" className="input h-9" />
                        <button disabled={update.isLoading} onClick={() => update.mutate({ id:app.id, values:{ notes:notes[app.id] ?? app.notes ?? '', note:'Candidate note updated' } })} className="shrink-0 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60 disabled:opacity-50">Save</button>
                      </div>
                    </div>
                    <div className="mt-5">
                      <label className="label">Company response</label>
                      <textarea value={companyReplies[app.id] || ''} onChange={(e) => setCompanyReplies((current) => ({ ...current, [app.id]:e.target.value }))} rows={3} maxLength={1000} placeholder="Paste or summarize an email, interview invite, rejection, or other reply…" className="input h-auto resize-y" />
                      <button disabled={update.isLoading || !(companyReplies[app.id] || '').trim()} onClick={() => update.mutate({ id:app.id, values:{ note:`Company response: ${companyReplies[app.id].trim()}` } })} className="mt-2 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent/60 disabled:opacity-50">Save response to activity</button>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">This records a reply you received; it does not read your email inbox.</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="eyebrow">Prepared documents</h3>
                    {app.documents?.length ? (
                      <div className="mt-3 space-y-2">
                        {app.documents.map((doc) => (
                          <button key={doc.id} onClick={() => setDocument({ title:doc.title, content:doc.content })} className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-accent/60">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{doc.title}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">Review</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-[12px] leading-relaxed text-muted-foreground">No material drafts saved. Open the job and prepare a tailored resume and email.</p>
                    )}
                  </div>
                </div>
              )}
            </motion.article>
          ))}
        </div>
      ) : (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-border-strong">
            <FileText className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
          </div>
          <h2 className="mt-2 text-[14px] font-semibold text-foreground">Your tracker is ready</h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">Save a role from Discover jobs. When you apply on the employer's site, mark it as applied here and follow each milestone.</p>
        </div>
      )}

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          <h2 className="text-[14px] font-semibold text-foreground">Share your experience</h2>
          <span className="text-[11.5px] text-muted-foreground">Feedback is moderated before display</span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); sendFeedback.mutate(); }} className="mt-4 grid gap-3 md:grid-cols-[220px_140px_1fr_auto]">
          <select value={feedback.application_id} onChange={(e) => setFeedback((f) => ({ ...f, application_id:e.target.value }))} className="input">
            <option value="">General platform feedback</option>
            {applications.map((app) => <option key={app.id} value={app.id}>{app.company_name} · {app.job_title}</option>)}
          </select>
          <label className="relative">
            <Star className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-warning" />
            <select value={feedback.rating} onChange={(e) => setFeedback((f) => ({ ...f, rating:Number(e.target.value) }))} className="input pl-9">{[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select>
          </label>
          <input value={feedback.feedback} onChange={(e) => setFeedback((f) => ({ ...f, feedback:e.target.value }))} minLength={5} maxLength={3000} required placeholder="Share a helpful detail" className="input" />
          <button disabled={sendFeedback.isLoading} className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50">{sendFeedback.isLoading ? 'Sending…' : 'Submit feedback'}</button>
        </form>
        {sendFeedback.error && <p className="mt-2 text-xs text-destructive">{(sendFeedback.error as Error).message}</p>}
      </section>

      {document && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={(e) => { if(e.target===e.currentTarget) setDocument(null); }}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-surface">
            <div className="flex items-start justify-between gap-3 border-b border-border p-4">
              <div className="min-w-0">
                <p className="eyebrow">Review before use</p>
                <h2 className="mt-1 truncate text-sm font-semibold text-foreground">{document.title}</h2>
              </div>
              <button onClick={() => setDocument(null)} className="rounded-md px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">Close</button>
            </div>
            <pre className="overflow-auto whitespace-pre-wrap p-5 font-mono text-[12.5px] leading-relaxed text-foreground">{document.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default Applications;
