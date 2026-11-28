import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Camera, CameraOff, Check, ChevronRight, Clock3, Lightbulb, Mic, Play,
  RotateCcw, Sparkles, Square,
} from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { JobRoleAvatar } from '@/components/candidate/JobRoleAvatar';
import { AvatarPortrait } from '@/components/interview/AvatarPortrait';
import { useInterviewerSpeech } from '@/components/interview/speech';
import { usePracticeFocus } from '@/stores/practiceFocus';

const EASE = [0.22, 1, 0.36, 1] as const;

const TOPICS = [
  {
    title: 'Should India make internships compulsory before final-year placements?',
    hint: 'Use one campus example and one industry example.',
    points: ['Open with a clear stand', 'Give one India-specific example', 'Close with a practical recommendation'],
  },
  {
    title: 'How should freshers explain a gap year to an interviewer?',
    hint: 'Focus on what you built or learned, not the gap.',
    points: ['Be honest and brief', 'Show evidence of learning', 'Link it back to the role'],
  },
  {
    title: 'What makes a remote team work for early-career engineers in India?',
    hint: 'Think about communication, mentoring and time zones.',
    points: ['Name the real constraint', 'Offer one workable fix', 'End with the outcome'],
  },
];

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

type Stage = 'queue' | 'brief' | 'prep' | 'deliver' | 'done';

