import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  Eye,
  Lightbulb,
  MessageSquare,
  Mic,
  Minus,
  Scissors,
  Shirt,
  Smile,
  Square,
  Sun,
  Target,
  Trash2,
  User,
  Video,
  Volume2,
} from 'lucide-react';
import { practice } from '@/lib/api';
import {
  PracticeAnswerResult,
  PracticeAvatar,
  PracticePresentationFeedback,
  PracticeQuestion,
  PracticeReportMistake,
  PracticeSessionReport,
  PracticeSessionSummary,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { PageLoader } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { AvatarPortrait, type InterviewerState } from '@/components/interview/AvatarPortrait';
import { CameraPanel } from '@/components/interview/CameraPanel';
import { fallbackAvatar } from '@/components/interview/roster';
import { useInterviewerSpeech, useVoiceAnswers } from '@/components/interview/speech';
import { useCameraPresence } from '@/components/interview/useCameraPresence';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

const CATEGORY_LABEL: Record<string, string> = {
  intro: 'Background',
  technical: 'Technical',
  project: 'Project deep-dive',
  behavioral: 'Behavioral',
  case: 'Scenario',
  general: 'General',
  follow_up: 'Follow-up',
};

const DIFFICULTY_LABEL: Record<string, string> = { calm: 'Calm', standard: 'Standard', brutal: 'Stress' };

function feedbackClass(score: number | null | undefined): string {
  if (score == null) return 'border-border bg-muted text-muted-foreground';
  if (score >= 80) return 'border-success/25 bg-success-soft text-success';
  if (score >= 55) return 'border-warning/25 bg-warning-soft text-warning';
  return 'border-destructive/25 bg-destructive-soft text-destructive';
}

/* ------------------------------- shared pieces ------------------------------- */

const SessionBadgeRow = ({ q, score }: { q: PracticeQuestion; score?: boolean }) => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge variant="muted">{CATEGORY_LABEL[q.category] || q.category}</Badge>
    {q.topic && <Badge variant="outline">{q.topic}</Badge>}
    {q.category === 'follow_up' && <Badge variant="signal">From your last answer</Badge>}
    {score !== false && (
      <span className={cn('ml-auto grid h-8 min-h-8 min-w-8 place-items-center rounded-lg border px-1 font-mono text-[12px] font-semibold tabular-nums', feedbackClass(q.score))}>
        {q.score ?? '–'}
      </span>
    )}
  </div>
);

const FeedbackGrid = ({ feedback }: { feedback: NonNullable<PracticeQuestion['feedback']> }) => (
  <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
    <div>
      <p className="eyebrow">Strong</p>
      <ul className="mt-1.5 space-y-1.5">
        {feedback.strengths.map((s, j) => (
          <li key={j} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />{s}</li>
        ))}
      </ul>
    </div>
    <div>
      <p className="eyebrow">To improve</p>
      <ul className="mt-1.5 space-y-1.5">
        {feedback.improvements.map((s, j) => (
          <li key={j} className="flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground"><Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />{s}</li>
        ))}
      </ul>
    </div>
  </div>
);

const AvatarBubble = ({
  avatar,
  label,
  children,
}: {
  avatar: PracticeAvatar;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex gap-2.5">
    <AvatarPortrait
      avatarId={avatar.id}
      name={avatar.name}
      title={avatar.title}
      state="idle"
      animated={false}
      showNameplate={false}
      fit="cover"
      className="h-10 w-8 shrink-0"
    />
    <div className="min-w-0 flex-1">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="mt-1 rounded-lg rounded-tl-sm border border-border bg-muted/45 px-3 py-2 text-[13px] leading-relaxed text-foreground/90">
        {children}
      </div>
    </div>
  </div>
);

const ConversationCard = ({ q, avatar }: { q: PracticeQuestion; avatar: PracticeAvatar }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="card p-5">
    <SessionBadgeRow q={q} />
    <div className="mt-3 space-y-2.5">
      <AvatarBubble avatar={avatar} label={`${avatar.name.split(' ')[0]} asked`}>{q.question}</AvatarBubble>
      {q.answer && (
        <div className="flex justify-end">
          <div className="max-w-[88%] rounded-lg rounded-br-sm border border-signal/25 bg-signal-soft/70 px-3 py-2 text-[13px] leading-relaxed text-foreground/90">
            {q.answer}
          </div>
        </div>
      )}
      {q.interviewer_reply && (
        <AvatarBubble avatar={avatar} label={`${avatar.name.split(' ')[0]} reacted`}>{q.interviewer_reply}</AvatarBubble>
      )}
    </div>
    {q.feedback && <FeedbackGrid feedback={q.feedback} />}
  </motion.div>
);

/* ------------------------------- results view ------------------------------- */

function barTone(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 60) return 'bg-signal';
  if (score >= 45) return 'bg-warning';
  return 'bg-destructive';
}

