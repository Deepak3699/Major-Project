import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from 'react-query';
import { ChevronRight, GraduationCap, Mic, Plus, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { candidate, practice } from '@/lib/api';
import { PracticeSessionSummary, PracticeSubscription } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoader } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

const DIFFICULTY_LABEL: Record<string, string> = { calm: 'Calm', standard: 'Standard', brutal: 'Stress' };
const DIFFICULTY_TONE: Record<string, 'info' | 'muted' | 'warning'> = { calm: 'info', standard: 'muted', brutal: 'warning' };

function scoreTone(score: number | null): 'success' | 'warning' | 'danger' | 'muted' {
  if (score == null) return 'muted';
  if (score >= 80) return 'success';
  if (score >= 55) return 'warning';
  return 'danger';
}

const StartDialog = (
  props: {
    open: boolean;
    onClose: () => void;
    subscription: PracticeSubscription | undefined;
    defaultRole: string;
    onUpgradeNeeded: () => void;
  },
) => {
  const { open, onClose, subscription, defaultRole, onUpgradeNeeded } = props;
  const navigate = useNavigate();
  const [role, setRole] = useState(defaultRole);
  const [difficulty, setDifficulty] = useState<'calm' | 'standard' | 'brutal'>('standard');
  const [count, setCount] = useState(6);
  const [starting, setStarting] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => { if (open) setRole(defaultRole); }, [open, defaultRole]);

  const quotaExhausted = !!subscription && !subscription.unlimited
    && subscription.monthly_limit != null && subscription.used_this_month >= subscription.monthly_limit;

  const start = async () => {
    if (quotaExhausted) { onUpgradeNeeded(); return; }
    setStarting(true);
    try {
      const res = await practice.createSession({ role_focus: role.trim() || undefined, difficulty, question_count: count });
      onClose();
      navigate(`/practice/session/${res.session.id}`);
    } catch (err) {
      onClose();
      onUpgradeNeeded();
      toast({ title: 'Session not started', description: (err as Error).message, variant: 'error' });
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set up the interview"
      description="Pick the role, the pressure, and how long it should run. Questions adapt to your saved profile."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={start} loading={starting}>Begin {count} questions</Button>
        </>
      )}
    >
      <div className="space-y-4">
        {quotaExhausted && (
          <div className="rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3 text-[13px] leading-relaxed text-warning">
            Free plan quota for this month is spent. Starting now opens the Pro upgrade request instead.
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="practice-role" className="text-[12.5px] font-medium text-foreground">Target role</label>
          <Input id="practice-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Frontend Developer" maxLength={120} />
          <p className="text-[12px] text-muted-foreground">Defaults to the first preferred role saved on your profile.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="practice-difficulty" className="text-[12.5px] font-medium text-foreground">Difficulty</label>
            <Select id="practice-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}>
              <option value="calm">Calm — warm-up pacing</option>
              <option value="standard">Standard — typical interview</option>
              <option value="brutal">Stress — follow-up pressure</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="practice-count" className="text-[12.5px] font-medium text-foreground">Questions</label>
            <Select id="practice-count" value={String(count)} onChange={(e) => setCount(Number(e.target.value))}>
              <option value="4">4 — quick round</option>
              <option value="6">6 — standard round</option>
              <option value="8">8 — full round</option>
            </Select>
          </div>
        </div>
        {subscription && !subscription.unlimited && subscription.monthly_limit != null && !quotaExhausted && (
          <p className="text-[12px] text-muted-foreground">
            {Math.max(0, subscription.monthly_limit - subscription.used_this_month)} of {subscription.monthly_limit} free sessions left this month.
          </p>
        )}
      </div>
    </Modal>
  );
};

const UpgradeDialog = (
  props: {
    open: boolean;
    onClose: () => void;
    subscription: PracticeSubscription | undefined;
  },
) => {
  const { open, onClose, subscription } = props;
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    if (open) { setNote(''); setSent(!!subscription?.requested_upgrade); }
  }, [open, subscription?.requested_upgrade]);

  const submit = async () => {
    setSending(true);
    try {
      await practice.upgradeRequest(note.trim() || undefined);
      setSent(true);
      queryClient.invalidateQueries('practice-subscription');
    } catch (err) {
      toast({ title: 'Request not sent', description: (err as Error).message, variant: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request Pro access"
      description="An administrator reviews upgrade requests. Pro removes the monthly interview cap."
      size="md"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {!sent && <Button onClick={submit} loading={sending}>Send request</Button>}
        </>
      )}
    >
      <div className="space-y-4">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border font-mono text-[12px] tabular-nums">
          <div className="bg-surface py-3.5 pl-4">
            <dt className="eyebrow font-sans">Current plan</dt>
            <dd className="mt-1 text-[15px] font-semibold capitalize text-foreground">{subscription?.plan || 'free'}</dd>
          </div>
          <div className="bg-surface py-3.5 pl-4">
            <dt className="eyebrow font-sans">Sessions used</dt>
            <dd className="mt-1 text-[15px] font-semibold text-foreground">
              {subscription?.unlimited ? 'unlimited' : `${subscription?.used_this_month ?? 0} / ${subscription?.monthly_limit ?? '—'}`}
            </dd>
          </div>
        </dl>
        {sent ? (
          <div className="rounded-lg border border-success/25 bg-success-soft px-3.5 py-3 text-[13px] leading-relaxed text-success">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Request is with the review team.</div>
            <p className="mt-1 text-[12.5px] text-foreground/80">You will keep the free quota meanwhile; learning tracks stay open on every plan.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <label htmlFor="upgrade-note" className="text-[12.5px] font-medium text-foreground">Note for the reviewer <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Textarea
              id="upgrade-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mention the deadline you are preparing for."
              maxLength={500}
              rows={3}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

const SessionRow = ({ session, i }: { session: PracticeSessionSummary; i: number }) => {
  const tone = scoreTone(session.overall_score);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.05, 0.25) }}>
      <Link
        to={`/practice/session/${session.id}`}
        className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-accent/60"
      >
        <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg border font-mono text-[12px] font-semibold tabular-nums', {
          'border-border bg-muted text-muted-foreground': session.overall_score == null,
          'border-success/25 bg-success-soft text-success': tone === 'success',
          'border-warning/25 bg-warning-soft text-warning': tone === 'warning',
          'border-destructive/25 bg-destructive-soft text-destructive': tone === 'danger',
        })}>
          {session.overall_score ?? '–'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-foreground">{session.role_focus}</p>
          <p className="truncate font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {session.status === 'completed' ? formatDateTime(session.completed_at) : formatDateTime(session.started_at)}
            {' · '}{session.question_count} questions{session.answered_count != null ? ` · ${session.answered_count} answered` : ''}
          </p>
        </div>
        <Badge variant={DIFFICULTY_TONE[session.difficulty] || 'muted'}>{DIFFICULTY_LABEL[session.difficulty] || session.difficulty}</Badge>
        <Badge variant={session.status === 'completed' ? 'success' : session.status === 'in_progress' ? 'signal' : 'outline'}>
          {session.status === 'completed' ? 'Scored' : session.status === 'in_progress' ? 'In progress' : 'Archived'}
        </Badge>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover:opacity-100" />
      </Link>
    </motion.div>
  );
};

