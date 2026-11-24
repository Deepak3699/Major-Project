import React, { useEffect, useRef } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * Aria — the mock-interview interviewer.
 *
 * Flat-illustration SVG portrait animated in a single requestAnimationFrame
 * loop, mutated imperatively (no per-frame React renders):
 *  - Mouth openness follows a decaying envelope that is kicked by speech
 *    word-boundary pulses, which reads as word-accurate lip movement.
 *  - Random blinks, idle breathing, slight head bob while speaking.
 *  - Listening state drives a five-bar mic meter; thinking shows a three-dot
 *    pulse. The tile keeps the instrument-panel language: ink frame, mono
 *    nameplate, one ember accent.
 */

export type InterviewerState = 'idle' | 'speaking' | 'listening' | 'thinking';

interface InterviewerAvatarProps {
  state: InterviewerState;
  /** Increments on each spoken word boundary; drives the lip-sync envelope. */
  pulse?: number;
  className?: string;
}

const SKIN = '#e6b385';
const SKIN_SHADE = '#d69f70';
const HAIR = '#241c18';
const LIP = '#b96a60';
const MOUTH_INNER = '#4b2420';

export const InterviewerAvatar: React.FC<InterviewerAvatarProps> = ({ state, pulse = 0, className }) => {
  const stateRef = useRef(state);
  stateRef.current = state;
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;

  const headRef = useRef<SVGGElement>(null);
  const browRef = useRef<SVGGElement>(null);
  const mouthRef = useRef<SVGEllipseElement>(null);
  const lowerLipRef = useRef<SVGPathElement>(null);
  const teethRef = useRef<SVGRectElement>(null);
  const lidLeftRef = useRef<SVGRectElement>(null);
  const lidRightRef = useRef<SVGRectElement>(null);
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  // Lip-sync + breathing loop.
  useEffect(() => {
    let raf = 0;
    let last = typeof performance !== 'undefined' ? performance.now() : 0;
    let openness = 0.05;
    let target = 0.05;
    let lastPulse = pulseRef.current;

    const loop = (now: number) => {
      const dt = Math.min(0.06, Math.max(0.001, (now - last) / 1000));
      last = now;
      const current = stateRef.current;

      if (pulseRef.current !== lastPulse) {
        lastPulse = pulseRef.current;
        target = 0.55 + Math.random() * 0.45; // each word kicks the jaw open
      }
      // Envelope: fast open, slower close — speech cadence rather than sine.
      target = Math.max(0, target - dt * 3.6);
      const attack = Math.min(1, dt * 26);
      openness += (target - openness) * attack;

      const idle = current === 'speaking' ? 0 : 0.045 + 0.035 * Math.sin(now / 620);
      const open = Math.min(1, Math.max(openness, idle));

      const mouth = mouthRef.current;
      if (mouth) {
        mouth.setAttribute('ry', (1.6 + open * 9.2).toFixed(2));
        mouth.setAttribute('rx', (12.5 + open * 4).toFixed(2));
      }
      const lower = lowerLipRef.current;
      if (lower) lower.setAttribute('transform', `translate(0 ${(open * 4.2).toFixed(2)})`);
      const teeth = teethRef.current;
      if (teeth) {
        const show = open > 0.22;
        teeth.setAttribute('height', show ? '2.6' : '0');
        teeth.setAttribute('y', (141.4 - open * 9.2).toFixed(2));
      }

      const head = headRef.current;
      if (head) {
        const bob = current === 'speaking' ? Math.sin(now / 210) * 1.1 : Math.sin(now / 1500) * 0.5;
        const tilt = current === 'speaking' ? Math.sin(now / 340) * 0.9 : Math.sin(now / 2100) * 0.4;
        head.setAttribute('transform', `translate(0 ${bob.toFixed(2)}) rotate(${tilt.toFixed(2)} 120 104)`);
      }
      const brow = browRef.current;
      if (brow) {
        const lift = current === 'speaking' ? -1.1 + Math.sin(now / 260) * 0.6 : current === 'thinking' ? -1.8 : 0;
        brow.setAttribute('transform', `translate(0 ${lift.toFixed(2)})`);
      }

      const bars = barsRef.current;
      if (current === 'listening') {
        bars.forEach((bar, i) => {
          if (!bar) return;
          const level = 4 + Math.abs(Math.sin(now / (170 + i * 44) + i * 1.7)) * (i === 2 ? 14 : 10);
          bar.style.height = `${level.toFixed(1)}px`;
        });
      } else {
        bars.forEach((bar) => { if (bar) bar.style.height = '3px'; });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Blink loop — independent of speech, keeps the face alive.
  useEffect(() => {
    let timer: number;
    const blink = () => {
      const left = lidLeftRef.current;
      const right = lidRightRef.current;
      left?.setAttribute('height', '10.6');
      right?.setAttribute('height', '10.6');
      window.setTimeout(() => {
        left?.setAttribute('height', '0');
        right?.setAttribute('height', '0');
      }, 105);
      timer = window.setTimeout(blink, 2200 + Math.random() * 2600);
    };
    timer = window.setTimeout(blink, 1400 + Math.random() * 1600);
    return () => window.clearTimeout(timer);
  }, []);

  const statusText = state === 'speaking' ? 'Speaking' : state === 'listening' ? 'Listening' : state === 'thinking' ? 'Thinking' : 'Ready';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-[#101012] transition-all duration-300',
        state === 'speaking' ? 'border-signal/60 shadow-[0_0_0_1px_hsl(var(--signal)/0.35),0_8px_28px_-18px_hsl(var(--signal)/0.7)]'
          : state === 'listening' ? 'border-success/50'
            : 'border-border',
        className,
      )}
      role="img"
      aria-label={`Aria, AI interviewer — ${statusText.toLowerCase()}`}
    >
      {/* faint frame grid, no gradient */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.055]"
        style={{ backgroundImage: 'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />

      <svg viewBox="0 0 240 220" className="relative block h-full w-full" aria-hidden>
        {/* back hair */}
        <path
          d="M62 122 C62 66 88 40 120 40 C152 40 178 66 178 122 L178 170 C178 181 169 187 157 187 L157 122 C157 104 142 94 120 94 C98 94 83 104 83 122 L83 187 C71 187 62 181 62 170 Z"
          fill={HAIR}
        />
        <circle cx="120" cy="34" r="15" fill={HAIR} />

        {/* neck */}
        <rect x="107" y="132" width="26" height="42" rx="11" fill={SKIN_SHADE} />

        {/* blazer */}
        <path d="M28 220 C40 184 76 171 120 171 C164 171 200 184 212 220 Z" fill="#222227" />
        <path d="M107 172 L120 199 L133 172 Z" fill="#f0ebe2" />
        <path d="M99 175 L120 205 L108 220 L88 188 Z" fill="#2c2c33" />
        <path d="M141 175 L120 205 L132 220 L152 188 Z" fill="#2c2c33" />

        <g ref={headRef}>
          {/* ears */}
          <ellipse cx="72" cy="107" rx="7.5" ry="11" fill={SKIN_SHADE} />
          <ellipse cx="168" cy="107" rx="7.5" ry="11" fill={SKIN_SHADE} />
          <circle cx="72" cy="120" r="2.4" fill="#d9b36a" />
          <circle cx="168" cy="120" r="2.4" fill="#d9b36a" />

          {/* face */}
          <ellipse cx="120" cy="104" rx="48" ry="55" fill={SKIN} />
          {/* fringe */}
          <path
            d="M74 94 C76 60 95 46 120 46 C145 46 164 60 166 94 C154 72 139 64 120 64 C101 64 86 72 74 94 Z"
            fill={HAIR}
          />
          <path d="M74 94 C70 82 72 68 80 58 C78 72 80 86 84 96 Z" fill={HAIR} />
          <path d="M166 94 C170 82 168 68 160 58 C162 72 160 86 156 96 Z" fill={HAIR} />

          {/* brows */}
          <g ref={browRef}>
            <path d="M93 88 Q101 84 110 87" stroke="#3a2b22" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M130 87 Q139 84 147 88" stroke="#3a2b22" strokeWidth="3" strokeLinecap="round" fill="none" />
          </g>

          {/* eyes */}
          <ellipse cx="100" cy="102" rx="8.4" ry="5.2" fill="#f6efe6" />
          <ellipse cx="140" cy="102" rx="8.4" ry="5.2" fill="#f6efe6" />
          <circle cx="100.5" cy="102" r="3.6" fill="#3d2c22" />
          <circle cx="139.5" cy="102" r="3.6" fill="#3d2c22" />
          <circle cx="99.4" cy="100.9" r="1.1" fill="#ffffff" opacity="0.9" />
          <circle cx="138.4" cy="100.9" r="1.1" fill="#ffffff" opacity="0.9" />
          {/* eyelids (blink) */}
          <rect ref={lidLeftRef} x="91.4" y="96.6" width="17.2" height="0" rx="8" fill={SKIN} />
          <rect ref={lidRightRef} x="131.4" y="96.6" width="17.2" height="0" rx="8" fill={SKIN} />

          {/* nose */}
          <path d="M120 104 C118 111 116 115 113 118 Q120 121 127 118" stroke="#c9905f" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* cheeks */}
          <ellipse cx="88" cy="121" rx="9" ry="5.5" fill="#e39a76" opacity="0.22" />
          <ellipse cx="152" cy="121" rx="9" ry="5.5" fill="#e39a76" opacity="0.22" />

          {/* mouth */}
          <ellipse ref={mouthRef} cx="120" cy="142.5" rx="12.5" ry="1.6" fill={MOUTH_INNER} />
          <rect ref={teethRef} x="109.5" y="141.4" width="21" height="0" rx="1.6" fill="#f7f0e6" />
          <path d="M102 141 Q111 136 120 139 Q129 136 138 141 Q129 142.6 120 141.6 Q111 142.6 102 141 Z" fill={LIP} />
          <path ref={lowerLipRef} d="M104 142.6 Q120 152.4 136 142.6 Q120 149.2 104 142.6 Z" fill="#c27569" />
        </g>
      </svg>

      {/* nameplate */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-white/10 bg-black/35 px-2.5 py-1.5">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/70">Aria · interviewer</span>
        <span className="flex items-center gap-1.5">
          {state === 'listening' ? (
            <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  ref={(el) => { barsRef.current[i] = el; }}
                  className="w-[2.5px] rounded-sm bg-success"
                  style={{ height: 3 }}
                />
              ))}
            </span>
          ) : (
            <span
              aria-hidden
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                state === 'speaking' ? 'animate-pulse bg-signal' : state === 'thinking' ? 'bg-warning' : 'bg-white/40',
              )}
            />
          )}
          <span className={cn(
            'font-mono text-[9.5px] uppercase tracking-[0.1em]',
            state === 'speaking' ? 'text-signal' : state === 'listening' ? 'text-success' : 'text-white/60',
          )}>
            {statusText}
          </span>
        </span>
      </div>
    </div>
  );
};

export default InterviewerAvatar;
