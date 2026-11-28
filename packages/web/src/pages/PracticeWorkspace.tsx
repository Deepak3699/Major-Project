import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from 'react-query';
import {
  ArrowRight, BookOpen, BrainCircuit, CheckCircle2, ChevronRight, CircleDot,
  Clock3, Crown, FileText, Mic, Play, Sparkles, Target, Trophy, Users,
} from 'lucide-react';
import { candidate, practice } from '@/lib/api';
import { GUIDE_KEY } from '@/components/practice/WorkspaceGuide';
import { cn } from '@/components/ui/cn';
import { exitFullscreenOnLeave } from '@/lib/fullscreen';
import { usePracticeFocus, type PracticeFocus } from '@/stores/practiceFocus';

const EASE = [0.22, 1, 0.36, 1] as const;

const TOUR_STEPS = [
  { title: 'Prepare first', copy: 'Generate job-specific material so every live room uses facts you already confirmed.' },
  { title: 'Practise live', copy: 'Answer adaptive interview questions with an interviewer matched to your target role.' },
  { title: 'Speak with a group', copy: 'A mentor sets the topic, members speak in turn, and you can raise your hand to conclude.' },
  { title: 'Perform on stage', copy: 'Reveal a queue card, prepare for 45 seconds, then speak for two minutes.' },
  { title: 'Take the full round', copy: 'Aptitude, discussion, presentation and interview — your first complete round is free.' },
] as const;

const ROOMS = [
  {
    to: '/practice/interview', label: 'AI interview', index: '01', icon: Mic,
    detail: 'Adaptive questions with an interviewer matched to your target role.',
    meta: 'Voice · camera · scorecard', tone: 'clay', featured: true,
  },
  {
    to: '/practice/group', label: 'Group discussion', index: '02', icon: Users,
    detail: 'Conference hall with mentor, topic rounds, open debate and a hand-raised conclusion.',
    meta: '8 India-focused topics', tone: 'amber', featured: false,
  },
  {
    to: '/practice/presentation', label: 'Presentation', index: '03', icon: BookOpen,
    detail: 'Queue card, 45-second prep and a strict two-minute stage timer.',
    meta: 'Timed delivery', tone: 'sky', featured: false,
  },
  {
    to: '/practice/prepare', label: 'Prepare materials', index: '04', icon: FileText,
    detail: 'Interview prep, group arguments, presentation structure and company research.',
    meta: 'Grounded · saved artifacts', tone: 'sage', featured: false,
  },
  {
    to: '/practice/mock', label: 'Full mock round', index: '05', icon: Trophy,
    detail: 'Aptitude → discussion → presentation → interview, end to end.',
    meta: 'First round free', tone: 'plum', featured: true,
  },
] as const;

const TONES = {
  clay: { bg: 'linear-gradient(145deg,#f8e6da,#e5b394)', ink: '#8b4428', chip: 'border-[#d9a98b]/50 bg-[#f9ece2] text-[#8b4428]' },
  sage: { bg: 'linear-gradient(145deg,#e5efe2,#bcd5bd)', ink: '#46694e', chip: 'border-[#b7d0b9]/55 bg-[#edf5ec] text-[#46694e]' },
  amber: { bg: 'linear-gradient(145deg,#f9ecd3,#efd09a)', ink: '#8f6325', chip: 'border-[#e5c68f]/55 bg-[#fbf3e3] text-[#8f6325]' },
  sky: { bg: 'linear-gradient(145deg,#e1edf2,#b9d6e2)', ink: '#3a667c', chip: 'border-[#bcd7e2]/55 bg-[#edf5f8] text-[#3a667c]' },
  plum: { bg: 'linear-gradient(145deg,#f1e4ed,#d8bdd2)', ink: '#774963', chip: 'border-[#d9bfd1]/55 bg-[#f7eef4] text-[#774963]' },
} as const;

function Metric({ value, label, icon: Icon }: { value: React.ReactNode; label: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.08] px-3 py-2.5 text-center backdrop-blur-sm">
      <Icon className="mx-auto h-3.5 w-3.5 text-[#e9b98f]" />
      <p className="mt-1.5 font-mono text-[18px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-[#fff7ef]">{value}</p>
      <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[#d8c4b3]">{label}</p>
    </div>
  );
}

