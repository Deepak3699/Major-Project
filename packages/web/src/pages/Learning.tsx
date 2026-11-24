import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import {
  ArrowUpRight, BookOpen, Check, ExternalLink, RefreshCw, RotateCcw, Square,
} from 'lucide-react';
import { candidate, practice } from '@/lib/api';
import { LearningModuleView, LearningTrackView } from '@/lib/types';
/* hero replaces PageHeader */
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { PageLoader } from '@/components/ui/spinner';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';

const EASE = [0.22, 1, 0.36, 1] as const;

const LEVEL_TONE: Record<string, 'info' | 'muted' | 'success'> = { beginner: 'info', intermediate: 'muted', advanced: 'success' };

const ModuleCard = ({ mod, trackId, i }: { mod: LearningModuleView; trackId: string; i: number }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const toggle = useMutation(
    () => practice.learningProgress(trackId, mod.index),
    {
      onSuccess: () => queryClient.invalidateQueries(['learning-track']),
      onError: (err: Error) => toast({ title: 'Progress not saved', description: err.message, variant: 'error' }),
    },
  );
  const external = (type: string) => type === 'roadmap' ? ArrowUpRight : BookOpen;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.05, 0.3) }}>
      <div className={cn('card p-5 transition-colors', mod.done && 'border-border-strong')}>
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => toggle.mutate()}
            disabled={toggle.isLoading}
            aria-pressed={mod.done}
            aria-label={mod.done ? `Mark module "${mod.title}" as not done` : `Mark module "${mod.title}" as done`}
            className={cn(
              'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors',
              mod.done ? 'border-success bg-success text-success-foreground' : 'border-border-strong bg-surface text-transparent hover:border-border-strong hover:bg-accent',
            )}
          >
            {mod.done ? <Check className="h-3 w-3" strokeWidth={3} /> : <Square className="h-2.5 w-2.5 fill-current" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="eyebrow">Module {i + 1}</p>
              <Badge variant={LEVEL_TONE[mod.level] || 'muted'}>{mod.level}</Badge>
              {mod.done && <Badge variant="success">Done</Badge>}
            </div>
            <h3 className={cn('mt-1.5 text-[15px] font-semibold tracking-[-0.014em]', mod.done ? 'text-muted-foreground line-through decoration-1' : 'text-foreground')}>
              {mod.title}
            </h3>
            {mod.why && <p className="mt-1 max-w-phi-body text-[13px] leading-relaxed text-muted-foreground">{mod.why}</p>}
          </div>
        </div>

        {mod.topics?.length > 0 && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {mod.topics.map((topic, ti) => (
              <div key={ti}>
                <p className="text-[13.5px] font-medium text-foreground">{topic.title}</p>
                {topic.what_to_learn && <p className="mt-0.5 max-w-phi-body text-[12.5px] leading-relaxed text-muted-foreground">{topic.what_to_learn}</p>}
                {topic.resources?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2.5">
                    {topic.resources.map((res, ri) => {
                      const Icon = external(res.type);
                      return (res.url && <a
                        key={ri}
                        href={res.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground underline-offset-4 hover:underline decoration-signal"
                      >
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />{res.name}
                      </a>);
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {mod.practice_exercise && (
          <p className="mt-4 rounded-lg bg-muted px-3.5 py-2.5 text-[12.5px] leading-relaxed text-foreground/90">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">Drill · </span>
            {mod.practice_exercise}
          </p>
        )}
      </div>
    </motion.div>
  );
};

const TrackView = ({ track }: { track: LearningTrackView }) => (
  <div className="space-y-3">
    <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <p className="eyebrow">Plan for {track.role_focus}</p>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          {track.progress.done}/{track.progress.total} modules · {track.model === 'template' ? 'standard syllabus' : 'drafted for your profile'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-signal transition-[width] duration-500" style={{ width: `${(track.progress.done / Math.max(1, track.progress.total)) * 100}%` }} aria-hidden />
        </div>
        <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{track.progress.done}/{track.progress.total}</span>
      </div>
    </div>
    {track.modules?.map((mod, i) => <ModuleCard key={mod.index ?? i} mod={mod} trackId={track.id} i={i} />)}
  </div>
);

const Learning: React.FC = () => {
  const [role, setRole] = useState('');
  const [roleSet, setRoleSet] = useState(false);
  const { toast } = useToast();
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { staleTime: 60_000 });
  const preferred = useMemo(() => (profileData?.profile?.preferred_roles || []).filter(Boolean) as string[], [profileData]);
  const activeRole = roleSet ? role : preferred[0] || '';

  const { data, isLoading, refetch } = useQuery(
    ['learning-track', activeRole],
    () => practice.learning(activeRole || undefined),
    { enabled: !!profileData },
  );

  const refresh = useMutation(() => practice.learningRefresh(activeRole || undefined), {
    onSuccess: () => { refetch(); toast({ title: 'Plan updated', description: 'Module progress was reset for the fresh plan.', variant: 'success' }); },
    onError: (err: Error) => toast({ title: 'Plan not generated', description: err.message, variant: 'error' }),
  });

  const track = data?.track || null;

  return (
    <div className="space-y-4">
      <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }} className="relative overflow-hidden rounded-2xl border border-border bg-grad-surface p-6 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--signal)/0.08),transparent_50%)]" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow text-signal">Grow your skills</p>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[36px]">Learning tracks.</h1>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">A module-by-module study plan built from your saved profile and the role you are aiming at.</p>
          </div>
          {track && (
            <Button variant="outline" onClick={() => refresh.mutate()} loading={refresh.isLoading} className="shrink-0">
              <RefreshCw className="h-4 w-4" />Regenerate plan
            </Button>
          )}
        </div>
      </motion.section>

      {preferred.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="eyebrow mr-1">Roles on your profile</p>
          {preferred.slice(0, 6).map((r) => {
            const selected = activeRole.toLowerCase() === r.toLowerCase();
            return (
              <button
                key={r}
                type="button"
                onClick={() => { setRole(r); setRoleSet(true); }}
                className={cn(
                  'inline-flex h-8 items-center rounded-lg border px-3 text-[12.5px] font-medium transition-colors',
                  selected ? 'border-signal/40 bg-surface text-foreground' : 'border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground',
                )}
                aria-pressed={selected}
              >
                {selected && <Check className="mr-1.5 h-3.5 w-3.5 text-signal" />}
                {r}
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="card space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 w-full" />)}
        </div>
      ) : !profileData ? (
        <div className="card p-5"><PageLoader label="Loading profile…" /></div>
      ) : track ? (
        <TrackView track={track} />
      ) : (
        <div className="card px-6">
          <EmptyState
            icon={BookOpen}
            title={activeRole ? `No learning plan for ${activeRole} yet` : 'No preferred role on your profile yet'}
            description={activeRole
              ? 'Generate one and it adapts to the skills already listed on your profile, then tracks module completion.'
              : 'Add a preferred role on your profile first — the plan is generated for a specific role.'}
            action={activeRole && (
              <Button className="mt-2" onClick={() => refresh.mutate()} loading={refresh.isLoading}>
                <RotateCcw className="h-4 w-4" />Build the plan
              </Button>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default Learning;
