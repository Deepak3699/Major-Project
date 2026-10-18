import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { ArrowRight, Target } from 'lucide-react';
import { candidate } from '@/lib/api';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { JobCard } from '@/components/candidate/JobCard';

const WEIGHT_LABELS: Record<string, string> = { skills: 'Skills', experience: 'Experience', education: 'Education', location: 'Location', role: 'Role fit', projects: 'Projects', salary: 'Salary', preferences: 'Preferences' };

const Recommendations: React.FC = () => {
  const { data, isLoading, error } = useQuery('candidate-recommendations', candidate.recommendations);
  return <div className="space-y-5">
    <PageHeader title="Recommended for you" description="Only roles scoring 70% or higher against your skills, role preferences, experience and work setup are shown." />
    {isLoading ? <PageLoader label="Matching jobs to your profile…" /> : error ? <div className="card p-5 text-sm text-destructive">{(error as Error).message}</div> : data?.needs_profile ? <div className="card p-8 text-center"><Target className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-3 text-lg font-semibold">Add your profile to unlock matches</h2><p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">Recommendations use the skills, roles, experience and location you confirm. Every score includes its reason and missing skills.</p><Link to="/profile" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">Set up profile <ArrowRight className="h-4 w-4" /></Link></div> : data?.data?.length ? <div className="space-y-4">{data.data.map((job) => <article key={job.id} className="space-y-3"><JobCard job={job} /><div className="card ml-0 grid gap-4 p-4 md:ml-5 md:grid-cols-[1.1fr_1fr]">
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Why this fits</p><ul className="space-y-1.5">{job.match_reasons?.map((reason) => <li key={reason} className="flex gap-2 text-xs text-foreground/90"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />{reason}</li>)}</ul>{job.matched_skills?.length ? <p className="mt-3 text-xs text-success">Matches: {job.matched_skills.join(', ')}</p> : null}{job.missing_skills?.length ? <p className="mt-2 text-xs text-warning">Skills not found in your profile: {job.missing_skills.join(', ')}</p> : null}</div>
      <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Score breakdown</p><div className="grid grid-cols-2 gap-x-4 gap-y-2">{Object.entries(job.score_breakdown || {}).map(([key, value]) => <div key={key}><div className="mb-1 flex justify-between text-[10px]"><span className="text-muted-foreground">{WEIGHT_LABELS[key] || key}</span><span className="tabular-nums">{value.score}% <span className="text-muted-foreground">· {value.weight}% weight</span></span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-info" style={{ width: `${value.score}%` }} /></div></div>)}</div></div>
    </div></article>)}</div> : <div className="card p-8 text-center text-sm text-muted-foreground">No recent active jobs to score right now. Browse listings or check back after a source run.</div>}
  </div>;
};

export default Recommendations;
