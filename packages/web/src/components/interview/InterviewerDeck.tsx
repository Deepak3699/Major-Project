import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Mic, Sparkles, Volume2 } from 'lucide-react';
import type { PracticeAvatar } from '@/lib/types';
import { AvatarPortrait } from '@/components/interview/AvatarPortrait';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';

/**
 * Swipe-deck interviewer picker.
 *
 * All interviewers are stacked like a deck of cards; the front card can be
 * dragged left/right, the arrow buttons and keyboard do the same thing, and the
 * side cards are clickable. Selection is the card in front, so the studio's
 * "Start with …" button always names the person the candidate is looking at.
 */

interface InterviewerDeckProps {
  avatars: PracticeAvatar[];
  activeId: string;
  recommendedId?: string;
  reason?: string;
  onSelect: (id: string) => void;
}

function offsetFor(index: number, active: number, total: number): number {
  let distance = index - active;
  if (distance > total / 2) distance -= total;
  if (distance < -total / 2) distance += total;
  return distance;
}

export const InterviewerDeck: React.FC<InterviewerDeckProps> = ({
  avatars,
  activeId,
  recommendedId,
  reason,
  onSelect,
}) => {
  const activeIndex = useMemo(() => {
    const found = avatars.findIndex((avatar) => avatar.id === activeId);
    return found >= 0 ? found : 0;
  }, [avatars, activeId]);

  const active = avatars[activeIndex] || avatars[0];
  if (!active) return null;

  const total = avatars.length;
  const go = (direction: -1 | 1) => {
    const next = (activeIndex + direction + total) % total;
    onSelect(avatars[next].id);
  };

  return (
    <div className="space-y-3">
      <div
        role="region"
        aria-label="Interviewer carousel"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
        }}
        className="relative h-[356px] rounded-2xl border border-border bg-[radial-gradient(ellipse_at_50%_10%,hsl(var(--signal)/0.10),transparent_62%)] outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-[392px]"
      >
        <div aria-live="polite" className="sr-only">
          {active.name}, {active.title}, interviewer {activeIndex + 1} of {total}
        </div>

        {avatars.map((avatar, index) => {
          const offset = offsetFor(index, activeIndex, total);
          const isActive = offset === 0;
          const hidden = Math.abs(offset) > 2;
          return (
            <div
              key={avatar.id}
              className="pointer-events-none absolute inset-0 flex items-start justify-center pt-4"
              style={{ zIndex: 30 - Math.abs(offset) }}
            >
              <motion.button
                type="button"
                drag={isActive ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                dragMomentum={false}
                onDragEnd={(_event, info) => {
                  if (info.offset.x < -56) go(1);
                  else if (info.offset.x > 56) go(-1);
                }}
                animate={{
                  x: offset * 54,
                  y: Math.abs(offset) * 13,
                  rotate: offset * 3.4,
                  scale: 1 - Math.abs(offset) * 0.075,
                  opacity: hidden ? 0 : 1,
                }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                whileDrag={{ scale: 1.025, cursor: 'grabbing' }}
                onClick={() => { if (!isActive) onSelect(avatar.id); }}
                aria-label={`Select ${avatar.name}`}
                aria-pressed={isActive}
                tabIndex={isActive ? 0 : -1}
                style={{ touchAction: 'pan-y', pointerEvents: hidden ? 'none' : 'auto' }}
                className={cn(
                  'relative h-[318px] w-[236px] overflow-hidden rounded-2xl border text-left shadow-[0_22px_50px_-24px_rgba(0,0,0,0.9)] transition-colors sm:h-[352px] sm:w-[252px]',
                  isActive ? 'cursor-grab border-white/25' : 'border-white/10',
                )}
              >
                <AvatarPortrait
                  avatarId={avatar.id}
                  name={avatar.name}
                  title={avatar.title}
                  state="idle"
                  animated={isActive}
                  showNameplate={false}
                  fit="cover"
                  className="h-full w-full rounded-none border-0"
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 to-transparent p-3 pb-8">
                  <span className="rounded-full border border-white/15 bg-black/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/70">
                    {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
                  </span>
                  {avatar.id === recommendedId && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-signal/50 bg-signal/20 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-white backdrop-blur-sm">
                      <Sparkles className="h-2.5 w-2.5" /> Best fit
                    </span>
                  )}
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/65 to-transparent p-4 pt-20">
                  <p className="text-[17px] font-semibold leading-tight text-white">{avatar.name}</p>
                  <p className="mt-0.5 text-[11px] text-white/65">{avatar.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {avatar.specialties.slice(0, 2).map((specialty) => (
                      <span key={specialty} className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-white/70">
                        {specialty}
                      </span>
                    ))}
                  </div>
                </div>

                {isActive && (
                  <span className="pointer-events-none absolute inset-x-0 top-[46%] flex justify-between px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-white/0">
                    <span>Prev</span>
                    <span>Next</span>
                  </span>
                )}
              </motion.button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous interviewer"
          className="absolute left-1 top-1/2 z-40 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent sm:left-2"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next interviewer"
          className="absolute right-1 top-1/2 z-40 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent sm:right-2"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Choose interviewer">
          {avatars.map((avatar, index) => (
            <button
              key={avatar.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={avatar.name}
              onClick={() => onSelect(avatar.id)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === activeIndex ? 'w-6 bg-signal' : 'w-1.5 bg-border-strong hover:bg-muted-foreground',
              )}
            />
          ))}
        </div>
        <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
          Drag or use ← →
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-foreground">{active.name.split(' ')[0]}'s round</p>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{active.title}</p>
          </div>
          {active.id === recommendedId ? (
            <Badge variant="signal"><Sparkles className="h-3 w-3" /> Best fit</Badge>
          ) : (
            <Badge variant="muted">Interviewer {activeIndex + 1} of {total}</Badge>
          )}
        </div>

        <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{active.tagline}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{active.ability}</p>

        <div className="mt-3 flex flex-wrap gap-1">
          {active.specialties.slice(0, 5).map((specialty) => (
            <span key={specialty} className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] text-muted-foreground">
              {specialty}
            </span>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
            <Volume2 className="h-3 w-3" /> {active.voice.gender} · {active.voice.lang}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
            <Mic className="h-3 w-3" /> {active.accent.split('·')[1]?.trim() || 'Indian English'}
          </span>
        </div>

        {active.id === recommendedId && reason && (
          <p className="mt-3 rounded-lg border border-signal/25 bg-signal-soft/70 px-3 py-2 text-[11.5px] leading-relaxed text-foreground/80">
            <span className="font-semibold text-foreground">Why this pick: </span>{reason}
          </p>
        )}
      </div>
    </div>
  );
};

export default InterviewerDeck;
