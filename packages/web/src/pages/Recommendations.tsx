import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from 'react-query';
import { ArrowRight, Target } from 'lucide-react';
import { candidate } from '@/lib/api';
/* hero replaces PageHeader */
import { PageLoader } from '@/components/ui/spinner';
import { JobCard } from '@/components/candidate/JobCard';

const EASE = [0.22, 1, 0.36, 1] as const;
const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: EASE, delay },
});

const WEIGHT_LABELS: Record<string, string> = { skills: 'Skills', experience: 'Experience', education: 'Education', location: 'Location', role: 'Role fit', projects: 'Projects', salary: 'Salary', preferences: 'Preferences' };

const Recommendations: React.FC = () => {
  const { data, isLoading, error } = useQuery('candidate-recommendations', candidate.recommendations, { refetchInterval: 30000 });
  return (
    <div className="space-y-6">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="relative overflow-hidden rounded-2xl border border-border bg-grad-surface p-6 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.08),transparent_50%)]" />
        <div className="relative">
          <p className="eyebrow text-signal">Personalized matches</p>
          <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[36px]">Recommended for you.</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">Roles with a 70%+ match to your profile, with clear reasons and skill gaps. Browse all trusted listings in Discover jobs too.</p>
        </div>
      </motion.section>
      {isLoading ? (
        <PageLoader label="Matching jobs to your profile…" />
      ) : error ? (
        <div className="card p-5 text-[13px] text-destructive">{(error as Error).message}</div>
      ) : data?.needs_profile ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="flex flex-col items-center px-6 py-14 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-dashed border-border-strong">
            <Target className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={1.75} />
          </div>
          <h2 className="mt-2 text-[14px] font-semibold text-foreground">Add your profile to unlock matches</h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">Recommendations use the skills, roles, experience and location you confirm. Every score includes its reason and missing skills.</p>
          <Link to="/profile" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">Set up profile <ArrowRight className="h-4 w-4" /></Link>
        </motion.div>
      ) : data?.data?.length ? (
        <div className="space-y-5">
          {data.data.map((job, i) => (
            <motion.article key={job.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.05, 0.25) }} className="space-y-2">
              <JobCard job={job} />
              <div className="card grid gap-4 p-4 md:ml-5 md:grid-cols-[1.1fr_1fr]">
                <div>
                  <p className="eyebrow">Why this fits</p>
                  <ul className="mt-3 space-y-1.5">
                    {job.match_reasons?.map((reason) => (
                      <li key={reason} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/90">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />{reason}
                      </li>
                    ))}
                  </ul>
                  {job.matched_skills?.length ? <p className="mt-3 text-[11.5px] leading-relaxed text-success">Matches: {job.matched_skills.join(', ')}</p> : null}
                  {job.missing_skills?.length ? <p className="mt-2 text-[11.5px] leading-relaxed text-warning">Skills not found in your profile: {job.missing_skills.join(', ')}</p> : null}
                </div>
                <div>
                  <p className="eyebrow">Score breakdown</p>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                    {Object.entries(job.score_breakdown || {}).map(([key, value]) => (
                      <div key={key}>
                        <div className="mb-1 flex items-baseline justify-between gap-2 text-[10.5px]">
                          <span className="text-muted-foreground">{WEIGHT_LABELS[key] || key}</span>
                          <span className="font-mono tabular-nums text-foreground">{value.score}% <span className="text-muted-foreground/80">· {value.weight}% weight</span></span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-info" style={{ width: `${value.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center text-[13px] leading-relaxed text-muted-foreground">No recent active jobs to score right now. Browse listings or check back after a source run.</div>
      )}
    </div>
  );
};

export default Recommendations;
