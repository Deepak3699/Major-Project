import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { Compass, GraduationCap, Mic, Search, Target, UserRound, BriefcaseBusiness, Settings, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { candidate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

const DONE_KEY = 'jobpilot:tutorial-done';
export const REPLAY_TOUR_EVENT = 'aijobpilot:replay-tour';

export function isTutorialDone(): boolean {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return true; }
}

export function markTutorialDone(): void {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* storage can be disabled */ }
}

export function resetTutorialFlag(): void {
  try { localStorage.removeItem(DONE_KEY); } catch { /* storage can be disabled */ }
}

type TargetId =
  | 'sidebar'
  | 'nav-for-you'
  | 'nav-practice'
  | 'nav-jobs'
  | 'nav-admin-practice'
  | 'palette'
  | 'user-menu';

interface TourStep {
  /** Anchored spotlight target; a hidden or missing target falls back to a centered card. */
  target?: TargetId;
  eyebrow: string;
  title: string;
  body: string;
  icon: LucideIcon;
  /*Forever centered regardless of target (welcome / closing).*/
  centered?: boolean;
}

// Cheap, safe selector strings — each maps 1:1 to a `data-tour` attribute.
const SELECTOR: Record<TargetId, string> = {
  'sidebar': '[data-tour="sidebar"]',
  'nav-for-you': '[data-tour="nav-for-you"]',
  'nav-practice': '[data-tour="nav-practice"]',
  'nav-jobs': '[data-tour="nav-jobs"]',
  'nav-admin-practice': '[data-tour="nav-admin-practice"]',
  'palette': '[data-tour="palette"]',
  'user-menu': '[data-tour="user-menu"]',
};

const CANDIDATE_STEPS: TourStep[] = [
  {
    eyebrow: 'Welcome · 01',
    title: 'Your job search, instrumented.',
    body: 'AI JobPilot finds roles matched to your profile, keeps every application on track, and lets you rehearse interviews with an AI that grades you like a real interviewer would — a short tour, then you are off.',
    icon: Compass,
    centered: true,
  },
  {
    target: 'sidebar',
    eyebrow: 'Navigation · 02',
    title: 'Everything lives in the rail.',
    body: 'Career space is your operating desk: jobs, recommendations, applications, documents. Practice space holds the interview engine and your learning tracks.',
    icon: Compass,
  },
  {
    target: 'nav-for-you',
    eyebrow: 'Recommendations · 03',
    title: 'Jobs, ranked for you.',
    body: '“For you” scores fresh postings against your skills. The matcher is only as good as your profile — fill it once and it keeps working.',
    icon: Target,
  },
  {
    target: 'nav-practice',
    eyebrow: 'Interviews · 04',
    title: 'Rehearse where it counts.',
    body: 'AI mock interviews, graded question by question. The free plan includes a small monthly quota; each session ends with a score, strengths, and what to fix next.',
    icon: Mic,
  },
  {
    target: 'nav-practice',
    eyebrow: 'Learning · 05',
    title: 'Close the gap it finds.',
    body: 'Learning tracks are generated from your profile and target role — modules with resources and drills, with progress you tick off as you go.',
    icon: GraduationCap,
  },
  {
    target: 'palette',
    eyebrow: 'Speed · 06',
    title: 'One keystroke away.',
    body: 'Press ⌘K or Ctrl+K from anywhere to jump straight to any page. You can also reach it from the search button here.',
    icon: Search,
  },
  {
    target: 'user-menu',
    eyebrow: 'Account · 07',
    title: 'Light, dark, and replay.',
    body: 'The avatar menu keeps the theme switch and this tutorial — replay it from the menu any time you like.',
    icon: UserRound,
  },
  {
    eyebrow: 'Ready · 08',
    title: 'Set your profile first.',
    body: 'One small tip before you go: open My profile and complete the skills and preferred roles. Everything downstream — matching, interviews, learning plans — keys off that.',
    icon: UserRound,
    centered: true,
  },
];

