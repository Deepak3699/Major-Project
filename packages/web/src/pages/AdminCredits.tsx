import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { AlertCircle, Coins, History, Search, SlidersHorizontal } from 'lucide-react';
import { creditsAdmin } from '@/lib/api';
import { AdminCreditWallet, CreditKind } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoader } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const KIND_LABEL: Record<string, string> = {
  signup_grant: 'Welcome grant',
  purchase: 'Purchase',
  consumption: 'Consumption',
  refund: 'Refund',
  admin_adjustment: 'Admin adjustment',
  expiry: 'Expiry',
};

function makeKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  return `admin-adjust-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const AdjustDialog = ({
  target,
  onClose,
}: {
  target: AdminCreditWallet | null;
  onClose: () => void;
}) => {
  const client = useQueryClient();
  const { toast } = useToast();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(makeKey);

  useEffect(() => {
    if (target) {
      setDelta('');
      setReason('');
      setKey(makeKey());
    }
  }, [target]);

  const mutation = useMutation(
    () => creditsAdmin.adjust({
      user_id: target!.user_id,
      delta: Number(delta),
      reason: reason.trim(),
      idempotency_key: key,
    }),
    {
      onSuccess: (res) => {
        client.invalidateQueries('admin-credit-wallets');
        client.invalidateQueries('admin-credit-ledger');
        toast({
          title: res.already_processed ? 'Adjustment already applied' : 'Credits adjusted',
          description: `${target?.email} now has ${res.wallet.balance} credits.`,
          variant: 'success',
        });
        onClose();
      },
      onError: (err: Error) => toast({ title: 'Adjustment failed', description: err.message, variant: 'error' }),
    },
  );

  const parsedDelta = Number(delta);
  const valid = Number.isInteger(parsedDelta) && parsedDelta !== 0 && reason.trim().length >= 3;

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Adjust credits"
      description="This writes a ledger entry and an audit record. Balances can never go below zero."
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isLoading} disabled={!valid}>
            <Coins className="h-4 w-4" />Apply adjustment
          </Button>
        </>
      )}
    >
      {target && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3.5 py-2.5">
            <p className="text-[13px] font-medium text-foreground">{target.email}</p>
            <p className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
              {target.plan_name || target.plan_code || 'No plan'} · balance {target.balance}
            </p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="credit-delta" className="text-[12.5px] font-medium text-foreground">Delta</label>
            <Input
              id="credit-delta"
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="e.g. 2 or -1"
            />
            <p className="text-[12px] text-muted-foreground">Positive adds credits, negative removes them. Zero is rejected.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="credit-reason" className="text-[12.5px] font-medium text-foreground">Reason</label>
            <Input
              id="credit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Support adjustment, refund, correction…"
            />
          </div>
          <div className="rounded-lg border border-border bg-surface px-3.5 py-2.5">
            <p className="eyebrow">Idempotency key</p>
            <p className="mt-1 break-all font-mono text-[10.5px] text-muted-foreground">{key}</p>
            <p className="mt-1 text-[11.5px] text-muted-foreground">A retry with this key will not double-apply.</p>
          </div>
        </div>
      )}
    </Modal>
  );
};

const AdminCredits: React.FC = () => {
  const [search, setSearch] = useState('');
  const [walletOffset, setWalletOffset] = useState(0);
  const [kind, setKind] = useState<'' | CreditKind>('');
  const [ledgerUserId, setLedgerUserId] = useState('');
  const [ledgerOffset, setLedgerOffset] = useState(0);
  const [target, setTarget] = useState<AdminCreditWallet | null>(null);
  const limit = 25;

  const wallets = useQuery(
    ['admin-credit-wallets', search, walletOffset],
    () => creditsAdmin.wallets(search, limit, walletOffset),
    { keepPreviousData: true },
  );
  const ledger = useQuery(
    ['admin-credit-ledger', kind, ledgerUserId, ledgerOffset],
    () => creditsAdmin.ledger({
      kind: kind || undefined,
      user_id: ledgerUserId || undefined,
      limit: 25,
      offset: ledgerOffset,
    }),
    { keepPreviousData: true },
  );

  const walletRows = wallets.data?.data || [];
  const walletTotal = wallets.data?.pagination.total || 0;
  const ledgerRows = ledger.data?.data || [];
  const ledgerTotal = ledger.data?.pagination.total || 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Credits ledger"
        description="Search candidate wallets, inspect every credit mutation, and apply audited adjustments. Paid-plan allocations remain unset until configured."
      />

      <section className="card overflow-hidden" aria-labelledby="wallets-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p id="wallets-heading" className="eyebrow">Wallets</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{walletTotal} accounts with a credit wallet.</p>
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search wallets by email"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setWalletOffset(0); }}
              placeholder="Search by email"
              className="pl-8"
            />
          </div>
        </div>

        {wallets.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : wallets.isError ? (
          <div className="flex items-center justify-between gap-3 px-4 py-6">
            <p className="flex items-center gap-2 text-[13px] text-destructive"><AlertCircle className="h-4 w-4" />{(wallets.error as Error)?.message || 'Wallets could not be loaded.'}</p>
            <Button variant="outline" size="sm" onClick={() => wallets.refetch()}>Retry</Button>
          </div>
        ) : walletRows.length === 0 ? (
          <EmptyState icon={Coins} title="No wallets found" description={search ? 'No candidate email matches this search.' : 'Candidate wallets appear after registration.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2 font-normal">Candidate</th>
                  <th className="px-4 py-2 font-normal">Plan</th>
                  <th className="px-4 py-2 text-right font-normal">Balance</th>
                  <th className="px-4 py-2 text-right font-normal">Granted</th>
                  <th className="px-4 py-2 text-right font-normal">Used</th>
                  <th className="px-4 py-2 font-normal">Last activity</th>
                  <th className="px-4 py-2 text-right font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {walletRows.map((wallet) => (
                  <tr key={wallet.user_id} className="border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2.5">
                      <p className="text-[13px] font-medium text-foreground">{wallet.email}</p>
                      <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">{wallet.role}</p>
                    </td>
                    <td className="px-4 py-2.5"><Badge variant={wallet.plan_code === 'FREE' ? 'muted' : 'signal'}>{wallet.plan_name || wallet.plan_code || '—'}</Badge></td>
                    <td className="px-4 py-2.5 text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">{wallet.balance}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">{wallet.lifetime_granted}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">{wallet.lifetime_used}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{wallet.last_activity_at ? formatDateTime(wallet.last_activity_at) : '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => { setLedgerUserId(wallet.user_id); setLedgerOffset(0); }}>Ledger</Button>
                        <Button size="sm" onClick={() => setTarget(wallet)}>Adjust</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{walletTotal === 0 ? '0' : `${walletOffset + 1}–${Math.min(walletOffset + limit, walletTotal)}`} of {walletTotal}</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={walletOffset === 0} onClick={() => setWalletOffset(Math.max(0, walletOffset - limit))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={walletOffset + limit >= walletTotal} onClick={() => setWalletOffset(walletOffset + limit)}>Next</Button>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden" aria-labelledby="admin-ledger-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p id="admin-ledger-heading" className="eyebrow">Ledger</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">{ledgerTotal} entries{ledgerUserId ? ' for the selected candidate' : ' across all candidates'}.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ledgerUserId && <Button variant="ghost" size="sm" onClick={() => { setLedgerUserId(''); setLedgerOffset(0); }}>Clear candidate</Button>}
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <Select aria-label="Filter ledger by type" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setLedgerOffset(0); }} className="h-8 w-44 text-[12px]">
                <option value="">All types</option>
                {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
          </div>
        </div>

        {ledger.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : ledger.isError ? (
          <div className="flex items-center justify-between gap-3 px-4 py-6">
            <p className="text-[13px] text-destructive">{(ledger.error as Error)?.message || 'Ledger could not be loaded.'}</p>
            <Button variant="outline" size="sm" onClick={() => ledger.refetch()}>Retry</Button>
          </div>
        ) : ledgerRows.length === 0 ? (
          <EmptyState icon={History} title="No ledger entries" description="Credit grants, spends and adjustments will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-4 py-2 font-normal">When</th>
                  <th className="px-4 py-2 font-normal">Candidate</th>
                  <th className="px-4 py-2 font-normal">Type</th>
                  <th className="px-4 py-2 font-normal">Reason</th>
                  <th className="px-4 py-2 text-right font-normal">Delta</th>
                  <th className="px-4 py-2 text-right font-normal">Balance</th>
                  <th className="px-4 py-2 font-normal">Actor</th>
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-muted-foreground">{formatDateTime(entry.created_at)}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-foreground">{entry.user_email || entry.user_id}</td>
                    <td className="px-4 py-2.5"><Badge variant="outline">{KIND_LABEL[entry.kind] || entry.kind}</Badge></td>
                    <td className="max-w-[24rem] px-4 py-2.5 text-[12.5px] text-foreground/85">{entry.reason || '—'}</td>
                    <td className={cn('px-4 py-2.5 text-right font-mono text-[12.5px] font-semibold tabular-nums', entry.delta > 0 ? 'text-success' : 'text-foreground')}>{entry.delta > 0 ? '+' : ''}{entry.delta}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[12px] tabular-nums text-muted-foreground">{entry.balance_after}</td>
                    <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">{entry.actor_email || 'System'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{ledgerTotal === 0 ? '0' : `${ledgerOffset + 1}–${Math.min(ledgerOffset + 25, ledgerTotal)}`} of {ledgerTotal}</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={ledgerOffset === 0} onClick={() => setLedgerOffset(Math.max(0, ledgerOffset - 25))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={ledgerOffset + 25 >= ledgerTotal} onClick={() => setLedgerOffset(ledgerOffset + 25)}>Next</Button>
          </div>
        </div>
      </section>

      <AdjustDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
};

export default AdminCredits;
