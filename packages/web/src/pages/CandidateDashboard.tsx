import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowRight, ArrowUpRight, BriefcaseBusiness, CheckCircle2, Clock3, FileText,
  GraduationCap, MapPin, Mic, RefreshCw, Search, Sparkles, Star, Target, TrendingUp, UserRound,
} from 'lucide-react';
import { candidate, credits } from '@/lib/api';
import type { CandidateJob } from '@/lib/types';
import { useAuthStore } from '@/stores/auth';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { ProfileAvatar } from '@/components/candidate/ProfileAvatar';
import { RecommendedCarousel } from '@/components/candidate/RecommendedCarousel';

const quickLinks = [
  { label: 'Discover jobs', detail: 'Fresh trusted listings', icon: Search, to: '/jobs', tone: 'primary' },
  { label: 'Improve resume', detail: 'Draft with your review', icon: FileText, to: '/resume', tone: 'success' },
  { label: 'Role guidance', detail: 'Plan your next move', icon: Target, to: '/practice/prepare', tone: 'warning' },
  { label: 'Skill practice', detail: 'Close the gaps', icon: GraduationCap, to: '/learning', tone: 'primary' },
  { label: 'Interview prep', detail: 'Practice out loud', icon: Mic, to: '/practice', tone: 'success' },
] as const;

const toneClasses = {
  primary: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
} as const;

function OverviewCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: React.ReactNode;
  hint: string;
  tone: keyof typeof toneClasses;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3.5 shadow-sm transition-colors hover:border-border-strong">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg', toneClasses[tone])}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </div>
      <p className="mt-1.5 font-mono text-[22px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">{value}</p>
      <p className="mt-1.5 truncate text-[10.5px] text-muted-foreground">{hint}</p>
    </div>
  );
}

const CandidateDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const summaryQuery = useQuery('candidate-summary', candidate.summary, { refetchInterval: 10000 });
  const profileQuery = useQuery('candidate-profile', candidate.profile);
  const recommendationsQuery = useQuery('candidate-recommendations', candidate.recommendations, {
    enabled: !!summaryQuery.data?.has_profile,
    refetchInterval: 10000,
  });
  const applicationsQuery = useQuery('candidate-applications', candidate.applications, { refetchInterval: 30000 });
  const creditsQuery = useQuery('credits-overview', credits.overview, { refetchInterval: 30000 });

  const summary = summaryQuery.data;
  const profile = profileQuery.data?.profile;
  const recommendations = recommendationsQuery.data?.data ?? [];
  const applications = applicationsQuery.data?.data ?? [];
  const completion = Math.round(summary?.profile_completion ?? 0);
  const creditsAvailable = creditsQuery.data?.wallet.balance ?? 0;
  const statuses = summary?.application_statuses || {};
  const activeApps = ['SAVED', 'RECOMMENDED', 'READY_TO_APPLY', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER']
    .reduce((total, key) => total + Number(statuses[key] || 0), 0);
  const latestActivity = applications.slice(0, 3);
  const carouselLoading = summaryQuery.isLoading || (summary?.has_profile ? recommendationsQuery.isLoading : false);
  const refreshing = Boolean(summary?.has_profile) && recommendationsQuery.isFetching && !recommendationsQuery.isLoading;
  const savedIds = useMemo(
    () => new Set(applications.map((application) => application.job_id)),
    [applications],
  );
  const [savingJobId, setSavingJobId] = React.useState<string | null>(null);
  const saveMutation = useMutation((job: CandidateJob) => candidate.saveJob(job.id, 'SAVED'), {
    onSuccess: (_data, job) => {
      toast({ title: 'Job saved', description: `${job.title} is now in your saved jobs.`, variant: 'success' });
      queryClient.invalidateQueries('candidate-applications');
      queryClient.invalidateQueries('candidate-summary');
    },
    onError: (saveError: Error) => toast({ title: 'Could not save job', description: saveError.message, variant: 'error' }),
  });
  const saveFromCarousel = (job: CandidateJob) => {
    setSavingJobId(job.id);
    saveMutation.mutate(job, { onSettled: () => setSavingJobId((current) => (current === job.id ? null : current)) });
  };

  const displayName = useMemo(() => {
    const fullName = profile?.full_name?.trim();
    if (fullName) return fullName;
    const emailName = (user?.email?.split('@')[0] || 'there').split(/[._-]/)[0];
    return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  }, [profile?.full_name, user?.email]);
  const firstName = displayName.split(/\s+/)[0];
  const headline = profile?.headline?.trim() || 'Your next opportunity is closer than it looks. Discover roles that fit your strengths and move forward with confidence.';

  const stages = [
    { label: 'Saved', value: Number(statuses.SAVED || 0) + Number(statuses.RECOMMENDED || 0) + Number(statuses.READY_TO_APPLY || 0), icon: Star },
    { label: 'Applied', value: Number(statuses.APPLIED || 0) + Number(statuses.SCREENING || 0), icon: BriefcaseBusiness },
    { label: 'Interview', value: Number(statuses.INTERVIEW || 0), icon: Mic },
    { label: 'Offer', value: Number(statuses.OFFER || 0) + Number(statuses.JOINED || 0), icon: CheckCircle2 },
  ];
  const pipelineTotal = stages.reduce((total, stage) => total + stage.value, 0);

  return (
    <div className="space-y-5 pb-4">
      {/* Compact welcome banner — profile name, not the account email. */}
      <section className="relative overflow-hidden rounded-[26px] border border-border bg-[linear-gradient(115deg,hsl(var(--surface))_0%,hsl(var(--accent))_56%,hsl(var(--primary-soft))_100%)] p-5 shadow-sm sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full border border-primary/10" />
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-primary/[0.06] blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 right-[32%] h-24 w-px bg-gradient-to-t from-primary/15 to-transparent" />

        <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,370px)] lg:items-center">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Your career space
            </p>
            <h1 className="mt-2 text-[29px] font-semibold leading-[1.06] tracking-[-0.04em] text-foreground sm:text-[37px]">
              Welcome back, <span className="text-primary">{firstName}</span>.
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground sm:text-[13.5px]">{headline}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Link
                to="/recommendations"
                className="group inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[12.5px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover"
              >
                Explore your matches <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/profile"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface/80 px-4 text-[12.5px] font-semibold text-foreground backdrop-blur transition-colors hover:border-border-strong hover:bg-surface"
              >
                <UserRound className="h-3.5 w-3.5 text-primary" /> {completion >= 85 ? 'Review profile' : 'Complete profile'}
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface/85 p-3.5 shadow-sm backdrop-blur">
            <div className="flex items-center gap-3.5">
              <ProfileAvatar
                avatarId={profile?.avatar_id}
                src={profile?.avatar_url}
                name={displayName}
                size={64}
                className="ring-2 ring-surface shadow-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold tracking-[-0.015em] text-foreground">{profile?.full_name || displayName}</p>
                <p className="truncate text-[11.5px] text-muted-foreground">{profile?.headline || 'Add a headline so recruiters remember you'}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-1.5 rounded-full bg-primary transition-all duration-500" style={{ width: `${completion}%` }} />
                  </div>
                  <span className="font-mono text-[10px] font-semibold tabular-nums text-foreground">{completion}%</span>
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-2.5 text-[10.5px] text-muted-foreground">
              {profile?.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{profile.location}</span>}
              {profile?.experience_years !== undefined && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{Number(profile.experience_years)} yr{Number(profile.experience_years) === 1 ? '' : 's'} experience</span>}
              {profile?.remote_preference && profile.remote_preference !== 'any' && <span className="capitalize">{profile.remote_preference}</span>}
            </div>
          </div>
        </div>
      </section>

      {/* Infinite recommendation rail — compact, role-aware cards on desktop. */}
      <section className="relative overflow-hidden rounded-[24px] border border-border bg-[linear-gradient(140deg,hsl(var(--surface))_0%,hsl(var(--accent))_100%)] p-4 shadow-sm sm:p-[18px]">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full border border-primary/10" />
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-primary/[0.05] blur-xl" />
        <div className="relative flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2 text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Tailored for you
            </p>
            <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-foreground sm:text-[20px]">Roles that fit your profile</h2>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              Compact cards, clear skill overlap, and a quick way to save what interests you.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={cn(
              'hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] sm:inline-flex',
              refreshing ? 'border-primary/25 bg-primary-soft text-primary' : 'border-border bg-muted/40 text-muted-foreground',
            )}>
              <RefreshCw className={cn('h-3 w-3', refreshing && 'animate-spin')} />
              {refreshing ? 'Refreshing' : 'Updated just now'}
            </span>
            <Link to="/recommendations" className="group inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface/80 px-3 text-[11.5px] font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-surface">
              View all <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
        <div className="relative mt-3">
          <RecommendedCarousel
            jobs={recommendations}
            loading={carouselLoading}
            refreshing={refreshing}
            needsProfile={!summary?.has_profile}
            savedIds={savedIds}
            savingId={savingJobId}
            onSave={saveFromCarousel}
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OverviewCard icon={BriefcaseBusiness} label="Fresh jobs" value={summary?.fresh_jobs_7d ?? 0} hint="Added in the last 7 days" tone="primary" />
        <OverviewCard icon={Sparkles} label="Profile strength" value={`${completion}%`} hint={completion >= 85 ? 'Strong enough for top matches' : 'A few details unlock better fits'} tone="success" />
        <OverviewCard icon={Target} label="Active applications" value={activeApps} hint="Saved through to offer" tone="warning" />
        <OverviewCard icon={Star} label="Credits" value={creditsAvailable} hint="Available balance" tone="primary" />
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.02em] text-foreground">
              <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.9} /> Quick access
            </h2>
            <Link to="/jobs" className="group inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary">
              Browse all <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {quickLinks.map(({ label, detail, icon: Icon, to, tone }) => (
              <Link
                key={label}
                to={to}
                className="group flex min-h-[104px] flex-col rounded-2xl border border-border bg-muted/20 p-3 transition duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface hover:shadow-sm"
              >
                <span className={cn('grid h-8 w-8 place-items-center rounded-lg', toneClasses[tone])}>
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <p className="mt-2.5 text-[12px] font-semibold leading-tight text-foreground">{label}</p>
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground">{detail}</p>
                <ArrowUpRight className="mt-auto h-3.5 w-3.5 self-end text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-[-0.02em] text-foreground">
              <Clock3 className="h-4 w-4 text-success" strokeWidth={1.9} /> Recent activity
            </h2>
            <Link to="/applications" className="group inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary">
              View all <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {latestActivity.length ? (
            <ol className="relative mt-4 space-y-4 border-l border-border pl-5 text-[12.5px]">
              {latestActivity.map((application, index) => (
                <li key={application.id} className="relative flex items-start justify-between gap-3">
                  <span className={cn('absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-surface', index === 0 ? 'bg-primary' : index === 1 ? 'bg-success' : 'bg-border-strong')} />
                  <span className="min-w-0 font-medium text-foreground">
                    <span className="block truncate">{application.job_title}</span>
                    <span className="mt-0.5 block text-[10.5px] font-normal capitalize text-muted-foreground">
                      {application.company_name} · {application.status.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </span>
                  <time className="shrink-0 font-mono text-[10px] text-muted-foreground">{new Date(application.updated_at).toLocaleDateString()}</time>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-[12.5px] leading-relaxed text-muted-foreground">
              Save a role and its progress will appear here.
              <Link to="/jobs" className="mt-2 flex items-center gap-1 font-semibold text-primary">Find a role <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[24px] border border-border bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow text-primary">Application progress</p>
              <h2 className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-foreground">Move each opportunity forward.</h2>
            </div>
            <Link to="/applications" className="group inline-flex items-center gap-1 text-[11.5px] font-semibold text-primary">
              Open tracker <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {stages.map(({ label, value, icon: Icon }) => (
              <div key={label} className={cn('rounded-xl border p-3 transition-colors', value > 0 ? 'border-primary/25 bg-primary-soft/45' : 'border-border bg-muted/20')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-medium text-muted-foreground">{label}</span>
                  <Icon className={cn('h-3.5 w-3.5', value > 0 ? 'text-primary' : 'text-muted-foreground/60')} />
                </div>
                <p className="mt-1.5 font-mono text-[20px] font-semibold leading-none tabular-nums text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
            {pipelineTotal > 0 ? stages.map((stage, index) => stage.value > 0 ? (
              <span
                key={stage.label}
                className={index === 0 ? 'bg-primary' : index === 1 ? 'bg-success' : index === 2 ? 'bg-warning' : 'bg-info'}
                style={{ width: `${(stage.value / pipelineTotal) * 100}%` }}
              />
            ) : null) : <span className="w-full bg-border" />}
          </div>
          <p className="mt-2 text-[10.5px] text-muted-foreground">
            {pipelineTotal > 0 ? `${pipelineTotal} opportunit${pipelineTotal === 1 ? 'y' : 'ies'} in your pipeline.` : 'Save your first role to start a pipeline.'}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-[24px] border border-border bg-[linear-gradient(135deg,hsl(var(--primary-soft)),hsl(var(--accent))_58%,hsl(var(--surface)))] p-5 shadow-sm">
          <div aria-hidden className="pointer-events-none absolute -right-10 -bottom-12 h-40 w-40 rounded-full bg-success/15 blur-xl" />
          <div aria-hidden className="pointer-events-none absolute -right-4 bottom-4 h-24 w-24 rounded-full border border-primary/15" />
          <div className="relative max-w-[250px]">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface text-success shadow-sm">
              <TrendingUp className="h-5 w-5" strokeWidth={2} />
            </span>
            <h2 className="mt-4 text-[19px] font-semibold leading-[1.1] tracking-[-0.025em] text-foreground">Build the skills your matches ask for.</h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">Use your missing-skill list to pick a focused learning track and close the gap before you apply.</p>
            <Link to="/learning" className="group mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3.5 text-[11.5px] font-semibold text-background transition-opacity hover:opacity-90">
              Explore skill tracks <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default CandidateDashboard;
