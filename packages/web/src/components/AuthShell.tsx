import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;
const ONE_LINERS = [
  'Fresh roles from company career pages and ATS platforms.',
  'Every listing scored for evidence and source trust.',
  'Drafts reviewed by you, sent by you.',
  'Applications tracked from saved to joined.',
];

// Shared sign-in and registration layout. Premium editorial split:
// deep ink narrative panel, warm ivory form panel, refined emerald signal.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Narrative panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-grad-hero p-10 text-[hsl(33,34%,94%)] lg:flex xl:p-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-grad-glow" />
        <div aria-hidden className="pointer-events-none absolute inset-0 border-r border-[hsl(22,22%,24%)]" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-[hsl(14,46%,58%/0.14)]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 right-10 h-48 w-48 rounded-full border border-[hsl(14,46%,58%/0.08)]" />

        <div className="relative flex items-center gap-2.5">
          <span aria-hidden className="h-3 w-3 rounded-[3px] bg-[hsl(14,46%,58%)]" />
          <span className="text-[19px] font-semibold tracking-[-0.032em]">HireGen</span>
        </div>

        <div className="relative max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[hsl(28,14%,62%)]">
            Job intelligence, without the noise
          </p>
          <h1 className="mt-4 text-[36px] font-semibold leading-[1.1] tracking-[-0.03em] xl:text-[40px]">
            Your next role,
            <span className="block text-[hsl(14,52%,64%)]">prepared with care.</span>
          </h1>
          <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-[hsl(30,16%,72%)]">
            A premium workspace for discovery, preparation and honest application tracking.
          </p>
          <ul className="mt-9 space-y-px">
            {ONE_LINERS.map((line, i) => (
              <motion.li
                key={line}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.35, ease: EASE }}
                className="group flex h-11 items-center gap-3 border-t border-[hsl(22,22%,24%)] last:border-b"
              >
                <span className="font-mono text-[10px] text-[hsl(14,52%,64%)]">0{i + 1}</span>
                <span className="text-[13.5px] leading-snug text-[hsl(33,24%,78%)] transition-colors group-hover:text-[hsl(33,34%,94%)]">{line}</span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[hsl(28,12%,46%)] transition-colors group-hover:text-[hsl(14,52%,64%)]" />
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-[11px] text-[hsl(28,12%,52%)]">© {new Date().getFullYear()} HireGen</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-5 py-12 sm:px-6 lg:w-[54%]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="w-full max-w-[392px]"
        >
          <div className="mb-7 flex items-center justify-between gap-3">
            <Logo size="lg" />
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4"
            >
              <ArrowLeft className="h-3.5 w-3.5" />Back to preview
            </Link>
          </div>
          <div className="mb-7">
            <p className="eyebrow">{subtitle}</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.026em] text-foreground">{title}</h2>
          </div>
          <div className="card p-6 sm:p-7">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
