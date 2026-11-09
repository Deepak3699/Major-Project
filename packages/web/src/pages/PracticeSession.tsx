import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { ArrowLeft, ArrowRight, Check, Minus, Trash2 } from 'lucide-react';
import { practice } from '@/lib/api';
import { PracticeQuestion, PracticeSessionSummary } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Textarea } from '@/components/ui/textarea';
import { PageLoader } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

const CATEGORY_LABEL: Record<string, string> = {
  intro: 'Background', technical: 'Technical', project: 'Project deep-dive', behavioral: 'Behavioral', case: 'Scenario', general: 'General',
};

const DIFFICULTY_LABEL: Record<string, string> = { calm: 'Calm', standard: 'Standard', brutal: 'Stress' };

function feedbackMeta(feedback: PracticeQuestion['feedback']) {
  if (!feedback) return { cls: 'border-border bg-muted text-muted-foreground' };
  if (feedback.score >= 80) return { cls: 'border-success/25 bg-success-soft text-success' };
  if (feedback.score >= 55) return { cls: 'border-warning/25 bg-warning-soft text-warning' };
  return { cls: 'border-destructive/25 bg-destructive-soft text-destructive' };
}

function scoreClass(score: number | null) {
  if (score == null) return 'border-border bg-muted text-muted-foreground';
  if (score >= 80) return 'border-success/25 bg-success-soft text-success';
  if (score >= 55) return 'border-warning/25 bg-warning-soft text-warning';
  return 'border-destructive/25 bg-destructive-soft text-destructive';
}

/* ------------------------------- shared pieces ------------------------------- */

const SessionBadgeRow = ({ q, score }: { q: PracticeQuestion; score?: boolean }) => (
  <div className="flex items-center gap-2">
    <Badge variant="muted">{CATEGORY_LABEL[q.category] || q.category}</Badge>
    {q.topic && <Badge variant="outline">{q.topic}</Badge>}
    {score !== false && (
      <span className={cn('ml-auto grid h-8 min-h-8 min-w-8 place-items-center rounded-lg border px-1 font-mono text-[12px] font-semibold tabular-nums', feedbackMeta(q.feedback).cls)}>
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

const AnsweredCard = ({ q }: { q: PracticeQuestion }) => (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="card p-5">
    <SessionBadgeRow q={q} />
    <p className="mt-2.5 text-[14px] font-medium leading-relaxed text-foreground">{q.question}</p>
    {q.answer && <p className="mt-2 rounded-lg bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/90">{q.answer}</p>}
    {q.feedback && <FeedbackGrid feedback={q.feedback} />}
  </motion.div>
);

/* ------------------------------- results view ------------------------------- */

const ResultsView = ({ session, byCategory, questions }: {
  session: PracticeSessionSummary;
  byCategory: Record<string, number>;
  questions: PracticeQuestion[];
}) => (
  <div className="space-y-4">
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Session verdict</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="font-mono text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-foreground">
              {session.overall_score ?? '–'}<span className="text-[15px] font-normal text-muted-foreground"> / 100</span>
            </span>
            {session.verdict && <Badge variant={session.overall_score != null && session.overall_score >= 80 ? 'success' : 'muted'}>{session.verdict}</Badge>}
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

    <div className="space-y-3">
      <p className="eyebrow">Answer review</p>
      {questions.map((q, i) => (
        <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.05, 0.3) }}>
          <AnsweredCard q={q} />
        </motion.div>
      ))}
    </div>
  </div>
);

/* ------------------------------- active runner ------------------------------- */

