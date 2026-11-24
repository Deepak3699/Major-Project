import React from 'react';
import { useQuery } from 'react-query';
import { Check, Crown, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { credits } from '@/lib/api';
import { cn } from '@/components/ui/cn';

const PLAN_DETAILS: Record<string, { tagline: string; features: string[] }> = {
  FREE: { tagline: 'Get started with essentials', features: ['2 initial preparation credits', 'Job discovery & tracking', 'Profile-based recommendations'] },
  CLASSIC: { tagline: 'More room to prepare', features: ['Everything in Free', 'Additional preparation credits', 'Priority preparation access'] },
  CLASSIC_PLUS: { tagline: 'For serious preparation', features: ['Everything in Classic', 'Higher credit allocation', 'Advanced preparation workflows'] },
  BRO: { tagline: 'Maximum preparation power', features: ['Everything in Classic Plus', 'Highest credit allocation', 'Premium candidate experience'] },
};

export function SubscriptionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useQuery('credits-overview', credits.overview, { enabled: open, staleTime: 30000 });
  const plans = data?.plans || [];
  const current = data?.plan?.code;

  return (
    <Modal open={open} onClose={onClose} title="Upgrade your plan" description="Choose a plan that matches your preparation pace. Paid plans are configured by the administrator." size="lg">
      <div className="space-y-4">
        <div className="rounded-xl bg-grad-hero p-4 text-[hsl(33,34%,94%)]">
          <div className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[hsl(14,52%,64%)]"><Crown className="h-3.5 w-3.5" /> Premium plans</div>
          <p className="mt-2 text-[14px] leading-relaxed text-[hsl(30,16%,74%)]">Invest in your preparation with a plan designed for focus, confidence, and momentum.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => {
            const detail = PLAN_DETAILS[plan.code] || { tagline: 'Plan details', features: [] };
            const active = current === plan.code;
            return (
              <div key={plan.code} className={cn('rounded-xl border p-4', active ? 'border-signal/40 bg-signal-soft/30' : 'border-border bg-surface')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{plan.code}</p>
                    <p className="mt-1 font-mono text-[24px] tabular-nums leading-none text-foreground">₹{Math.round((plan.price_paise || 0) / 100).toLocaleString('en-IN')}</p>
                  </div>
                  {active ? <Badge variant="success">Current</Badge> : plan.code === 'FREE' ? <Badge variant="muted">Free</Badge> : <Badge variant="signal"><Sparkles className="mr-1 h-3 w-3" />Premium</Badge>}
                </div>
                <p className="mt-2 text-[12.5px] text-muted-foreground">{detail.tagline}</p>
                <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {detail.features.map((f) => (
                    <li key={f} className="flex gap-2 text-[12px] text-foreground/85"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />{f}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <p className="text-[12px] text-muted-foreground">Checkout is enabled only when payment provider is configured.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button asChild onClick={onClose}><Link to="/credits">View credits & plans</Link></Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