const PracticeWorkspace: React.FC = () => {
  const [tourStep, setTourStep] = useState<number | null>(() => {
    try { return localStorage.getItem(GUIDE_KEY) === 'done' ? null : 0; } catch { return 0; }
  });
  const [searchParams] = useSearchParams();
  const focus = usePracticeFocus((state) => state.focus);
  const setFocus = usePracticeFocus((state) => state.setFocus);
  const clearFocus = usePracticeFocus((state) => state.clearFocus);
  const [customRole, setCustomRole] = useState('');
  const jobParam = searchParams.get('job');
  const { data: subscriptionData } = useQuery('practice-subscription', practice.subscription, { staleTime: 60_000 });
  const { data: sessionsData } = useQuery('practice-sessions', practice.sessions, { staleTime: 60_000 });
  const { data: mockStatus } = useQuery('mock-round-status', practice.mockRoundStatus, { staleTime: 30_000 });
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { staleTime: 60_000 });
  const { data: recommendationsData } = useQuery('candidate-recommendations', candidate.recommendations, { staleTime: 60_000 });
  const { data: linkedJobData } = useQuery(['candidate-job-focus', jobParam], () => candidate.job(jobParam || ''), { enabled: !!jobParam, staleTime: 60_000 });

  // Returning from a live session should land on the normal workspace view.
  useEffect(() => { exitFullscreenOnLeave(); }, []);

  // A job detail card can deep-link here with ?job=<id>; adopt that role.
  useEffect(() => {
    const job = linkedJobData?.job;
    if (!jobParam || !job) return;
    setFocus({
      jobId: job.id,
      role: job.title,
      company: job.company_name,
      source: 'job',
      matchScore: (job as any).match_score ?? null,
    });
  }, [jobParam, linkedJobData, setFocus]);

  const subscription = subscriptionData?.subscription;
  const sessions = sessionsData?.sessions || [];
  const completed = sessions.filter((session) => session.status === 'completed');
  const recent = sessions.slice(0, 3);
  const profileRole = profileData?.profile?.preferred_roles?.[0] || 'your target role';
  const role = focus?.role || profileRole;
  const recommendedJobs = recommendationsData?.data || [];
  const readiness = Math.min(100, 20 + completed.length * 20 + (mockStatus?.used ? 20 : 0));

  const closeTour = () => {
    try { localStorage.setItem(GUIDE_KEY, 'done'); } catch { /* ignore */ }
    setTourStep(null);
  };
  const nextTour = () => {
    if (tourStep === null) return;
    if (tourStep < TOUR_STEPS.length - 1) setTourStep(tourStep + 1);
    else closeTour();
  };

  const chooseRecommendedJob = (jobId: string) => {
    if (!jobId) { clearFocus(); return; }
    const job = recommendedJobs.find((item) => item.id === jobId);
    if (!job) return;
    setFocus({
      jobId: job.id,
      role: job.title,
      company: job.company_name,
      source: 'recommendation',
      matchScore: (job as any).match_score ?? null,
    });
  };
  const chooseOwnRole = () => {
    const value = customRole.trim();
    if (!value) return;
    setFocus({ role: value, source: 'manual' });
    setCustomRole('');
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Deep editorial hero */}
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="relative overflow-hidden rounded-[30px] border border-[#5b3a2b] bg-[linear-gradient(122deg,#241a16_0%,#3d2a22_52%,#7a4230_100%)] px-6 py-7 shadow-[0_22px_50px_-30px_rgba(46,25,16,0.65)] sm:px-8 sm:py-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.14]" style={{ backgroundImage: 'linear-gradient(#f4d6bd 1px, transparent 1px), linear-gradient(90deg,#f4d6bd 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full border border-[#e9b98f]/20" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-[#e08a54]/10 blur-3xl" />
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#e9b98f]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e9b98f]" /> Practice workspace · 2026
            </p>
            <h1 className="mt-3 max-w-2xl text-[33px] font-semibold leading-[1.04] tracking-[-0.045em] text-[#fff6ed] sm:text-[42px]">
              Your interview, <span className="text-[#e9a877]">rehearsed.</span>
            </h1>
            <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-[#e2cfc1] sm:text-[13.5px]">
              Five focused rooms. One clear path from preparation to performance. Choose a room below and practise the skill that matters today.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => setTourStep(0)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#f2c39a] px-4 text-[12px] font-semibold text-[#3a2318] transition-colors hover:bg-[#f8d4b3]">
                <Play className="h-3.5 w-3.5" /> Guided tour
              </button>
              <Link to="/practice/mock" className="group inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/[0.06] px-4 text-[12px] font-semibold text-[#fff6ed] backdrop-blur-sm transition-colors hover:bg-white/[0.12]">
                Full mock round <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.07] p-4 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#d8c4b3]">Readiness</p>
                <p className="mt-1 font-mono text-[34px] font-semibold leading-none tabular-nums tracking-[-0.05em] text-[#fff7ef]">{readiness}<span className="text-[15px] text-[#d8c4b3]">%</span></p>
              </div>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e9b98f]/20 text-[#e9b98f]"><Target className="h-4 w-4" /></span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15">
              <motion.div className="h-full rounded-full bg-[#e9b98f]" initial={{ width: 0 }} animate={{ width: `${readiness}%` }} transition={{ duration: 0.7, ease: EASE }} />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-[#d8c4b3]">Built from completed interviews and your mock round.</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
              <Metric value={subscription?.plan === 'pro' ? 'Pro' : 'Free'} label="Plan" icon={Crown} />
              <Metric value={completed.length} label="Done" icon={CheckCircle2} />
              <Metric value={mockStatus?.used ? 'Used' : 'Free'} label="Mock" icon={Trophy} />
            </div>
          </div>
        </div>
      </motion.section>

      {/* Practice focus — shared by every room */}
      <section className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-primary"><Target className="h-3.5 w-3.5" /> Practice focus</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Pick a recommended job or type your own role. Every room rehearses this focus.</p>
          </div>
          <span className="rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
            Applied to all rooms
          </span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Recommended for you</span>
            <select
              value={focus?.jobId || ''}
              onChange={(event) => chooseRecommendedJob(event.target.value)}
              className="input mt-1.5 h-10 text-[12px]"
            >
              <option value="">Choose a recommended job…</option>
              {recommendedJobs.map((job) => (
                <option key={job.id} value={job.id}>{job.title} — {job.company_name}</option>
              ))}
              {focus?.jobId && !recommendedJobs.some((job) => job.id === focus.jobId) && (
                <option value={focus.jobId}>{focus.role}{focus.company ? ` — ${focus.company}` : ''}</option>
              )}
            </select>
          </label>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Or use your own role</p>
            <div className="mt-1.5 flex gap-2">
              <input
                value={customRole}
                onChange={(event) => setCustomRole(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') chooseOwnRole(); }}
                placeholder={profileRole}
                className="input h-10 min-w-0 flex-1 text-[12px]"
              />
              <button type="button" onClick={chooseOwnRole} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground transition hover:bg-primary-hover">
                Set role <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Rehearsing for <span className="font-semibold text-foreground">{role}</span>
          {focus?.company ? ` · ${focus.company}` : ''}
          {focus?.source === 'manual' ? ' · custom role' : ''}
        </p>
      </section>

      {/* Rooms */}
      <section className="rounded-[28px] border border-border bg-[linear-gradient(150deg,hsl(var(--surface)),hsl(var(--accent)/0.5))] p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Choose a room</p>
            <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.025em] text-foreground sm:text-[21px]">Five rooms, one preparation plan.</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">Each room opens on its own page, focused on a single skill.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            <CircleDot className="h-3 w-3 text-success" /> Tuned for {role}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROOMS.map((room, index) => {
            const Icon = room.icon;
            const tone = TONES[room.tone];
            return (
              <motion.div key={room.to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: Math.min(index * 0.045, 0.22) }}>
                <Link to={focus?.jobId ? `${room.to}?job=${focus.jobId}` : room.to} className={cn('group relative flex min-h-[168px] flex-col overflow-hidden rounded-[22px] border border-border bg-surface p-4 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_36px_-24px_rgba(58,36,24,0.6)]', room.featured && 'border-primary/25')}>
                  <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] opacity-70" style={{ background: tone.bg }} />
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/40 shadow-sm" style={{ background: tone.bg, color: tone.ink }}>
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{room.index} / 05</span>
                  </div>
                  <p className="mt-3 text-[14px] font-semibold tracking-[-0.015em] text-foreground">{room.label}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{room.detail}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <span className={cn('rounded-md border px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.08em]', tone.chip)}>{room.meta}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <section className="rounded-[28px] border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-primary" /><p className="eyebrow">Recommended order</p></div>
          <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">One test, four rooms, one clear result.</h2>
          <div className="mt-5 relative grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Aptitude', detail: 'Role-based reasoning', icon: BrainCircuit },
              { label: 'Discussion', detail: 'Conference hall', icon: Users },
              { label: 'Presentation', detail: 'Two-minute stage', icon: BookOpen },
              { label: 'Interview', detail: 'Adaptive questions', icon: Mic },
            ].map(({ label, detail, icon: Icon }, index) => (
              <div key={label} className="relative rounded-2xl border border-border bg-muted/20 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-surface text-primary"><Icon className="h-3.5 w-3.5" /></span>
                  <span className="font-mono text-[9px] tabular-nums text-muted-foreground">0{index + 1}</span>
                </div>
                <p className="mt-2.5 text-[12px] font-semibold text-foreground">{label}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {mockStatus?.used ? 'Your free round is complete. Pro access unlocks more attempts.' : 'Your first complete round is free. Additional rounds need Pro.'}
            </p>
            <Link to="/practice/mock" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"><Trophy className="h-3.5 w-3.5" /> Open mock round</Link>
          </div>
        </section>

        <section className="rounded-[28px] border border-border bg-surface p-5 shadow-sm">
          <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-success" /><p className="eyebrow">Recent sessions</p></div>
          {recent.length ? (
            <div className="mt-4 space-y-2">
              {recent.map((session) => (
                <Link key={session.id} to={`/practice/session/${session.id}`} className="group flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 p-2.5 transition-colors hover:border-border-strong hover:bg-surface">
                  <span className="min-w-0">
                    <span className="block truncate text-[11.5px] font-medium text-foreground">{session.role_focus || 'Interview practice'}</span>
                    <span className="block font-mono text-[9px] capitalize text-muted-foreground">{session.status.replace(/_/g, ' ')}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-foreground">{session.overall_score != null ? `${session.overall_score}%` : '—'}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-7 text-center">
              <Sparkles className="mx-auto h-4 w-4 text-muted-foreground" />
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">No sessions yet. Your completed interviews will appear here.</p>
            </div>
          )}
          <Link to="/practice/interview" className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-accent/50">Open interview room <ArrowRight className="h-3.5 w-3.5" /></Link>
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: FileText, title: 'Ground first', copy: 'Generate material before any live room so your answers stay consistent.' },
          { icon: Users, title: 'Speak early', copy: 'Give one point in the first discussion round; the mentor coaches at the end.' },
          { icon: Target, title: 'Finish clean', copy: 'Presentation prep is 45 seconds; delivery is two minutes. Practise the close.' },
        ].map(({ icon: Icon, title, copy }) => (
          <div key={title} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} />
            <p className="mt-2 text-[12px] font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">{copy}</p>
          </div>
        ))}
      </section>

      {tourStep !== null && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[110] grid place-items-center bg-[#1b130f]/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Practice workspace tour">
          <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.32, ease: EASE }} className="w-full max-w-lg overflow-hidden rounded-[26px] border border-[#e9b98f]/25 bg-[#fff8f1] p-6 shadow-[0_30px_70px_-30px_rgba(30,16,10,0.6)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#a05a34]">Welcome · step {tourStep + 1} of {TOUR_STEPS.length}</p>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#2b1c15]">{TOUR_STEPS[tourStep].title}</h2>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#6f594c]">{TOUR_STEPS[tourStep].copy}</p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                {TOUR_STEPS.map((step, index) => <span key={step.title} className={cn('h-1.5 rounded-full transition-all duration-300', index === tourStep ? 'w-6 bg-[#b3633c]' : 'w-1.5 bg-[#e3cfbf]')} />)}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeTour} className="rounded-lg px-2.5 py-2 text-[11.5px] font-medium text-[#6f594c] hover:text-[#2b1c15]">Skip</button>
                <button type="button" onClick={nextTour} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#b3633c] px-3.5 text-[11.5px] font-semibold text-[#fff8f1] hover:bg-[#9b4f2d]">{tourStep === TOUR_STEPS.length - 1 ? 'Start practising' : 'Next'} <ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
};

export default PracticeWorkspace;
