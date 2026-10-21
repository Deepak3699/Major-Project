import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BriefcaseBusiness, MapPin, ShieldCheck, Bookmark } from 'lucide-react';
import { CandidateJob } from '@/lib/types';

function trustLabel(band: CandidateJob['trust_band']) {
  if (band === 'very_high') return 'Very high confidence';
  if (band === 'high') return 'High confidence';
  if (band === 'low') return 'Low trust';
  if (band === 'review') return 'Trust check';
  return 'Trust';
}

function trustColor(band: CandidateJob['trust_band']) {
  if (band === 'very_high' || band === 'high' || band === 'review') return 'border-success/30 bg-success-soft text-success';
  if (band === 'low') return 'border-destructive/30 bg-destructive-soft text-destructive';
  return 'border-warning/30 bg-warning-soft text-warning';
}

export function JobCard({ job, onSave, saving = false }: { job: CandidateJob; onSave?: (job: CandidateJob) => void; saving?: boolean }) {
  const date = job.posted_at || job.first_seen_at;
  return (
    <article className="card group p-5 transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface/90">
      <div className="flex flex-col justify-between gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${trustColor(job.trust_band)}`}><ShieldCheck className="mr-1 inline h-3.5 w-3.5" />{trustLabel(job.trust_band)} · {job.trust_score}</span>
            {job.match_score !== undefined && <span className="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">{job.match_score}% match</span>}
            {date && <span className="text-xs text-muted-foreground">Posted {new Date(date).toLocaleDateString()}</span>}
          </div>
          <Link to={`/jobs/${job.id}`} className="text-lg font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">{job.title}</Link>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{job.company_name}{job.company_industry ? ` · ${job.company_industry}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {job.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{job.location}</span>}
            {job.employment_type && <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-3.5 w-3.5" />{job.employment_type.replace(/_/g, ' ')}</span>}
            {job.salary_range && <span>{job.salary_range}</span>}
            {job.experience_level && <span>{job.experience_level}</span>}
          </div>
          {job.skills?.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{job.skills.slice(0, 6).map((skill) => <span key={skill} className="rounded-md border border-border bg-muted/55 px-2 py-1 text-[11px] text-muted-foreground">{skill}</span>)}{job.skills.length > 6 && <span className="px-1 py-1 text-[11px] text-muted-foreground">+{job.skills.length - 6}</span>}</div>}
        </div>
        <div className="flex shrink-0 items-start gap-2 sm:flex-col sm:items-end">
          {onSave && <button type="button" disabled={saving} onClick={() => onSave(job)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"><Bookmark className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}</button>}
          <Link to={`/jobs/${job.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary-hover">View details <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
    </article>
  );
}
