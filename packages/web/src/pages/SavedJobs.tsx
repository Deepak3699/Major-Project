import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { Bookmark, BriefcaseBusiness } from 'lucide-react';
import { candidate } from '@/lib/api';
import { CandidateApplication } from '@/lib/types';
import { JobCard } from '@/components/candidate/JobCard';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';

const SavedJobs: React.FC = () => {
  const { data, isLoading, error } = useQuery('candidate-applications', candidate.applications);
  const saved = (data?.data || []).filter((application: CandidateApplication) => application.status === 'SAVED');
  return <div className="space-y-5">
    <PageHeader title="Saved jobs" description="Roles you bookmarked to review or apply to later." />
    {isLoading ? <PageLoader label="Loading saved jobs…" /> : error ? <div className="card p-5 text-sm text-destructive">{(error as Error).message}</div> : saved.length ? <div className="space-y-3">{saved.map((application) => <JobCard key={application.id} job={{
      id: application.job_id, title: application.job_title, company_name: application.company_name,
      location: application.location, location_type: application.location_type, employment_type: application.employment_type,
      apply_url: application.apply_url, job_url: application.job_url || '', source_site: application.source_site || '', skills: application.skills || [],
      posted_at: application.posted_at, experience_level: application.experience_level, salary_range: application.salary_range,
      trust_score: application.trust_score || 0, trust_band: application.trust_band || 'review',
    }} />)}</div> : <div className="card p-8 text-center"><Bookmark className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">No saved roles yet</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Save a role from the job listing page and it will be easy to find here.</p><Link to="/jobs" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><BriefcaseBusiness className="h-4 w-4" />Browse jobs</Link></div>}
  </div>;
};

export default SavedJobs;