const Scorecard = ({ report }: { report: PracticeSessionReport }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="eyebrow">Scorecard</p>
        <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">Five dimensions of the round</h2>
      </div>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
        {report.model !== 'template' ? 'AI review' : 'Rule-based review'}
      </span>
    </div>

    <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
      {report.dimensions.map((dimension, i) => (
        <motion.div
          key={dimension.key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE, delay: Math.min(i * 0.04, 0.2) }}
          className="rounded-lg border border-border bg-surface p-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">{dimension.label}</p>
            <span className="font-mono text-[16px] font-semibold tabular-nums text-foreground">{dimension.score}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full transition-[width] duration-700', barTone(dimension.score))} style={{ width: `${Math.max(2, Math.min(100, dimension.score))}%` }} />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{dimension.note}</p>
        </motion.div>
      ))}
    </div>

    {report.strengths?.length ? (
      <div className="mt-4 border-t border-border pt-4">
        <p className="eyebrow">What worked</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {report.strengths.map((strength, i) => (
            <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/90">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />{strength}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
  </motion.div>
);

const PresentationCard = ({ presentation }: { presentation: PracticePresentationFeedback }) => {
  if (!presentation.available) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-muted-foreground" />
          <p className="eyebrow">Camera review</p>
        </div>
        <p className="mt-2 max-w-phi-body text-[13px] leading-relaxed text-muted-foreground">{presentation.summary}</p>
        {presentation.tips.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {presentation.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/80">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />{tip}
              </li>
            ))}
          </ul>
        )}
      </motion.div>
    );
  }

  const items = [
    { label: 'Dress', value: presentation.dress, icon: Shirt },
    { label: 'Grooming', value: presentation.grooming, icon: Scissors },
    { label: 'Expression', value: presentation.expression, icon: Smile },
    { label: 'Posture', value: presentation.posture, icon: User },
    { label: 'Eye contact', value: presentation.eye_contact, icon: Eye },
    { label: 'Lighting', value: presentation.lighting, icon: Sun },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Camera review</p>
          <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">How you came across on camera</h2>
        </div>
        {presentation.score != null && (
          <div className="flex items-baseline gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
            <span className="font-mono text-[24px] font-semibold leading-none tabular-nums text-foreground">{presentation.score}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">/ 100 presence</span>
          </div>
        )}
      </div>

      <p className="mt-3 max-w-phi-body text-[13px] leading-relaxed text-foreground/85">{presentation.summary}</p>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-border bg-muted/35 p-3">
            <p className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
              <Icon className="h-3 w-3" /> {label}
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/85">{value}</p>
          </div>
        ))}
      </div>

      {presentation.tips.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="eyebrow">For the next round</p>
          <ul className="mt-2 space-y-1.5">
            {presentation.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/85">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />{tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
};

const MistakesCard = ({ mistakes }: { mistakes: PracticeReportMistake[] }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5">
    <div className="flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 text-destructive" />
      <p className="eyebrow">What cost you marks</p>
    </div>
    <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-foreground">Specific mistakes, with the fix</h2>

    <div className="mt-4 space-y-3">
      {mistakes.map((mistake, i) => (
        <article key={i} className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className={cn('grid h-9 min-h-9 min-w-9 shrink-0 place-items-center rounded-lg border px-1 font-mono text-[12px] font-semibold tabular-nums', feedbackClass(mistake.score))}>
              {mistake.score}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-relaxed text-foreground">{mistake.question}</p>
              {mistake.answer_excerpt && (
                <p className="mt-1 line-clamp-3 text-[12px] italic leading-relaxed text-muted-foreground">“{mistake.answer_excerpt}”</p>
              )}
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-destructive/20 bg-destructive-soft/60 px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-destructive">Mistake</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-foreground/85">{mistake.mistake}</p>
                </div>
                <div className="rounded-lg border border-success/20 bg-success-soft/60 px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-success">Fix</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-foreground/85">{mistake.fix}</p>
                </div>
              </div>
              {mistake.model_answer && (
                <details className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                  <summary className="cursor-pointer font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">
                    Stronger answer outline
                  </summary>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/85">{mistake.model_answer}</p>
                </details>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  </motion.div>
);

const NextStepsCard = ({ steps }: { steps: string[] }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5">
    <div className="flex items-center gap-2">
      <Target className="h-4 w-4 text-signal" />
      <p className="eyebrow">Your next three moves</p>
    </div>
    <ol className="mt-3 space-y-2.5">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-foreground/85">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-signal/40 bg-signal-soft font-mono text-[10px] font-semibold text-signal">{i + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  </motion.div>
);

const ResultsView = ({ session, byCategory, questions }: {
  session: PracticeSessionSummary;
  byCategory: Record<string, number>;
  questions: PracticeQuestion[];
}) => {
  const avatar = session.avatar || fallbackAvatar();
  const report = session.report;
  const presentation = session.presentation;
  return (
    <div className="space-y-4">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <AvatarPortrait
              avatarId={avatar.id}
              name={avatar.name}
              title={avatar.title}
              state="idle"
              animated={false}
              showNameplate={false}
              fit="cover"
              className="h-24 w-20 shrink-0"
            />
            <div className="min-w-0">
              <p className="eyebrow">Session verdict</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
                  {session.overall_score ?? '–'}<span className="text-[15px] font-normal text-muted-foreground"> / 100</span>
                </span>
                {session.verdict && <Badge variant={session.overall_score != null && session.overall_score >= 80 ? 'success' : 'muted'}>{session.verdict}</Badge>}
                {presentation?.available && presentation.score != null && (
                  <Badge variant="outline"><Video className="h-3 w-3" /> Presence {presentation.score}</Badge>
                )}
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                Interviewed by {avatar.name} · {avatar.title}
                {session.job?.company ? ` · ${session.job.company}` : ''}
              </p>
            </div>
          </div>
          <div className="text-right font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <p>{session.role_focus}</p>
            <p>{DIFFICULTY_LABEL[session.difficulty] || session.difficulty} · {session.question_count} questions</p>
            <p>{formatDateTime(session.completed_at || session.started_at)}</p>
          </div>
        </div>
        {session.summary && (
          <p className="mt-4 max-w-phi-body border-t border-border pt-4 text-[13.5px] leading-relaxed text-muted-foreground">{session.summary}</p>
        )}
        {Object.keys(byCategory).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {Object.entries(byCategory).map(([k, v]) => (
              <Badge key={k} variant={v >= 80 ? 'success' : v >= 55 ? 'warning' : 'danger'}>
                <span className="font-mono uppercase">{CATEGORY_LABEL[k] || k}</span>
                <span className="font-mono font-semibold tabular-nums">{v}</span>
              </Badge>
            ))}
          </div>
        )}
      </motion.div>

      {report?.dimensions?.length ? <Scorecard report={report} /> : null}
      {presentation ? <PresentationCard presentation={presentation} /> : null}
      {report?.mistakes?.length ? <MistakesCard mistakes={report.mistakes} /> : null}
      {report?.next_steps?.length ? <NextStepsCard steps={report.next_steps} /> : null}

      <div className="space-y-3">
        <p className="eyebrow">Conversation review</p>
        {questions.map((q, i) => (
          <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.05, 0.3) }}>
            <ConversationCard q={q} avatar={avatar} />
          </motion.div>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------- active runner ------------------------------- */

const AnswerPanel = ({ session, question, index, total, isLast, onNext }: {
  session: PracticeSessionSummary;
  question: PracticeQuestion;
  index: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
}) => {
  const avatar = session.avatar || fallbackAvatar();
  const [text, setText] = useState('');
  const [result, setResult] = useState<PracticeAnswerResult | null>(null);
  const [voiceOn, setVoiceOn] = useState(() => {
    try { return localStorage.getItem('hiregen:voice-interview') !== '0'; } catch { return true; }
  });
  const [micArmed, setMicArmed] = useState(() => {
    try { return localStorage.getItem('hiregen:mic-armed') === '1'; } catch { return false; }
  });
  const micArmedRef = useRef(false);
  micArmedRef.current = micArmed;
  const spokenRef = useRef('');
  const { toast } = useToast();

  const speech = useInterviewerSpeech(avatar.voice);
  const voice = useVoiceAnswers({
    onFinal: (chunk) => setText((prev) => `${prev ? `${prev.trimEnd()} ` : ''}${chunk}`.slice(0, 6000)),
  });

  const answerMutation = useMutation(
    (answer: string) => practice.answer(session.id, { question_id: question.id, answer }),
    {
      onSuccess: (response) => {
        setResult(response);
        const spoken = response.reply || response.question.interviewer_reply || '';
        if (voiceOn && spoken && speech.supported) speech.speak(spoken);
      },
      onError: (err: Error) => toast({ title: 'Answer not saved', description: err.message, variant: 'error' }),
    },
  );

  // The avatar opens the round, then asks each question aloud. If the candidate
  // has armed the mic, the answer window opens as soon as the voice finishes.
  useEffect(() => {
    if (!voiceOn || !speech.supported || question.feedback) return;
    const key = `${session.id}:${question.id}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    const lines: string[] = [];
    if (question.idx === 0 && session.opening_line) lines.push(session.opening_line);
    lines.push(question.question);
    speech.speakAll(lines, {
      onEnd: () => {
        if (micArmedRef.current && voice.supported) voice.start();
      },
    });
    return () => speech.cancel();
  }, [question.id, voiceOn]);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    try { localStorage.setItem('hiregen:voice-interview', next ? '1' : '0'); } catch { /* storage can be disabled */ }
    if (!next) {
      speech.cancel();
      voice.stop();
    } else if (!question.feedback && !result) {
      const lines = question.idx === 0 && session.opening_line
        ? [session.opening_line, question.question]
        : [question.question];
      speech.speakAll(lines);
    }
  };

  const startAnswering = () => {
    setMicArmed(true);
    try { localStorage.setItem('hiregen:mic-armed', '1'); } catch { /* storage can be disabled */ }
    speech.cancel();
    voice.start();
  };

  const graded = result?.grade || question.feedback;
  const gradedScore = result?.question.score ?? question.score;
  const reaction = result?.reply || question.interviewer_reply || '';
  const submittedAnswer = result?.question.answer || question.answer || text;

  const avatarState: InterviewerState = speech.speaking
    ? 'speaking'
    : voice.listening
      ? 'listening'
      : answerMutation.isLoading
        ? 'thinking'
        : 'idle';

  return (
    <motion.div key={question.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-5 py-2.5">
        <p className="eyebrow">Question {index + 1} of {total}</p>
        <Badge variant="muted">{CATEGORY_LABEL[question.category] || question.category}</Badge>
        {question.topic && <Badge variant="outline">{question.topic}</Badge>}
        {question.category === 'follow_up' && <Badge variant="signal">From your last answer</Badge>}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const lines = question.idx === 0 && session.opening_line
                ? [session.opening_line, question.question]
                : [question.question];
              speech.speakAll(lines);
            }}
            disabled={!speech.supported}
            title="Replay the question aloud"
            aria-label="Replay the question aloud"
            className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Volume2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleVoice}
            aria-pressed={voiceOn}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors',
              voiceOn
                ? 'border-signal/40 bg-signal-soft text-foreground'
                : 'border-border bg-surface text-muted-foreground hover:bg-accent',
            )}
          >
            <Mic className="h-3 w-3" /> Voice {voiceOn ? 'on' : 'off'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-2">
          <AvatarPortrait
            avatarId={avatar.id}
            name={avatar.name}
            title={avatar.title}
            state={avatarState}
            pulse={speech.pulse}
            fit="cover"
            className="h-64 w-full lg:h-[270px]"
          />
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">Voice</p>
            <p className="mt-0.5 truncate text-[11px] text-foreground/80" title={speech.voiceLabel || avatar.accent}>
              {speech.voiceLabel || avatar.accent}
            </p>
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Indian English · {avatar.voice.gender}</p>
          </div>
        </div>

        <div className="min-w-0">
          <div className="rounded-xl border border-border bg-muted/35 px-4 py-3.5">
            <p className="eyebrow flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> {avatar.name.split(' ')[0]} asks</p>
            <p className="mt-1.5 max-w-phi-body text-[17px] font-medium leading-relaxed tracking-[-0.01em] text-foreground">{question.question}</p>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
            {graded
              ? 'Graded from your own answer — the breakdown below explains the score.'
              : voiceOn && speech.supported
                ? `${avatar.name.split(' ')[0]} asks aloud in English. Answer by voice (words land below, editable) or just type — four to six specific sentences in English.`
                : 'Answer in four to six specific sentences in English.'}
          </p>
          {!graded && !micArmed && voiceOn && voice.supported && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              <Mic className="h-3 w-3" /> One click arms the mic — after that every question flows automatically
            </p>
          )}

          {!graded ? (
            <div className="mt-4 space-y-3">
              <Textarea
                aria-label={`Your answer to question ${index + 1}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={6000}
                rows={8}
                placeholder={voice.listening ? 'Listening… speak naturally, or type here.' : 'Situation, what you did, and how it turned out.'}
              />
              {voice.listening && (
                <p className="flex items-center gap-2 text-[12.5px] italic text-muted-foreground" aria-live="polite">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-success" aria-hidden />
                  {voice.partial ? `“${voice.partial}”` : 'Listening — go ahead.'}
                </p>
              )}
              {voice.error && <p className="text-[12px] text-destructive">{voice.error}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{text.trim().length} / 6000</p>
                <div className="flex flex-wrap items-center gap-2">
                  {voiceOn && voice.supported && (
                    voice.listening ? (
                      <Button variant="outline" size="default" onClick={() => voice.stop()} className="border-success/50 text-success">
                        <Square className="h-3.5 w-3.5 fill-current" /> Stop answering
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={startAnswering} disabled={answerMutation.isLoading}>
                        <Mic className="h-4 w-4" /> Answer by voice
                      </Button>
                    )
                  )}
                  <Button onClick={() => answerMutation.mutate(text.trim())} loading={answerMutation.isLoading} disabled={text.trim().length < 10}>
                    Submit answer
                  </Button>
                </div>
              </div>
              {voiceOn && !voice.supported && (
                <p className="text-[12px] text-muted-foreground">
                  Voice answers need Chrome or Edge — {avatar.name.split(' ')[0]} still reads questions aloud where supported, and typing works everywhere.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4 border-t border-border pt-4">
              {reaction && (
                <div className="rounded-xl border border-signal/30 bg-signal-soft/55 px-4 py-3">
                  <p className="eyebrow flex items-center gap-1.5 text-signal"><MessageSquare className="h-3.5 w-3.5" /> {avatar.name.split(' ')[0]} reacts</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">{reaction}</p>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2.5">
                <span className={cn('grid h-9 w-9 place-items-center rounded-lg border font-mono text-[14px] font-semibold tabular-nums', feedbackClass(gradedScore))}>
                  {gradedScore ?? '–'}
                </span>
                <p className="text-[12.5px] text-muted-foreground">Scored out of 100, with the strengths and gaps to fix.</p>
              </div>
              {graded && <FeedbackGrid feedback={graded} />}
              {submittedAnswer && (
                <p className="mt-4 rounded-lg bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/90">{submittedAnswer}</p>
              )}
              <div className="mt-4 flex justify-end">
                <Button onClick={onNext}>
                  {result?.complete || isLast ? 'Review the full session' : 'Next question'}<ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const FinalizeCard = ({ session, answeredCount, finishing, onFinish }: {
  session: PracticeSessionSummary;
  answeredCount: number;
  finishing: boolean;
  onFinish: () => void;
}) => {
  const avatar = session.avatar || fallbackAvatar();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5 text-center">
      <AvatarPortrait
        avatarId={avatar.id}
        name={avatar.name}
        title={avatar.title}
        state="idle"
        animated={false}
        showNameplate={false}
        fit="cover"
        className="mx-auto h-24 w-20"
      />
      <p className="eyebrow mt-3">Round complete</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
        {answeredCount} of {session.question_count} answers are in for the {DIFFICULTY_LABEL[session.difficulty] || session.difficulty} {session.role_focus} interview
        {session.job?.company ? ` at ${session.job.company}` : ''}. {avatar.name.split(' ')[0]} will score the round as a whole
        and, if the camera was on, add a presentation review.
      </p>
      <Button className="mt-4" onClick={onFinish} loading={finishing}>Score the interview</Button>
    </motion.div>
  );
};

const PracticeSession: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const { toast } = useToast();

  const camera = useCameraPresence();
  const { data, isLoading, isError } = useQuery(
    ['practice-session', id],
    () => practice.session(id),
    { enabled: !!id },
  );

  const finishMutation = useMutation(() => practice.finish(id, camera.buildMetrics()), {
    onSuccess: () => {
      camera.disable();
      camera.reset();
      queryClient.invalidateQueries(['practice-session', id]);
      queryClient.invalidateQueries('practice-sessions');
    },
    onError: (err: Error) => toast({ title: 'Session not scored', description: err.message, variant: 'error' }),
  });

  const abandonMutation = useMutation(() => practice.abandon(id), {
    onSuccess: async () => {
      setDiscardOpen(false);
      await queryClient.invalidateQueries('practice-sessions');
      navigate('/practice');
    },
    onError: (err: Error) => toast({ title: 'Not discarded', description: err.message, variant: 'error' }),
  });

  const session = data?.session;
  const questions = useMemo(() => data?.questions || [], [data]);

  // Per-category means, also shown on reopening a completed session.
  const byCategory = useMemo(() => {
    const acc: Record<string, { sum: number; n: number }> = {};
    for (const q of questions) {
      if (q.score == null) continue;
      const c = CATEGORY_LABEL[q.category] || q.category;
      (acc[c] = acc[c] || { sum: 0, n: 0 });
      acc[c].sum += q.score;
      acc[c].n += 1;
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(acc)) out[k] = Math.round(v.sum / v.n);
    return out;
  }, [questions]);

  if (isLoading) return <PageLoader label="Loading interview…" />;
  if (isError || !session) {
    return (
      <div className="card p-5 text-[13px] text-destructive">
        This session could not be opened. <Link to="/practice" className="text-foreground underline decoration-signal underline-offset-4">Back to practice</Link>
      </div>
    );
  }

  const avatar = session.avatar || fallbackAvatar();
  const answered = questions.filter((q) => q.answered_at);
  const pending = questions.filter((q) => !q.answered_at);
  const current = pending[Math.min(cursor, pending.length - 1)];
  // `question_count` is the round's target; only the opening question exists
  // up front, so counting generated questions would show "1 of 1" all round.
  const targetCount = Math.max(session.question_count || 0, questions.length, 1);

  const advance = () => {
    queryClient.invalidateQueries(['practice-session', id]);
    queryClient.invalidateQueries('practice-sessions');
    setCursor(0);
  };

  return (
    <div className="space-y-4">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="relative overflow-hidden rounded-2xl border border-border bg-grad-surface p-5"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.08),transparent_55%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
          <AvatarPortrait
            avatarId={avatar.id}
            name={avatar.name}
            title={avatar.title}
            state="idle"
            animated={false}
            showNameplate={false}
            fit="cover"
            className="h-24 w-20 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="eyebrow text-signal">Live interview</p>
            <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-foreground sm:text-[28px]">{session.role_focus}</h1>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {avatar.name} · {avatar.title}
              {session.job?.company ? ` · ${session.job.company}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="muted">{DIFFICULTY_LABEL[session.difficulty] || session.difficulty}</Badge>
              <Badge variant="outline">{session.question_count} questions</Badge>
              {session.job && <Badge variant="signal"><Briefcase className="h-3 w-3" /> {session.job.title}</Badge>}
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                <Volume2 className="h-3 w-3" /> {avatar.accent}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="ghost" asChild><Link to="/practice"><ArrowLeft className="h-4 w-4" />Session log</Link></Button>
            {session.status === 'in_progress' && (
              <Button variant="outline" onClick={() => setDiscardOpen(true)}><Trash2 className="h-4 w-4" />Discard</Button>
            )}
          </div>
        </div>
      </motion.section>

      {session.status === 'completed' ? (
        <ResultsView session={session} byCategory={byCategory} questions={questions} />
      ) : session.status === 'in_progress' ? (
        <>
          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-signal transition-[width] duration-500" style={{ width: `${(answered.length / targetCount) * 100}%` }} aria-hidden />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{answered.length}/{targetCount}</span>
          </div>

          <CameraPanel camera={camera} />

          {pending.length === 0 && questions.length > 0 ? (
            <FinalizeCard
              session={session}
              answeredCount={answered.length}
              finishing={finishMutation.isLoading}
              onFinish={() => finishMutation.mutate()}
            />
          ) : current ? (
            <AnswerPanel
              key={current.id}
              session={session}
              question={current}
              index={questions.indexOf(current)}
              total={targetCount}
              isLast={answered.length + 1 >= targetCount}
              onNext={advance}
            />
          ) : (
            <PageLoader label="Preparing questions…" />
          )}
          {answered.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow">Conversation so far</p>
              {answered.map((q) => <ConversationCard key={q.id} q={q} avatar={avatar} />)}
            </div>
          )}
        </>
      ) : (
        <div className="card p-5 text-[13px] text-muted-foreground">This interview was discarded.</div>
      )}

      <Modal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard this interview?"
        description="The session is archived without a score, and its questions will not count as practice."
        size="sm"
        footer={(
          <>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)}>Keep going</Button>
            <Button variant="destructive" onClick={() => abandonMutation.mutate()} loading={abandonMutation.isLoading}>Discard</Button>
          </>
        )}
      />
    </div>
  );
};

export default PracticeSession;
