import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BrainCircuit, Lock, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { exitFullscreenOnLeave } from '@/lib/fullscreen';
import { RoomAtmosphere } from './RoomAtmosphere';

export interface PracticeShellProps {
  title: string;
  eyebrow?: string;
  description: string;
  children: React.ReactNode;
}

/**
 * Immersive frame for a practice room. Every room is its own page and shows
 * only its own content; the only navigation is back to the workspace home.
 * The shared atmosphere and fullscreen control match the conference hall.
 */
export function PracticeShell({ title, eyebrow = 'Practice room', description, children }: PracticeShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    // A leftover document-level fullscreen (e.g. after leaving a session)
    // should not make the next room appear fullscreen.
    if (document.fullscreenElement === document.documentElement) exitFullscreenOnLeave(document.documentElement);
    return () => exitFullscreenOnLeave(shellRef.current);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be blocked by browser policy; the room still works.
    }
  };

  return (
    <div
      ref={shellRef}
      data-practice-room
      data-fullscreen={fullscreen ? '' : undefined}
      className={cn(
        'relative overflow-hidden rounded-[30px] border border-[#4a352a] bg-[#160f0c] p-4 text-[#fff6ed] shadow-[0_36px_90px_-48px_rgba(40,20,12,0.8)] sm:p-5',
        fullscreen && 'rounded-none border-0',
      )}
    >
      <RoomAtmosphere dense />
      <div className="practice-room-content space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/practice"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10.5px] font-medium text-[#d8c4b3] transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Back to practice workspace
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/45 sm:inline-flex">
              <Lock className="h-3 w-3 text-[#8fbf9f]" /> Private room
            </span>
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-white/45 transition-colors hover:border-white/20 hover:text-white/80',
                fullscreen && 'px-2.5 text-[9.5px] font-semibold text-[#f2c9a8]',
              )}
            >
              {fullscreen ? <><Minimize2 className="h-3.5 w-3.5" /> Exit fullscreen</> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.035] p-5 backdrop-blur-sm sm:p-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full border border-[#e9b98f]/10" />
          <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-[#e9b98f]/[0.06] blur-xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#e9b98f]">
                <Sparkles className="h-3.5 w-3.5" /> {eyebrow}
              </p>
              <h1 className="mt-2 text-[25px] font-semibold leading-tight tracking-[-0.035em] text-[#fff6ed] sm:text-[30px]">{title}</h1>
              <p className="practice-room-description mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-white/45">{description}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#8fbf9f]/25 bg-[#8fbf9f]/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#a8d3b7]">
              <BrainCircuit className="h-3 w-3" /> Private room
            </span>
          </div>
        </section>

        <div>{children}</div>
      </div>
    </div>
  );
}
