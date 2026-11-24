import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from 'react-query';
import { Bookmark, BriefcaseBusiness } from 'lucide-react';
import { candidate } from '@/lib/api';
import { CandidateApplication } from '@/lib/types';
import { JobCard } from '@/components/candidate/JobCard';
/* hero replaces PageHeader */
import { PageLoader } from '@/components/ui/spinner';

const EASE = [0.22, 1, 0.36, 1] as const;

const SavedJobs: React.FC = () => {
  const { data, isLoading, error } = useQuery('candidate-applications', candidate.applications);
  const saved = (data?.data || []).filter((application: CandidateApplication) => application.status === 'SAVED');
  return (
    <div className="space-y-6">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="relative overflow-hidden rounded-2xl border border-border bg-grad-surface p-6 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.08),transparent_50%)]" />
        <div className="relative">
          <p className="eyebrow text-signal">Your shortlist</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[36px]">Saved jobs.</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">Roles you bookmarked to review, compare, and apply to when the time is right.</p>
        </div>
      </motion.section>
      {isLoading ? (
        <PageLoader label="Loading saved jobs…" />
      ) : error ? (
        <div className="card p-5 text-[13px] text-destructive">{(error as Error).message}</div>
      ) : saved.length ? (
        <div className="space-y-3">
          {saved.map((application, i) => (
            <motion.div key={application.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.04, 0.24) }}>
              <JobCard job={{
                id: application.job_id, title: application.job_title, company_name: application.company_name,
                location: application.location, location_type: application.location_type, employment_type: application.employment_type,
                apply_url: application.apply_url, job_url: application.job_url || '', source_site: application.source_site || '', skills: application.skills || [],
                posted_at: application.posted_at, experience_level: application.experience_level, salary_range: application.salary_range,
                trust_score: application.trust_score || 0, trust_band: application.trust_band || 'review',
              }} />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card flex flex-col items-center px-6 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-border-strong">
            <Bookmark className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
          </div>
          <h2 className="mt-2 text-[14px] font-semibold text-foreground">No saved roles yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">Save a role from the job listing page and it will be easy to find here.</p>
          <Link to="/jobs" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"><BriefcaseBusiness className="h-4 w-4" />Browse jobs</Link>
        </div>
      )}
    </div>
  );
};

export default SavedJobs;
