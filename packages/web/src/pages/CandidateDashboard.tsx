import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useQuery } from 'react-query';
import {
  ArrowRight, BriefcaseBusiness, Clock, Coins, MapPin, Mic,
  Play, Plus, Search, Sparkles, Star, TrendingUp,
} from 'lucide-react';
import { candidate, practice, credits } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

function rise(delay = 0, y = 14) {
  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: EASE, delay },
  };
}
function fade(delay = 0) {
  return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.4, ease: EASE, delay } };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({ icon: Icon, label, value, hint, delay, glow }: { icon: any; label: string; value: React.ReactNode; hint: string; delay: number; glow?: boolean }) {
  return (
    <motion.div {...rise(delay)} whileHover={{ y: -3, transition: { duration: 0.2 } }} className={cn("relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-1 hover:border-signal/25 hover:shadow-[0_18px_40px_-16px_hsl(var(--signal)/0.2)]", glow ? "border-signal/20 shadow-[0_12px_32px_-16px_hsl(var(--signal)/0.2)]" : "border-border/70")}>
      <div aria-hidden className="pointer-events-none absolute -top-3 -right-8 h-20 w-20 rounded-full bg-signal/5 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-foreground/55">{label}</p>
          <p className="mt-3 text-[28px] font-semibold leading-none tabular-nums tracking-tight text-foreground">{value}</p>
          <p className="mt-2 text-[12.5px] text-foreground/70">{hint}</p>
        </div>
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl backdrop-blur-md", glow ? "border-signal/15 bg-signal/15 text-signal" : "border-border/80 bg-surface")}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
      </div>
    </motion.div>
  );
}

function StatusPulse({ message, isToned }: { message: string; isToned: boolean }) {
  return (
    <motion.div {...rise(0.1)} className={cn("flex items-center gap-3 rounded-2xl border px-4 py-3", isToned ? "border-success/25 bg-success/8" : "border-border/80 bg-surface/80")}>
      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#C4775F]/20 bg-[#C4775F]/12 text-[#C4775F]">
        <TrendingUp className="h-4.5 w-4.5" strokeWidth={2} />
      </span>
      <p className="text-[12.5px] leading-relaxed text-foreground/85">{message}</p>
    </motion.div>
  );
}

