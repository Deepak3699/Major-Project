import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { AlertCircle, ArrowRight, Check, Coins, History, Lock, Sparkles } from 'lucide-react';
import { credits } from '@/lib/api';
import { CreditKind, CreditLedgerEntry } from '@/lib/types';
/* header replaced by premium hero */
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
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-[hsl(22,22%,24%)] bg-grad-hero p-6 text-[hsl(33,34%,94%)] sm:p-8">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grad-glow" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[hsl(14,52%,64%)]">Credits & plan</p>
            <h1 className="mt-3 text-[32px] font-semibold leading-[1.08] tracking-[-0.032em] text-[#EFDECD] sm:text-[40px]">Your preparation, well managed.</h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-[hsl(30,16%,74%)]">
              Every preparation credit is tracked in a secure server-side ledger. Clear balances, transparent history, and plans designed for your pace.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="h-11 bg-[hsl(14,46%,58%)] px-5 text-[hsl(22,32%,12%)] hover:bg-[hsl(14,50%,64%)]">
                <Link to="/practice/prepare"><Sparkles className="h-4 w-4" />Use for preparation</Link>
              </Button>
              <Button variant="outline" asChild className="h-11 border-[hsl(33,34%,94%/0.18)] bg-transparent px-5 text-[#EFDECD] hover:bg-[hsl(33,34%,94%/0.08)] hover:text-[#EFDECD]">
                <a href="#ledger"><History className="h-4 w-4" />View ledger</a>
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-[hsl(33,34%,94%/0.12)] bg-[hsl(33,34%,94%/0.05)] p-5 backdrop-blur-[1px] sm:min-w-[220px]">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[hsl(30,16%,68%)]">Current balance</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-[42px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-[#EFDECD]">{wallet.balance}</span>
              <span className="text-[13px] text-[hsl(30,16%,72%)]">credits</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={plan.code === 'FREE' ? 'muted' : 'signal'} className="bg-[hsl(33,34%,94%/0.1)] text-[#EFDECD] border-[hsl(33,34%,94%/0.12)]">{plan.name}</Badge>
              {wallet.signup_granted && <span className="text-[11px] text-[hsl(30,16%,72%)]">{free_initial_credits} welcome credits applied</span>}
            </div>
          </div>
        </div>
      </section>

      <StatCardGrid>
        <StatCard icon={Coins} label="Balance" value={wallet.balance} tone="success" hint="Available to spend" />
        <StatCard icon={Sparkles} label="Granted" value={wallet.lifetime_granted} tone="muted" hint="Lifetime credits added" />
        <StatCard icon={History} label="Used" value={wallet.lifetime_used} tone="warning" hint="Lifetime credits spent" />
        <StatCard icon={Lock} label="Plan" value={plan.name} tone="primary" hint={plan.code === 'FREE' ? 'Upgrade when available' : 'Paid plan'} />
      </StatCardGrid>

      <section className="card overflow-hidden" aria-labelledby="plans-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-5 sm:px-6">
          <div>
            <p id="plans-heading" className="eyebrow">Choose your plan</p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.02em] text-foreground">Plans built for momentum</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">Known prices, no invented entitlements. Paid-plan credits and billing stay configurable by the owner.</p>
          </div>
          <Badge variant="outline">Billing not configured</Badge>
        </div>
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-4">
          {plans.map((item) => {
            const current = item.code === plan.code;
            return (
              <div key={item.code} className={cn('flex flex-col rounded-2xl border p-5 transition-all duration-200', current ? 'border-signal/35 bg-signal-soft/25 shadow-pop' : 'border-border bg-surface hover:border-border-strong hover:shadow-pop')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{item.code}</p>
                  {current ? <Badge variant="signal">Current</Badge> : item.code === 'FREE' ? <Badge variant="muted">Free</Badge> : <Badge variant="outline">Premium</Badge>}
                </div>
                <p className="mt-4 text-[15px] font-semibold text-foreground">{item.name}</p>
                <div className="mt-2">
                  <p className="font-mono text-[30px] font-semibold leading-none tabular-nums tracking-tight text-foreground">{money(item.price_paise, item.currency)}</p>
                  <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">one-time reference price</p>
                </div>
                <p className="mt-4 min-h-[2.75rem] text-[12.5px] leading-relaxed text-muted-foreground">
                  {item.credits_included != null
                    ? `${item.credits_included} preparation credits included`
                    : 'Credit allocation is set by the administrator.'}
                </p>
                {Array.isArray(item.features) && item.features.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-border pt-4">
                    {item.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-[12px] leading-relaxed text-foreground/85">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />{feature}
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant={current ? 'outline' : 'default'} size="sm" className="mt-5" disabled title={payments.reason}>
                  {current ? 'Current plan' : 'Get started'} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-border bg-muted/30 px-5 py-4 sm:px-6">
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {payments.reason}
          </p>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5" aria-label="Credit and billing policies">
        {[
          { title: 'Credits ledger', detail: 'Every change recorded' },
          { title: 'Use for preparation', detail: 'Role-specific modules' },
          { title: 'Plan selection', detail: 'Administrator controlled' },
          { title: 'Payment security', detail: 'Provider verification pending' },
          { title: 'Refund policy', detail: 'Owner decision pending' },
        ].map((item) => (
          <div key={item.title} className="bg-surface px-3.5 py-3">
            <p className="text-[12px] font-medium text-foreground">{item.title}</p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{item.detail}</p>
          </div>
        ))}
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
