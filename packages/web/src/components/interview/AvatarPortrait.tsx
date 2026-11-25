import React, { useEffect, useRef } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * Illustrated interviewer portraits — one look per avatar id.
 *
 * The same flat-illustration language as the original Aria portrait, but the
 * face, hair, outfit, accessories and accent colour are driven by a look table
 * so the roster reads as six different people rather than one recoloured
 * template. Animation is still imperative inside a single rAF loop: word
 * boundary pulses kick the jaw, blinks and breathing keep the face alive, and
 * the listening state drives a mic meter. No per-frame React renders.
 */

export type InterviewerState = 'idle' | 'speaking' | 'listening' | 'thinking';

type HairStyle = 'long' | 'short' | 'bun' | 'messy';
type FacialHair = 'none' | 'beard' | 'stubble';

interface Look {
  skin: string;
  skinShade: string;
  hair: string;
  hairStyle: HairStyle;
  lip: string;
  blazer: string;
  lapel: string;
  shirt: string;
  accent: string;
  glasses: boolean;
  facialHair: FacialHair;
  earrings: boolean;
}

const LOOKS: Record<string, Look> = {
  aria: {
    skin: '#e6b385', skinShade: '#d69f70', hair: '#241c18', hairStyle: 'long', lip: '#b96a60',
    blazer: '#222227', lapel: '#2c2c33', shirt: '#f0ebe2', accent: '#c96f4a',
    glasses: false, facialHair: 'none', earrings: true,
  },
  vikram: {
    skin: '#c98d63', skinShade: '#b57a52', hair: '#171310', hairStyle: 'short', lip: '#9c5a4d',
    blazer: '#1d2a3a', lapel: '#26374b', shirt: '#dce6f0', accent: '#4f86a8',
    glasses: true, facialHair: 'beard', earrings: false,
  },
  priya: {
    skin: '#dca578', skinShade: '#c98f63', hair: '#2a1a14', hairStyle: 'long', lip: '#b85f62',
    blazer: '#3a2230', lapel: '#4a2c3e', shirt: '#f3e6ea', accent: '#b25a7c',
    glasses: false, facialHair: 'none', earrings: true,
  },
  arjun: {
    skin: '#bd7f56', skinShade: '#a86d47', hair: '#120e0b', hairStyle: 'short', lip: '#8f4f43',
    blazer: '#2a2a2f', lapel: '#35353b', shirt: '#e8e2d6', accent: '#c25a32',
    glasses: false, facialHair: 'stubble', earrings: false,
  },
  neha: {
    skin: '#e3ad7c', skinShade: '#d09766', hair: '#1d1510', hairStyle: 'bun', lip: '#ad5f58',
    blazer: '#1f2f2a', lapel: '#2a4038', shirt: '#e7efe9', accent: '#4f8a6d',
    glasses: true, facialHair: 'none', earrings: true,
  },
  rohan: {
    skin: '#d09568', skinShade: '#bb8256', hair: '#241a12', hairStyle: 'messy', lip: '#a25a4d',
    blazer: '#33302a', lapel: '#403c34', shirt: '#2f3a42', accent: '#c08a45',
    glasses: false, facialHair: 'stubble', earrings: false,
  },
};

const DEFAULT_NAMES: Record<string, string> = {
  aria: 'Aria Sharma',
  vikram: 'Vikram Rao',
  priya: 'Priya Nair',
  arjun: 'Arjun Mehta',
  neha: 'Neha Iyer',
  rohan: 'Rohan Kapoor',
};

const DEFAULT_TITLES: Record<string, string> = {
  aria: 'Talent Partner',
  vikram: 'Principal Engineer',
  priya: 'Product & Design Lead',
  arjun: 'Bar Raiser',
  neha: 'Data & AI Lead',
  rohan: 'Founder & Builder',
};

interface AvatarPortraitProps {
  avatarId?: string;
  name?: string;
  title?: string;
  state: InterviewerState;
  /** Increments on each spoken word boundary; drives the lip-sync envelope. */
  pulse?: number;
  className?: string;
  /** Cards can opt out of the animation loop to keep a gallery cheap. */
  animated?: boolean;
  showNameplate?: boolean;
}

