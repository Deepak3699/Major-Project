import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, BriefcaseBusiness, Building2, Check, ClipboardList,
  Compass, Lock, Mic, Moon, Search, ShieldCheck, Sun, Target, UserRound,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

const NAV = [
  { href: '#product', label: 'Product' },
  { href: '#workflow', label: 'How it works' },
  { href: '#preparation', label: 'Preparation' },
  { href: '#plans', label: 'Plans' },
  { href: '#trust', label: 'Trust' },
];

function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('jobpilot-theme') === 'dark'; } catch { return false; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    try { localStorage.setItem('jobpilot-theme', dark ? 'dark' : 'light'); } catch { /* storage can be disabled */ }
  }, [dark]);

  return (
    <button
      type="button"
      onClick={() => setDark((value) => !value)}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function PublicHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5 sm:px-8">
        <Link to="/" aria-label="Hiregen home" className="shrink-0">
          <Logo size="md" />
        </Link>
        <nav aria-label="Page sections" className="ml-6 hidden items-center gap-5 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground hover:underline hover:decoration-signal hover:underline-offset-4"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/register">Create free account</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

const PREVIEW_ROWS = [
  { role: 'Role 01', employer: 'Sample employer', signal: 'Evidence checked' },
  { role: 'Role 02', employer: 'Sample employer', signal: 'Source verified' },
  { role: 'Role 03', employer: 'Sample employer', signal: 'Profile aligned' },
];

function ProductPreview() {
  return (
    <div className="card overflow-hidden" aria-label="Illustrative Hiregen workspace preview">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div aria-hidden className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          <span className="h-2 w-2 rounded-full bg-border-strong" />
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">Hiregen · workspace</span>
        <Badge variant="muted">Sample</Badge>
      </div>
      <div className="grid sm:grid-cols-[9.5rem_minmax(0,1fr)]">
        <div className="hidden border-r border-border bg-muted/30 p-3 sm:block" aria-hidden>
          <p className="eyebrow px-1">Workspace</p>
          <ul className="mt-3 space-y-px">
            {[
              { icon: Compass, label: 'Discover' },
              { icon: Target, label: 'For you' },
              { icon: ClipboardList, label: 'Applications' },
              { icon: Mic, label: 'Practice' },
              { icon: BriefcaseBusiness, label: 'Credits' },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2 rounded-md px-1.5 py-2 text-[11.5px] text-muted-foreground">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">For you · sample order</p>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">3 roles</span>
          </div>
          <ul className="mt-3 space-y-2">
            {PREVIEW_ROWS.map((row, index) => (
              <li key={row.role} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[12.5px] font-medium text-foreground">{row.role}</p>
                  <p className="text-[11.5px] text-muted-foreground">{row.employer}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                  <Check className="h-3 w-3 text-success" aria-hidden />
                  {row.signal}
                </span>
                <span aria-hidden className="sr-only">Preview row {index + 1}</span>
              </li>
            ))}
          </ul>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
              <p className="eyebrow">Credits</p>
              <p className="mt-1 font-mono text-[22px] tabular-nums leading-none text-foreground">2</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">FREE plan</p>
            </div>
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
              <p className="eyebrow">Interview</p>
              <p className="mt-1.5 text-[12.5px] font-medium text-foreground">Practice session</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Score + feedback</p>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border px-4 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
          Illustrative interface · sample data, not live listings or results
        </p>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon, eyebrow, title, body, points,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
}) {
  return (
    <div className="card p-5">
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background text-foreground">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <p className="eyebrow mt-4">{eyebrow}</p>
      <h3 className="mt-1.5 text-[16px] font-semibold tracking-[-0.018em] text-foreground">{title}</h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      <ul className="mt-4 space-y-1.5 border-t border-border pt-3">
        {points.map((point) => (
          <li key={point} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/85">
            <Check className="mt-[3px] h-3 w-3 shrink-0 text-signal" aria-hidden />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FEATURES = [
  {
    icon: Search,
    eyebrow: 'Discover',
    title: 'Roles with evidence attached',
    body: 'Browse roles from permitted sources with source counts, posting age and a trust signal you can inspect before you apply.',
    points: ['Source and evidence view', 'Filters for role, location and setup', 'Saved and applied states'],
  },
  {
    icon: Target,
    eyebrow: 'Match',
    title: 'A fit score you can question',
    body: 'Recommendations break down skills, experience, projects and preferences so you know why a role was suggested.',
    points: ['Weighted dimension breakdown', 'Missing skills called out', 'Confirmed profile facts only'],
  },
  {
    icon: Mic,
    eyebrow: 'Practice',
    title: 'Rehearse, then see the gaps',
    body: 'Interview sessions capture answers, ask grounded follow-ups and end with a score, strengths and a revision plan.',
    points: ['Voice questions and answers', 'Adaptive follow-up questions', 'Learning tracks from your profile'],
  },
  {
    icon: BriefcaseBusiness,
    eyebrow: 'Prepare',
    title: 'Four modules for one role',
    body: 'Interview prep, group discussion, presentation structure and cited company research, all anchored to the job you selected.',
    points: ['Role- and company-specific', 'Sources with retrieval times', 'No employer endorsement claimed'],
  },
];

const STEPS = [
  { title: 'Build your profile', body: 'Enter details yourself or upload a resume. Extracted fields stay suggestions until you review and confirm them.' },
  { title: 'Choose a role', body: 'Discover fresh listings or open a recommendation. Read the evidence and decide whether the role is worth your time.' },
  { title: 'Prepare and practise', body: 'Use your confirmed profile and the job description to generate preparation, then rehearse with the interview bot.' },
  { title: 'Apply and track', body: 'You open the employer page and send the application. Hiregen tracks the status and lets you report an outcome voluntarily.' },
];

const PLANS = [
  { code: 'FREE', price: '₹0', note: 'Exactly 2 initial preparation credits', action: 'Start free' },
  { code: 'CLASSIC', price: '₹199', note: 'Credit allocation and entitlements configured by the administrator', action: null },
  { code: 'CLASSIC PLUS', price: '₹499', note: 'Credit allocation and entitlements configured by the administrator', action: null },
  { code: 'BRO', price: '₹799', note: 'A paid plan stays a user account; it never grants administrator access', action: null },
];

const TRUST = [
  { icon: UserRound, title: 'Your profile stays yours', body: 'No hidden employment decisions are made from generated content, and no application is submitted on your behalf.' },
  { icon: ShieldCheck, title: 'Roles are separated', body: 'Administrator access comes from a protected bootstrap process. Buying a plan never changes your security role.' },
  { icon: Building2, title: 'Claims carry sources', body: 'Company research keeps source URLs and retrieval timestamps, and says plainly when evidence is missing.' },
  { icon: Lock, title: 'Facts before generation', body: 'Only confirmed profile details and the selected job reach the provider. Provider keys stay server-side.' },
];

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:text-foreground"
      >
        Skip to content
      </a>
      <PublicHeader />

      <main id="main">
        {/* Hero */}
        <section className="border-b border-border" aria-labelledby="hero-heading">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:py-20">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              <p className="eyebrow">Candidate workspace · public preview</p>
              <h1 id="hero-heading" className="mt-4 text-[38px] font-semibold leading-[1.08] tracking-[-0.035em] text-foreground sm:text-[52px] lg:text-[58px]">
                A job search with its receipts.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Hiregen keeps the useful parts of a search in one place: roles with visible evidence, a profile you control,
                interview practice, job-specific preparation and an honest record of what you sent.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-2.5">
                <Button asChild size="lg">
                  <Link to="/register">Create free account <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
              <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                2 starter credits · no card required · no automatic applications
              </p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06, ease: EASE }}>
              <ProductPreview />
            </motion.div>
          </div>
        </section>

        {/* Feature grid */}
        <section id="product" className="mx-auto max-w-6xl px-5 py-14 sm:px-8" aria-labelledby="product-heading">
          <div className="max-w-2xl">
            <p className="eyebrow">Product</p>
            <h2 id="product-heading" className="mt-2 text-[28px] font-semibold tracking-[-0.028em] text-foreground">
              One workspace, from first shortlist to final answer.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
              Each module uses the same confirmed profile and the same selected job, so your preparation never drifts into generic advice.
            </p>
          </div>
          <div className="mt-7 grid gap-3 md:grid-cols-2">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05, ease: EASE }}
              >
                <FeatureCard {...feature} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="workflow" className="border-y border-border bg-muted/30" aria-labelledby="workflow-heading">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">How it works</p>
                <h2 id="workflow-heading" className="mt-2 text-[28px] font-semibold tracking-[-0.028em] text-foreground">Four steps, in your control.</h2>
              </div>
              <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                You decide what is confirmed, which roles deserve time and which application is yours to send.
              </p>
            </div>
            <ol className="mt-8 grid gap-px border-t border-border sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="border-b border-border px-4 py-5 first:pl-0 lg:border-b-0 lg:border-r lg:last:border-r-0 lg:first:pl-0">
                  <span className="font-mono text-[11px] tabular-nums text-signal">0{index + 1}</span>
                  <h3 className="mt-3 text-[15px] font-semibold tracking-[-0.014em] text-foreground">{step.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Preparation deep-dive */}
        <section id="preparation" className="mx-auto max-w-6xl px-5 py-14 sm:px-8" aria-labelledby="preparation-heading">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <p className="eyebrow">Preparation</p>
              <h2 id="preparation-heading" className="mt-2 text-[28px] font-semibold tracking-[-0.028em] text-foreground">
                Built for the role in front of you.
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                Preparation uses the posting, your confirmed profile and cited company context. Where evidence is missing, the artifact says so instead of guessing.
              </p>
              <ul className="mt-6 space-y-2.5">
                {[
                  'Interview preparation with question bank, frameworks and revision plan',
                  'Group discussion topics, balanced arguments and participation tips',
                  'Presentation outline with speaking notes and likely questions',
                  'Company research with source URLs and retrieval timestamps',
                ].map((line) => (
                  <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/90">
                    <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-signal" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <p className="eyebrow">Artifact · sample structure</p>
                <Badge variant="muted">Sample</Badge>
              </div>
              <div className="divide-y divide-border">
                {[
                  { index: '01', title: 'Role and company context', detail: 'Requirements and confirmed profile facts' },
                  { index: '02', title: 'Questions and frameworks', detail: 'A short answer shape for each question' },
                  { index: '03', title: 'Sources and evidence notes', detail: 'URLs, retrieval time, gaps called out' },
                  { index: '04', title: 'Revision plan', detail: 'What to review before the conversation' },
                ].map((row) => (
                  <div key={row.index} className="flex gap-4 px-5 py-3.5">
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{row.index}</span>
                    <div>
                      <p className="text-[13.5px] font-medium text-foreground">{row.title}</p>
                      <p className="mt-1 text-[12.5px] text-muted-foreground">{row.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">Preparation aid only · not employer endorsed</p>
              </div>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section id="plans" className="border-y border-border bg-muted/30" aria-labelledby="plans-heading">
          <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
            <div className="max-w-2xl">
              <p className="eyebrow">Plans</p>
              <h2 id="plans-heading" className="mt-2 text-[28px] font-semibold tracking-[-0.028em] text-foreground">Known prices. No invented entitlements.</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                The free plan is ready to use. Paid-plan credits, expiry and feature limits stay under administrator configuration until the product owner defines them.
              </p>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => (
                <div key={plan.code} className="card flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">{plan.code}</p>
                    {plan.code === 'FREE' && <Badge variant="success">Available</Badge>}
                  </div>
                  <p className="mt-4 font-mono text-[26px] tabular-nums leading-none text-foreground">{plan.price}</p>
                  <p className="mt-3 min-h-[3.5rem] text-[12.5px] leading-relaxed text-muted-foreground">{plan.note}</p>
                  <div className="mt-4 border-t border-border pt-3">
                    {plan.action ? (
                      <Button asChild size="sm" className="w-full">
                        <Link to="/register">{plan.action} <ArrowRight className="h-3.5 w-3.5" /></Link>
                      </Button>
                    ) : (
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Configured by administrator</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
              Checkout stays disabled until a payment provider and billing terms are configured. No purchase state is simulated.
            </p>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="mx-auto max-w-6xl px-5 py-14 sm:px-8" aria-labelledby="trust-heading">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <p className="eyebrow">Trust</p>
              <h2 id="trust-heading" className="mt-2 text-[28px] font-semibold tracking-[-0.028em] text-foreground">
                A tool, not a decision maker.
              </h2>
              <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
                Hiregen does not contact employers, submit forms or make hiring decisions. The output is preparation you review and use yourself.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TRUST.map((item) => (
                <div key={item.title} className="border-t border-border pt-4">
                  <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg border border-border text-foreground">
                    <item.icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-3 text-[14px] font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-6xl px-5 pb-14 sm:px-8" aria-labelledby="cta-heading">
          <div className="rounded-xl bg-foreground px-6 py-12 text-background sm:px-10">
            <div className="mx-auto max-w-2xl text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-background/60">Ready when you are</p>
              <h2 id="cta-heading" className="mt-3 text-[30px] font-semibold tracking-[-0.028em] sm:text-[36px]">Start with a profile. Everything else follows.</h2>
              <p className="mt-3 text-[14px] leading-relaxed text-background/70">
                Create an account, confirm your details and receive two preparation credits. The tour shows you where everything lives.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                <Button asChild size="lg" variant="secondary">
                  <Link to="/register">Create free account <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className={cn('text-background hover:bg-background/10')}>
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-8 px-5 py-10 sm:px-8">
          <div className="max-w-xs">
            <Logo size="md" />
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
              Job intelligence for candidates. Roles with evidence, preparation you control, and a record of what you sent.
            </p>
          </div>
          <nav aria-label="Footer sections" className="flex flex-wrap gap-x-8 gap-y-2">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="text-[12.5px] text-muted-foreground transition-colors hover:text-foreground">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="text-[12px] leading-relaxed text-muted-foreground">
            <p>© {new Date().getFullYear()} Hiregen</p>
            <p className="mt-1">Not an employer. No applications sent automatically.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
