import React from 'react';
import { motion } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { Target, ClipboardCheck, Globe2, BriefcaseBusiness } from 'lucide-react';

const FEATURES = [
  { icon: Globe2, title: 'Fresh roles from permitted sources', body: 'Company career pages, ATS platforms and job feeds in one searchable workspace.' },
  { icon: Target, title: 'Find suitable roles', body: 'See how each listing matches your skills, experience and preferences.' },
  { icon: ClipboardCheck, title: 'Keep applications organized', body: 'Review resume drafts, record replies, and follow every application milestone.' },
];

// Shared sign-in and registration layout.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0" style={{ background: 'var(--grad-mesh)' }} />
        <div className="relative z-10"><Logo /></div>
        <div className="relative z-10 max-w-md">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
            <BriefcaseBusiness className="h-3.5 w-3.5 text-primary" /> A clearer job search
          </div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight">
            Find a role that fits<span className="text-gradient"> and make your next step clear.</span>
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Discover fresh jobs, compare the fit with your profile, prepare honest application materials, and track each outcome from saved to joined.
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
        <p className="relative z-10 text-xs text-muted-foreground/70">© {new Date().getFullYear()} JobPilot · Career Workspace</p>
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
