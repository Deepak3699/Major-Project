import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { AlertCircle, ArrowRight, Check, Coins, History, Lock, Sparkles } from 'lucide-react';
import { credits } from '@/lib/api';
import { CreditKind, CreditLedgerEntry } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard, StatCardGrid } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoader } from '@/components/ui/spinner';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/components/ui/cn';

const KIND_LABEL: Record<CreditKind, string> = {
  signup_grant: 'Welcome grant',
  purchase: 'Plan purchase',
  consumption: 'Used',
  refund: 'Refund',
  admin_adjustment: 'Admin adjustment',
  expiry: 'Expiry',
};

const KIND_TONE: Record<CreditKind, string> = {
  signup_grant: 'text-success',
  purchase: 'text-success',
  consumption: 'text-foreground',
  refund: 'text-info',
  admin_adjustment: 'text-warning',
  expiry: 'text-destructive',
};

function money(paise: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${(paise / 100).toLocaleString('en-IN')}`;
}

const LedgerRow = ({ entry }: { entry: CreditLedgerEntry }) => {
  const positive = entry.delta > 0;
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-border px-4 py-3 last:border-0 sm:grid-cols-[8rem_1fr_6rem_5.5rem] sm:items-center">
      <div className="flex items-center gap-2">
        <span className={cn('font-mono text-[10px] uppercase tracking-[0.06em]', KIND_TONE[entry.kind])}>
          {KIND_LABEL[entry.kind] || entry.kind}
        </span>
      </div>
      <p className="col-span-2 min-w-0 text-[13px] leading-relaxed text-foreground sm:col-span-1">
        {entry.reason || '—'}
        {entry.actor_email && entry.kind === 'admin_adjustment' && (
          <span className="mt-0.5 block font-mono text-[10.5px] text-muted-foreground">by {entry.actor_email}</span>
        )}
      </p>
      <p className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">{formatDateTime(entry.created_at)}</p>
      <div className="text-right">
        <p className={cn('font-mono text-[13px] font-semibold tabular-nums', positive ? 'text-success' : 'text-foreground')}>
          {positive ? '+' : ''}{entry.delta}
        </p>
        <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground">bal {entry.balance_after}</p>
      </div>
    </div>
  );
};

const Credits: React.FC = () => {
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const overview = useQuery('credits-overview', credits.overview);
  const ledger = useQuery(['credits-ledger', offset], () => credits.ledger(limit, offset), { keepPreviousData: true });

  if (overview.isLoading) return <PageLoader label="Loading your plan and credits…" />;

  if (overview.isError || !overview.data) {
    return (
      <div className="card flex flex-col items-start gap-3 p-6" role="alert">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <p className="text-[14px] font-medium">Credits could not be loaded</p>
        </div>
        <p className="text-[13px] text-muted-foreground">{(overview.error as Error)?.message || 'Try again in a moment.'}</p>
        <Button variant="outline" onClick={() => overview.refetch()}>Retry</Button>
      </div>
    );
  }

  const { wallet, plans, payments, free_initial_credits } = overview.data;
  const plan = wallet.plan;
  const ledgerEntries = ledger.data?.data || [];
  const total = ledger.data?.pagination.total || 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + limit, total);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Credits & plan"
        description="Every preparation credit is tracked in a server-side ledger. Balances come from the API, never from the browser."
      />

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow">Available balance</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-[38px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">{wallet.balance}</span>
              <span className="text-[13px] text-muted-foreground">preparation credits</span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground">
              <Badge variant={plan.code === 'FREE' ? 'muted' : 'signal'}>{plan.name}</Badge>
              <span>{plan.code === 'FREE' ? 'Free plan' : `Active until ${plan.expires_at ? formatDateTime(plan.expires_at) : 'further notice'}`}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {wallet.signup_granted && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">
                <Check className="h-3 w-3 text-success" /> {free_initial_credits}-credit welcome grant applied
              </span>
            )}
            <Button variant="outline" asChild>
              <a href="#ledger"><History className="h-4 w-4" />View ledger</a>
            </Button>
          </div>
        </div>
      </div>

      <StatCardGrid>
        <StatCard icon={Coins} label="Balance" value={wallet.balance} tone="success" hint="Available to spend" />
        <StatCard icon={Sparkles} label="Granted" value={wallet.lifetime_granted} tone="muted" hint="Lifetime credits added" />
        <StatCard icon={History} label="Used" value={wallet.lifetime_used} tone="warning" hint="Lifetime credits spent" />
        <StatCard icon={Lock} label="Plan" value={plan.name} tone="primary" hint={plan.code === 'FREE' ? 'Upgrade requires an administrator' : 'Paid plan'} />
      </StatCardGrid>

      <section className="card overflow-hidden" aria-labelledby="plans-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div>
            <p id="plans-heading" className="eyebrow">Plan catalog</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Prices are fixed. Paid-plan credit allocations stay configurable until the owner defines them.</p>
          </div>
          <Badge variant="outline">Billing not configured</Badge>
        </div>
        <div className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
          {plans.map((item) => {
            const current = item.code === plan.code;
            return (
              <div key={item.code} className={cn('flex flex-col gap-3 p-5', current && 'bg-signal-soft/40')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-foreground">{item.name}</p>
                  {current && <Badge variant="signal">Current</Badge>}
                </div>
                <div>
                  <p className="font-mono text-[24px] font-semibold leading-none tabular-nums text-foreground">{money(item.price_paise, item.currency)}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">one-time reference price</p>
                </div>
                <p className="min-h-[2.5rem] text-[12.5px] leading-relaxed text-muted-foreground">
                  {item.credits_included != null
                    ? `${item.credits_included} preparation credits included`
                    : 'Credit allocation is set by the administrator.'}
                </p>
                {Array.isArray(item.features) && item.features.length > 0 && (
                  <ul className="space-y-1.5">
                    {item.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-1.5 text-[12px] leading-relaxed text-foreground/85">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" />{feature}
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant={current ? 'outline' : 'default'} size="sm" className="mt-auto" disabled title={payments.reason}>
                  {current ? 'Current plan' : 'Upgrade'} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border bg-muted/35 px-5 py-3">
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {payments.reason}
          </p>
        </div>
      </section>

      <section id="ledger" className="card overflow-hidden" aria-labelledby="ledger-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
          <div>
            <p id="ledger-heading" className="eyebrow">Transaction history</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Every grant, spend, refund and adjustment, newest first.</p>
          </div>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{total} entries</p>
        </div>

        {ledger.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : ledger.isError ? (
          <div className="flex items-center justify-between gap-3 px-5 py-6">
            <p className="text-[13px] text-destructive">{(ledger.error as Error)?.message || 'History could not be loaded.'}</p>
            <Button variant="outline" size="sm" onClick={() => ledger.refetch()}>Retry</Button>
          </div>
        ) : ledgerEntries.length === 0 ? (
          <EmptyState icon={History} title="No transactions yet" description="Your welcome grant and every future credit change will appear here." />
        ) : (
          <div>
            <div className="hidden grid-cols-[8rem_1fr_6rem_5.5rem] gap-2 border-b border-border bg-muted/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:grid">
              <span>Type</span><span>Reason</span><span className="text-right">When</span><span className="text-right">Delta</span>
            </div>
            {ledgerEntries.map((entry) => <LedgerRow key={entry.id} entry={entry} />)}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
          <p className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{pageStart}–{pageEnd} of {total}</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>Next</Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Credits;
