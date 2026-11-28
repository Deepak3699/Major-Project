import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, ShieldCheck, Bookmark, Clock, Banknote, Gauge, Briefcase } from 'lucide-react';
import { CandidateJob } from '@/lib/types';
import { JobRoleAvatar, getRoleTheme } from './JobRoleAvatar';

function trustLabel(band: CandidateJob['trust_band']) {
  if (band === 'very_high') return 'Very high confidence';
  if (band === 'high') return 'High confidence';
  if (band === 'low') return 'Low trust';
  if (band === 'review') return 'Trust check';
  return 'Trust';
}

function trustColor(band: CandidateJob['trust_band']) {
  if (band === 'very_high' || band === 'high' || band === 'review') return 'border-success/25 bg-success-soft text-success';
  if (band === 'low') return 'border-destructive/25 bg-destructive-soft text-destructive';
  return 'border-warning/25 bg-warning-soft text-warning';
}

export function JobCard({ job, onSave, saving = false }: { job: CandidateJob; onSave?: (job: CandidateJob) => void; saving?: boolean }) {
  const date = job.posted_at || job.first_seen_at;
  const theme = getRoleTheme(job.title, job.company_industry, job.skills);
  return (
    <article className="card group relative overflow-hidden p-5 transition-colors duration-150 hover:border-border-strong">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] opacity-40" style={{ backgroundColor: theme.color }} />
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="flex min-w-0 flex-1 gap-3">
          <JobRoleAvatar title={job.title} industry={job.company_industry} skills={job.skills} size={44} />
          <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-medium ${trustColor(job.trust_band)}`}><ShieldCheck className="mr-1 h-3 w-3" />{trustLabel(job.trust_band)} · {job.trust_score}</span>
            {job.match_score !== undefined && <span className="inline-flex items-center rounded-md border border-signal/25 bg-signal-soft px-2 py-0.5 font-mono text-[10.5px] font-medium text-signal">{job.match_score}% match</span>}
            {date && <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground"><Clock className="h-3 w-3" />{new Date(date).toLocaleDateString()}</span>}
          </div>
          <Link to={`/jobs/${job.id}`} className="text-[17px] font-semibold leading-snug tracking-[-0.014em] text-foreground transition-colors group-hover:text-foreground group-hover:underline group-hover:decoration-signal group-hover:decoration-2 group-hover:underline-offset-4">{job.title}</Link>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground">{job.company_name}{job.company_industry ? ` · ${job.company_industry}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
            {job.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>}
            {job.employment_type && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" />{job.employment_type.replace(/_/g, ' ')}</span>}
            {job.salary_range && <span className="inline-flex items-center gap-1"><Banknote className="h-3 w-3" />{job.salary_range}</span>}
            {job.experience_level && <span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" />{job.experience_level}</span>}
          </div>
          {job.skills?.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-1.5">{job.skills.slice(0, 6).map((skill) => <span key={skill} className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">{skill}</span>)}{job.skills.length > 6 && <span className="font-mono text-[10.5px] text-muted-foreground/70">+{job.skills.length - 6}</span>}</div>}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1.5 sm:flex-col sm:items-end">
          {onSave && <button type="button" disabled={saving} onClick={() => onSave(job)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50"><Bookmark className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}</button>}
          <Link to={`/jobs/${job.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">Details <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
    </article>
  );
}
