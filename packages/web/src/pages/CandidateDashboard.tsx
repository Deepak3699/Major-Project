import React, { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import { useQuery } from 'react-query';
import {
  ArrowRight, ArrowUpRight, BriefcaseBusiness, Brain, Check,
  CheckCircle2, Clock, Coins, Flame, GraduationCap, MapPin,
  Menu, Mic, Pause, Play, Plus, Search, Sparkles, Star,
  TrendingUp, Wind, Briefcase, LayoutGrid, ListChecks, BookOpen, User, Target,
} from "lucide-react";
import { candidate, practice, credits } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { JobCard } from '@/components/candidate/JobCard';
import { PageLoader } from '@/components/ui/spinner';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

function rise(delay = 0, y = 16) {
  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.55, ease: EASE, delay },
  };
}

function fade(delay = 0) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.5, ease: EASE, delay },
  };
}

function slideIn(delay = 0, y = 20) {
  return {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.5, ease: EASE, delay },
  };
}

function greeting() {
  const h = new Date().getHours();
  const suffix = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${suffix}`;
}

function StatStack({ icon, label, value, change, isTrendUp }: {
  icon: any;
  label: string;
  value: string | number;
  change?: string;
  isTrendUp?: boolean;
}) {
  const ref = useInView({ once: true });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 20, scale: 0.95 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE }} className="group relative overflow-hidden rounded-3xl border border-[#C4775F]/15 bg-[#E8D5C3]/8 p-6 transition-all duration-500 hover:shadow-[0_20px_50px_-12px_hsl(12/46%/44%/0.15)] hover:border-[#C4775F]/25 hover:bg-[#E8D5C3]/12">
      <div aria-hidden className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-[#C4775F]/5 blur-3xl transition-transform duration-700 group-hover:scale-110" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="font-serif text-[11px] uppercase tracking-[0.18em] text-[#493126]/50">{label}</p>
          <p className="mt-4 font-sans text-[32px] font-semibold tracking-[-0.025em] text-[#493126] dark:text-[#F0E4D8]">{value}</p>
          {change && (
            <p className={cn("mt-2 text-xs font-medium flex items-center gap-1", isTrendUp ? "text-[#C4775F]" : "text-[#747B59]")}>
              {isTrendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
              {change}
            </p>
          )}
        </div>
        <motion.div whileHover={{ rotate: 2, scale: 1.05 }} className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#C4775F]/10 text-[#C4775F]">
          <icon className="h-8 w-8" strokeWidth={1.8} />
        </motion.div>
      </div>
    </motion.div>
  );
}

function GlowCard({
  children, className, delay = 0, showGlow = true, onClick
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  showGlow?: boolean;
  onClick?: () => void;
}) {
  const ref = useInView({ once: true });
  return (
    <motion.ref
      ref={ref as any}
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
      className={cn(
        "relative overflow-hidden rounded-3xl border p-6 transition-all duration-500 hover:shadow-[0_25px_60px_-15px_hsl(12/46%/44%/0.12)]",
        !showGlow && "border-[#747B59]/10 bg-[#F8F2EA]/5",
        showGlow && "border-[#C4775F]/15 bg-[#E8D5C3]/8",
        onClick && "cursor-pointer hover:scale-[1.01]"
      )}
    >
      {showGlow && (
        <div aria-hidden className="pointer-events-none absolute -top-20 -left-20 h-40 w-40 rounded-full bg-[#C4775F]/8 blur-3xl transition-transform duration-700" />
      )}
      {children}
    </motion.ref>
  );
}

function ProgressBar({ progress, color }: { progress: number; color?: string }) {
  const colorValue = color || "#C4775F";
  const ref = useInView({ once: true });
  return (
    <div ref={ref as any} className="relative h-2 overflow-hidden rounded-full bg-[#E8D5C3]/20">
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.min(100, progress)}%` }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="h-full bg-[#C4775F]"
        style={{ boxShadow: `0 0 20px ${colorValue}60` }}
      />
    </div>
  );
}

