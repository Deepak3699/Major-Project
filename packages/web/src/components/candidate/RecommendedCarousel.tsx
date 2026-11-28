import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, Banknote, Bookmark, BriefcaseBusiness, Check, ChevronLeft,
  ChevronRight, MapPin, Pause, Play, ShieldCheck, Sparkles,
} from 'lucide-react';
import type { CandidateJob } from '@/lib/types';
import { cn } from '@/components/ui/cn';
import { JobRoleAvatar, getRoleTheme } from './JobRoleAvatar';

const GAP = 12;
const AUTO_MS = 3000;
const EASE = [0.22, 1, 0.36, 1] as const;

function matchTone(score?: number) {
  if ((score ?? 0) >= 85) return 'border-success/35 bg-success-soft text-success';
  if ((score ?? 0) >= 75) return 'border-signal/35 bg-signal-soft text-signal';
  return 'border-warning/35 bg-warning-soft text-warning';
}

function MiniJobCard({
  job, width, decorative, saved, saving, onSave,
}: {
  job: CandidateJob;
  width: number;
  decorative?: boolean;
  saved?: boolean;
  saving?: boolean;
  onSave?: (job: CandidateJob) => void;
}) {
  const theme = getRoleTheme(job.title, job.company_industry, job.skills);
  const matched = job.matched_skills || [];
  const missing = job.missing_skills || [];

  return (
    <div
      style={{ width }}
      className="group relative flex shrink-0 flex-col overflow-hidden rounded-2xl border border-border/80 bg-surface p-3 shadow-[0_2px_10px_-6px_rgba(58,36,24,0.35)] transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] opacity-45" style={{ backgroundColor: theme.color }} />
      <Link
        to={`/jobs/${job.id}?from=dashboard`}
        tabIndex={decorative ? -1 : undefined}
        aria-hidden={decorative || undefined}
        aria-label={`View ${job.title} at ${job.company_name}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
      />

      <div className="pointer-events-none relative z-[1] flex h-full flex-col">
        <div className="flex items-start gap-2.5">
          <JobRoleAvatar title={job.title} industry={job.company_industry} skills={job.skills} size={38} />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-[10px] font-medium text-muted-foreground">
              {job.company_name}
            </p>
            <h3 className="mt-0.5 line-clamp-2 min-h-[32px] text-[12.5px] font-semibold leading-[1.25] tracking-[-0.012em] text-foreground transition-colors group-hover:text-primary">
              {job.title}
            </h3>
          </div>
          <span className={cn('mt-0.5 shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold tabular-nums', matchTone(job.match_score))}>
            {Math.round(job.match_score ?? 0)}%
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[9.5px] text-muted-foreground">
          {job.location && (
            <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{job.location}</span></span>
          )}
          {job.employment_type && (
            <span className="inline-flex items-center gap-1"><BriefcaseBusiness className="h-2.5 w-2.5 shrink-0" />{job.employment_type.replace(/_/g, ' ')}</span>
          )}
          {job.salary_range && (
            <span className="inline-flex items-center gap-1"><Banknote className="h-2.5 w-2.5 shrink-0" />{job.salary_range}</span>
          )}
        </div>

        <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-1">
          {matched.slice(0, 2).map((skill) => (
            <span key={skill} className="rounded-md border border-success/25 bg-success-soft px-1.5 py-px text-[9.5px] font-medium text-success">{skill}</span>
          ))}
          {matched.length > 2 && <span className="font-mono text-[9.5px] text-success">+{matched.length - 2}</span>}
          {!matched.length && missing.length > 0 && <span className="text-[9.5px] text-warning">{missing.length} skill gap{missing.length === 1 ? '' : 's'}</span>}
        </div>

        <div className="mt-auto flex items-center justify-between gap-1 border-t border-border/70 pt-2">
          <span className="inline-flex items-center gap-1 font-mono text-[9px] tabular-nums text-muted-foreground">
            <ShieldCheck className="h-2.5 w-2.5 text-success" />{job.trust_score}
          </span>
          <div className="flex items-center gap-1.5">
            {onSave && (
              <button
                type="button"
                aria-label={saved ? `${job.title} is saved` : `Save ${job.title}`}
                onClick={(event) => { event.stopPropagation(); onSave(job); }}
                disabled={saved || saving}
                className={cn(
                  'pointer-events-auto grid h-6 w-6 place-items-center rounded-md border transition-colors',
                  saved
                    ? 'border-success/30 bg-success-soft text-success'
                    : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                  saving && 'opacity-60',
                )}
              >
                {saved ? <Check className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
              </button>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary">
              View <ArrowUpRight className="h-2.5 w-2.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CarouselSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-hidden>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="animate-pulse rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between"><div className="h-9 w-9 rounded-xl bg-muted" /><div className="h-4 w-9 rounded bg-muted" /></div>
          <div className="mt-3 h-3 w-full rounded bg-muted" />
          <div className="mt-1.5 h-3 w-2/3 rounded bg-muted" />
          <div className="mt-2.5 h-2.5 w-3/4 rounded bg-muted" />
          <div className="mt-2 flex gap-1.5"><div className="h-3.5 w-12 rounded bg-muted" /><div className="h-3.5 w-10 rounded bg-muted" /></div>
        </div>
      ))}
    </div>
  );
}

function EmptyCarousel({ needsProfile }: { needsProfile: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border bg-muted/25 px-5 py-7 text-center sm:px-8">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary-soft/70" />
      <span className="relative mx-auto grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface text-primary">
        <Sparkles className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <h3 className="relative mt-3 text-[15px] font-semibold tracking-[-0.015em] text-foreground">
        {needsProfile ? 'Unlock recommendations tailored to you' : 'No scored matches just yet'}
      </h3>
      <p className="relative mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
        {needsProfile
          ? 'Add your skills, preferred roles and location. We will rank every trusted listing against your profile and show the skill overlap.'
          : 'New roles are scored as sources refresh. Browse all trusted listings in the meantime, or check back shortly.'}
      </p>
      <Link
        to={needsProfile ? '/profile' : '/jobs'}
        className="relative mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      >
        {needsProfile ? 'Complete your profile' : 'Browse jobs'} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export interface RecommendedCarouselProps {
  jobs: CandidateJob[];
  loading?: boolean;
  refreshing?: boolean;
  needsProfile?: boolean;
  savedIds?: Set<string>;
  savingId?: string | null;
  onSave?: (job: CandidateJob) => void;
}

/**
 * Infinite recommendation rail.
 *
 * Five compact cards are visible on wide screens, with a slim peek of the next
 * one. Every five seconds the rail slides by one card; the list is rendered
 * three times and silently re-centred at the boundaries so the motion never
 * stops or rewinds. Hover, focus, tab visibility, reduced-motion preferences
 * and the pause control all stop the timer.
 */
export function RecommendedCarousel({
  jobs, loading = false, refreshing = false, needsProfile = false, savedIds, savingId, onSave,
}: RecommendedCarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(5);
  const [index, setIndex] = useState(0);
  const [instant, setInstant] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [lastInteraction, setLastInteraction] = useState(0);
  const [refreshPulse, setRefreshPulse] = useState(false);

  const count = jobs.length;
  const targetVisible = Math.max(1, Math.floor(visible));
  const loop = count > 1 && count >= targetVisible;
  const base = loop ? count : 0;
  const cardWidth = width > 0
    ? Math.max(150, (() => {
        const measured = (width - GAP * (visible - 1)) / visible;
        const cap = targetVisible >= 4 ? 212 : targetVisible === 3 ? 244 : 340;
        return Math.min(measured, cap);
      })())
    : 206;
  const step = cardWidth + GAP;
  const renderedJobs = useMemo(
    () => (loop ? [jobs, jobs, jobs].flat() : jobs),
    [jobs, loop],
  );
  const paused = hovered || focusWithin || userPaused || documentHidden || reduceMotion;

  // Measure the viewport so five cards plus a slim peek fit on desktop and a
  // single card (with its neighbour) shows on phones.
  useLayoutEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => {
      const nextWidth = node.clientWidth;
      const nextVisible = nextWidth < 520 ? 1.15 : nextWidth < 760 ? 2.15 : nextWidth < 1080 ? 3.15 : nextWidth < 1240 ? 4.15 : 5.15;
      setWidth(nextWidth);
      setVisible(nextVisible);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    setInstant(true);
    setIndex(loop ? count : 0);
    const frame = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(frame);
  }, [count, loop]);

  useEffect(() => {
    if (!loop || paused || count === 0) return;
    const timer = window.setInterval(() => setIndex((current) => current + 1), AUTO_MS);
    return () => window.clearInterval(timer);
  }, [loop, paused, count, lastInteraction]);

  useEffect(() => {
    const onVisibility = () => setDocumentHidden(document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReduceMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  // A background refetch gets a short, visible pulse instead of silently
  // swapping the cards. The timer is deliberately not cleaned up when the
  // request finishes, so even a 50ms response still shows a perceptible cue.
  const refreshTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!refreshing || loading) return;
    setRefreshPulse(true);
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      setRefreshPulse(false);
      refreshTimerRef.current = null;
    }, 700);
  }, [refreshing, loading]);
  useEffect(() => () => {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
  }, []);

  const normalize = useCallback(() => {
    if (!loop || count === 0) return;
    const normalized = base + ((((index - base) % count) + count) % count);
    if (normalized !== index) {
      setInstant(true);
      setIndex(normalized);
      requestAnimationFrame(() => setInstant(false));
    }
  }, [base, count, index, loop]);

  const nudge = (direction: 1 | -1) => {
    if (!loop) return;
    setLastInteraction(Date.now());
    setIndex((current) => current + direction);
  };

  const goTo = (position: number) => {
    if (!loop) return;
    setLastInteraction(Date.now());
    setIndex(base + position);
  };

  const activeIndex = count ? ((index - base) % count + count) % count : 0;

  if (loading) return <CarouselSkeleton />;
  if (!count) return <EmptyCarousel needsProfile={needsProfile} />;

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Recommended jobs"
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusWithin(false);
      }}
    >
      <div ref={viewportRef} className="relative overflow-hidden py-0.5">
        {refreshPulse && !reduceMotion && (
          <motion.span
            aria-hidden
            className="absolute left-0 top-0 z-10 h-0.5 w-full bg-primary/55"
            style={{ transformOrigin: 'left' }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: [0, 1, 0] }}
            transition={{ duration: 0.7, ease: 'easeInOut' }}
          />
        )}
        <motion.div
          className={cn('flex', !loop && 'justify-center')}
          style={{ gap: GAP }}
          animate={{ x: -index * step, opacity: refreshPulse ? 0.72 : 1 }}
          transition={instant || reduceMotion ? { duration: 0 } : { duration: 0.52, ease: EASE }}
          onAnimationComplete={normalize}
        >
          {renderedJobs.map((job, i) => {
            const visibleStart = index;
            const visibleEnd = index + targetVisible;
            return (
              <MiniJobCard
                key={`${job.id}-${i}`}
                job={job}
                width={cardWidth}
                decorative={i < visibleStart || i > visibleEnd}
                saved={savedIds?.has(job.id)}
                saving={savingId === job.id}
                onSave={onSave}
              />
            );
          })}
        </motion.div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {loop ? (
            count <= 10 ? (
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Choose a recommendation">
                {jobs.map((job, position) => (
                  <button
                    key={job.id}
                    type="button"
                    role="tab"
                    aria-selected={position === activeIndex}
                    aria-label={`Show ${job.title} at ${job.company_name}`}
                    onClick={() => goTo(position)}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-300',
                      position === activeIndex ? 'w-5 bg-primary' : 'w-1.5 bg-border-strong/45 hover:bg-border-strong',
                    )}
                  />
                ))}
              </div>
            ) : (
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{activeIndex + 1}</span> / {count}
              </span>
            )
          ) : (
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
              {count} match{count === 1 ? '' : 'es'} ready
            </span>
          )}
          {loop && (
            <span className="hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground sm:inline-flex">
              <span className={cn('h-1.5 w-1.5 rounded-full', paused ? 'bg-warning' : 'animate-pulse bg-success')} />
              {paused ? 'Paused' : 'Auto-rotating'}
            </span>
          )}
        </div>

        {loop ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setUserPaused((value) => !value)}
              aria-label={userPaused ? 'Resume automatic rotation' : 'Pause automatic rotation'}
              className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              {userPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </button>
            <button
              type="button"
              onClick={() => nudge(-1)}
              aria-label="Previous recommendation"
              className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => nudge(1)}
              aria-label="Next recommendation"
              className="grid h-7 w-7 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">All matches shown</span>
        )}
      </div>
    </div>
  );
}
