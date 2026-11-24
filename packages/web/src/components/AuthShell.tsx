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

// Shared sign-in and registration layout. Both panels follow the theme tokens:
// ink on light, warm paper on dark. The narrative stays editorial and flat.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Narrative panel */}
      <div className="hidden w-[46%] flex-col justify-between bg-foreground p-10 text-background lg:flex xl:p-14">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="h-3 w-3 rounded-[3px] bg-signal" />
          <span className="text-[19px] font-semibold tracking-[-0.032em]">Hiregen</span>
        </div>

        <div className="max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-background/60">
            Job intelligence, without the noise
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.12] tracking-[-0.028em]">
            See every role worth your time.
            <span className="text-background/55"> Nothing that isn't.</span>
          </h1>
          <ul className="mt-9 space-y-px">
            {ONE_LINERS.map((line, i) => (
              <motion.li
                key={line}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.35, ease: EASE }}
                className="group flex h-11 items-center gap-3 border-t border-background/15 last:border-b"
              >
                <span className="font-mono text-[10px] text-background/50">0{i + 1}</span>
                <span className="text-[13.5px] leading-snug text-background/75 transition-colors group-hover:text-background">{line}</span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-background/40 transition-colors group-hover:text-background" />
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="font-mono text-[11px] text-background/50">© {new Date().getFullYear()} Hiregen</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-5 py-12 sm:px-6 lg:w-[54%]">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="w-full max-w-[368px]"
        >
          <div className="mb-6 flex items-center justify-between gap-3">
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
            <h2 className="mt-1.5 text-[24px] font-semibold tracking-[-0.022em] text-foreground">{title}</h2>
          </div>
          <div className="card p-6">{children}</div>
        </motion.div>
      </div>
    </div>
  );
}
