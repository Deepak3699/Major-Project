import React from 'react';
import { motion } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { Radar, Sparkles, Zap, Globe2 } from 'lucide-react';

const FEATURES = [
  { icon: Globe2, title: 'Every India source', body: 'Naukri · Internshala · Apna · Cutshort · ATS boards + 30 more, run in parallel.' },
  { icon: Sparkles, title: 'HR contact enrichment', body: 'An autonomous fallback army finds the person behind every posting.' },
  { icon: Zap, title: 'Fully automatic', body: 'One click scrapes, enriches, verifies and drafts. You just review.' },
];

// Shared premium split-screen used by Login + Register.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--grad-mesh)' }} />
        <motion.div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-primary/25 blur-[120px]" animate={{ y: [0, -30, 0], opacity: [0.6, 0.9, 0.6] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="pointer-events-none absolute right-0 top-10 h-72 w-72 rounded-full bg-info/20 blur-[100px]" animate={{ y: [0, 40, 0] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }} />

        <div className="relative z-10"><Logo /></div>
        <div className="relative z-10 max-w-md">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/40 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Radar className="h-3.5 w-3.5 animate-pulse text-success" /> Autonomous lead intelligence
          </div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">
            Find every fresher job in India<span className="text-gradient"> and the HR behind it.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Scrape → enrich → verify → draft, on autopilot. Contact enrichment with an army of free + paid fallbacks, so a lead never comes back empty.
          </p>
          <div className="mt-8 space-y-4">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.12 }} className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border/60 bg-surface/50 text-primary backdrop-blur"><f.icon className="h-[18px] w-[18px]" /></div>
                <div><p className="text-sm font-semibold text-foreground">{f.title}</p><p className="text-[13px] text-muted-foreground">{f.body}</p></div>
              </motion.div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs text-muted-foreground/70">© {new Date().getFullYear()} Take It · Lead Intelligence Engine</p>
      </div>

      <div className="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden"><Logo /></div>
          <div className="mb-8">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="glow-ring card p-6 sm:p-7">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
