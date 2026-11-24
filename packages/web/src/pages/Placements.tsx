import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Award, CheckCircle2, PartyPopper } from 'lucide-react';
import { candidate } from '@/lib/api';
import { CandidateApplication, PlacementOutcome, PlacementOutcomeKind } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateTime } from '@/lib/format';

const OUTCOME_LABEL: Record<PlacementOutcomeKind, string> = {
  offer_received: 'Offer received',
  joined: 'Joined',
};

const OutcomeRow = ({ item }: { item: PlacementOutcome }) => (
  <div className="flex flex-col gap-2 border-b border-border px-4 py-3.5 last:border-0 sm:flex-row sm:items-start sm:justify-between">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13.5px] font-medium text-foreground">{item.role_title}</p>
        <span className="text-muted-foreground/50">·</span>
        <p className="text-[13px] text-foreground/85">{item.company_name}</p>
        <Badge variant={item.outcome === 'joined' ? 'success' : 'signal'}>{OUTCOME_LABEL[item.outcome]}</Badge>
      </div>
      {item.notes && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">{item.notes}</p>}
      <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
        Reported {formatDateTime(item.created_at)}
        {item.joined_on ? ` · joined ${formatDate(item.joined_on)}` : ''}
      </p>
    </div>
  </div>
);

const Placements: React.FC = () => {
  const client = useQueryClient();
  const { toast } = useToast();
  const [applicationId, setApplicationId] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [outcome, setOutcome] = useState<PlacementOutcomeKind>('joined');
  const [joinedOn, setJoinedOn] = useState('');
  const [notes, setNotes] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const applications = useQuery('candidate-applications', candidate.applications);
  const placements = useQuery(['placements', offset], () => candidate.placements(limit, offset), { keepPreviousData: true });

  const appOptions = useMemo<CandidateApplication[]>(() => applications.data?.data || [], [applications.data]);

  const selectApplication = (id: string) => {
    setApplicationId(id);
    const match = appOptions.find((item) => item.id === id);
    if (match) {
      setCompany(match.company_name || '');
      setRole(match.job_title || '');
    }
  };

  const report = useMutation(
    () => candidate.reportPlacement({
      application_id: applicationId || undefined,
      company_name: company.trim() || undefined,
      role_title: role.trim() || undefined,
      outcome,
      joined_on: joinedOn || undefined,
      notes: notes.trim() || undefined,
    }),
    {
      onSuccess: () => {
        client.invalidateQueries('placements');
        toast({ title: 'Placement reported', description: 'Thank you — this is voluntary and only visible to you and administrators.', variant: 'success' });
        setApplicationId('');
        setCompany('');
        setRole('');
        setOutcome('joined');
        setJoinedOn('');
        setNotes('');
      },
      onError: (err: Error) => toast({ title: 'Could not save placement', description: err.message, variant: 'error' }),
    },
  );

  const rows = placements.data?.data || [];
  const total = placements.data?.pagination.total || 0;
  const canSubmit = Boolean(applicationId || (company.trim() && role.trim()));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Placement outcomes"
        description="Sharing a placement is optional. Report an offer or a joined role if you want to keep the milestone with your search history; you can skip this entirely."
      />

      <section className="card overflow-hidden" aria-labelledby="report-placement-heading">
        <div className="border-b border-border px-5 py-3">
          <p id="report-placement-heading" className="eyebrow">Report a placement</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Link an application to prefill the employer and role, or enter them yourself.</p>
        </div>
        <form
          className="grid gap-3 p-5 sm:grid-cols-2"
          onSubmit={(event) => { event.preventDefault(); if (canSubmit) report.mutate(); }}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="placement-application" className="text-[12.5px] font-medium text-foreground">Linked application <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Select id="placement-application" value={applicationId} onChange={(event) => selectApplication(event.target.value)}>
              <option value="">No linked application</option>
              {appOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.job_title} — {item.company_name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="placement-company" className="text-[12.5px] font-medium text-foreground">Company</label>
            <Input id="placement-company" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={200} placeholder="Company name" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="placement-role" className="text-[12.5px] font-medium text-foreground">Role</label>
            <Input id="placement-role" value={role} onChange={(event) => setRole(event.target.value)} maxLength={200} placeholder="Job title" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="placement-outcome" className="text-[12.5px] font-medium text-foreground">Outcome</label>
            <Select id="placement-outcome" value={outcome} onChange={(event) => setOutcome(event.target.value as PlacementOutcomeKind)}>
              <option value="joined">Joined the role</option>
              <option value="offer_received">Offer received</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="placement-date" className="text-[12.5px] font-medium text-foreground">Joining date <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Input id="placement-date" type="date" value={joinedOn} onChange={(event) => setJoinedOn(event.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="placement-notes" className="text-[12.5px] font-medium text-foreground">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Textarea id="placement-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Anything you want to remember about this milestone." />
          </div>
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="max-w-md text-[12px] leading-relaxed text-muted-foreground">Only you and administrators can see this. It never changes your plan, credits or application status.</p>
            <Button type="submit" loading={report.isLoading} disabled={!canSubmit}>
              <PartyPopper className="h-4 w-4" />Save placement
            </Button>
          </div>
        </form>
      </section>

      <section className="card overflow-hidden" aria-labelledby="placement-history-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div>
            <p id="placement-history-heading" className="eyebrow">Your reports</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Voluntary milestones, newest first.</p>
          </div>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{total} reported</p>
        </div>

        {placements.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="skeleton h-12 w-full" />)}</div>
        ) : placements.isError ? (
          <div className="flex items-center justify-between gap-3 px-5 py-6">
            <p className="text-[13px] text-destructive">{(placements.error as Error)?.message || 'Placements could not be loaded.'}</p>
            <Button variant="outline" size="sm" onClick={() => placements.refetch()}>Retry</Button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No placements reported"
            description="If you accept an offer or join a role, you can record it here. Reporting is always optional."
          />
        ) : (
          <div>{rows.map((item) => <OutcomeRow key={item.id} item={item} />)}</div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{total === 0 ? '0' : `${offset + 1}–${Math.min(offset + limit, total)}`} of {total}</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</Button>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-2 px-1 text-[12px] leading-relaxed text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Placement reporting is voluntary. Declining to report never affects your account or job recommendations.
      </div>
    </div>
  );
};

export default Placements;