const ADMIN_STEPS: TourStep[] = [
  {
    eyebrow: 'Welcome · 01',
    title: 'The marketplace control room.',
    body: 'You review what enters the jobs index, keep contact data clean, and see quality signals from candidate feedback — a short tour of the panel first.',
    icon: Compass,
    centered: true,
  },
  {
    target: 'nav-jobs',
    eyebrow: 'Job review · 02',
    title: 'Guard the index.',
    body: 'New postings land here for manual review — publish, quarantine, or reject. Quarantined listings never reach candidate recommendations.',
    icon: BriefcaseBusiness,
  },
  {
    target: 'nav-admin-practice',
    eyebrow: 'Subscriptions · 03',
    title: 'Practice upgrade requests.',
    body: 'Candidates on the free quota can request Pro access here. You approve or reject requests, and can grant Pro directly by email.',
    icon: Mic,
  },
  {
    target: 'palette',
    eyebrow: 'Speed · 04',
    title: 'One keystroke away.',
    body: 'Press ⌘K or Ctrl+K from anywhere to jump straight to any admin page, including settings.',
    icon: Search,
  },
  {
    target: 'user-menu',
    eyebrow: 'Account · 05',
    title: 'Light, dark, and replay.',
    body: 'The avatar menu keeps the theme switch, automation-run alerts live in the bell, and this tutorial can be replayed from the menu any time.',
    icon: Settings,
  },
];

const buildSteps = (isAdmin: boolean): TourStep[] => (isAdmin ? ADMIN_STEPS : CANDIDATE_STEPS);

const PAD = 6;

interface Rect { left: number; top: number; width: number; height: number }

