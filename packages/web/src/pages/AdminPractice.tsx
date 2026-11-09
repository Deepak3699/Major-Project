import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { Check, Mic, ShieldCheck, X } from 'lucide-react';
import { practiceAdmin } from '@/lib/api';
import { PracticeUpgradeRequest } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';

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

const AdminPractice: React.FC = () => {
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
      <PageHeader
        title="Practice subscriptions"
        description="Approve interview-practice upgrade requests, or grant Pro directly by email. Both actions land in the audit log."
      />

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

export default AdminPractice;
