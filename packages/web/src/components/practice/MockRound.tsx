import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowRight, BookOpen, BrainCircuit, Check, ChevronLeft, ChevronRight,
  Clock3, Crown, Lightbulb, Mic, Play, ShieldCheck, Sparkles, Target, Trophy, Users,
} from 'lucide-react';
import { candidate, practice } from '@/lib/api';
import { enterFullscreenForNavigation } from '@/lib/fullscreen';
import { usePracticeFocus } from '@/stores/practiceFocus';
import { GroupDiscussion } from '@/components/practice/GroupDiscussion';
import { PresentationStudio } from '@/components/practice/PresentationStudio';
import PracticeSession from '@/pages/PracticeSession';
import { AvatarPortrait } from '@/components/interview/AvatarPortrait';
import { useInterviewerSpeech } from '@/components/interview/speech';
import { FALLBACK_AVATARS } from '@/components/interview/roster';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;
const PROGRESS_KEY = 'hiregen:mock-round-progress';
const STAGES = [
  { id: 'aptitude', label: 'Aptitude', icon: BrainCircuit, hint: 'Role-based reasoning' },
  { id: 'gd', label: 'Group discussion', icon: Users, hint: 'Speak with a group' },
  { id: 'presentation', label: 'Presentation', icon: BookOpen, hint: 'Two-minute delivery' },
  { id: 'interview', label: 'Interview', icon: Mic, hint: 'Live AI interviewer' },
] as const;

function aptitudeFor(role: string) {
  const focus = role.trim() || 'Software Engineer';
  return [
    {
      question: `A ${focus} receives a bug report with no steps to reproduce. What is the most professional first move?`,
      options: ['Close it as invalid', 'Ask for the expected result, actual result and environment', 'Rewrite the whole module', 'Ask the reporter to learn testing'],
      answer: 1,
    },
    {
      question: 'In an Indian campus placement drive, which signal best predicts job readiness?',
      options: ['Only percentage marks', 'A verified work sample plus clear communication', 'The number of certificates', 'The college brand alone'],
      answer: 1,
    },
    {
      question: 'If a stakeholder asks for a feature in two days, what should you do first?',
      options: ['Promise immediately', 'Refuse politely', 'Clarify the outcome, constraints and minimum viable scope', 'Start coding without a plan'],
      answer: 2,
    },
    {
      question: 'Which sentence is free of redundant wording?',
      options: ['We will each and every one review it', 'We will review it together', 'We will review it in a group together', 'We will all collectively review it'],
      answer: 1,
    },
    {
      question: `A ${focus} joining a remote team in India should prioritise which habit?`,
      options: ['Never ask questions', 'Write clear updates and document decisions', 'Work only in isolation', 'Avoid all meetings'],
      answer: 1,
    },
  ];
}