const Practice: React.FC = () => {
  const [startOpen, setStartOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { data: subData, isLoading: subLoading } = useQuery('practice-subscription', practice.subscription);
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery('practice-sessions', practice.sessions);
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { staleTime: 60_000 });

  const subscription = subData?.subscription;
  const sessions = sessionsData?.sessions || [];
  const activeSession = sessions.find((s) => s.status === 'in_progress');
  const completed = sessions.filter((s) => s.status === 'completed');
  const lastScore = completed[0]?.overall_score ?? null;
  const bestScore = completed.reduce<number | null>((best, s) => (best == null || (s.overall_score ?? 0) > best ? s.overall_score : best), null);
  const defaultRole = profileData?.profile?.preferred_roles?.[0] || '';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Interview practice"
        description="Mock interviews graded question by question, and a learning plan that tracks the gap between your profile and the role."
        actions={
          <>
            <Button variant="outline" asChild><Link to="/learning"><GraduationCap className="h-4 w-4" />Learning tracks</Link></Button>
            <Button onClick={() => (subscription && !subscription.unlimited && subscription.monthly_limit != null && subscription.used_this_month >= subscription.monthly_limit ? setUpgradeOpen(true) : setStartOpen(true))}>
              <Plus className="h-4 w-4" />New session
            </Button>
          </>
        }
      />

      <StatCardGrid loading={subLoading}>
        <StatCard icon={ShieldCheck} label="Plan" value={subscription ? (subscription.plan === 'pro' ? 'Pro' : 'Free') : null} hint={subscription?.unlimited ? 'Unlimited interviews' : 'Monthly interview quota'} />
        <StatCard
          icon={Mic}
          label="This month"
          value={subscription ? (subscription.unlimited
            ? sessions.filter((s) => s.started_at && new Date(s.started_at).getMonth() === new Date().getMonth()).length
            : subscription.used_this_month) : null}
          hint={subscription && !subscription.unlimited && subscription.monthly_limit != null ? `of ${subscription.monthly_limit} allowed` : 'unlimited on Pro'}
        />
        <StatCard icon={ScrollText} label="Latest score" value={lastScore ?? '—'} tone={scoreTone(lastScore)} hint={completed[0]?.verdict || undefined} />
        <StatCard icon={Users} label="Interviews completed" value={completed.length} hint={bestScore != null ? `best ${bestScore}/100` : 'no scored rounds yet'} />
      </StatCardGrid>

      {activeSession && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
          <Link
            to={`/practice/session/${activeSession.id}`}
            className="group flex items-center gap-3 rounded-lg border border-signal/40 bg-signal-soft px-4 py-3 transition-colors hover:border-signal/70"
          >
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-signal" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-foreground">{activeSession.role_focus} interview is open</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {activeSession.answered_count ?? 0}/{activeSession.question_count} answered · started {formatDateTime(activeSession.started_at)}
              </p>
            </div>
            <span className="text-[13px] font-medium text-foreground underline-offset-4 group-hover:underline decoration-signal">Resume</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </motion.div>
      )}

      {sessionsLoading ? (
        <div className="card space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 w-full" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="card px-6">
          <EmptyState
            icon={Mic}
            title="No interview practice yet"
            description="The first session sets the baseline: a small set of questions from your profile, graded as a real interviewer would."
            action={<Button className="mt-2" onClick={() => setStartOpen(true)}><Plus className="h-4 w-4" />Start the first session</Button>}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="eyebrow">Session log</p>
          {sessions.map((s, i) => <SessionRow key={s.id} session={s} i={i} />)}
        </div>
      )}

      <StartDialog open={startOpen} onClose={() => setStartOpen(false)} subscription={subscription} defaultRole={defaultRole} onUpgradeNeeded={() => setUpgradeOpen(true)} />
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} subscription={subscription} />
    </div>
  );
};

export default Practice;
