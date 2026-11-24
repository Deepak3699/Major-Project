import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, BriefcaseBusiness, Building2, Check, ClipboardList, Coins,
  Compass, FileText, Lock, Mic, Moon, Presentation, Search, ShieldCheck, Sun, Target,
  UserRound, Users,
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
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center gap-4 px-5 sm:px-8">
        <Link to="/" aria-label="AI JobPilot home" className="shrink-0">
          <Logo size="md" />
        </Link>
        <nav aria-label="Page sections" className="ml-8 hidden items-center gap-6 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="px-4">
            <Link to="/register">Create free account</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

const PREVIEW_ROWS = [
  { role: 'Product Designer', employer: 'Sample employer', meta: 'Hybrid · 2–4 yrs', match: '92%' },
  { role: 'Frontend Engineer', employer: 'Sample employer', meta: 'Remote · 3–5 yrs', match: '86%' },
  { role: 'Data Analyst', employer: 'Sample employer', meta: 'On-site · 1–3 yrs', match: '81%' },
];

const PREP_TILES = [
  { icon: Mic, label: 'Mock interview' },
  { icon: Users, label: 'Group discussion' },
  { icon: Presentation, label: 'Presentation' },
  { icon: Building2, label: 'Company research' },
];

function PreviewRing() {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" role="img" aria-label="Sample profile 75 percent complete">
      <circle cx="30" cy="30" r={radius} fill="none" stroke="hsl(var(--border) / 0.7)" strokeWidth="5" />
      <circle cx="30" cy="30" r={radius} fill="none" stroke="hsl(var(--signal))" strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * 0.25} transform="rotate(-90 30 30)" />
      <text x="30" y="34" textAnchor="middle" className="font-mono text-[12px] tabular-nums" style={{ fill: 'hsl(var(--foreground))' }}>75%</text>
    </svg>
  );
}