export function MockRound() {
  const speech = useInterviewerSpeech();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { toast } = useToast();
  const { data: statusData, isLoading: statusLoading } = useQuery('mock-round-status', practice.mockRoundStatus, { staleTime: 30_000 });
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { staleTime: 60_000 });
  const { data: jobsData } = useQuery('mock-round-jobs', () => candidate.jobs({ days: 90, limit: 50, sort: 'trust' }), { staleTime: 5 * 60_000 });
  const { data: avatarData } = useQuery('mock-round-avatars', () => practice.avatars(), { staleTime: 60_000 });
  const [started, setStarted] = useState(() => {
    try { return sessionStorage.getItem(PROGRESS_KEY) !== null; } catch { return false; }
  });
  const [stage, setStage] = useState(() => {
    try { return Number(sessionStorage.getItem(PROGRESS_KEY) || 0); } catch { return 0; }
  });
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [gdTopicIndex, setGdTopicIndex] = useState(0);
  const [gdPoints, setGdPoints] = useState<string[]>([]);
  const [gdInput, setGdInput] = useState('');
  const [prepLeft, setPrepLeft] = useState(45);
  const [deliverLeft, setDeliverLeft] = useState(120);
  const focus = usePracticeFocus((state) => state.focus);
  const [jobId, setJobId] = useState(focus?.jobId || '');
  const [busy, setBusy] = useState(false);
  const [mockSessionId, setMockSessionId] = useState('');
  const [mockResult, setMockResult] = useState<{ aptitude_correct: number; aptitude_total: number; interview_score: number | null; interview_session_id?: string | null } | null>(null);
  const [resultSaved, setResultSaved] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const mockSessionStartedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const role = focus?.role || profileData?.profile?.preferred_roles?.[0] || 'Software Engineer';
  const questions = useMemo(() => aptitudeFor(role), [role]);
  const avatars = avatarData?.avatars?.length ? avatarData.avatars : FALLBACK_AVATARS;
  const canUse = Boolean(statusData?.can_use);
  const gdTopics = [
    `Should ${role} roles in India require a verified work sample before interview?`,
    `How can early-career ${role}s in India stand out without a large personal brand?`,
    `Is structured feedback more valuable than a higher starting salary for a ${role}?`,
  ];

  useEffect(() => () => { if (timerRef.current) window.clearInterval(timerRef.current); speech.cancel(); }, []);

  useEffect(() => {
    try {
      if (started) sessionStorage.setItem(PROGRESS_KEY, String(stage));
      else sessionStorage.removeItem(PROGRESS_KEY);
    } catch { /* session storage may be disabled */ }
  }, [started, stage]);

  // A completed round leaves a replay flag so clicking the mock card again
  // starts a fresh local attempt without charging another lifetime round.
  useEffect(() => {
    let replay = false;
    try {
      replay = localStorage.getItem('hiregen:mock-replay') === '1';
      if (replay) localStorage.removeItem('hiregen:mock-replay');
    } catch { /* storage may be disabled */ }
    if (!replay) return;
    try {
      sessionStorage.removeItem(PROGRESS_KEY);
      sessionStorage.removeItem('hiregen:mock-interview-session');
    } catch { /* ignore */ }
    mockSessionStartedRef.current = false;
    setStarted(true);
    setStage(0);
    setAnswers({});
    setMockSessionId('');
    setMockResult(null);
    setResultSaved(false);
  }, []);

  // Show the outcome, persist it, then return to the practice workspace.
  useEffect(() => {
    if (stage !== 4 || !resultSaved) return;
    const timer = window.setTimeout(() => returnToWorkspace(), 6000);
    return () => window.clearTimeout(timer);
  }, [stage, resultSaved, navigate]);

  // The mock interview round opens the real live session by itself.
  useEffect(() => {
    if (stage !== 3 || mockSessionStartedRef.current) return;
    mockSessionStartedRef.current = true;
    try {
      const saved = sessionStorage.getItem('hiregen:mock-interview-session');
      if (saved) { setMockSessionId(saved); return; }
    } catch { /* session storage may be disabled */ }
    let cancelled = false;
    void (async () => {
      try {
        const res = await practice.createSession({
          role_focus: role,
          difficulty: 'standard',
          question_count: 6,
          avatar_id: avatars[0]?.id,
          job_id: focus?.jobId || undefined,
        });
        await client.invalidateQueries('practice-sessions');
        if (!cancelled) {
          try { sessionStorage.setItem('hiregen:mock-interview-session', res.session.id); } catch { /* ignore */ }
          setMockSessionId(res.session.id);
        }
      } catch (error: any) {
        if (!cancelled) toast({ title: 'Interview could not start', description: error?.response?.data?.error || (error as Error).message, variant: 'error' });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const consume = useMutation(() => practice.startMockRound(), {
    onSuccess: () => {
      client.invalidateQueries('mock-round-status');
      try { sessionStorage.removeItem('hiregen:mock-interview-session'); } catch { /* ignore */ }
      setStarted(true);
    },
    onError: (error: any) => {
      if (error?.response?.status === 402) toast({ title: 'Free round already used', description: 'Request Pro to take more mock rounds.', variant: 'error' });
      else toast({ title: 'Could not start the round', description: (error as Error).message, variant: 'error' });
    },
  });

  const upgrade = useMutation(() => practice.upgradeRequest('Requesting Pro for additional mock rounds.'), {
    onSuccess: () => { client.invalidateQueries('mock-round-status'); toast({ title: 'Upgrade requested', description: 'An administrator will review your request.', variant: 'success' }); },
  });

  const startInterview = async () => {
    await enterFullscreenForNavigation();
    setBusy(true);
    try {
      const res = await practice.createSession({ role_focus: role, difficulty: 'standard', question_count: 6, avatar_id: avatars[0]?.id, job_id: jobId || undefined });
      await client.invalidateQueries('practice-sessions');
      try { sessionStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
      navigate(`/practice/session/${res.session.id}`, { state: { autoFullscreen: true } });
    } catch (error: any) {
      toast({ title: 'Interview could not start', description: error?.response?.data?.error || (error as Error).message, variant: 'error' });
    } finally { setBusy(false); }
  };

  const runPresentationTimer = (mode: 'prep' | 'deliver') => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (mode === 'prep') speech.speak(`Presentation topic: ${gdTopics[gdTopicIndex]}. You have 45 seconds to prepare.`);
    else speech.speak('Please start your presentation. You have two minutes.');
    timerRef.current = window.setInterval(() => {
      if (mode === 'prep') {
        setPrepLeft((value) => {
          if (value <= 1) { window.clearInterval(timerRef.current || undefined); speech.speak('Time to present. Please begin.'); return 0; }
          return value - 1;
        });
      } else {
        setDeliverLeft((value) => {
          if (value <= 1) { window.clearInterval(timerRef.current || undefined); return 0; }
          return value - 1;
        });
      }
    }, 1000);
  };

  const stageIndex = stage;
  const aptitudeScore = Object.entries(answers).reduce((total, [index, value]) => total + (questions[Number(index)]?.answer === value ? 1 : 0), 0);

  if (statusLoading) return <div className="card p-5 text-[12.5px] text-muted-foreground">Checking your mock round access…</div>;

  if (!started) {
    return (
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-[24px] border border-primary/20 bg-[linear-gradient(120deg,hsl(var(--primary-soft)),hsl(var(--surface))_75%)] p-6 shadow-sm">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full border border-primary/15" />
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface text-primary shadow-sm"><Crown className="h-5 w-5" /></span>
          <p className="eyebrow mt-4 text-primary">The complete test</p>
          <h2 className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-foreground sm:text-[30px]">One round. Four rooms. One clear result.</h2>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">Aptitude, group discussion, presentation and a live AI interview — sequenced like a real campus process. Your first mock round is free; further rounds need Pro.</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-primary">
            <Target className="h-3 w-3" /> Practising for {role}{focus?.company ? ` · ${focus.company}` : ''}
          </span>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {STAGES.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/80 p-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary-soft font-mono text-[10px] font-semibold text-primary">{index + 1}</span>
                  <div className="min-w-0"><p className="text-[11.5px] font-semibold text-foreground">{item.label}</p><p className="truncate text-[10px] text-muted-foreground">{item.hint}</p></div>
                  <Icon className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {canUse ? (
              <button type="button" disabled={consume.isLoading} onClick={() => consume.mutate()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"><Play className="h-4 w-4" /> {consume.isLoading ? 'Preparing…' : 'Begin free mock round'}</button>
            ) : (
              <button type="button" disabled={upgrade.isLoading} onClick={() => upgrade.mutate()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-[12px] font-semibold text-background transition-colors disabled:opacity-50"><Crown className="h-4 w-4" /> {upgrade.isLoading ? 'Sending…' : 'Request Pro to continue'}</button>
            )}
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em]', canUse ? 'border-success/25 bg-success-soft text-success' : 'border-warning/25 bg-warning-soft text-warning')}>
              <ShieldCheck className="h-3 w-3" />{canUse ? 'Free round available' : 'Free round used'}
            </span>
          </div>
          {!canUse && <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Upgrade requests are reviewed by an administrator. Once Pro is active, this room unlocks again.</p>}
        </section>
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { icon: BrainCircuit, title: 'Aptitude', copy: 'Five questions tuned to your target role and Indian workplace context.' },
            { icon: Users, title: 'Discussion', copy: 'A mentor assigns a topic and members speak before you join the debate.' },
            { icon: Clock3, title: 'Timed', copy: '45 seconds of prep and a strict two-minute presentation window.' },
          ].map(({ icon: Icon, title, copy }) => (
            <div key={title} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
              <Icon className="h-4 w-4 text-primary" strokeWidth={1.8} />
              <p className="mt-2 text-[12.5px] font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{copy}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const returnToWorkspace = () => {
    try {
      sessionStorage.removeItem(PROGRESS_KEY);
      sessionStorage.removeItem('hiregen:mock-interview-session');
      localStorage.setItem('hiregen:mock-replay', '1');
    } catch { /* ignore */ }
    navigate('/practice');
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-primary">{stage >= STAGES.length ? 'Mock round complete' : 'Mock round in progress'}</p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">{stage >= STAGES.length ? 'Complete' : STAGES[stage].label}</h2>
          </div>
          <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{Math.min(stage + 1, STAGES.length)} / {STAGES.length}</span>
        </div>
        <div className="mt-4 flex gap-1.5">
          {STAGES.map((item, index) => (
            <span key={item.id} className={cn('h-1.5 flex-1 rounded-full transition-colors', index <= stage ? 'bg-primary' : 'bg-muted')} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STAGES.map((item, index) => (
            <span key={item.id} className={cn('rounded-md border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em]', index === stage ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border text-muted-foreground')}>{item.label}</span>
          ))}
        </div>
      </section>

      {stage === 0 && (
        <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm sm:p-6">
          <p className="eyebrow text-primary">Aptitude round</p>
          <h2 className="mt-1 text-[18px] font-semibold text-foreground">Five role-based questions</h2>
          <div className="mt-4 space-y-4">
            {questions.map((question, index) => (
              <div key={index} className="rounded-xl border border-border bg-muted/20 p-3.5">
                <p className="text-[12px] font-medium text-foreground"><span className="mr-2 font-mono text-[10px] text-muted-foreground">{index + 1}.</span>{question.question}</p>
                <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
                  {question.options.map((option, optionIndex) => (
                    <button key={option} type="button" onClick={() => setAnswers((current) => ({ ...current, [index]: optionIndex }))} className={cn('rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors', answers[index] === optionIndex ? 'border-primary/40 bg-primary-soft text-primary' : 'border-border bg-surface text-muted-foreground hover:border-border-strong')}>
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{Object.keys(answers).length}/{questions.length} answered</p>
            <button type="button" disabled={Object.keys(answers).length < questions.length} onClick={() => { speech.speak('Aptitude round complete. Moving to the group discussion.'); setStage(1); }} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[11.5px] font-semibold text-primary-foreground disabled:opacity-50">Continue <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
        </section>
      )}

      {stage === 1 && (
        <GroupDiscussion
          mockMode
          onContinue={() => {
            setStage(2);
            setPrepLeft(45);
            setDeliverLeft(120);
            runPresentationTimer('prep');
          }}
        />
      )}

      {stage === 2 && (
        <PresentationStudio
          mockMode
          onContinue={() => {
            setStage(3);
          }}
        />
      )}

      {stage === 3 && (
        mockSessionId ? (
          <PracticeSession
            sessionId={mockSessionId}
            mockMode
            onMockFinish={({ overallScore, sessionId }) => {
              window.clearInterval(timerRef.current || undefined);
              try { sessionStorage.removeItem('hiregen:mock-interview-session'); } catch { /* ignore */ }
              const result = {
                aptitude_correct: aptitudeScore,
                aptitude_total: questions.length,
                interview_score: overallScore,
                interview_session_id: sessionId,
              };
              setMockResult(result);
              setResultSaved(false);
              setSavingResult(true);
              void (async () => {
                try {
                  await practice.saveMockRoundResult(result);
                  client.invalidateQueries('mock-round-status');
                } catch (error: any) {
                  toast({ title: 'Result not saved', description: (error as Error).message, variant: 'error' });
                } finally {
                  setSavingResult(false);
                  setResultSaved(true);
                }
              })();
              setStage(4);
            }}
          />
        ) : (
          <section className="rounded-[24px] border border-border bg-surface p-6 shadow-sm">
            <p className="eyebrow text-primary">Interview round</p>
            <h2 className="mt-1 text-[18px] font-semibold text-foreground">Opening your live AI interviewer…</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Your interview session is being prepared. It will start automatically.</p>
          </section>
        )
      )}

      {stage === 4 && (
        <section className="rounded-[24px] border border-success/25 bg-success-soft/40 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-success"><Trophy className="h-4 w-4" /> Mock round outcomes</p>
              <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.025em] text-foreground">All four rooms, one completed round.</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">Your result is saved to your profile. You can start a fresh round from the practice workspace.</p>
            </div>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em]', resultSaved ? 'border-success/30 bg-success-soft text-success' : 'border-warning/30 bg-warning-soft text-warning')}>
              {savingResult ? <Sparkles className="h-3 w-3" /> : resultSaved ? <Check className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
              {savingResult ? 'Saving…' : resultSaved ? 'Saved' : 'Pending'}
            </span>
          </div>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Aptitude', value: `${mockResult?.aptitude_correct ?? aptitudeScore}/${mockResult?.aptitude_total ?? questions.length}`, hint: 'Correct answers' },
              { label: 'Discussion', value: 'Done', hint: 'Topic rounds + conclusion' },
              { label: 'Presentation', value: 'Done', hint: 'Prep + two-minute stage' },
              { label: 'Interview', value: mockResult?.interview_score != null ? `${mockResult.interview_score}` : '—', hint: 'Overall score / 100' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-surface/70 p-3">
                <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-[-0.03em] text-foreground">{item.value}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{item.hint}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={returnToWorkspace} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
              Back to practice workspace <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <span className="text-[11px] text-muted-foreground">Returning automatically in a moment…</span>
          </div>
        </section>
      )}
    </div>
  );
}