function JobCardHome({ job, delay }: { job: any; delay: number }) {
  return (
    <motion.div key={job.id} {...rise(delay)} whileHover={{ y: -2, transition: { duration: 0.2 } }} className="card group transition-all duration-300 hover:border-signal/25">
      <Link to={`/jobs/${job.id}`} className="absolute inset-0 z-10 rounded-2xl" aria-label={`View ${job.title}`} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-signal/15 bg-signal/10 text-signal backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
          <BriefcaseBusiness className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {job.match_score != null && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-signal/25 bg-signal/10 px-2 py-0.5 text-[10.5px] font-semibold text-signal">
                <Star className="h-2.5 w-2.5 fill-signal" /> {job.match_score}% match
              </span>
            )}
            {job.trust_band && (
              <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-medium", job.trust_band === 'very_high' ? "border-success/25 bg-success/8 text-success" : job.trust_band === 'low' ? "border-warning/25 bg-warning/8 text-warning" : "border-success/20 bg-success/8 text-success")}>
                Verified
              </span>
            )}
          </div>
          <h3 className="mt-1.5 line-clamp-2 font-semibold leading-snug tracking-[-0.015em] text-foreground">{job.title}</h3>
          <p className="mt-1 line-clamp-1 text-[12.5px] text-foreground/70">{job.company_name}{job.company_industry ? ` · ${job.company_industry}` : ''}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-foreground/55">
            {job.location && <span>{job.location}</span>}
            {job.salary_range && <span>{job.salary_range}</span>}
            {job.posted_at && <span>{new Date(job.posted_at).toLocaleDateString()}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link to={`/jobs/${job.id}`} className="inline-flex h-9 items-center gap-1 rounded-xl border border-border px-3.5 text-[12.5px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-accent">Details</Link>
          <button type="button" aria-label={`Save ${job.title}`} className="grid h-9 w-9 place-items-center rounded-xl border border-border text-foreground/70 transition-colors hover:border-border-strong hover:text-foreground">
            <Plus className="h-4 w-4" strokeWidth={1.9} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function ActionItem({ to, icon: Icon, title, hint }: { to: string; icon: any; title: string; hint: string }) {
  return (
    <motion.div whileHover={{ y: -2, transition: { duration: 0.2 } }} className="card group flex flex-col gap-3 p-5 transition-all duration-300 hover:border-signal/25">
      <span className="grid h-11 w-11 place-items-center rounded-2xl border border-signal/15 bg-signal/10 text-signal backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <div>
        <p className="font-semibold text-[13.5px] text-foreground">{title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-foreground/65">{hint}</p>
      </div>
      <Link to={to} className="mt-auto inline-flex items-center gap-1.5 text-[12.5px] font-medium text-signal transition-colors hover:underline">Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} /></Link>
    </motion.div>
  );
}

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const reduced = useReducedMotion();
  const [search] = useSearchParams();
  const [q, setQ] = useState(search.get('q') ?? '');

  const { data: summary, isLoading } = useQuery('candidate-summary', candidate.summary, { refetchInterval: 30000 });
  const { data: recommendations } = useQuery('candidate-recommendations', candidate.recommendations, { enabled: !!summary?.has_profile, refetchInterval: 30000 });
  const { data: apps } = useQuery('candidate-applications', candidate.applications, { refetchInterval: 30000 });
  const { data: creditsData } = useQuery('credits-overview', credits.overview);
  const { data: practiceData } = useQuery('practice-sessions', practice.sessions);

  if (isLoading) return <PageLoader label="Loading your workspace…" />;

  const firstName = (user?.email || 'there').split('@')[0].split(/[._-]/)[0];
  const topJobs = (recommendations?.data || []).slice(0, 3);
  const recentApps = (apps?.data || []).slice(0, 2);
  const completion = Number(summary?.profile_completion || 0);
  const statuses = summary?.application_statuses || {};
  const appliedCount = Number(statuses.APPLIED || 0) + Number(statuses.INTERVIEW || 0);
  const offerCount = Number(statuses.OFFER || 0) + Number(statuses.JOINED || 0);
  const practiceRemaining = practiceData?.sessions?.length != null ? `${Math.max(0, 3 - practiceData.sessions.length)} sessions left` : '3 sessions available';

  const statusMessage = offerCount > 0
    ? 'You have an offer in review — treat every reply as your next application.'
    : appliedCount > 0
      ? 'Your applications are in flight — nudge the ones at milestones.'
      : 'Nothing is queued right now. Discover roles to start.';

  const filteredJobs = useMemo(() => {
    const jobs = topJobs;
    if (!q) return jobs;
    const s = q.toLowerCase();
    return jobs.filter((j: any) => `${j.title} ${j.company_name}`.toLowerCase().includes(s));
  }, [topJobs, q]);

  return (
    <motion.div {...fade(0)} className="mx-auto space-y-5 sm:space-y-6" initial={reduced ? undefined : { opacity: 0 }}>
      <section {...rise(0)} className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,hsl(36,42%,99.5%),hsl(33,34%,95.5%))] p-5 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">Home · {greeting().toLowerCase()}</p>
            <h1 className="mt-2.5 text-[28px] font-semibold leading-[1.1] tracking-[-0.035em] text-foreground sm:text-[36px]">
              Welcome back, <span className="text-[hsl(20,40%,14%)]">{firstName}</span>
            </h1>
            <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-foreground/75">
              Focus on what matters: your application, the role, and the edge you need to win it.
            </p>
            <div className="mt-6">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link to="/recommendations" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-all hover:bg-primary-hover">
                  Explore jobs <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </Link>
                <Link to="/jobs" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-[13px] font-medium text-foreground transition-all hover:bg-accent"><Search className="h-4 w-4" strokeWidth={2} /> Discover</Link>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-1 lg:grid-cols-3">
            <StatCard icon={BriefcaseBusiness} label="Fresh jobs" value={summary?.fresh_jobs_7d ?? 0} hint="new listings" delay={0.03} />
            <StatCard icon={TrendingUp} label="Applications" value={summary?.application_total ?? 0} hint="in progress" delay={0.06} />
            <StatCard icon={Coins} label="Credits" value={creditsData?.wallet.balance ?? '—'} hint={creditsData?.plan?.name || 'Plan'} delay={0.09} />
          </div>
        </div>
      </section>

      <StatusPulse message={statusMessage} isToned={appliedCount > 0 || offerCount > 0} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <motion.section {...rise(0.12)} className="min-w-0 space-y-4" aria-labelledby="home-jobs-title">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">With focus</p>
              <h2 id="home-jobs-title" className="mt-1 font-semibold tracking-[-0.02em] text-foreground">Open roles worth your time</h2>
            </div>
          </div>

          {/* Jobs grid — no cards if empty */}
          {topJobs.length > 0 ? (
            <div className="grid gap-4">
              {filteredJobs.length > 0 ? (
                filteredJobs.map((job, i) => <JobCardHome key={job.id} job={job} delay={0.16 + i * 0.04} />)
              ) : (
                <div className="card rounded-2xl px-6 py-8 text-center text-[13.5px] text-foreground/75">
                  No results match your search. Try another query.
                </div>
              )}
            </div>
          ) : (
            <motion.div {...rise(0.2)} className="card flex flex-col items-center justify-center rounded-2xl px-6 py-10 text-center">
              <span aria-hidden className="grid h-12 w-12 place-items-center rounded-xl border border-signal/15 bg-signal/10 text-signal"><BriefcaseBusiness className="h-5.5 w-5.5" /></span>
              <p className="mt-4 text-[14.5px] font-medium text-foreground">No strong matches yet</p>
              <p className="mt-2 text-[13px] leading-relaxed text-foreground/70">Discover roles to keep the pipeline flowing.</p>
              <Link to="/jobs" className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-signal hover:underline">Discover jobs <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} /></Link>
            </motion.div>
          )}
        </motion.section>

        <div className="space-y-5">
          {completion < 70 && (
            <motion.section {...rise(0.14)} className="card rounded-2xl p-5 sm:p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">Action needed</p>
              <h2 className="mt-1.5 text-[17px] font-semibold text-foreground">Complete your profile first</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/72">A strong profile helps recruiters shortlist you faster. Complete the basics now.</p>
              <div className="mt-4 inline-flex items-center gap-2 text-[12.5px] text-signal">
                <Star className="h-4 w-4 fill-signal" /> Profile strength {completion}%
              </div>
              <Link to="/profile" className="mt-4 inline-flex h-9 items-center rounded-xl border border-signal/30 bg-signal/10 px-3.5 text-[12.5px] font-medium text-signal transition-colors hover:bg-signal/15">
                Improve profile
              </Link>
            </motion.section>
          )}

          {recentApps.length > 0 && (
            <motion.section {...rise(0.16)} className="space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">Recent activity</p>
                  <h2 className="mt-1 font-semibold text-foreground">Applications</h2>
                </div>
                <Link to="/applications" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-foreground/70 hover:text-foreground">Open tracker <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} /></Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {recentApps.map((app, i) => (
                  <motion.div key={app.id} {...rise(0.18 + i * 0.04)} className="card group flex items-center justify-between gap-3 p-4 transition-all duration-300 hover:border-signal/25">
                    <div className="min-w-0">
                      <p className="line-clamp-1 text-[13.5px] font-semibold text-foreground">{app.job_title}</p>
                      <p className="mt-0.5 text-[11.5px] text-foreground/65">{new Date(app.updated_at).toLocaleDateString()}</p>
                    </div>
                    <Link to="/applications" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-foreground/70 transition-colors hover:bg-accent">
                      <ArrowRight className="h-4 w-4" strokeWidth={2} />
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          <motion.section {...rise(0.2)} className="card rounded-2xl p-5 sm:p-6 lg:p-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-signal">Boost momentum</p>
                <h2 className="mt-1 text-[17px] font-semibold text-foreground">Preparation & practice</h2>
                <p className="mt-2 text-[12.5px] leading-relaxed text-foreground/72">Stay sharp: rehearse, refine, and document your next win.</p>
              </div>
              <Link to="/practice" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                <Play className="h-3.5 w-3.5" strokeWidth={2} fill="currentColor" /> Practice
              </Link>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <ActionItem to="/preparation" icon={Sparkles} title="Prep for role" hint="Question bank, frameworks and revision plan." />
              <ActionItem to="/credits" icon={Coins} title="Check credits" hint={practiceRemaining + " left."} />
              <ActionItem to="/learning" icon={Mic} title="Skill gap review" hint="Map strengths to job requirements." />
            </div>
          </motion.section>
        </div>
      </div>
    </motion.div>
  );
};

export default CandidateDashboard;
