import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  Check,
  ChevronRight,
  ClipboardList,
  FileText,
  Mic,
  Search,
  ShieldCheck,
  Video,
  X,
} from 'lucide-react';
import { practiceAdmin } from '@/lib/api';
import { AdminInterviewSession, PracticeUpgradeRequest } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { FALLBACK_AVATARS } from '@/components/interview/roster';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

type Tab = 'upgrades' | 'interviews';
type SessionStatus = 'all' | 'in_progress' | 'completed' | 'abandoned';

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  in_progress: 'In progress',
  abandoned: 'Discarded',
};

const avatarName = (id: string) => FALLBACK_AVATARS.find((avatar) => avatar.id === id)?.name || id || 'Interviewer';

function scoreClass(score: number | null | undefined): string {
  if (score == null) return 'border-border bg-muted text-muted-foreground';
  if (score >= 80) return 'border-success/25 bg-success-soft text-success';
  if (score >= 55) return 'border-warning/25 bg-warning-soft text-warning';
  return 'border-destructive/25 bg-destructive-soft text-destructive';
}

/* ------------------------------ upgrade requests ------------------------------ */

const RequestCard = ({ request, busy }: { request: PracticeUpgradeRequest; busy: boolean }) => {
  const client = useQueryClient();
  const { toast } = useToast();

  const approve = useMutation(() => practiceAdmin.approve(request.id), {
    onSuccess: () => {
      client.invalidateQueries('practice-admin-upgrades');
      toast({ title: 'Pro granted', description: `${request.user_email} now has unlimited practice.`, variant: 'success' });
    },
    onError: (err: Error) => toast({ title: 'Decision not saved', description: err.message, variant: 'error' }),
  });

  const reject = useMutation(() => practiceAdmin.reject(request.id), {
    onSuccess: () => {
      client.invalidateQueries('practice-admin-upgrades');
      toast({ title: 'Request rejected', description: `${request.user_email} stays on the free plan.`, variant: 'info' });
    },
    onError: (err: Error) => toast({ title: 'Decision not saved', description: err.message, variant: 'error' }),
  });

  return (
    <article className="card p-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">Pending</Badge>
            {request.current_plan && <Badge variant="outline">on {request.current_plan}</Badge>}
            <span className="font-mono text-[11px] text-muted-foreground">{formatDateTime(request.created_at)}</span>
          </div>
          <p className="mt-2 truncate text-[13.5px] font-medium text-foreground">{request.user_email}</p>
          {request.note && <p className="mt-1 max-w-phi-body text-[13px] leading-relaxed text-muted-foreground">{request.note}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="success" size="sm" disabled={busy} loading={approve.isLoading} onClick={() => approve.mutate()}>
            <Check className="h-3.5 w-3.5" />Approve Pro
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            loading={reject.isLoading}
            onClick={() => reject.mutate()}
            className="border-destructive/30 text-destructive hover:bg-destructive-soft hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />Reject
          </Button>
        </div>
      </div>
    </article>
  );
};

const UpgradeRequests = () => {
  const client = useQueryClient();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'free' | 'pro'>('pro');
  const [days, setDays] = useState('');

  const { data, isLoading } = useQuery('practice-admin-upgrades', () => practiceAdmin.upgrades('pending'));
  const requests = data?.requests || [];

  const grant = useMutation(
    () => practiceAdmin.grant({
      email: email.trim().toLowerCase(),
      plan,
      expires_in_days: plan === 'pro' && days ? Number(days) : undefined,
    }),
    {
      onSuccess: (res) => {
        client.invalidateQueries('practice-admin-upgrades');
        toast({
          title: `${res.plan === 'pro' ? 'Pro' : 'Free'} access granted`,
          description: res.expires_at ? `Expires ${formatDateTime(res.expires_at)}` : 'Open-ended access.',
          variant: 'success',
        });
        setEmail('');
        setDays('');
      },
      onError: (err: Error) => toast({ title: 'Grant failed', description: err.message, variant: 'error' }),
    },
  );

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <p className="eyebrow">Direct grant</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem_9rem_auto] sm:items-end">
          <div className="space-y-1.5">
            <label htmlFor="grant-email" className="text-[12.5px] font-medium text-foreground">Candidate email</label>
            <Input id="grant-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="candidate@example.com" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="grant-plan" className="text-[12.5px] font-medium text-foreground">Plan</label>
            <Select id="grant-plan" value={plan} onChange={(e) => setPlan(e.target.value as typeof plan)}>
              <option value="pro">Pro — unlimited</option>
              <option value="free">Free — reset quota</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="grant-days" className="text-[12.5px] font-medium text-foreground">Days <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input id="grant-days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} disabled={plan !== 'pro'} placeholder="open-ended" />
          </div>
          <Button onClick={() => grant.mutate()} loading={grant.isLoading} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())}>
            <ShieldCheck className="h-4 w-4" />Grant access
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="card space-y-3 p-5">
          {Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-20 w-full" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="card px-6">
          <EmptyState className="py-10" icon={Mic} title="No pending upgrade requests" description="When candidates request Pro, the review queue appears here." />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="eyebrow">Pending requests ({requests.length})</p>
          {requests.map((request) => <RequestCard key={request.id} request={request} busy={grant.isLoading} />)}
        </div>
      )}
    </div>
  );
};

