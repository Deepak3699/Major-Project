import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, BookOpen, BrainCircuit, ChevronRight, FileText, Mic, Play,
  ShieldCheck, Sparkles, Target, Users,
} from 'lucide-react';
import { AvatarPortrait } from '@/components/interview/AvatarPortrait';
import { cn } from '@/components/ui/cn';

const GUIDE_KEY = 'hiregen:workspace-tutorial-done';
const EASE = [0.22, 1, 0.36, 1] as const;

const STEPS = [
  {
    id: 'welcome', label: 'Welcome', icon: Sparkles,
    title: 'Your practice workspace',
    copy: 'Everything you need for interview day lives here: guidance, printed prep material, live practice and a full mock round.',
    accent: 'text-primary',
  },
  {
    id: 'interview', label: 'Interview', icon: Mic,
    title: 'Live AI interview',
    copy: 'Choose an interviewer who fits the job, answer in English or with your voice, and get an honest scorecard with next steps.',
    accent: 'text-signal',
  },
  {
    id: 'group', label: 'Group discussion', icon: Users,
    title: 'Conference hall',
    copy: 'A mentor introduces an India-focused topic, then members speak one by one before an open debate. Join in whenever you are ready.',
    accent: 'text-success',
  },
  {
    id: 'stage', label: 'Presentation', icon: Target,
    title: 'Presentation stage',
    copy: 'Read the queue card, get 45 seconds to prepare, then speak for two minutes while the timer keeps you honest.',
    accent: 'text-warning',
  },
  {
    id: 'mock', label: 'Mock round', icon: BrainCircuit,
    title: 'The full test',
    copy: 'Aptitude, group discussion, presentation and interview — one complete mock round. Your first round is free.',
    accent: 'text-info',
  },
] as const;

export interface WorkspaceGuideProps {
  onOpen: (tab: string) => void;
}

/** First-run tutorial plus the always-available tips board. */
export function WorkspaceGuide({ onOpen }: WorkspaceGuideProps) {
  const [tourOpen, setTourOpen] = useState(() => {
    try { return localStorage.getItem(GUIDE_KEY) !== 'done'; } catch { return true; }
  });
  const [step, setStep] = useState(0);

  const finish = () => {
    try { localStorage.setItem(GUIDE_KEY, 'done'); } catch { /* storage may be disabled */ }
    setTourOpen(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) setStep((value) => value + 1);
    else finish();
  };

  const current = STEPS[step];

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[24px] border border-border bg-[linear-gradient(120deg,hsl(var(--surface)),hsl(var(--accent))_60%,hsl(var(--primary-soft)))] p-5 shadow-sm sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full border border-primary/10" />
        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
          <div>
            <p className="eyebrow flex items-center gap-2 text-primary"><BookOpen className="h-3.5 w-3.5" /> Start here</p>
            <h2 className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[28px]">How this workspace works.</h2>
            <p className="mt-2 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground">
              Five focused rooms, one goal: walk into your interview with proof you have practised. Open a room below, or replay the guided tour any time.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setStep(0); setTourOpen(true); }} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface/80 px-3.5 text-[11.5px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-surface">
                <Play className="h-3.5 w-3.5 text-primary" /> Replay the tour
              </button>
              <button type="button" onClick={() => onOpen('mock')} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                Take a mock round <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="hidden justify-end lg:flex">
            <AvatarPortrait avatarId="aria" name="Aria" title="Your practice mentor" state="idle" animated showNameplate className="h-[138px] w-[110px]" />
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">Your rooms</p>
            <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground">Pick a room and begin</h2>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success-soft px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-success"><ShieldCheck className="h-3 w-3" /> Private by default</span>
        </div>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {STEPS.slice(1).map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" onClick={() => onOpen(item.id === 'stage' ? 'presentation' : item.id)} className="group flex min-h-[116px] flex-col rounded-2xl border border-border bg-muted/20 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface hover:shadow-sm">
                <span className={cn('grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface', item.accent)}><Icon className="h-4 w-4" strokeWidth={1.8} /></span>
                <p className="mt-2.5 text-[12.5px] font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground">{item.copy}</p>
                <ChevronRight className="ml-auto mt-auto h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          { icon: FileText, title: 'Prepare before you perform', copy: 'Generate job-specific material first. The interview and mock round reuse the same confirmed facts.' },
          { icon: Users, title: 'Speak early, speak clearly', copy: 'In the group discussion, give one point in round one. The mentor will coach you if you stay silent.' },
          { icon: Target, title: 'Use the clock', copy: 'Presentation prep is 45 seconds, delivery is two minutes. Practise finishing inside the window.' },
        ].map(({ icon: Icon, title, copy }) => (
          <div key={title} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} />
            <p className="mt-2 text-[12.5px] font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{copy}</p>
          </div>
        ))}
      </section>

      <AnimatePresence>
        {tourOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Practice workspace tour" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(); }}>
            <motion.div initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.32, ease: EASE }} className="relative w-full max-w-xl overflow-hidden rounded-[26px] border border-border bg-surface p-6 shadow-pop sm:p-7">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary-soft/70" />
              <div className="relative flex items-start gap-4">
                <AvatarPortrait avatarId="aria" name="Aria" title="Practice mentor" state={step === 0 ? 'idle' : 'speaking'} animated showNameplate className="h-[92px] w-[76px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="eyebrow text-primary">Welcome · step {step + 1} of {STEPS.length}</p>
                  <h3 className="mt-2 text-[20px] font-semibold leading-tight tracking-[-0.025em] text-foreground">{current.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{current.copy}</p>
                </div>
              </div>
              <div className="relative mt-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5" aria-label="Tour progress">
                  {STEPS.map((item, index) => <span key={item.id} className={cn('h-1.5 rounded-full transition-all duration-300', index === step ? 'w-6 bg-primary' : 'w-1.5 bg-border-strong/50')} />)}
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={finish} className="rounded-lg px-2.5 py-2 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground">Skip</button>
                  <button type="button" onClick={next} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[11.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
                    {step === STEPS.length - 1 ? 'Start practising' : 'Next'} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { GUIDE_KEY };
