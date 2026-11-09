import React from 'react';
import { motion } from 'framer-motion';
import { Logo } from '@/components/Logo';
import { ArrowUpRight } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;
const ONE_LINERS = [
  'Fresh roles from company career pages and ATS platforms.',
  'Every listing scored for evidence and source trust.',
  'Drafts reviewed by you, sent by you.',
  'Applications tracked from saved to joined.',
];

// Shared sign-in and registration layout.
// Narrative panel sits on fixed warm graphite; the form panel follows the theme.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Narrative panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[hsl(28_8%_9%)] p-10 lg:flex xl:p-14">
        {/* dotted atmosphere */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(hsl(44 22% 92% / 0.11) 1px, transparent 1px)',
            backgroundSize: '23px 23px',
            maskImage: 'radial-gradient(ellipse 110% 95% at 80% 0%, black 30%, transparent 78%)',
            WebkitMaskImage: 'radial-gradient(ellipse 110% 95% at 80% 0%, black 30%, transparent 78%)',
          }}
        />
        <div className="relative z-10 flex items-center gap-2.5">
          <span aria-hidden className="h-3 w-3 rounded-[3px] bg-signal" />
          <span className="text-[19px] font-semibold tracking-[-0.032em] text-[hsl(44_22%_92%)]">Hiregen</span>
        </div>

        <div className="relative z-10 max-w-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[hsl(44_22%_60%)]">
            Job intelligence, without the noise
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.12] tracking-[-0.028em] text-[hsl(44_22%_92%)]">
            See every role worth your time.
            <span className="text-[hsl(44_22%_55%)]"> Nothing that isn't.</span>
          </h1>
          <ul className="mt-9 space-y-px">
            {ONE_LINERS.map((line, i) => (
              <motion.li
                key={line}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: EASE }}
                className="group flex h-11 items-center gap-3 border-t border-[hsl(30_6%_18%)] last:border-b"
              >
                <span className="font-mono text-[10px] text-[hsl(44_22%_45%)]">0{i + 1}</span>
                <span className="text-[13.5px] leading-snug text-[hsl(44_16%_74%)] transition-colors group-hover:text-[hsl(44_22%_92%)]">{line}</span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 -translate-x-1 text-[hsl(44_22%_45%)] opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </motion.li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 font-mono text-[11px] text-[hsl(44_22%_45%)]">
          © {new Date().getFullYear()} Hiregen
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-5 py-12 sm:px-6 lg:w-[54%]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="w-full max-w-[368px]"
        >
          <div className="mb-8 flex flex-col items-start gap-5 lg:hidden">
            <Logo size="lg" />
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
