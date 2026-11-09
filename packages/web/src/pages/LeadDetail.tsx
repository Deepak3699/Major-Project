import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { leads as leadsApi, admin } from '@/lib/api';
import { LeadDetail as LeadDetailType, OutreachDraft } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/spinner';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/ui/toast';
import { useSSE, shouldRefreshLeadDetail } from '@/hooks/useSSE';
import {
  ArrowLeft,
  Sparkles,
  BadgeCheck,
  FileText,
  Send,
  UserPlus,
  User,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Loader2,
  Link2,
  Mail,
  Globe,
} from 'lucide-react';
import {
  SCORE_BAND_META,
  stageMeta,
  emailStatusMeta,
  whatsappStatusMeta,
  DATA_QUALITY_META,
  formatDateTime,
} from '@/lib/format';

type EditingState = {
  draftId: string;
  subject: string;
  body: string;
} | null;

function sanitizeHtml(html: string): string {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

const TIMELINE_TYPE_LABELS: Record<string, string> = {
  created: 'Lead discovered',
  enrichment_started: 'Enrichment started',
  enrichment_completed: 'Enrichment completed',
  verification_completed: 'Verification completed',
  draft_generated: 'Draft generated',
  draft_edited: 'Draft edited',
  send_completed: 'Message sent',
  replied: 'Lead replied',
  bounced: 'Message bounced',
  assigned: 'Lead assigned',
  do_not_contact: 'Do-not-contact updated',
};

const LeadDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data,
    isLoading,
    error: leadError,
    refetch,
  } = useQuery(['lead', id], () => leadsApi.get(id!), { enabled: !!id });

  const { data: timelineData } = useQuery(['lead-timeline', id], () => leadsApi.timeline(id!), {
    enabled: !!id,
  });

  const { data: scoreData } = useQuery(['lead-score', id], () => leadsApi.scoreExplanation(id!), {
    enabled: !!id,
  });

  const { data: usersData } = useQuery('users-list', () => admin.getUsers(), {
    // /admin/users is admin-only; don't fire it as sales_rep (was a 403 + console error).
    enabled: !!id && useAuthStore.getState().user?.role === 'admin',
    retry: false,
  });

  const { data: providerStatus } = useQuery(
    'provider-status',
    () => admin.providerStatus(),
    { enabled: !!id, staleTime: 60000, retry: false },
  );
  const enrichmentReady = providerStatus?.enrichment as Record<string, boolean> | undefined;
  const sendingReady = providerStatus?.sending;

  // Backend -> frontend: live updates for this lead (enrich/verify/draft/send
  // completing elsewhere refresh the detail, timeline and score in place).
  // Scoped to THIS lead's lifecycle events only — heartbeats, connects and
  // other leads' events must not refetch (was a refetch storm).
  useSSE('/sse/token', (event) => {
    if (shouldRefreshLeadDetail(event, id)) {
      queryClient.invalidateQueries(['lead', id]);
      queryClient.invalidateQueries(['lead-timeline', id]);
      queryClient.invalidateQueries(['lead-score', id]);
    }
  });

  const [editing, setEditing] = useState<EditingState>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractProvider, setExtractProvider] = useState<'contactout' | 'snovio' | 'osint' | undefined>(undefined);
  const [pendingSend, setPendingSend] = useState<{ channel: string; draftId?: string } | null>(null);
  const [sending, setSending] = useState(false);

  const editDraftMutation = useMutation(
    ({ leadId, draftId, patch }: { leadId: string; draftId: string; patch: { subject?: string; body?: string } }) =>
      leadsApi.editDraft(leadId, draftId, patch),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['lead', id]);
        toast({ title: 'Draft saved', variant: 'success' });
      },
      onError: (err) => toast({ title: 'Failed to save draft', description: (err as Error).message, variant: 'error' }),
    },
  );

  const doNotContactMutation = useMutation(
    ({ leadId, value }: { leadId: string; value: boolean }) => leadsApi.setDoNotContact(leadId, value),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['lead', id]);
        queryClient.invalidateQueries('dashboard-stats');
      },
      onError: (err) => toast({ title: 'Failed to update preference', description: (err as Error).message, variant: 'error' }),
    },
  );

  const assignMutation = useMutation(
    ({ leadId, userId }: { leadId: string; userId: string | null }) => leadsApi.assign(leadId, userId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['lead', id]);
        setShowAssignModal(false);
        toast({ title: 'Lead assigned', variant: 'success' });
      },
      onError: (err) => toast({ title: 'Assignment failed', description: (err as Error).message, variant: 'error' }),
    },
  );

  const enrichMutation = useMutation(
    ({ leadId, provider }: { leadId: string; provider?: string }) => leadsApi.enrich(leadId, provider),
    {
      onSuccess: () => {
        setExtracting(false);
        queryClient.invalidateQueries(['lead', id]);
        queryClient.invalidateQueries(['lead-timeline', id]);
        toast({ title: 'HR extraction started', description: 'This may take a few moments.', variant: 'success' });
      },
      onError: (err) => {
        setExtracting(false);
        toast({ title: 'Extraction failed', description: (err as Error).message, variant: 'error' });
      },
    },
  );

  if (isLoading) return <PageLoader label="Loading lead..." />;

  if (leadError) {
    const isAuthError = leadError instanceof Error && leadError.message?.includes('401');
    return (
      <ErrorState
        title="Error loading lead"
        message={leadError instanceof Error ? leadError.message : 'Unknown error'}
        onRetry={() => {
          if (isAuthError) {
            useAuthStore.getState?.()?.logout?.();
            navigate('/login');
          } else {
            refetch();
          }
        }}
        retryLabel={isAuthError ? 'Re-login' : 'Retry'}
      />
    );
  }

  const lead: LeadDetailType = data.lead;
  const timeline = (timelineData as any)?.timeline || [];
  const users = (usersData as any)?.users || [];

  const startEditing = (draft: OutreachDraft) => {
    // Restore an unsent local backup first (reload-proof editing).
    let backup = null;
    try {
      const raw = localStorage.getItem(`draft-backup:${lead.id}:${draft.id}`);
      backup = raw ? JSON.parse(raw) : null;
    } catch { /* corrupted backup: fall through to server draft */ }
    setEditing({
      draftId: draft.id,
      subject: backup?.subject ?? draft.subject ?? '',
      body: backup?.body ?? draft.body ?? '',
    });
  };

  const updateEditing = (patch: Partial<{ subject: string; body: string }>) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(`draft-backup:${lead.id}:${prev.draftId}`, JSON.stringify({
          subject: next.subject, body: next.body, savedAt: Date.now(),
        }));
      } catch { /* storage full/blocked: editing still works in memory */ }
      return next;
    });
  };

  const clearBackup = (draftId: string) => {
    try {
      localStorage.removeItem(`draft-backup:${lead.id}:${draftId}`);
    } catch { /* ignore */ }
  };

  const saveEditing = () => {
    if (!editing) return;
    editDraftMutation.mutate(
      { leadId: lead.id, draftId: editing.draftId, patch: { subject: editing.subject, body: editing.body } },
      { onSuccess: () => { clearBackup(editing.draftId); setEditing(null); } },
    );
  };

  const handleEnrich = () => {
    setExtracting(true);
    enrichMutation.mutate({ leadId: lead.id, provider: extractProvider });
  };

  const runAction = (fn: Promise<unknown>, successMsg: string) => {
    fn.then(() => {
      queryClient.invalidateQueries(['lead', id]);
      queryClient.invalidateQueries(['lead-timeline', id]);
      toast({ title: successMsg, variant: 'success' });
    }).catch((err: Error) => toast({ title: 'Action failed', description: err.message, variant: 'error' }));
  };

  const handleDoNotContactChange = (value: boolean) => {
    doNotContactMutation.mutate({ leadId: lead.id, value });
  };

  const confirmSend = () => {
    if (!pendingSend) return;
    setSending(true);
    leadsApi.send(lead.id, pendingSend.channel as any, pendingSend.draftId)
      .then(() => {
        queryClient.invalidateQueries(['lead', id]);
        queryClient.invalidateQueries(['lead-timeline', id]);
        toast({ title: 'Send queued — provider result will update the timeline', variant: 'success' });
        setPendingSend(null);
      })
      .catch((err: Error) => toast({ title: 'Send blocked', description: err.message, variant: 'error' }))
      .finally(() => setSending(false));
  };

  const sendBlockReason = lead.do_not_contact
    ? 'This lead is flagged Do Not Contact — sending is blocked.'
    : null;

  const handleAssign = (userId: string) => {
    assignMutation.mutate({ leadId: lead.id, userId: userId || null });
  };

  const assignedUser = users.find((u: any) => u.id === lead.assigned_to);
  const currentUserId = useAuthStore.getState().user?.id;
  const isAdmin = useAuthStore.getState().user?.role === 'admin';
  const assignedLabel = assignedUser?.email
    || (lead.assigned_to === currentUserId ? 'You' : null)
    || (isAdmin ? lead.assigned_to : null)
    || 'Unassigned';
  const bandMeta = SCORE_BAND_META[lead.score_band];
  const stageMetaV = stageMeta(lead.pipeline_stage);
  const emailMeta = emailStatusMeta(lead.email_status);
  const waMeta = whatsappStatusMeta(lead.whatsapp_status);
  const dqMeta = DATA_QUALITY_META[lead.data_quality];

  const providerNote =
    extractProvider === 'contactout'
      ? `ContactOut uses LinkedIn URL to find email/phone. Highest accuracy. Per-row manual trigger — 1 credit only when YOU click Enrich, never bulk, never automatic.${enrichmentReady?.contactout === false ? ' Key missing.' : ''}`
      : extractProvider === 'snovio'
        ? `Snov.io uses company name + HR name to find email/phone. Good fallback. Per-row manual trigger — credits only on your click.${enrichmentReady?.snovio === false ? ' Key missing.' : ''}`
        : extractProvider === 'osint'
          ? 'OSINT fallback searches public sources for contact info. Lowest confidence. Free — no credits.'
          : 'Auto: ContactOut → Snov.io → OSINT. Paid providers run per-row on your click only — no credits consumed until you click Enrich.';

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/leads"
          className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to leads
        </Link>

        {/* Hero: identity + the single action row */}
        <div className="card overflow-hidden">
          <div className="border-b border-border p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="eyebrow">Lead record</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
                    {lead.company_name || 'Untitled lead'}
                  </h1>
                  <span className="flex items-baseline gap-1">
                    <span className="font-mono text-[22px] font-semibold leading-none tabular-nums tracking-[-0.02em] text-foreground">
                      {lead.lead_score}
                    </span>
                    <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full ${bandMeta?.dot ?? 'bg-muted-foreground'}`} />
                    <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{bandMeta?.label ?? lead.score_band}</span>
                  </span>
                </div>
                <p className="mt-1 max-w-phi-body text-sm leading-relaxed text-muted-foreground">
                  {lead.job_title || 'Job title not available'}
                  {lead.experience_level && <span className="text-muted-foreground/70"> · {lead.experience_level}</span>}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Badge className={stageMetaV.className}>
                    <span className="capitalize">{stageMetaV.label}</span>
                  </Badge>
                  {lead.do_not_contact && (
                    <Badge variant="danger">
                      <ShieldAlert className="h-3 w-3" />
                      Do Not Contact
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button onClick={handleEnrich} loading={extracting || enrichMutation.isLoading} variant="secondary">
                  <Sparkles className="h-4 w-4" />
                  {extracting ? 'Extracting…' : 'Enrich'}
                </Button>
                <Button
                  onClick={() => runAction(leadsApi.verify(lead.id), 'Verification completed')}
                  disabled={lead.pipeline_stage === 'verified' || lead.pipeline_stage === 'discovered'}
                  variant="outline"
                >
                  <BadgeCheck className="h-4 w-4" />
                  Verify
                </Button>
                <Button
                  onClick={() => runAction(leadsApi.draft(lead.id, 'both'), 'Draft generated')}
                  disabled={lead.pipeline_stage === 'drafted'}
                  variant="outline"
                >
                  <FileText className="h-4 w-4" />
                  Draft
                </Button>
                <Button
                  onClick={() => setPendingSend({ channel: 'both' })}
                  disabled={(lead.pipeline_stage !== 'drafted' && lead.pipeline_stage !== 'verified') || !!sendBlockReason}
                  title={sendBlockReason || 'Verify + preview before sending'}
                  variant="default"
                >
                  <Send className="h-4 w-4" />
                  Send
                </Button>
                {isAdmin && (
                  <Button onClick={() => setShowAssignModal(true)} variant="ghost">
                    <UserPlus className="h-4 w-4" />
                    Assign
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Factual strip: source, domain, owner, discovered */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Globe className="h-3.5 w-3.5" />
              {lead.source_site ? <span className="font-mono capitalize">{lead.source_site}</span> : 'Source unknown'}
            </span>
            {lead.company_domain && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
                <Globe className="h-3.5 w-3.5" />
                {lead.company_domain}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              {assignedLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              Discovered {formatDateTime(lead.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Extraction provider selection */}
      <Card>
        <CardHeader>
          <CardTitle>Extraction Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { value: undefined, label: 'Auto (ContactOut → Snov.io → OSINT)', key: undefined },
              { value: 'contactout', label: 'ContactOut', key: 'contactout' },
              { value: 'snovio', label: 'Snov.io', key: 'snovio' },
              { value: 'osint', label: 'OSINT Fallback', key: 'osint' },
            ].map((opt) => {
              // Paid providers show live configured/NOT-CONFIGURED state;
              // OSINT/Auto need no key. Keys are never exposed — booleans only.
              const needsKey = opt.key === 'contactout' || opt.key === 'snovio';
              const ready = !needsKey || (opt.key && enrichmentReady?.[opt.key]);
              return (
                <button
                  key={opt.label}
                  onClick={() => setExtractProvider(opt.value as never)}
                  title={needsKey && !ready ? `${opt.label} API key not configured — runs but cannot spend credits` : `${opt.label} — per-row, on-demand only`}
                  className={`rounded-lg border px-3.5 py-1.5 transition-colors duration-150 ${
                    extractProvider === opt.value
                      ? 'border-signal/40 bg-surface text-foreground'
                      : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground'
                  }`}
                >
                  <span className="text-[13px] font-medium">{opt.label}</span>
                  {needsKey && (
                    <span className={`ml-1.5 font-mono text-[11px] font-semibold ${ready ? 'text-success' : 'text-warning'}`}>
                      {ready ? '●' : '○'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {providerNote && (
            <p className="mt-3 max-w-phi-body text-[13px] leading-relaxed text-muted-foreground">{providerNote}</p>
          )}
          {extractProvider && (extractProvider === 'contactout' || extractProvider === 'snovio') && enrichmentReady?.[extractProvider] === false && (
            <p className="mt-2 border-l-2 border-l-warning pl-2.5 text-[13px] leading-relaxed text-warning">
              ACTION REQUIRED: no {extractProvider === 'contactout' ? 'ContactOut' : 'Snov.io'} key configured — enriching with it will fail honestly. Add a key in Settings or use Auto/OSINT.
            </p>
          )}
          {extracting && (
            <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-4 py-3 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Extracting HR contact… This may take a few moments.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lead info + score breakdown + company narrative */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <p className="eyebrow">Dossier</p>
            <CardTitle>Lead Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border text-[13px]">
              {[
                ['Score', `${lead.lead_score} (${lead.score_band})`, 'mono'],
                ['Stage', lead.pipeline_stage, 'plain'],
                ['Data quality', dqMeta?.label || '—', 'plain'],
                ['Email', lead.hr_email || '—', 'mono'],
                ['Phone', lead.hr_mobile || '—', 'mono'],
                ['Experience', lead.experience_level || '—', 'plain'],
                ['Salary range', lead.salary_range || '—', 'mono'],
                ['Source site', lead.source_site || '—', 'mono'],
              ].map(([k, v, style]) => (
                <div key={k as string} className="flex items-start justify-between gap-4 py-2.5">
                  <dt className="shrink-0 text-muted-foreground">{k}</dt>
                  <dd className={`min-w-0 break-all text-right capitalize text-foreground ${style === 'mono' ? 'font-mono text-[12px] tabular-nums' : 'font-medium'}`}>
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
            {lead.hr_name && (
              <div className="mt-4 rounded-lg border border-border p-3">
                <p className="eyebrow">HR Contact</p>
                <p className="mt-1.5 text-sm font-medium text-foreground">{lead.hr_name}</p>
                {lead.hr_linkedin_url && (
                  <a
                    href={lead.hr_linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-info hover:underline hover:decoration-signal"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    LinkedIn profile
                  </a>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {emailMeta && <Badge className={emailMeta.className}>{emailMeta.label}</Badge>}
                  {waMeta && <Badge className={waMeta.className}>{waMeta.label}</Badge>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deterministic score explanation — no black-box number. */}
        {scoreData && Object.keys(scoreData.breakdown || {}).length > 0 && (
          <Card className="lg:col-span-1">
            <CardHeader>
              <p className="eyebrow">Breakdown</p>
              <CardTitle className="flex items-center justify-between">
                <span>Why this score</span>
                <span className="font-mono text-[20px] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
                  {scoreData.score}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-[13px]">
                {Object.values(scoreData.breakdown).filter(Boolean).map((b: any) => (
                  <li key={b.reason} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{b.reason}</span>
                    <span className="font-mono font-medium tabular-nums text-success">+{b.points}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Score is deterministic from these fields; re-verifying or enriching updates it.
              </p>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <p className="eyebrow">Company record</p>
            <CardTitle>About the Company & Role</CardTitle>
          </CardHeader>
          <CardContent>
            {lead.about_company && (
              <p className="mb-4 max-w-phi-body text-[13px] leading-relaxed text-muted-foreground">{lead.about_company}</p>
            )}
            <p className="eyebrow mb-2">Job Description</p>
            <div
              className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4 text-[13px] leading-relaxed text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(lead.job_description || 'No description available') }}
            />
          </CardContent>
        </Card>
      </div>

      {/* Outreach guardrail */}
      <Card>
        <CardHeader>
          <p className="eyebrow">Guardrail</p>
          <CardTitle>Contact Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[13px] font-medium text-foreground">Do Not Contact</p>
              <p className="mt-0.5 max-w-phi-body text-[13px] leading-relaxed text-muted-foreground">
                {lead.do_not_contact
                  ? 'This lead is excluded from all outreach.'
                  : 'This lead can receive emails and WhatsApp messages.'}
              </p>
            </div>
            <Switch
              checked={lead.do_not_contact}
              onCheckedChange={handleDoNotContactChange}
              disabled={doNotContactMutation.isLoading}
            />
          </div>
          {doNotContactMutation.isError && (
            <p className="mt-2 text-[13px] text-destructive">Failed to update preference. Please retry.</p>
          )}
        </CardContent>
      </Card>

      {lead.drafts && lead.drafts.length > 0 && (
        <Card>
          <CardHeader>
            <p className="eyebrow">Outbound · {lead.drafts.length}</p>
            <CardTitle>Outreach Drafts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lead.drafts.map((draft: OutreachDraft) => {
              const isEditing = editing?.draftId === draft.id;
              return (
                <div key={draft.id} className="rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="uppercase">{draft.channel}</Badge>
                      <span className="font-mono text-[11px] text-muted-foreground">v{draft.version}</span>
                    </div>
                    <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                      {draft.is_edited ? 'Edited' : 'Auto-generated'}
                    </span>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3 p-4">
                      <div>
                        <label className="label">Subject</label>
                        <Input
                          value={editing.subject}
                          onChange={(e) => updateEditing({ subject: e.target.value })}
                          placeholder="Email subject"
                        />
                      </div>
                      <div>
                        <label className="label">Body</label>
                        <Textarea
                          value={editing.body}
                          onChange={(e) => updateEditing({ body: e.target.value })}
                          rows={8}
                          placeholder="Message body"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={saveEditing} loading={editDraftMutation.isLoading}>
                          {editDraftMutation.isLoading ? 'Saving…' : 'Save Draft'}
                        </Button>
                        <Button onClick={() => { clearBackup(draft.id); setEditing(null); }} variant="outline" disabled={editDraftMutation.isLoading}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4">
                      {draft.subject && (
                        <p className="mb-2 text-[13px] font-semibold text-foreground">{draft.subject}</p>
                      )}
                      <pre className="max-h-64 min-h-[80px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-sans text-[13px] leading-relaxed text-foreground">
                        {draft.body || 'No draft body available'}
                      </pre>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button onClick={() => startEditing(draft)} variant="outline" size="sm">
                          <Mail className="h-3.5 w-3.5" />
                          Edit Draft
                        </Button>
                        <Button
                          onClick={() => setPendingSend({ channel: draft.channel, draftId: draft.id })}
                          variant="outline"
                          size="sm"
                          disabled={!!sendBlockReason}
                          title={sendBlockReason || `Send via ${draft.channel} — you will confirm first`}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Send this draft
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Event log */}
      <Card>
        <CardHeader>
          <p className="eyebrow">Event log</p>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <EmptyState icon={XCircle} title="No events yet" description="Actions on this lead will appear here." />
          ) : (
            <ol className="space-y-0">
              {timeline.map((event: any, i: number) => (
                <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < timeline.length - 1 && (
                    <span className="absolute left-[5px] top-4 h-full w-px bg-border" />
                  )}
                  <span className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-background ${
                    event.status === 'failed' || event.status === 'bounced'
                      ? 'bg-destructive'
                      : event.status === 'success' || event.status === 'replied'
                        ? 'bg-success'
                        : 'bg-foreground'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-foreground">
                        {TIMELINE_TYPE_LABELS[event.type] || event.type.replace(/_/g, ' ')}
                      </p>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {event.timestamp ? formatDateTime(event.timestamp) : '—'}
                      </span>
                    </div>
                    {(event.status || event.delivery_status || event.provider || event.channel) && (
                      <p className="mt-0.5 flex flex-wrap gap-2 text-[11px] capitalize text-muted-foreground">
                        {event.status && <span>{event.status}</span>}
                        {event.delivery_status && <span>delivery: {event.delivery_status}</span>}
                        {event.channel && <span>via {event.channel}</span>}
                        {event.provider && <span>via {event.provider}</span>}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingSend}
        onClose={() => (sending ? null : setPendingSend(null))}
        onConfirm={confirmSend}
        title={sendBlockReason ? 'Sending blocked' : `Send via ${pendingSend?.channel}?`}
        description={
          sendBlockReason ||
          `To: ${lead.hr_email || lead.hr_mobile || 'no verified contact'}\nEmail: ${lead.email_status || 'unknown'} · WhatsApp: ${lead.whatsapp_status || 'unknown'}\nEmail provider: ${sendingReady?.email ? 'configured' : 'NOT CONFIGURED — send will fail honestly, configure keys in Settings'}\nWhatsApp provider: ${sendingReady?.whatsapp ? 'configured' : 'NOT CONFIGURED — send will fail honestly, configure in Settings'}\nQueued sends report the real provider result — "queued" is not "sent".`
        }
        confirmLabel={sendBlockReason ? 'Blocked' : 'Confirm send'}
        loading={sending}
      />

      <Modal open={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign Lead">
        <div className="space-y-2">
          <button
            onClick={() => handleAssign('')}
            className="flex w-full items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-accent"
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Unassigned</span>
          </button>
          {users.map((user: any) => (
            <button
              key={user.id}
              onClick={() => handleAssign(user.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                lead.assigned_to === user.id
                  ? 'border-foreground bg-accent text-foreground'
                  : 'border-border hover:bg-accent'
              }`}
            >
              <User className="h-4 w-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{user.email}</p>
                <p className="text-[11px] capitalize text-muted-foreground">{user.role}</p>
              </div>
              {lead.assigned_to === user.id && <CheckCircle2 className="h-4 w-4 text-foreground" />}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={() => setShowAssignModal(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default LeadDetail;