const AnswerPanel = ({ sessionId, question, index, total, isLast, onAnswered, onNext }: {
  sessionId: string;
  question: PracticeQuestion;
  index: number;
  total: number;
  isLast: boolean;
  onAnswered: () => void;
  onNext: () => void;
}) => {
  const [text, setText] = useState('');
  const { toast } = useToast();
  const answerMutation = useMutation(
    (answer: string) => practice.answer(sessionId, { question_id: question.id, answer }),
    {
      onSuccess: onAnswered,
      onError: (err: Error) => toast({ title: 'Answer not saved', description: err.message, variant: 'error' }),
    },
  );

  return (
    <motion.div key={question.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5">
      <div className="flex items-center gap-2">
        <p className="eyebrow">Question {index + 1} of {total}</p>
        <Badge variant="muted">{CATEGORY_LABEL[question.category] || question.category}</Badge>
        {question.topic && <Badge variant="outline">{question.topic}</Badge>}
      </div>
      <p className="mt-3 max-w-phi-body text-[17px] font-medium leading-relaxed tracking-[-0.01em] text-foreground">{question.question}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">Answer in four to six specific sentences — the grader reads only what you write here.</p>

      {!question.feedback ? (
        <div className="mt-4 space-y-3">
          <Textarea
            aria-label={`Your answer to question ${index + 1}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={6000}
            rows={9}
            placeholder="Situation, what you did, and how it turned out."
          />
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{text.trim().length} / 6000</p>
            <Button onClick={() => answerMutation.mutate(text.trim())} loading={answerMutation.isLoading} disabled={text.trim().length < 10}>
              Submit answer
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-center gap-2.5">
            <span className={cn('grid h-9 w-9 place-items-center rounded-lg border font-mono text-[14px] font-semibold tabular-nums', scoreClass(question.score))}>
              {question.score ?? '–'}
            </span>
            <p className="text-[12.5px] text-muted-foreground">Graded from your own answer — the breakdown below explains the score.</p>
          </div>
          <FeedbackGrid feedback={question.feedback} />
          <p className="mt-4 rounded-lg bg-muted px-3.5 py-2.5 text-[13px] leading-relaxed text-foreground/90">{question.answer}</p>
          <div className="mt-4 flex justify-end">
            <Button onClick={onNext}>
              {isLast ? 'Review the full session' : 'Next question'}<ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
};

const FinalizeCard = ({ session, answeredCount, finishing, onFinish }: {
  session: PracticeSessionSummary;
  answeredCount: number;
  finishing: boolean;
  onFinish: () => void;
}) => (
  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="card p-5 text-center">
    <p className="eyebrow">Round complete</p>
    <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
      {answeredCount} of {session.question_count} answers are in for the {DIFFICULTY_LABEL[session.difficulty] || session.difficulty} {session.role_focus} interview.
      Finish to grade the round as a whole.
    </p>
    <Button className="mt-4" onClick={onFinish} loading={finishing}>Score the interview</Button>
  </motion.div>
);

const PracticeSession: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery(
    ['practice-session', id],
    () => practice.session(id),
    { enabled: !!id },
  );

  const finishMutation = useMutation(() => practice.finish(id), {
    onSuccess: () => queryClient.invalidateQueries(['practice-session', id]),
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

  const answered = questions.filter((q) => q.answered_at);
  const pending = questions.filter((q) => !q.answered_at);
  const current = pending[Math.min(cursor, pending.length - 1)];

  return (
    <div className="space-y-4">
      <PageHeader
        title={session.role_focus}
        description={session.status === 'completed'
          ? 'Scored session with the full answer review.'
          : 'Answer one question at a time. Each answer is graded before the next opens.'}
        actions={
          <>
            <Button variant="ghost" asChild><Link to="/practice"><ArrowLeft className="h-4 w-4" />Session log</Link></Button>
            {session.status === 'in_progress' && (
              <Button variant="outline" onClick={() => setDiscardOpen(true)}><Trash2 className="h-4 w-4" />Discard</Button>
            )}
          </>
        }
      />

      {session.status === 'completed' ? (
        <ResultsView session={session} byCategory={byCategory} questions={questions} />
      ) : session.status === 'in_progress' ? (
        <>
          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-signal transition-[width] duration-500" style={{ width: `${(answered.length / Math.max(1, questions.length)) * 100}%` }} aria-hidden />
            </div>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{answered.length}/{questions.length}</span>
          </div>
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
              sessionId={id}
              question={current}
              index={questions.indexOf(current)}
              total={questions.length}
              isLast={pending.length === 1}
              onAnswered={() => { queryClient.invalidateQueries(['practice-session', id]); setCursor(0); }}
              onNext={() => setCursor(0)}
            />
          ) : (
            <PageLoader label="Preparing questions…" />
          )}
          {answered.length > 0 && (
            <div className="space-y-2">
              <p className="eyebrow">Graded so far</p>
              {answered.map((q) => <AnsweredCard key={q.id} q={q} />)}
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