function measure(target?: TargetId): Rect | null {
  if (!target) return null;
  const el = document.querySelector(SELECTOR[target]);
  if (!(el instanceof HTMLElement)) return null;
  if (el.getClientRects().length === 0) return null; // display:none / hidden
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

const CARD_W = 360;
const CARD_GAP = 14;
const VIEWPORT_PAD = 16;

const OnboardingTour = () => {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const steps = useMemo(() => buildSteps(!!isAdmin), [isAdmin]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [serverProgress, setServerProgress] = useState<{ completed: boolean; skipped: boolean } | null | undefined>(undefined);
  const nextRef = useRef<HTMLButtonElement>(null);

  const stepKey = useCallback(
    (index: number) => `${isAdmin ? 'admin' : 'candidate'}-${index + 1}`,
    [isAdmin],
  );

  // Server-side onboarding state wins across browsers; local storage remains the
  // fast path when the API is unavailable.
  useEffect(() => {
    if (!user?.role) return;
    if (isAdmin) { setServerProgress(null); return; }
    let cancelled = false;
    candidate.onboarding()
      .then(({ progress }) => { if (!cancelled) setServerProgress(progress); })
      .catch(() => { if (!cancelled) setServerProgress(null); });
    return () => { cancelled = true; };
  }, [user?.role, isAdmin]);

  const persist = useCallback((currentStep: number, completed: boolean, skipped: boolean) => {
    if (isAdmin) return;
    const viewed = Array.from({ length: completed ? steps.length : currentStep + 1 }, (_, index) => stepKey(index));
    candidate.saveOnboarding({
      completed_steps: viewed,
      last_step: Math.min(currentStep, 49),
      completed,
      skipped,
    }).catch(() => { /* offline: local completion flag still applies */ });
  }, [isAdmin, stepKey, steps.length]);

  // First-run auto-open: once per browser, shortly after the shell settles and
  // after the server confirms the tour has not already been finished elsewhere.
  useEffect(() => {
    if (!user?.role) return;
    if (serverProgress === undefined) return;
    if (isTutorialDone()) return;
    if (serverProgress?.completed || serverProgress?.skipped) {
      markTutorialDone();
      return;
    }
    const timer = window.setTimeout(() => { setStep(0); setOpen(true); }, 1100);
    return () => window.clearTimeout(timer);
  }, [user?.role, serverProgress]);

  // Replay from the Header avatar menu.
  useEffect(() => {
    const replay = () => { setStep(0); setOpen(true); };
    window.addEventListener(REPLAY_TOUR_EVENT, replay);
    return () => window.removeEventListener(REPLAY_TOUR_EVENT, replay);
  }, []);

  // Measure target around the current step; keep stable while scrolling (targets live in the fixed chrome).
  useLayoutEffect(() => {
    if (!open) return;
    const current = steps[step];
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setRect(measure(current.target)));
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, [open, step, steps]);

  const close = useCallback((finished = false) => {
    markTutorialDone();
    setOpen(false);
    persist(step, finished, !finished);
  }, [persist, step]);

  const next = useCallback(() => {
    if (step >= steps.length - 1) close(true);
    else {
      const upcoming = step + 1;
      setStep(upcoming);
      persist(upcoming, false, false);
    }
  }, [step, steps.length, close, persist]);

  const back = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (!open) return;
    nextRef.current?.focus();
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, next, back, close]);

  // Lock page scroll while the tour is up (main scrolls in Layout, so the body lock is sufficient).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const current = steps[step];
  const anchored = !current.centered && rect;
  const Icon = current.icon;
  const isLast = step === steps.length - 1;

  // Card placement
  let cardStyle: React.CSSProperties;
  if (!anchored) {
    cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const r = rect!;
    const preferBelow = r.top + r.height + CARD_GAP;
    const spaceBelow = window.innerHeight - preferBelow;
    const spaceAbove = r.top - CARD_GAP;
    const placeBelow = spaceBelow > 190 || spaceAbove < 190;
    const top = placeBelow ? Math.min(spaceBelow > 190 ? r.top + r.height + CARD_GAP : VIEWPORT_PAD, window.innerHeight - VIEWPORT_PAD) : Math.max(VIEWPORT_PAD, r.top - CARD_GAP);
    cardStyle = {
      top,
      left: Math.min(
        Math.max(r.left, VIEWPORT_PAD),
        Math.max(VIEWPORT_PAD, window.innerWidth - VIEWPORT_PAD - CARD_W),
      ),
      width: CARD_W,
    };
  }

  const highlightStyle: React.CSSProperties = anchored
    ? {
        left: rect!.left - PAD,
        top: rect!.top - PAD,
        width: rect!.width + PAD * 2,
        height: rect!.height + PAD * 2,
        transition: 'left 260ms cubic-bezier(0.22,1,0.36,1), top 260ms cubic-bezier(0.22,1,0.36,1), width 260ms cubic-bezier(0.22,1,0.36,1), height 260ms cubic-bezier(0.22,1,0.36,1)',
      }
    : { left: '50%', top: '50%', width: 0, height: 0 };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-tour"
      role="dialog"
      aria-modal="true"
      aria-label="Product tour"
    >
      {/* Dim + block interactions; the highlight cut-out sits above it */}
      <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[1px]" aria-hidden />
      {rect && (
        <div
          className="pointer-events-none absolute rounded-[10px] border-[1.5px] border-signal"
          style={{ ...highlightStyle, boxShadow: '0 0 0 9999px rgba(9, 9, 11, 0.6), 0 0 0 1px rgba(9,9,11,0.2)' }}
          aria-hidden
        />
      )}
      {!rect && !current.centered && (
        <div
          className="pointer-events-none absolute inset-0 bg-transparent"
          style={{ boxShadow: 'none' }}
          aria-hidden
        />
      )}

      <motion.div
        key={current.title}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE }}
        className="absolute rounded-xl border border-border bg-surface p-5 shadow-popover"
        style={cardStyle}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">{current.eyebrow}</p>
            <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.014em] text-foreground">{current.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{current.body}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3.5">
          <div className="flex items-center gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-200',
                  i === step ? 'w-4 bg-signal' : 'w-1.5 bg-border-strong/60',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => close(false)}>
              {isLast ? 'Close' : 'Skip'}
            </Button>
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={back}>
                Back
              </Button>
            )}
            <Button ref={nextRef} size="sm" variant={isLast ? 'default' : 'signal'} onClick={next}>
              {isLast ? 'Got it' : 'Next'}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
};

export default OnboardingTour;