function StatusPulse({ type, message }: { type: 'success' | 'neutral' | 'warning'; message: string }) {
  const pulseColors = {
    success: "border-[#747B59]/20 bg-[#F8F2EA]/5 text-[#747B59]",
    neutral: "border-[#C4775F]/20 bg-[#E8D5C3]/10 text-[#C4775F]",
    warning: "border-[#C4775F]/30 bg-[#E8D5C3]/15 text-[#C4775F]/90",
  };
  const icon = type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />;
  const ref = useInView({ once: true });
  return (
    <motion.div
      ref={ref as any}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
      className={cn("mt-5 flex items-center gap-4 rounded-2xl border px-6 py-4", pulseColors[type])}
    >
      <div className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl bg-[#493126]/5" aria-hidden>
        {icon}
      </div>
      <p className="text-[14px] font-medium leading-relaxed text-[#493126] dark:text-[#F0E4D8]">{message}</p>
    </motion.div>
  );
}

function ActionCard({ icon, title, description, color }: {
  icon: any;
  title: string;
  description: string;
  color: string;
}) {
  const ref = useInView({ once: true });
  return (
    <motion.div
      ref={ref as any}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      whileHover={{ y: -4, transition: { duration: 0.3 } }}
      className="group relative overflow-hidden rounded-3xl border p-6 transition-all duration-500 hover:shadow-[0_20px_45px_-12px_rgba(196,119,95,0.1)] hover:border-[#C4775F]/20"
    >
      <motion.div
        animate={{ rotate: [0, 5, 0] }}
        transition={{ duration: 20, alternate: true, repeat: Infinity }}
        className="absolute -top-20 -right-20 h-32 w-32 rounded-full bg-[#C4775F]/5 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="relative z-10">
        <div className={cn("mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C4775F]/10 text-[#C4775F] transition-transform duration-500 group-hover:scale-110", color === 'almond' && "bg-[#E8D5C3]/10 text-[#E8D5C3]", color === 'walnut' && "bg-[#493126]/10 text-[#747B59]")} aria-hidden>
          <icon className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <p className="font-semibold text-[15px] leading-tight text-[#493126] dark:text-[#F0E4D8]">{title}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-[#747B59]">{description}</p>
        <Link
          className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-[#C4775F] transition-all group-hover:gap-1.5"
          onClick={(e) => e.stopPropagation()}
          href="#"
        >
          Open <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </div>
    </motion.div>
  );
}

function StatusIndicator({ current, label }: { current: number; label: string }) {
  const ref = useInView({ once: true });
  return (
    <motion.div ref={ref as any} initial={{ width: 0 }} whileInView={{ width: `${Math.max(6, Math.min(100, current * 20))}%` }} transition={{ duration: 0.8, ease: EASE }} className="h-2 rounded-full bg-[#C4775F]" />
  );
}

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const reduced = useReducedMotion();

  // Helper function to calculate status indicator value
  const getStatusValue = (status?: string): number => {
    if (!status) return 0;
    switch (status) {
      case 'APPLIED': return 2;
      case 'INTERVIEW': return 4;
      case 'OFFER': return 5;
      case 'JOINED': return 5;
      default: return 0;
    }
  };
  const [search] = useSearchParams();
  const [q, setQ] = useState(search.get('q') ?? '');
  const [expanded, setExpanded] = useState<[boolean, boolean, boolean]>([false, false, false]);

  const { summary, isLoading } = useQuery('candidate-summary', candidate.summary, { refetchInterval: 30000 });
  const { recommendations } = useQuery('candidate-recommendations', candidate.recommendations, { enabled: !!summary?.has_profile, refetchInterval: 30000 });
  const { apps } = useQuery('candidate-applications', candidate.applications, { refetchInterval: 30000 });
  const { creditsData } = useQuery('credits-overview', credits.overview);
  const { practiceData } = useQuery('practice-sessions', practice.sessions);

  if (isLoading) return (
    <div className="flex h-screen min-h-[60vh] items-center justify-center">
      <PageLoader label="Loading your workspace..." />
    </div>
  );

  const firstName = (user?.email || 'there').split('@')[0].split(/[._-]/)[0];
  const lastName = firstName.split(' ').slice(1).join(' ') || '';
  const fullName = `${firstName}${lastName ? ` ${lastName.charAt(0)}.` : ''}`;
  const topJobs = (recommendations?.data || []).slice(0, 3);
  const recentApps = (apps?.data || []).slice(0, 3);
  const completion = Number(summary?.profile_completion || 0);
  const statuses = summary?.application_statuses || {};
  const appliedCount = Number(summary?.application_total || 0);
  const offerCount = Number(statuses.OFFER || 0) + Number(statuses.JOINED || 0);
  const interviewCount = Number(statuses.INTERVIEW || 0);
  const practiceRemaining = practiceData?.sessions?.length != null ? `${Math.max(0, 5 - practiceData.sessions.length)} sessions left` : '5 sessions available';
  const hasProfile = !!(summary as any)?.has_profile;
  const hasMatches = topJobs.length > 0;
  const statusMessage = offerCount > 0
    ? 'You have an offer in review — treat every reply as your next application.'
    : interviewCount > 0
      ? 'An interview is in progress. Keep the momentum going.'
      : appliedCount > 0
        ? 'Your applications are in flight. Stay focused on your goals.'
        : 'Nothing is queued right now. Discover roles to start.'

  const filteredJobs = useMemo(() => {
    if (!q) return topJobs;
    const lowerQ = q.toLowerCase();
    return topJobs.filter((j: any) => `${j.title} ${j.company_name}`.toLowerCase().includes(lowerQ));
  }, [topJobs, q]);

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="relative overflow-hidden rounded-[2.5rem] border border-[#C4775F]/10 bg-[linear-gradient(135deg,_hsl(36,42%,99.5%),_hsl(33,34%,95%))] p-8 md:p-12"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div
            animate={{ x: [0, 20, 0], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 20 }}
            className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-[#C4775F]/5 blur-3xl"
          />
          <motion.div
            animate={{ x: [0, -20, 0], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 25 }}
            className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-[#493126]/5 blur-3xl"
          />
          <motion.div
            animate={{ y: [0, 10, 0], opacity: [0.3, 0.4, 0.3] }}
            transition={{ duration: 30 }}
            className="absolute -right-32 top-1/3 h-72 w-72 rounded-full bg-[#747B59]/5 blur-3xl"
          />
        </div>

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex-1">
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-2 rounded-full border border-[#C4775F]/20 bg-[#C4775F]/5 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-[#C4775F]"
            >
              <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="h-1.5 w-1.5 rounded-full bg-[#C4775F]" />
              HOME
            </motion.span>
            <h1 className="mt-5 font-serif text-[42px] font-semibold leading-[1.1] tracking-[-0.03em] text-[#493126] dark:text-[#F0E4D8] sm:text-[52px] md:text-[58px]">
              Welcome back, <span className="relative inline-block">
                {fullName}
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute -bottom-1 left-0 h-1 w-full rounded-full bg-[#C4775F]"
                  style={{ background: "linear-gradient(90deg, transparent, #C4775F, transparent)" }}
                />
              </span>
              .
            </h1>
            <p className="mt-5 max-w-xl font-serif text-[16px] leading-relaxed text-[#747B59]">
              Your career journey is unfolding. Track every opportunity, refine your preparation, and prepare for success.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/recommendations"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group inline-flex h-12 items-center gap-2.5 rounded-2xl bg-[#C4775F] px-5 text-[14px] font-semibold text-white transition-all duration-300 hover:bg-[#B85E50] hover:shadow-[0_10px_30px_-8px_hsl(12/46%/44%/0.3)]"
              >
                Explore jobs <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2} />
              </Link>
              <Link
                to="/profile"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex h-12 items-center gap-2.5 rounded-2xl border-2 border-[#E8D5C3] bg-[#F8F2EA]/50 px-5 text-[14px] font-semibold text-[#493126] dark:border-[#F0E4D8] dark:text-[#F0E4D8] transition-all duration-300 hover:bg-[#E8D5C3]/30 hover:shadow-[0_8px_24px_-10px_hsl(12/46%/44%/0.15)]"
              >
                <User className="h-4 w-4 text-[#C4775F]" /> Profile
              </Link>
            </div>
          </div>
          <motion.div
            animate={{ rotate: [0, 180, 0] }}
            transition={{ duration: 60, ease: "linear" }}
            className="hidden h-64 w-64 shrink-0 items-center justify-center rounded-full border-4 border-[#C4775F]/5 bg-[#C4775F]/5 backdrop-blur-xl sm:flex"
            aria-hidden
          >
            <Brain className="h-32 w-32 text-[#C4775F]/40" strokeWidth={1} />
          </motion.div>
        </div>
      </motion.section>

      {/* Stats Row */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-6 gap-4 md:grid-cols-6">
        <StatStack icon={BriefcaseBusiness} label="Fresh jobs" value={summary?.fresh_jobs_7d ?? 0} change="new listings" isTrendUp />
        <StatStack icon={TrendingUp} label="Applications" value={appliedCount} change="in progress" />
        <StatStack icon={Flame} label="Profile strength" value={`${completion}%`} color={completion >= 80 ? "#747B59" : "#C4775F"} />
        <StatStack icon={Coins} label="Credits" value={creditsData?.wallet.balance ?? '—'} color="#747B59" />
        <StatStack icon={Target} label="Practice" value={practiceData?.sessions?.length ?? '0'} color="#C4775F" />
        <StatStack icon={Sparkles} label="Saved" value={summary?.saved_jobs ?? 0} color="#747B59" />
      </motion.div>

      {/* Status Pulse */}
      <StatusPulse type={appliedCount > 0 ? 'success' : 'neutral'} message={statusMessage} />

      {/* Main Content - Jobs & Quick Actions */}
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* Jobs Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-5"
        >
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <p className="font-serif text-[10px] uppercase tracking-[0.18em] text-[#493126]/50">Recommended</p>
              <h2 className="mt-1 font-serif text-[28px] font-semibold tracking-[-0.02em] text-[#493126] dark:text-[#F0E4D8]">Careers worth your time</h2>
            </div>
            <Link to="/jobs" className="group inline-flex items-center gap-2 text-[13px] font-medium text-[#C4775F] transition-all hover:gap-3">
              View all <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-y-0.5 group-hover:translate-x-0.5" strokeWidth={2} />
            </Link>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#747B59]/60" strokeWidth={2} />
            <input
              type="text"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search jobs, companies, or titles"
              className={cn(
                "w-full rounded-2xl border-2 border-[#E8D5C3]/40 bg-[#F8F2EA]/50 pl-12 pr-4 py-4 text-[14px] font-medium text-[#493126] placeholder:text-[#747B59]/60 outline-none transition-all duration-300 focus:border-[#C4775F]/40 focus:bg-[#F8F2EA]/70 focus:ring-4 focus:ring-[#C4775F]/10",
                q && "rounded-2xl border-[#C4775F]/40 bg-[#F8F2EA]/70"
              )}
            />
          </div>

          {/* Jobs Grid */}
          {hasMatches ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredJobs.map((job: any, i) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, y: 20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.4 + i * 0.05 }}
                  whileHover={{ y: -4, scale: 1.01, transition: { duration: 0.3 } }}
                  className="group cursor-pointer"
                >
                  <JobCard job={job} />
                </motion.div>
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-card relative overflow-hidden rounded-[2rem] border border-[#E8D5C3]/20 bg-[#E8D5C3]/5 p-12 text-center"
            >
              <div aria-hidden className="flex h-24 w-24 mx-auto items-center justify-center rounded-full border-2 border-[#C4775F]/10 bg-[#C4775F]/5">
                <Brain className="h-10 w-10 text-[#C4775F]" strokeWidth={1.5} />
              </div>
              <h3 className="mt-6 font-serif text-[20px] font-semibold text-[#493126] dark:text-[#F0E4D8]">No strong matches yet</h3>
              <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-[#747B59]">
                {hasProfile ? "Browse trusted jobs while we find closer matches." : "Complete your profile to get tailored recommendations."}
              </p>
              <Link
                to={hasProfile ? "/jobs" : "/profile"}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "mt-6 inline-flex items-center gap-2 rounded-full border-2 px-6 py-3 font-semibold transition-all duration-300",
                  hasProfile ? "border-[#C4775F] bg-[#C4775F] text-white hover:bg-[#B85E50]" : "border-[#C4775F] text-[#C4775F] hover:bg-[#C4775F]/5"
                )}
              >
                {hasProfile ? "Browse jobs" : "Complete profile"} <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
            </motion.div>
          )}
        </motion.section>

        {/* Quick Actions */}
        <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="space-y-5">
          <p className="font-serif text-[10px] uppercase tracking-[0.18em] text-[#493126]/50">Quick Actions</p>

          <GlowCard showGlow={true} delay={0.5}>
            <div className="flex items-start gap-4">
              <div className="relative">
                <motion.div animate={{ rotate: 0, scale: [1, 1.1, 1] }} transition={{ duration: 8, ease: "easeInOut" }} className="h-14 w-14 flex items-center justify-center rounded-2xl bg-[#C4775F]/10 text-[#C4775F]">
                  <Mic className="h-6 w-6" strokeWidth={1.75} />
                </motion.div>
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-[18px] font-semibold text-[#493126] dark:text-[#F0E4D8]">Interview Practice</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#747B59]">Rehearse, track your performance, and refine your responses.</p>
                <Link to="/practice" className="mt-4 inline-flex items-center gap-1 text-[12px] font-bold text-[#C4775F] transition-all hover:gap-1.5">
                  Start now <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
              </div>
            </div>
          </GlowCard>

          <GlowCard showGlow={false} delay={0.6}>
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 flex items-center justify-center rounded-2xl bg-[#747B59]/10 text-[#747B59]">
                <GraduationCap className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-[18px] font-semibold text-[#493126] dark:text-[#F0E4D8]">Skill Development</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#747B59]">Build your knowledge and close skill gaps.</p>
                <Link to="/learning" className="mt-4 inline-flex items-center gap-1 text-[12px] font-bold text-[#747B59] transition-all hover:gap-1.5">
                  Explore tracks <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
              </div>
            </div>
          </GlowCard>

          <GlowCard showGlow={true} delay={0.7}>
            <div className="relative z-0 flex items-start gap-4">
              <div className="h-14 w-14 flex items-center justify-center rounded-2xl bg-[#493126]/10 bg-gradient-to-br from-[#493126]/10 to-[#747B59]/10 text-[#747B59]">
                <Coins className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <h3 className="font-serif text-[18px] font-semibold text-[#493126] dark:text-[#F0E4D8]">Credits & Plan</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-[#747B59]">{creditsData?.wallet.balance ?? '—'} credits available</p>
                <Link to="/credits" className="mt-4 inline-flex items-center gap-1 text-[12px] font-bold text-[#747B59] transition-all hover:gap-1.5">
                  View plan <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                </Link>
              </div>
            </div>
            {practiceData?.sessions && practiceData.sessions.length > 0 && (
              <div className="mt-6 rounded-xl border border-[#C4775F]/10 bg-[#F8F2EA]/30 px-4 py-3">
                <p className="text-[13px] text-[#493126] font-medium">{practiceRemaining}</p>
              </div>
            )}
          </GlowCard>

          {/* Application Pipeline */}
          {recentApps.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="space-y-3">
              <p className="font-serif text-[10px] uppercase tracking-[0.18em] text-[#493126]/50">Your Pipeline</p>

              {recentApps.slice(0, 3).map((app, i) => (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1 + i * 0.08 }}
                  whileHover={{ x: 4, transition: { duration: 0.2 } }}
                  className="group relative overflow-hidden rounded-2xl border border-[#E8D5C3]/20 bg-[#E8D5C3]/5 p-4 transition-all duration-300 hover:border-[#C4775F]/30 hover:shadow-[0_10px_30px_-8px_hsl(12/46%/44%/0.08)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div aria-hidden className="grid h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#C4775F]/10 text-[#C4775F]">
                        <BriefcaseBusiness className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-[14px] text-[#493126] dark:text-[#F0E4D8]">{app.job_title}</p>
                        <p className="text-[12px] text-[#747B59]">{new Date(app.updated_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <StatusIndicator current={getStatusValue(app.status)} />
                    {app.status === 'OFFER' || app.status === 'JOINED' && (
                      <motion.span
                        animate={{ scale: [1, 1.1, 1], rotate: [0, 10, 0] }}
                        transition={{ duration: 3 }}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#747B59]/10 text-[#747B59]"
                      >
                        <Star className="h-4 w-4 fill-[#747B59]" strokeWidth={2} />
                      </motion.span>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.aside>
      </div>
    </motion.main>
  );
};

export default CandidateDashboard;