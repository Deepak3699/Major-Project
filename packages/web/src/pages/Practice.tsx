import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useQueryClient } from 'react-query';
import {
  Briefcase,
  ChevronRight,
  GraduationCap,
  Mic,
  Plus,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { candidate, practice } from '@/lib/api';
import { CandidateJob, PracticeDifficulty, PracticeSessionSummary, PracticeSubscription } from '@/lib/types';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { AvatarPortrait } from '@/components/interview/AvatarPortrait';
import { InterviewerDeck } from '@/components/interview/InterviewerDeck';
import { FALLBACK_AVATARS } from '@/components/interview/roster';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

const DIFFICULTY_LABEL: Record<string, string> = { calm: 'Calm', standard: 'Standard', brutal: 'Stress' };
const DIFFICULTY_TONE: Record<string, 'info' | 'muted' | 'warning'> = { calm: 'info', standard: 'muted', brutal: 'warning' };

const DIFFICULTY_OPTIONS: Array<{ value: PracticeDifficulty; label: string; hint: string }> = [
  { value: 'calm', label: 'Calm', hint: 'Warm-up pacing' },
  { value: 'standard', label: 'Standard', hint: 'Typical interview' },
  { value: 'brutal', label: 'Stress', hint: 'Follow-up pressure' },
];

interface JobOption {
  id: string;
  title: string;
  company: string;
  skills?: string[];
}

function scoreTone(score: number | null): 'success' | 'warning' | 'danger' | 'muted' {
  if (score == null) return 'muted';
  if (score >= 80) return 'success';
  if (score >= 55) return 'warning';
  return 'danger';
}

const UpgradeDialog = ({
  open,
  onClose,
  subscription,
}: {
  open: boolean;
  onClose: () => void;
  subscription: PracticeSubscription | undefined;
}) => {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
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
          <p className="truncate text-[13.5px] font-medium text-foreground">
            {session.role_focus}
            {session.job?.company ? <span className="font-normal text-muted-foreground"> · {session.job.company}</span> : null}
          </p>
          <p className="truncate font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {session.avatar?.name ? `${session.avatar.name} · ` : ''}
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const studioRef = useRef<HTMLDivElement>(null);
  const [jobId, setJobId] = useState(searchParams.get('job') || '');
  const [role, setRole] = useState('');
  const [avatarId, setAvatarId] = useState('');
  const [avatarTouched, setAvatarTouched] = useState(false);
  const [difficulty, setDifficulty] = useState<PracticeDifficulty>('standard');
  const [count, setCount] = useState(6);
  const [starting, setStarting] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: subData, isLoading: subLoading } = useQuery('practice-subscription', practice.subscription);
  const { data: sessionsData, isLoading: sessionsLoading } = useQuery('practice-sessions', practice.sessions);
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { staleTime: 60_000 });
  const { data: jobsData } = useQuery(
    'practice-jobs',
    () => candidate.jobs({ days: 90, limit: 50, sort: 'trust' }),
    { staleTime: 5 * 60_000 },
  );
  const { data: appsData } = useQuery('candidate-applications', candidate.applications, { staleTime: 60_000 });
  const { data: avatarData } = useQuery(
    ['practice-avatars', jobId],
    () => practice.avatars(jobId || undefined),
    { staleTime: 60_000, keepPreviousData: true },
  );

  const subscription = subData?.subscription;
  const sessions = sessionsData?.sessions || [];
  const activeSession = sessions.find((s) => s.status === 'in_progress');
  const completed = sessions.filter((s) => s.status === 'completed');
  const lastScore = completed[0]?.overall_score ?? null;
  const bestScore = completed.reduce<number | null>((best, s) => (best == null || (s.overall_score ?? 0) > best ? s.overall_score : best), null);
  const defaultRole = profileData?.profile?.preferred_roles?.[0] || '';

  useEffect(() => {
    if (!role) setRole(defaultRole);
  }, [defaultRole]);

  const savedJobOptions = useMemo<JobOption[]>(() => {
    const apps = appsData?.data || [];
    return apps
      .filter((app) => app.status === 'SAVED')
      .map((app) => ({ id: app.job_id, title: app.job_title, company: app.company_name, skills: app.skills }));
  }, [appsData]);

  const jobOptions = useMemo<JobOption[]>(() => {
    const seen = new Set<string>();
    const out: JobOption[] = [];
    const add = (option: JobOption) => {
      if (!option.id || seen.has(option.id)) return;
      seen.add(option.id);
      out.push(option);
    };
    savedJobOptions.forEach(add);
    ((jobsData?.data || []) as CandidateJob[]).forEach((job) => add({ id: job.id, title: job.title, company: job.company_name, skills: job.skills }));
    if (jobId && avatarData?.job && !seen.has(jobId)) {
      add({ id: avatarData.job.id, title: avatarData.job.title, company: avatarData.job.company, skills: avatarData.job.skills });
    }
    return out;
  }, [savedJobOptions, jobsData, jobId, avatarData]);

  const selectedJob = jobOptions.find((job) => job.id === jobId) || null;
  const selectedJobSkills = selectedJob?.skills?.length ? selectedJob.skills : (avatarData?.job?.skills || []);
  const savedIds = new Set(savedJobOptions.map((job) => job.id));
  const otherJobOptions = jobOptions.filter((job) => !savedIds.has(job.id));
  const recommendedId = avatarData?.recommended?.avatar_id;
  const avatars = avatarData?.avatars?.length ? avatarData.avatars : FALLBACK_AVATARS;
  // Apply the recommendation as soon as it arrives rather than waiting for a
  // state effect; this keeps the start button and the deck in sync on first paint.
  const selectedAvatarId = !avatarTouched && recommendedId ? recommendedId : avatarId;
  const activeAvatar = avatars.find((avatar) => avatar.id === selectedAvatarId) || avatars[0];

  useEffect(() => {
    if (recommendedId && !avatarTouched) setAvatarId(recommendedId);
  }, [recommendedId, avatarTouched]);

  useEffect(() => {
    if (!avatarId && avatars[0]) setAvatarId(avatars[0].id);
  }, [avatarId, avatars]);

  const quotaExhausted = !!subscription && !subscription.unlimited
    && subscription.monthly_limit != null && subscription.used_this_month >= subscription.monthly_limit;

  const changeJob = (next: string) => {
    setJobId(next);
    setAvatarTouched(false);
    if (!next) setRole(defaultRole);
  };

  const start = async () => {
    if (quotaExhausted) { setUpgradeOpen(true); return; }
    setStarting(true);
    try {
      const res = await practice.createSession({
        role_focus: selectedJob?.title || role.trim() || undefined,
        difficulty,
        question_count: count,
        avatar_id: selectedAvatarId || activeAvatar.id,
        job_id: jobId || undefined,
      });
      await queryClient.invalidateQueries('practice-sessions');
      navigate(`/practice/session/${res.session.id}`);
    } catch (err) {
      if ((err as any)?.response?.status === 402) setUpgradeOpen(true);
      toast({ title: 'Session not started', description: (err as Error).message, variant: 'error' });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="relative overflow-hidden rounded-2xl border border-border bg-grad-surface p-6 sm:p-7"
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.10),transparent_55%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow flex items-center gap-1.5 text-signal"><Sparkles className="h-3.5 w-3.5" /> AI interview studio</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[38px]">
              Practise with an interviewer who fits the job.
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              Six interviewers, six rooms. Swipe the deck and the studio recommends the best fit for your job.
              The round follows your answers in proper English and reviews your camera presence at the end.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <Mic className="h-4 w-4" /> Set up an interview
              </Button>
              <Button variant="outline" asChild><Link to="/learning"><GraduationCap className="h-4 w-4" />Learning tracks</Link></Button>
            </div>
          </div>

          <div className="hidden shrink-0 items-end sm:flex">
            {avatars.slice(0, 5).map((avatar, index) => (
              <AvatarPortrait
                key={avatar.id}
                avatarId={avatar.id}
                name={avatar.name}
                title={avatar.title}
                state="idle"
                animated={false}
                showNameplate={false}
                fit="cover"
                className={cn(
                  'h-[112px] w-[86px] border-2 border-background shadow-lg',
                  index > 0 && '-ml-5',
                  index % 2 === 0 ? 'rotate-[-3deg]' : 'rotate-[2deg]',
                )}
              />
            ))}
          </div>
        </div>
      </motion.section>

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
              <p className="text-[13.5px] font-semibold text-foreground">
                {activeSession.role_focus} interview is open
                {activeSession.avatar?.name ? <span className="font-normal text-muted-foreground"> with {activeSession.avatar.name}</span> : null}
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {activeSession.answered_count ?? 0}/{activeSession.question_count} answered · started {formatDateTime(activeSession.started_at)}
              </p>
            </div>
            <span className="text-[13px] font-medium text-foreground underline-offset-4 group-hover:underline decoration-signal">Resume</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        </motion.div>
      )}

      <section ref={studioRef} id="studio" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
        <div className="card h-fit space-y-5 p-5">
          <div>
            <p className="eyebrow flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> The job</p>
            <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.02em] text-foreground">What are you preparing for?</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Saved jobs come first. The interviewer is recommended from the job title, skills and description.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="practice-job" className="text-[12.5px] font-medium text-foreground">Job</label>
            <Select id="practice-job" value={jobId} onChange={(e) => changeJob(e.target.value)}>
              <option value="">No specific job — use my target role</option>
              {savedJobOptions.length > 0 && (
                <optgroup label="Saved jobs">
                  {savedJobOptions.map((job) => (
                    <option key={job.id} value={job.id}>{job.title}{job.company ? ` — ${job.company}` : ''}</option>
                  ))}
                </optgroup>
              )}
              {otherJobOptions.length > 0 && (
                <optgroup label={jobId && !savedIds.has(jobId) ? 'Selected job' : 'Fresh jobs'}>
                  {otherJobOptions.map((job) => (
                    <option key={job.id} value={job.id}>{job.title}{job.company ? ` — ${job.company}` : ''}</option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>

          {selectedJob ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-[12.5px] font-medium text-foreground">{selectedJob.title}</p>
              <p className="text-[11.5px] text-muted-foreground">{selectedJob.company || 'Company not listed'}</p>
              {selectedJobSkills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedJobSkills.slice(0, 6).map((skill) => (
                    <span key={skill} className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10.5px] text-muted-foreground">{skill}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="practice-role" className="text-[12.5px] font-medium text-foreground">Target role</label>
              <Input id="practice-role" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Frontend Developer" maxLength={120} />
              <p className="text-[11.5px] text-muted-foreground">Defaults to the first preferred role saved on your profile.</p>
            </div>
          )}

          {jobId && avatarData?.recommended && (
            <div className="rounded-lg border border-signal/30 bg-signal-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-signal" /> {avatarData.recommended.name} recommended
              </p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-foreground/75">{avatarData.recommended.reason}</p>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[12.5px] font-medium text-foreground">Difficulty</p>
            <div className="grid grid-cols-3 gap-1.5">
              {DIFFICULTY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDifficulty(option.value)}
                  aria-pressed={difficulty === option.value}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-left transition-colors',
                    difficulty === option.value
                      ? 'border-signal/60 bg-signal-soft text-foreground'
                      : 'border-border bg-surface text-muted-foreground hover:bg-accent',
                  )}
                >
                  <span className="block text-[12px] font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-tight opacity-70">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[12.5px] font-medium text-foreground">Length</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[4, 6, 8].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCount(value)}
                  aria-pressed={count === value}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-center transition-colors',
                    count === value
                      ? 'border-signal/60 bg-signal-soft text-foreground'
                      : 'border-border bg-surface text-muted-foreground hover:bg-accent',
                  )}
                >
                  <span className="block text-[12px] font-medium">{value} questions</span>
                  <span className="mt-0.5 block text-[10px] opacity-70">{value === 4 ? 'Quick round' : value === 6 ? 'Standard' : 'Full round'}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            {quotaExhausted && (
              <p className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[12px] leading-relaxed text-warning">
                Free quota is spent for this month. Starting now opens the Pro upgrade request.
              </p>
            )}
            {subscription && !subscription.unlimited && subscription.monthly_limit != null && !quotaExhausted && (
              <p className="text-[11.5px] text-muted-foreground">
                {Math.max(0, subscription.monthly_limit - subscription.used_this_month)} of {subscription.monthly_limit} free sessions left this month.
              </p>
            )}
            <Button className="w-full" onClick={start} loading={starting}>
              <Mic className="h-4 w-4" />
              {activeAvatar ? `Start with ${activeAvatar.name.split(' ')[0]}` : 'Start interview'}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Spoken in proper Indian English. Camera feedback is optional and processed only for your review.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="eyebrow">Choose your interviewer</p>
              <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-foreground">Swipe the deck. Pick your room.</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">Each card is a different interviewer with their own voice, pace and pressure.</p>
            </div>
            {avatarData?.recommended && (
              <Badge variant="signal"><Sparkles className="h-3 w-3" /> Best fit: {avatarData.recommended.name.split(' ')[0]}</Badge>
            )}
          </div>

          <InterviewerDeck
            avatars={avatars}
            activeId={selectedAvatarId || activeAvatar.id}
            recommendedId={recommendedId}
            reason={avatarData?.recommended?.reason}
            onSelect={(id) => { setAvatarId(id); setAvatarTouched(true); }}
          />

          {!avatarData && (
            <p className="text-[11.5px] text-muted-foreground">
              Showing the default roster while the recommendation service loads.
            </p>
          )}
        </div>
      </section>

      {sessionsLoading ? (
        <div className="card space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 w-full" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="card px-6">
          <EmptyState
            icon={Mic}
            title="No interview practice yet"
            description="Pick a job and an interviewer above. The first round sets the baseline and the avatar reacts to every answer."
            action={<Button className="mt-2" onClick={() => studioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><Plus className="h-4 w-4" />Set up the first round</Button>}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="eyebrow">Session log</p>
          {sessions.map((s, i) => <SessionRow key={s.id} session={s} i={i} />)}
        </div>
      )}

      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} subscription={subscription} />
    </div>
  );
};

export default Practice;