/* ------------------------------ interview answers ------------------------------ */

const InterviewDetail = ({ id }: { id: string }) => {
  const { data, isLoading } = useQuery(['practice-admin-session', id], () => practiceAdmin.session(id));

  if (isLoading) return <PageLoader label="Loading transcript…" />;
  if (!data) return <p className="text-[13px] text-destructive">This interview could not be loaded.</p>;

  const { session, candidate, questions } = data;
  const report = session.report;
  const presentation = session.presentation;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/35 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={session.status === 'completed' ? 'success' : session.status === 'in_progress' ? 'signal' : 'outline'}>
            {STATUS_LABEL[session.status] || session.status}
          </Badge>
          <span className="text-[13px] font-medium text-foreground">{candidate.email}</span>
          {session.overall_score != null && (
            <span className={cn('ml-auto grid h-8 min-w-8 place-items-center rounded-lg border px-1.5 font-mono text-[12px] font-semibold tabular-nums', scoreClass(session.overall_score))}>
              {session.overall_score}
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">
          {session.role_focus}
          {session.job_title ? ` · ${session.job_title}${session.job_company ? ` at ${session.job_company}` : ''}` : ''}
          {' · '}{avatarName(session.avatar_id)}
          {' · '}{formatDateTime(session.started_at)}
        </p>
        {session.verdict && <p className="mt-1 text-[12px] text-foreground/80">{session.verdict}</p>}
      </div>

      {report?.dimensions?.length ? (
        <div className="rounded-lg border border-border p-3.5">
          <p className="eyebrow flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Report dimensions</p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {report.dimensions.map((dimension) => (
              <div key={dimension.key} className="rounded-md border border-border bg-surface px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">{dimension.label}</span>
                  <span className="font-mono text-[12px] font-semibold tabular-nums">{dimension.score}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{dimension.note}</p>
              </div>
            ))}
          </div>
          {report.mistakes?.length ? (
            <div className="mt-3 border-t border-border pt-2.5">
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-destructive">Mistakes flagged</p>
              <ul className="mt-1.5 space-y-1">
                {report.mistakes.map((mistake, i) => (
                  <li key={i} className="text-[11.5px] leading-relaxed text-foreground/80">
                    <span className="font-mono text-[10px] text-muted-foreground">{mistake.score} · </span>
                    {mistake.mistake}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {presentation ? (
        <div className="rounded-lg border border-border p-3.5">
          <p className="eyebrow flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Camera review</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-foreground/85">
            {presentation.available
              ? `Presence ${presentation.score ?? '–'}/100 — ${presentation.summary}`
              : presentation.summary}
          </p>
          {presentation.available && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
              Dress: {presentation.dress} · Expression: {presentation.expression}
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-2.5">
        <p className="eyebrow">Transcript ({questions.filter((question) => question.answered_at).length}/{questions.length} answered)</p>
        {questions.map((question, index) => (
          <article key={question.id} className="rounded-lg border border-border bg-surface p-3.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Q{index + 1}</span>
              <Badge variant="muted">{question.category}</Badge>
              {question.topic && <Badge variant="outline">{question.topic}</Badge>}
              <span className={cn('ml-auto grid h-7 min-w-7 place-items-center rounded-md border px-1 font-mono text-[11px] font-semibold tabular-nums', scoreClass(question.score))}>
                {question.score ?? '–'}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] font-medium leading-relaxed text-foreground">{question.question}</p>
            <div className="mt-2 rounded-md bg-muted/50 px-2.5 py-2">
              <p className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-muted-foreground">Candidate answer</p>
              <p className={cn('mt-1 whitespace-pre-wrap text-[12px] leading-relaxed', question.answer ? 'text-foreground/90' : 'italic text-muted-foreground')}>
                {question.answer || 'Not answered.'}
              </p>
            </div>
            {question.interviewer_reply && (
              <p className="mt-2 border-l-2 border-signal/40 pl-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
                <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-signal">Interviewer: </span>
                {question.interviewer_reply}
              </p>
            )}
            {question.feedback && (question.feedback.strengths.length > 0 || question.feedback.improvements.length > 0) && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {question.feedback.strengths.length > 0 && (
                  <div>
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-success">Strong</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {question.feedback.strengths.map((strength, i) => (
                        <li key={i} className="text-[11px] leading-relaxed text-foreground/80">· {strength}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {question.feedback.improvements.length > 0 && (
                  <div>
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-warning">Improve</p>
                    <ul className="mt-0.5 space-y-0.5">
                      {question.feedback.improvements.map((improvement, i) => (
                        <li key={i} className="text-[11px] leading-relaxed text-foreground/80">· {improvement}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
};

const InterviewAnswers = () => {
  const [status, setStatus] = useState<SessionStatus>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery(
    ['practice-admin-sessions', status, query],
    () => practiceAdmin.sessions({ status, search: query || undefined, limit: 50 }),
    { keepPreviousData: true },
  );
  const sessions = data?.sessions || [];

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <label htmlFor="interview-status" className="text-[12.5px] font-medium text-foreground">Status</label>
            <Select id="interview-status" value={status} onChange={(e) => setStatus(e.target.value as SessionStatus)}>
              <option value="all">All interviews</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In progress</option>
              <option value="abandoned">Discarded</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="interview-search" className="text-[12.5px] font-medium text-foreground">Search</label>
            <Input
              id="interview-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setQuery(search.trim()); }}
              placeholder="Candidate email, role, company or interviewer id"
            />
          </div>
          <Button variant="outline" onClick={() => setQuery(search.trim())}>
            <Search className="h-4 w-4" />Search
          </Button>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          {data ? `${data.total} interview${data.total === 1 ? '' : 's'} found` : 'Loading interviews…'}
        </p>
      </div>

      {isLoading && sessions.length === 0 ? (
        <div className="card space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="card px-6">
          <EmptyState
            className="py-10"
            icon={ClipboardList}
            title="No interviews match this view"
            description="Candidate transcripts appear here as soon as they start a practice round."
          />
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session: AdminInterviewSession) => (
            <button
              key={session.id}
              type="button"
              onClick={() => setSelected(session.id)}
              className="card flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:border-border-strong hover:bg-accent/40"
            >
              <span className={cn('grid h-9 min-w-9 shrink-0 place-items-center rounded-lg border px-1 font-mono text-[12px] font-semibold tabular-nums', scoreClass(session.overall_score))}>
                {session.overall_score ?? '–'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-[13px] font-medium text-foreground">{session.user_email}</p>
                  <Badge variant={session.status === 'completed' ? 'success' : session.status === 'in_progress' ? 'signal' : 'outline'}>
                    {STATUS_LABEL[session.status] || session.status}
                  </Badge>
                  {session.has_report && <Badge variant="outline"><FileText className="h-2.5 w-2.5" /> Report</Badge>}
                  {session.camera_review && <Badge variant="outline"><Video className="h-2.5 w-2.5" /> Camera</Badge>}
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                  {session.role_focus}
                  {session.job_company ? ` · ${session.job_company}` : ''}
                  {' · '}{avatarName(session.avatar_id)}
                  {' · '}{session.answered_count}/{session.question_total} answered
                  {' · '}{formatDateTime(session.started_at)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Interview transcript"
        description="Read-only view of the candidate's answers, interviewer reactions and end-of-round report."
        size="lg"
      >
        {selected && <InterviewDetail id={selected} />}
      </Modal>
    </div>
  );
};

/* ---------------------------------- page ---------------------------------- */

const AdminPractice: React.FC = () => {
  const [tab, setTab] = useState<Tab>('upgrades');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Interview practice"
        description="Approve upgrade requests, grant Pro directly, and review every candidate interview answer."
      />

      <div className="flex w-fit gap-1 rounded-lg border border-border bg-muted/50 p-1" role="tablist" aria-label="Practice admin views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'upgrades'}
          onClick={() => setTab('upgrades')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
            tab === 'upgrades' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" /> Upgrade requests
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'interviews'}
          onClick={() => setTab('interviews')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors',
            tab === 'interviews' ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <ClipboardList className="h-3.5 w-3.5" /> Interview answers
        </button>
      </div>

      {tab === 'upgrades' ? <UpgradeRequests /> : <InterviewAnswers />}
    </div>
  );
};

export default AdminPractice;