function ProductPreview() {
  const glassPanel = 'rounded-xl border border-[hsl(var(--border)/0.65)] bg-[hsl(var(--surface)/0.62)] backdrop-blur-md shadow-[0_1px_0_hsl(var(--surface)/0.8)_inset]';
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-4 rounded-[2rem] bg-[radial-gradient(ellipse_at_top,hsl(var(--signal)/0.14),transparent_55%),radial-gradient(ellipse_at_bottom_right,hsl(var(--primary)/0.08),transparent_50%)] blur-sm" />
      <div aria-hidden className="absolute -inset-3 rounded-[1.75rem] border border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface)/0.35)] backdrop-blur-sm" />
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--surface)/0.58)] shadow-[0_24px_60px_-20px_hsl(var(--foreground)/0.18)] backdrop-blur-xl" aria-label="Illustrative AI JobPilot workspace preview">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--surface)/0.45),hsl(var(--surface)/0.15))]" />
        <div className="relative flex items-center justify-between gap-3 border-b border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface)/0.45)] px-4 py-3 backdrop-blur-md">
          <div aria-hidden className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-signal/40" />
            <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--foreground)/0.15)]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--foreground)/0.15)]" />
          </div>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">AI JobPilot · candidate workspace</span>
          <Badge variant="signal" className="bg-signal-soft/80 backdrop-blur-sm">Sample</Badge>
        </div>
        <div className="relative grid sm:grid-cols-[9rem_minmax(0,1fr)]">
          <div className="hidden border-r border-[hsl(var(--border)/0.55)] bg-[hsl(var(--muted)/0.25)] p-3.5 backdrop-blur-sm sm:block" aria-hidden>
            <p className="eyebrow px-1 text-foreground/65">Workspace</p>
            <ul className="mt-3 space-y-0.5">
              {[
                { icon: Compass, label: 'Discover', active: false },
                { icon: Target, label: 'For you', active: true },
                { icon: ClipboardList, label: 'Applications', active: false },
                { icon: Mic, label: 'Practice', active: false },
                { icon: FileText, label: 'Credits', active: false },
              ].map(({ icon: Icon, label, active }) => (
                <li key={label} className={cn('flex items-center gap-2 rounded-lg px-2 py-2 text-[11px] transition-colors', active ? 'bg-signal-soft/80 text-signal font-semibold shadow-[inset_0_0_0_1px_hsl(var(--signal)/0.12)]' : 'text-foreground/70')}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl border border-[hsl(var(--border)/0.6)] bg-[hsl(var(--surface)/0.55)] p-2.5 backdrop-blur-sm">
              <p className="text-[11px] font-semibold leading-tight text-foreground">Your career, our priority.</p>
              <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.05em] text-muted-foreground">Credits → preparation</p>
            </div>
          </div>

          <div className="min-w-0 bg-[hsl(var(--background)/0.25)] p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { icon: BriefcaseBusiness, label: 'Active jobs', value: '12' },
                { icon: ClipboardList, label: 'Applied', value: '08' },
                { icon: Coins, label: 'Credits', value: '02' },
                { icon: Target, label: 'Matches', value: '03' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className={cn(glassPanel, 'px-2.5 py-2.5')}>
                  <div className="flex items-center justify-between gap-2">
                    <Icon className="h-3.5 w-3.5 text-signal/80" aria-hidden />
                    <span className="h-1.5 w-1.5 rounded-full bg-signal/60" aria-hidden />
                  </div>
                  <p className="mt-2 font-mono text-[18px] tabular-nums leading-none tracking-tight text-foreground">{value}</p>
                  <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.05em] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_11.5rem]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="eyebrow text-foreground/70">Recommended for you</p>
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.05em] text-muted-foreground">3 roles</span>
                </div>
                <ul className="mt-2 space-y-2">
                  {PREVIEW_ROWS.map((row) => (
                    <li key={row.role} className={cn(glassPanel, 'flex flex-wrap items-center justify-between gap-2 px-3 py-2.5')}>
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-foreground">{row.role}</p>
                        <p className="truncate text-[10.5px] text-muted-foreground">{row.employer} · {row.meta}</p>
                      </div>
                      <span className="rounded-md border border-signal/25 bg-signal-soft/80 px-2 py-1 font-mono text-[9.5px] tabular-nums text-signal">{row.match} match</span>
                    </li>
                  ))}
                </ul>
                <p className="eyebrow mt-4 text-foreground/70">Preparation center</p>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {PREP_TILES.map(({ icon: Icon, label }) => (
                    <div key={label} className={cn(glassPanel, 'px-1.5 py-2.5 text-center')}>
                      <Icon className="mx-auto h-3.5 w-3.5 text-signal/85" aria-hidden />
                      <p className="mt-1.5 truncate text-[8.5px] font-medium text-foreground/75">{label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className={cn(glassPanel, 'px-3 py-3')}>
                  <div className="flex items-center gap-2.5">
                    <PreviewRing />
                    <div>
                      <p className="eyebrow text-foreground/70">Profile</p>
                      <p className="mt-1 text-[11px] font-medium text-foreground">Nearly ready</p>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1.5 border-t border-[hsl(var(--border)/0.55)] pt-2.5">
                    {['Basic details', 'Education', 'Skills', 'Experience'].map((item, index) => (
                      <li key={item} className="flex items-center gap-1.5 text-[10px] text-foreground/75">
                        <span className={cn('grid h-3.5 w-3.5 place-items-center rounded-full border', index < 3 ? 'border-success/30 bg-success-soft text-success' : 'border-border/70 bg-surface/40')}>
                          {index < 3 ? <Check className="h-2 w-2" aria-hidden /> : null}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={cn(glassPanel, 'px-3 py-3')}>
                  <p className="eyebrow text-foreground/70">Application progress</p>
                  <ol className="mt-3 flex items-center" aria-label="Sample application progress">
                    {['Applied', 'Interview', 'Offer', 'Joined'].map((stage, index) => (
                      <li key={stage} className="flex flex-1 flex-col items-center gap-1 text-center">
                        <span className={cn('grid h-4.5 w-4.5 place-items-center rounded-full border font-mono text-[8px]', index < 2 ? 'border-signal/50 bg-signal text-signal-foreground' : 'border-border/70 bg-surface/40 text-muted-foreground')}>
                          {index < 2 ? <Check className="h-2 w-2" aria-hidden /> : index + 1}
                        </span>
                        <span className="text-[8.5px] text-foreground/70">{stage}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="relative border-t border-[hsl(var(--border)/0.55)] bg-[hsl(var(--surface)/0.35)] px-4 py-2.5 backdrop-blur-sm">
          <p className="font-mono text-[10px] uppercase tracking-[0.07em] text-muted-foreground">
            Illustrative interface · sample data, not live listings or results
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon, eyebrow, title, body, points, index,
}: {
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  index: number;
}) {
  return (
    <div className="card group relative h-full p-6 transition-colors duration-200 hover:border-border-strong">
      <div className="flex items-start justify-between gap-4">
        <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-muted/40 text-foreground transition-colors group-hover:border-signal/30 group-hover:bg-signal-soft group-hover:text-signal">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground/70">0{index + 1}</span>
      </div>
      <p className="eyebrow mt-5">{eyebrow}</p>
      <h3 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
      <ul className="mt-5 space-y-2 border-t border-border pt-4">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5 text-[12.5px] leading-relaxed text-foreground/85">
            <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-signal" aria-hidden />
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
  { title: 'Apply and track', body: 'You open the employer page and send the application. AI JobPilot tracks the status and lets you report an outcome voluntarily.' },
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

const PRINCIPLES = [
  { value: '02', label: 'Starter credits' },
  { value: '04', label: 'Preparation modules' },
  { value: '100%', label: 'User-controlled applying' },
];

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:text-foreground"
      >
        Skip to content
      </a>
      <PublicHeader />

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border bg-[linear-gradient(180deg,hsl(36,40%,99%),hsl(34,38%,95%))]" aria-labelledby="hero-heading">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(14,50%,93%,0.9),transparent_45%),radial-gradient(ellipse_at_bottom_left,hsl(32,36%,92%,0.7),transparent_40%)]" />
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -right-24 top-0 h-[28rem] w-[28rem] rounded-full border border-signal/10" />
            <div className="absolute -right-8 top-16 h-[20rem] w-[20rem] rounded-full border border-signal/8" />
          </div>
          <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-24">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">Candidate workspace · public preview</span>
                </div>
                <h1 id="hero-heading" className="mt-6 max-w-xl text-[42px] font-semibold leading-[1.04] tracking-[-0.04em] text-foreground sm:text-[56px] lg:text-[64px]">
                  <span className="text-[hsl(20,40%,12%)] dark:text-[#EFDECD]">A job search,</span>
                  <span className="block text-signal">crafted with clarity.</span>
                </h1>
                <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-muted-foreground">
                  AI JobPilot brings roles, evidence, preparation and application tracking into one refined workspace — so every move you make is informed, deliberate and yours.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg" className="h-11 px-6">
                    <Link to="/register">Create free account <ArrowRight className="h-4 w-4" /></Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-11 px-6">
                    <Link to="/login">Sign in</Link>
                  </Button>
                </div>
                <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-5">
                  {['2 starter credits', 'No card required', 'No automatic applications'].map((item) => (
                    <p key={item} className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      <span className="h-1 w-1 rounded-full bg-signal/70" aria-hidden />
                      {item}
                    </p>
                  ))}
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.08, ease: EASE }}>
                <ProductPreview />
              </motion.div>
            </div>

            <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
              {PRINCIPLES.map((item) => (
                <div key={item.label} className="bg-surface px-5 py-5 sm:px-6">
                  <p className="font-mono text-[28px] tabular-nums leading-none tracking-tight text-foreground">{item.value}</p>
                  <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section id="product" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20" aria-labelledby="product-heading">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,0.66fr)] lg:items-end">
            <div>
              <p className="eyebrow">Product</p>
              <h2 id="product-heading" className="mt-3 text-[32px] font-semibold leading-[1.12] tracking-[-0.032em] text-foreground sm:text-[40px]">
                One workspace, every meaningful step.
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground lg:pb-1">
              Each module uses the same confirmed profile and the same selected job, so your preparation never drifts into generic advice. Evidence stays visible, and control stays with you.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.35, delay: index * 0.04, ease: EASE }}
              >
                <FeatureCard {...feature} index={index} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="workflow" className="border-y border-border bg-muted/20" aria-labelledby="workflow-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div className="max-w-2xl">
                <p className="eyebrow">How it works</p>
                <h2 id="workflow-heading" className="mt-3 text-[32px] font-semibold tracking-[-0.032em] text-foreground sm:text-[40px]">Four steps, fully in your control.</h2>
              </div>
              <p className="max-w-sm text-[14px] leading-relaxed text-muted-foreground">
                You decide what is confirmed, which roles deserve time and which application is yours to send.
              </p>
            </div>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="card relative p-5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-signal/25 bg-signal-soft font-mono text-[11px] tabular-nums text-signal">0{index + 1}</span>
                  <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.014em] text-foreground">{step.title}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Preparation deep-dive */}
        <section id="preparation" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20" aria-labelledby="preparation-heading">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center">
            <div>
              <p className="eyebrow">Preparation</p>
              <h2 id="preparation-heading" className="mt-3 text-[32px] font-semibold leading-[1.12] tracking-[-0.032em] text-foreground sm:text-[40px]">
                Built for the role in front of you.
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                Preparation uses the posting, your confirmed profile and cited company context. Where evidence is missing, the artifact says so instead of guessing.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  'Interview preparation with question bank, frameworks and revision plan',
                  'Group discussion topics, balanced arguments and participation tips',
                  'Presentation outline with speaking notes and likely questions',
                  'Company research with source URLs and retrieval timestamps',
                ].map((line) => (
                  <li key={line} className="flex gap-3 text-[13.5px] leading-relaxed text-foreground/90">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-signal/25 bg-signal-soft text-signal">
                      <Check className="h-3 w-3" aria-hidden />
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card overflow-hidden shadow-pop">
              <div className="flex items-center justify-between border-b border-border bg-muted/20 px-5 py-4">
                <div>
                  <p className="eyebrow">Artifact · sample structure</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">What a preparation package contains</p>
                </div>
                <Badge variant="muted" className="bg-surface">Sample</Badge>
              </div>
              <div className="divide-y divide-border">
                {[
                  { index: '01', title: 'Role and company context', detail: 'Requirements, responsibilities and confirmed profile facts' },
                  { index: '02', title: 'Questions and frameworks', detail: 'A clear answer shape for each likely question' },
                  { index: '03', title: 'Sources and evidence notes', detail: 'URLs, retrieval time, and gaps called out plainly' },
                  { index: '04', title: 'Revision plan', detail: 'Focused actions to review before the conversation' },
                ].map((row) => (
                  <div key={row.index} className="flex gap-4 px-5 py-4">
                    <span className="font-mono text-[11px] tabular-nums text-signal">{row.index}</span>
                    <div>
                      <p className="text-[14px] font-medium text-foreground">{row.title}</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{row.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border bg-muted/10 px-5 py-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.07em] text-muted-foreground">Preparation aid only · not employer endorsed</p>
              </div>
            </div>
          </div>
        </section>

        {/* Plans */}
        <section id="plans" className="border-y border-border bg-muted/20" aria-labelledby="plans-heading">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20">
            <div className="max-w-2xl">
              <p className="eyebrow">Plans</p>
              <h2 id="plans-heading" className="mt-3 text-[32px] font-semibold tracking-[-0.032em] text-foreground sm:text-[40px]">Clear pricing. Honest limits.</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
                The free plan is ready to use. Paid-plan credits, expiry and feature limits stay under administrator configuration until the product owner defines them.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => (
                <div key={plan.code} className={cn('card flex flex-col p-5', plan.code === 'FREE' && 'border-signal/30')}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground">{plan.code}</p>
                    {plan.code === 'FREE' && <Badge variant="success">Available</Badge>}
                  </div>
                  <p className="mt-5 font-mono text-[30px] tabular-nums leading-none tracking-tight text-foreground">{plan.price}</p>
                  <p className="mt-3 min-h-[4rem] text-[12.5px] leading-relaxed text-muted-foreground">{plan.note}</p>
                  <div className="mt-5 border-t border-border pt-4">
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
            <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
              Checkout stays disabled until a payment provider and billing terms are configured. No purchase state is simulated.
            </p>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:py-20" aria-labelledby="trust-heading">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div>
              <p className="eyebrow">Trust</p>
              <h2 id="trust-heading" className="mt-3 text-[32px] font-semibold leading-[1.12] tracking-[-0.032em] text-foreground sm:text-[40px]">
                A tool, not a decision maker.
              </h2>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                AI JobPilot does not contact employers, submit forms or make hiring decisions. The output is preparation you review and use yourself.
              </p>
              <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">Design principle</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-foreground/90">Every generated claim should be inspectable, and every important action should remain yours.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {TRUST.map((item) => (
                <div key={item.title} className="card p-5">
                  <span aria-hidden className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-muted/30 text-foreground">
                    <item.icon className="h-4 w-4" strokeWidth={1.75} />
                  </span>
                  <h3 className="mt-4 text-[14px] font-semibold tracking-[-0.01em] text-foreground">{item.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:pb-20" aria-labelledby="cta-heading">
          <div className="relative overflow-hidden rounded-2xl border border-[hsl(22,22%,24%)] bg-grad-hero px-6 py-14 text-[hsl(33,34%,94%)] sm:px-10">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-grad-glow" />
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-[hsl(14,46%,58%/0.14)]" />
            <div aria-hidden className="pointer-events-none absolute bottom-0 left-10 h-32 w-32 rounded-full border border-[hsl(14,46%,58%/0.08)]" />
            <div className="relative mx-auto max-w-3xl text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[hsl(14,52%,64%)]">Ready when you are</p>
              <h2 id="cta-heading" className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-[-0.032em] sm:text-[44px]">Start with a profile. Everything else follows.</h2>
              <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-[hsl(30,16%,72%)]">
                Create an account, confirm your details and receive two preparation credits. The tour shows you where everything lives.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild size="lg" className="h-11 bg-[hsl(14,46%,58%)] px-6 text-[hsl(22,32%,12%)] hover:bg-[hsl(14,50%,64%)]">
                  <Link to="/register">Create free account <ArrowRight className="h-4 w-4" /></Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="h-11 px-6 text-[hsl(33,34%,94%)] hover:bg-[hsl(33,34%,94%/0.08)] hover:text-[hsl(33,34%,94%)]">
                  <Link to="/login">Sign in</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-8 px-5 py-10 sm:px-8">
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
            <p>© {new Date().getFullYear()} AI JobPilot</p>
            <p className="mt-1">Not an employer. No applications sent automatically.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