export const AvatarPortrait: React.FC<AvatarPortraitProps> = ({
  avatarId = 'aria',
  name,
  title,
  state,
  pulse = 0,
  className,
  animated = true,
  showNameplate = true,
}) => {
  const look = LOOKS[avatarId] || LOOKS.aria;
  const displayName = name || DEFAULT_NAMES[avatarId] || DEFAULT_NAMES.aria;
  const displayTitle = title || DEFAULT_TITLES[avatarId] || DEFAULT_TITLES.aria;

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
    if (!animated) return;
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
        target = 0.55 + Math.random() * 0.45;
      }
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
  }, [animated]);

  // Blink loop — independent of speech, keeps the face alive.
  useEffect(() => {
    if (!animated) return;
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
  }, [animated]);

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
      aria-label={`${displayName}, AI interviewer — ${statusText.toLowerCase()}`}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.055]"
        style={{ backgroundImage: 'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-24 opacity-40"
        style={{ background: `radial-gradient(ellipse at 50% 0%, ${look.accent}55, transparent 70%)` }}
      />

      <svg viewBox="0 0 240 220" className="relative block h-full w-full" aria-hidden>
        {/* back hair */}
        {look.hairStyle === 'long' && (
          <>
            <path
              d="M62 122 C62 66 88 40 120 40 C152 40 178 66 178 122 L178 170 C178 181 169 187 157 187 L157 122 C157 104 142 94 120 94 C98 94 83 104 83 122 L83 187 C71 187 62 181 62 170 Z"
              fill={look.hair}
            />
            <circle cx="120" cy="34" r="15" fill={look.hair} />
          </>
        )}
        {look.hairStyle === 'short' && (
          <path d="M70 122 C70 76 92 48 120 48 C148 48 170 76 170 122 L170 140 C170 150 164 155 156 155 L156 118 C156 102 141 92 120 92 C99 92 84 102 84 118 L84 155 C76 155 70 150 70 140 Z" fill={look.hair} />
        )}
        {look.hairStyle === 'bun' && (
          <>
            <circle cx="120" cy="28" r="17" fill={look.hair} />
            <path d="M68 122 C68 74 92 46 120 46 C148 46 172 74 172 122 L172 150 C172 160 166 165 158 165 L158 118 C158 102 142 92 120 92 C98 92 82 102 82 118 L82 165 C74 165 68 160 68 150 Z" fill={look.hair} />
          </>
        )}
        {look.hairStyle === 'messy' && (
          <>
            <path d="M70 120 C68 78 92 46 120 46 C150 46 172 78 170 120 L170 142 C170 152 164 157 156 157 L156 118 C156 102 141 92 120 92 C99 92 84 102 84 118 L84 157 C76 157 70 152 70 142 Z" fill={look.hair} />
            <path d="M86 56 L76 36 L96 46 Z M112 44 L108 22 L126 40 Z M144 46 L158 28 L154 52 Z" fill={look.hair} />
          </>
        )}

        {/* neck */}
        <rect x="107" y="132" width="26" height="42" rx="11" fill={look.skinShade} />

        {/* outfit */}
        <path d="M28 220 C40 184 76 171 120 171 C164 171 200 184 212 220 Z" fill={look.blazer} />
        <path d="M107 172 L120 199 L133 172 Z" fill={look.shirt} />
        <path d="M99 175 L120 205 L108 220 L88 188 Z" fill={look.lapel} />
        <path d="M141 175 L120 205 L132 220 L152 188 Z" fill={look.lapel} />

        <g ref={headRef}>
          {/* ears + earrings */}
          <ellipse cx="72" cy="107" rx="7.5" ry="11" fill={look.skinShade} />
          <ellipse cx="168" cy="107" rx="7.5" ry="11" fill={look.skinShade} />
          {look.earrings && (
            <>
              <circle cx="72" cy="120" r="2.4" fill="#d9b36a" />
              <circle cx="168" cy="120" r="2.4" fill="#d9b36a" />
            </>
          )}

          {/* face */}
          <ellipse cx="120" cy="104" rx="48" ry="55" fill={look.skin} />

          {/* fringe */}
          {look.hairStyle === 'long' && (
            <>
              <path d="M74 94 C76 60 95 46 120 46 C145 46 164 60 166 94 C154 72 139 64 120 64 C101 64 86 72 74 94 Z" fill={look.hair} />
              <path d="M74 94 C70 82 72 68 80 58 C78 72 80 86 84 96 Z" fill={look.hair} />
              <path d="M166 94 C170 82 168 68 160 58 C162 72 160 86 156 96 Z" fill={look.hair} />
            </>
          )}
          {look.hairStyle === 'short' && (
            <path d="M76 96 C78 62 96 48 120 48 C144 48 162 62 164 96 C154 74 138 66 120 66 C102 66 86 74 76 96 Z" fill={look.hair} />
          )}
          {look.hairStyle === 'bun' && (
            <path d="M76 94 C78 62 96 50 120 50 C144 50 162 62 164 94 C154 72 138 64 120 64 C102 64 86 72 76 94 Z" fill={look.hair} />
          )}
          {look.hairStyle === 'messy' && (
            <>
              <path d="M74 96 C76 60 96 46 120 46 C146 46 164 60 166 96 C154 72 138 64 120 64 C102 64 86 72 74 96 Z" fill={look.hair} />
              <path d="M84 70 L72 52 L90 60 Z M128 54 L136 34 L146 58 Z" fill={look.hair} />
            </>
          )}

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
          <rect ref={lidLeftRef} x="91.4" y="96.6" width="17.2" height="0" rx="8" fill={look.skin} />
          <rect ref={lidRightRef} x="131.4" y="96.6" width="17.2" height="0" rx="8" fill={look.skin} />

          {/* glasses */}
          {look.glasses && (
            <g stroke={look.accent} strokeWidth="2.2" fill="none" opacity="0.95">
              <rect x="89" y="93" width="22" height="18" rx="6" />
              <rect x="129" y="93" width="22" height="18" rx="6" />
              <path d="M111 101 Q120 97 129 101" />
              <path d="M89 99 L80 97 M151 99 L160 97" />
            </g>
          )}

          {/* nose */}
          <path d="M120 104 C118 111 116 115 113 118 Q120 121 127 118" stroke="#c9905f" strokeWidth="2" fill="none" strokeLinecap="round" />

          {/* cheeks */}
          <ellipse cx="88" cy="121" rx="9" ry="5.5" fill="#e39a76" opacity="0.22" />
          <ellipse cx="152" cy="121" rx="9" ry="5.5" fill="#e39a76" opacity="0.22" />

          {/* facial hair */}
          {look.facialHair !== 'none' && (
            <>
              <path
                d="M82 118 C86 150 102 163 120 163 C138 163 154 150 158 118 C150 142 138 151 120 151 C102 151 90 142 82 118 Z"
                fill={look.hair}
                opacity={look.facialHair === 'beard' ? 0.92 : 0.28}
              />
              <path d="M108 130 Q120 126 132 130 Q120 134 108 130 Z" fill={look.hair} opacity={look.facialHair === 'beard' ? 0.9 : 0.3} />
            </>
          )}

          {/* mouth */}
          <ellipse ref={mouthRef} cx="120" cy="142.5" rx="12.5" ry="1.6" fill="#4b2420" />
          <rect ref={teethRef} x="109.5" y="141.4" width="21" height="0" rx="1.6" fill="#f7f0e6" />
          <path d="M102 141 Q111 136 120 139 Q129 136 138 141 Q129 142.6 120 141.6 Q111 142.6 102 141 Z" fill={look.lip} />
          <path ref={lowerLipRef} d="M104 142.6 Q120 152.4 136 142.6 Q120 149.2 104 142.6 Z" fill={look.lip} opacity="0.82" />
        </g>
      </svg>

      {showNameplate && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-white/10 bg-black/35 px-2.5 py-1.5">
          <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-white/70">{displayName}</span>
          <span className="flex shrink-0 items-center gap-1.5">
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
      )}
    </div>
  );
};

export default AvatarPortrait;