export function PresentationStudio({ mockMode = false, onContinue }: { mockMode?: boolean; onContinue?: () => void } = {}) {
  const speech = useInterviewerSpeech();
  const focusRole = usePracticeFocus((state) => state.focus?.role || 'your target role');
  const [topicIndex, setTopicIndex] = useState(() => mockMode ? Math.floor(Math.random() * TOPICS.length) : 0);
  const autoStartedRef = useRef(false);
  const [stage, setStage] = useState<Stage>('queue');
  const [prepLeft, setPrepLeft] = useState(45);
  const [deliverLeft, setDeliverLeft] = useState(120);
  const [notes, setNotes] = useState('');
  const topic = TOPICS[topicIndex];
  const timerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const enableCamera = async () => {
    if (cameraOn || streamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setCameraError('');
      setCameraOn(true);
    } catch {
      setCameraError('Camera unavailable — you can still present with audio.');
      setCameraOn(false);
    }
  };

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOn]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    speech.cancel();
  }, []);

  const progress = useMemo(() => {
    if (stage === 'prep') return ((45 - prepLeft) / 45) * 100;
    if (stage === 'deliver') return ((120 - deliverLeft) / 120) * 100;
    return 0;
  }, [stage, prepLeft, deliverLeft]);

  useEffect(() => {
    if (stage !== 'prep' && stage !== 'deliver') return;
    timerRef.current = window.setInterval(() => {
      if (stage === 'prep') {
        setPrepLeft((value) => {
          if (value <= 1) {
            window.clearInterval(timerRef.current || undefined);
            window.setTimeout(() => {
              void enableCamera();
              speech.speak('Your 45 seconds are over. Please begin your presentation now.');
              setStage('deliver');
            }, 200);
            return 0;
          }
          return value - 1;
        });
      } else {
        setDeliverLeft((value) => {
          if (value <= 1) {
            window.clearInterval(timerRef.current || undefined);
            speech.speak('Time is up. Thank you. Please stop speaking.');
            setStage('done');
            return 0;
          }
          return value;
        });
      }
    }, 1000);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [stage]);

  const reveal = () => {
    setPrepLeft(45);
    setDeliverLeft(120);
    setNotes('');
    setStage('brief');
    speech.speak(`Your presentation topic is: ${topic.title}. ${topic.hint}. Focus it on ${focusRole}. You have 45 seconds to prepare.`);
    window.setTimeout(() => setStage('prep'), 5200);
  };

  const startPresentation = () => {
    window.clearInterval(timerRef.current || undefined);
    void enableCamera();
    speech.speak('Please start your presentation. You have two minutes. Start speaking now.');
    setStage('deliver');
  };

  const reset = () => {
    speech.cancel();
    stopCamera();
    window.clearInterval(timerRef.current || undefined);
    setStage('queue');
    setPrepLeft(45);
    setDeliverLeft(120);
  };

  const nextTopic = () => { setTopicIndex((index) => (index + 1) % TOPICS.length); reset(); };

  // Mock round: choose a random queue card and open it by itself.
  useEffect(() => {
    if (!mockMode || autoStartedRef.current) return;
    autoStartedRef.current = true;
    const timer = window.setTimeout(reveal, 700);
    return () => window.clearTimeout(timer);
  }, [mockMode]);

  return (
    <div className="space-y-5">
      <div className="room-main-grid grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-start">
        <section className="relative min-h-[440px] overflow-hidden rounded-[26px] border border-border bg-surface p-6 shadow-sm">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(hsl(var(--border-strong)/0.6) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <span className="absolute left-4 top-4 z-10 max-w-[45%] truncate rounded-full border border-[#e9b98f]/20 bg-[#0f0a08]/70 px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-[#e9b98f] backdrop-blur-md">
            Focus · {focusRole}
          </span>
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute right-4 top-4 z-10 hidden items-center gap-2 rounded-2xl border border-[#e9b98f]/20 bg-[#0f0a08]/75 p-1.5 pr-3 backdrop-blur-md sm:flex"
          >
            <AvatarPortrait
              avatarId="aria"
              name="Aria"
              title="Mentor"
              state={speech.speaking ? 'speaking' : 'idle'}
              pulse={speech.pulse}
              animated
              showNameplate={false}
              className="h-12 w-10 rounded-xl border border-[#e9b98f]/25"
            />
            <span>
              <span className="block font-mono text-[8px] uppercase tracking-[0.12em] text-[#e9b98f]">Mentor · Aria</span>
              <span className="block text-[9px] text-white/45">{speech.speaking ? 'Reading the brief' : 'On standby'}</span>
            </span>
            <span className={cn('h-1.5 w-1.5 rounded-full', speech.speaking ? 'animate-pulse bg-[#e06a55]' : 'bg-white/25')} />
          </motion.div>
          <AnimatePresence mode="wait">
            {stage === 'queue' && (
              <motion.div key="queue" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.35, ease: EASE }} className="relative mx-auto max-w-lg text-center">
                <motion.div animate={{ rotate: [0, -3, 3, 0] }} transition={{ duration: 4, repeat: Infinity }} className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-primary/25 bg-primary-soft text-primary shadow-sm"><Sparkles className="h-7 w-7" /></motion.div>
                <p className="eyebrow mt-4">Queue card · topic {topicIndex + 1} of {TOPICS.length}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">When you are ready, reveal the card. The mentor will read the topic aloud and start your preparation clock.</p>
                {!mockMode && (
                <button type="button" onClick={reveal} className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-[12.5px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"><Play className="h-4 w-4" /> Reveal my topic</button>
                )}
              </motion.div>
            )}

            {stage === 'brief' && (
              <motion.div key="brief" initial={{ opacity: 0, scale: 0.9, rotateX: -12 }} animate={{ opacity: 1, scale: 1, rotateX: 0 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.5, ease: EASE }} className="relative mx-auto max-w-xl text-center">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.4, repeat: Infinity }} className="mx-auto inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning-soft px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-warning"><Sparkles className="h-3 w-3" /> Topic unlocked</motion.div>
                <h3 className="mt-5 text-[24px] font-semibold leading-tight tracking-[-0.03em] text-foreground sm:text-[28px]">{topic.title}</h3>
                <p className="mt-2 text-[12.5px] text-muted-foreground">{topic.hint}</p>
                <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Mentor is reading the brief…</p>
              </motion.div>
            )}

            {(stage === 'prep' || stage === 'deliver' || stage === 'done') && (
              <motion.div key="stage" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative mx-auto max-w-xl">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em]', stage === 'prep' ? 'border-warning/30 bg-warning-soft text-warning' : stage === 'deliver' ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-muted/40 text-muted-foreground')}>
                    <Clock3 className="h-3 w-3" />{stage === 'prep' ? 'Preparation' : stage === 'deliver' ? 'Presenting' : 'Complete'}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{stage === 'prep' ? '45 seconds' : '2 minutes'}</span>
                  <button
                    type="button"
                    onClick={() => (cameraOn ? stopCamera() : void enableCamera())}
                    aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                    aria-pressed={cameraOn}
                    className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold transition-colors', cameraOn ? 'border-success/30 bg-success-soft text-success' : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground')}
                  >
                    {cameraOn ? <Camera className="h-3.5 w-3.5" /> : <CameraOff className="h-3.5 w-3.5" />}
                    {cameraOn ? 'Camera on' : 'Camera off'}
                  </button>
                </div>
                <p className="mt-4 text-[19px] font-semibold leading-snug tracking-[-0.02em] text-foreground">{topic.title}</p>
                <div className="mt-5 flex items-baseline justify-between">
                  <p className="font-mono text-[44px] font-semibold leading-none tabular-nums tracking-[-0.05em] text-foreground">{formatClock(stage === 'prep' ? prepLeft : deliverLeft)}</p>
                  <span className="text-[11px] text-muted-foreground">{stage === 'prep' ? 'Plan your three points' : 'Speak clearly and finish on time'}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div className={cn('h-full rounded-full', stage === 'prep' ? 'bg-warning' : 'bg-success')} animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }} transition={{ duration: 0.4 }} />
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-2">
                  <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {cameraOn ? (
                      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-muted-foreground"><CameraOff className="h-5 w-5" /></span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-foreground">You · presentation camera</p>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {cameraOn ? 'Live — mentor can see your delivery.' : cameraError || 'Camera starts automatically when you begin speaking.'}
                    </p>
                  </div>
                </div>
                {stage === 'prep' && (
                  <>
                    <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Jot three quick points…" className="input mt-4 h-auto text-[12px]" />
                    {!mockMode && (
                      <button type="button" onClick={startPresentation} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[12px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"><Mic className="h-4 w-4" /> Start speaking — camera on</button>
                    )}
                  </>
                )}
                {stage === 'deliver' && (
                  <button type="button" onClick={() => { speech.cancel(); setStage('done'); }} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border text-[12px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-accent/50"><Square className="h-3.5 w-3.5" /> Finish early</button>
                )}
                {stage === 'done' && (
                  <div className="mt-4 rounded-2xl border border-success/25 bg-success-soft/50 p-4">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-success"><Check className="h-4 w-4" /> Presentation complete</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                      {mockMode ? 'Your presentation is recorded as part of this mock round.' : notes.trim() ? 'Review your three points and try the same topic again to improve timing.' : 'Next time, write three points during prep so your delivery has a clear spine.'}
                    </p>
                    {mockMode ? (
                      <button type="button" onClick={onContinue} disabled={!onContinue} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[11.5px] font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /> Continue to interview</button>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[11px] font-semibold text-foreground"><RotateCcw className="h-3.5 w-3.5" /> Retry topic</button>
                        <button type="button" onClick={nextTopic} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground"><ChevronRight className="h-3.5 w-3.5" /> Next queue card</button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {!mockMode && (
        <aside className="space-y-5">
          <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <p className="eyebrow">Your three checks</p>
            <ol className="mt-3 space-y-2.5">
              {topic.points.map((point, index) => (
                <li key={point} className="flex gap-2.5 rounded-xl border border-border bg-muted/20 p-2.5 text-[11.5px] text-foreground/90">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border bg-surface font-mono text-[9px] text-muted-foreground">{index + 1}</span>{point}
                </li>
              ))}
            </ol>
          </section>
          <section className="rounded-[24px] border border-primary/20 bg-[linear-gradient(140deg,hsl(var(--primary-soft)),hsl(var(--surface))_85%)] p-5 shadow-sm">
            <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /><p className="eyebrow text-primary">Mentor tips</p></div>
            <ul className="mt-3 space-y-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <li>• Open with your stand in one sentence.</li>
              <li>• Use one India-specific example, then one role-specific example.</li>
              <li>• Stop before the timer ends — a tidy close beats a rushed one.</li>
            </ul>
          </section>
          <section className="rounded-[24px] border border-border bg-surface p-5 shadow-sm">
            <p className="eyebrow">Queue</p>
            <div className="mt-3 space-y-1.5">
              {TOPICS.map((item, index) => (
                <button key={item.title} type="button" onClick={() => { setTopicIndex(index); reset(); }} className={cn('flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[10.5px] transition-colors', topicIndex === index ? 'border-primary/30 bg-primary-soft text-primary' : 'border-border text-muted-foreground hover:border-border-strong')}>
                  <JobRoleAvatar title={item.title} size={24} className="rounded-md" />
                  <span className="line-clamp-1 flex-1">{item.title}</span>
                  {topicIndex === index && <ArrowRight className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </section>
        </aside>
        )}
      </div>
    </div>
  );
}
