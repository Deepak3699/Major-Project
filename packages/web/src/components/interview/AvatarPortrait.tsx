import React, { useEffect, useId, useRef } from 'react';
import { cn } from '@/components/ui/cn';

/**
 * Interviewer portraits — six distinct people, rendered as layered vector
 * portraits with soft studio lighting rather than flat clip-art.
 *
 * Each face is built from: a tinted studio backdrop, a shaded neck and
 * shoulders, gradient skin with jaw/temple occlusion, rim light, individually
 * shaped eyes with catchlights, styled brows, hair with specular strands,
 * outfit folds, and per-person accessories (glasses, beard, earrings,
 * headphones). The geometry and palette differ per person, so the roster reads
 * as six humans rather than one recoloured template.
 *
 * Animation stays imperative inside a single rAF loop: word-boundary pulses
 * kick the jaw, blinks and breathing keep the face alive, and the listening
 * state drives a mic meter. No per-frame React renders.
 */

export type InterviewerState = 'idle' | 'speaking' | 'listening' | 'thinking';

type HairStyle = 'wavy' | 'crop' | 'sleek' | 'buzz' | 'bun' | 'messy';
type Glasses = 'none' | 'rect' | 'round';
type FacialHair = 'none' | 'full' | 'stubble';
type Earrings = 'none' | 'hoop' | 'stud';
type BrowStyle = 'soft' | 'thick' | 'arch';

interface Look {
  /** [light, base, shade, deep] */
  skin: [string, string, string, string];
  /** [highlight, base, shadow] */
  hair: [string, string, string];
  /** [base, light, dark] */
  lips: [string, string, string];
  /** [light, base] */
  iris: [string, string];
  eyeLine: string;
  /** [light, base, dark] */
  jacket: [string, string, string];
  lapel: string;
  shirt: string;
  shirtShade: string;
  accent: string;
  bg: string;
  hairStyle: HairStyle;
  glasses: Glasses;
  beard: FacialHair;
  earrings: Earrings;
  faceScale: number;
  brow: BrowStyle;
  lashes: boolean;
  necklace: boolean;
  crew: boolean;
  headphones?: boolean;
}

const LOOKS: Record<string, Look> = {
  aria: {
    skin: ['#f2c6a0', '#e2aa7c', '#c98b5f', '#a86b45'],
    hair: ['#5a4030', '#2f2018', '#170f0b'],
    lips: ['#b25c58', '#d98b81', '#8e423f'],
    iris: ['#7a5533', '#2f1d10'],
    eyeLine: '#2a1a12',
    jacket: ['#4a3327', '#33231b', '#21150f'],
    lapel: '#553a2d', shirt: '#efe4d2', shirtShade: '#d8c9b4',
    accent: '#d27a52', bg: '#1a1210',
    hairStyle: 'wavy', glasses: 'none', beard: 'none', earrings: 'hoop',
    faceScale: 1, brow: 'soft', lashes: true, necklace: true, crew: false,
  },
  vikram: {
    skin: ['#e0b089', '#c99268', '#a97148', '#895a37'],
    hair: ['#3a3530', '#1a1512', '#0b0806'],
    lips: ['#925449', '#b06d5e', '#6f3a31'],
    iris: ['#5a4228', '#24160c'],
    eyeLine: '#17100b',
    jacket: ['#2c4056', '#1d2c3d', '#111c28'],
    lapel: '#354b63', shirt: '#dbe7f0', shirtShade: '#bfd0dd',
    accent: '#6197bd', bg: '#0f151c',
    hairStyle: 'crop', glasses: 'rect', beard: 'full', earrings: 'none',
    faceScale: 1.04, brow: 'thick', lashes: false, necklace: false, crew: false,
  },
  priya: {
    skin: ['#f4cba8', '#e4b086', '#ca8e64', '#a97049'],
    hair: ['#45291f', '#24130e', '#100806'],
    lips: ['#a84e5d', '#cf7482', '#843844'],
    iris: ['#5c3523', '#28160c'],
    eyeLine: '#24120c',
    jacket: ['#4d2a3f', '#321a2a', '#1f0f1a'],
    lapel: '#5a3149', shirt: '#f3e6e8', shirtShade: '#dcc7cb',
    accent: '#c46d8c', bg: '#190f14',
    hairStyle: 'sleek', glasses: 'none', beard: 'none', earrings: 'stud',
    faceScale: 0.99, brow: 'arch', lashes: true, necklace: true, crew: false,
  },
  arjun: {
    skin: ['#d6a173', '#bc8354', '#9b643c', '#7b4a2a'],
    hair: ['#2b2521', '#14100d', '#080605'],
    lips: ['#8c4b3f', '#aa6052', '#6b332a'],
    iris: ['#4c301b', '#1d1109'],
    eyeLine: '#120c08',
    jacket: ['#323238', '#212126', '#141418'],
    lapel: '#3b3b43', shirt: '#202024', shirtShade: '#2b2b31',
    accent: '#d2683f', bg: '#151110',
    hairStyle: 'buzz', glasses: 'none', beard: 'stubble', earrings: 'none',
    faceScale: 1.05, brow: 'thick', lashes: false, necklace: false, crew: true,
  },
  neha: {
    skin: ['#f0c69f', '#dda97b', '#c48a5d', '#a56f46'],
    hair: ['#3a2a21', '#1e130e', '#0d0806'],
    lips: ['#a95250', '#c97470', '#843c3a'],
    iris: ['#523b24', '#22160c'],
    eyeLine: '#1e120b',
    jacket: ['#24483b', '#162f26', '#0d1d17'],
    lapel: '#2d5949', shirt: '#eef2ec', shirtShade: '#d3dcd5',
    accent: '#67a98a', bg: '#0e1713',
    hairStyle: 'bun', glasses: 'round', beard: 'none', earrings: 'stud',
    faceScale: 1.03, brow: 'soft', lashes: true, necklace: false, crew: false,
  },
  rohan: {
    skin: ['#e4b184', '#cf9667', '#b0784b', '#8f5c35'],
    hair: ['#423020', '#251a11', '#110c07'],
    lips: ['#9a5849', '#b9705e', '#743d32'],
    iris: ['#5e4329', '#26180d'],
    eyeLine: '#1a110a',
    jacket: ['#444331', '#2b2a1e', '#191811'],
    lapel: '#4f4d38', shirt: '#2a3034', shirtShade: '#343b40',
    accent: '#d29a52', bg: '#16140d',
    hairStyle: 'messy', glasses: 'none', beard: 'stubble', earrings: 'none',
    faceScale: 1.02, brow: 'thick', lashes: false, necklace: false, crew: true,
    headphones: true,
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
  state?: InterviewerState;
  /** Increments on each spoken word boundary; drives the lip-sync envelope. */
  pulse?: number;
  className?: string;
  /** Cards can opt out of the animation loop to keep a gallery cheap. */
  animated?: boolean;
  showNameplate?: boolean;
  /** `cover` fills a tall card by cropping the sides; `contain` letterboxes. */
  fit?: 'contain' | 'cover';
}

export const AvatarPortrait: React.FC<AvatarPortraitProps> = ({
  avatarId = 'aria',
  name,
  title,
  state = 'idle',
  pulse = 0,
  className,
  animated = true,
  showNameplate = true,
  fit = 'contain',
}) => {
  const look = LOOKS[avatarId] || LOOKS.aria;
  const displayName = name || DEFAULT_NAMES[avatarId] || DEFAULT_NAMES.aria;
  const displayTitle = title || DEFAULT_TITLES[avatarId] || DEFAULT_TITLES.aria;

  // Unique gradient/filter ids: several portraits render on one page and SVG
  // ids are document-global, so a shared prefix would cross-wire the shading.
  const uid = `p${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const stateRef = useRef(state);
  stateRef.current = state;
  const pulseRef = useRef(pulse);
  pulseRef.current = pulse;

  const headRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGGElement>(null);
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
        mouth.setAttribute('ry', (1.3 + open * 8.4).toFixed(2));
        mouth.setAttribute('rx', (11 + open * 3.4).toFixed(2));
      }
      const lower = lowerLipRef.current;
      if (lower) lower.setAttribute('transform', `translate(0 ${(open * 3.8).toFixed(2)})`);
      const teeth = teethRef.current;
      if (teeth) {
        const show = open > 0.24;
        teeth.setAttribute('height', show ? '2.4' : '0');
        teeth.setAttribute('y', (138.3 - open * 8.4).toFixed(2));
      }

      const head = headRef.current;
      if (head) {
        const bob = current === 'speaking' ? Math.sin(now / 210) * 1.1 : Math.sin(now / 1500) * 0.55;
        const tilt = current === 'speaking' ? Math.sin(now / 340) * 0.9 : Math.sin(now / 2100) * 0.45;
        head.setAttribute('transform', `translate(0 ${bob.toFixed(2)}) rotate(${tilt.toFixed(2)} 120 104)`);
      }
      const body = bodyRef.current;
      if (body) {
        const breath = Math.sin(now / 2600) * 0.45;
        body.setAttribute('transform', `translate(0 ${breath.toFixed(2)})`);
      }
      const brow = browRef.current;
      if (brow) {
        const lift = current === 'speaking' ? -1.1 + Math.sin(now / 260) * 0.6 : current === 'thinking' ? -1.9 : 0;
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
      left?.setAttribute('height', '10.8');
      right?.setAttribute('height', '10.8');
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
  const eye = (cx: number) => (
    <g>
      <ellipse cx={cx} cy={106} rx={11} ry={7.2} fill={look.skin[2]} opacity={0.18} filter={`url(#${uid}-soft)`} />
      <path d={`M${cx - 10} 105 Q${cx} 96 ${cx + 10} 105 Q${cx} 113 ${cx - 10} 105 Z`} fill="#f7f1e8" />
      <circle cx={cx + 0.5} cy={104.6} r={4.2} fill={`url(#${uid}-iris)`} />
      <circle cx={cx + 0.5} cy={104.6} r={1.9} fill="#120c08" />
      <circle cx={cx - 0.8} cy={103.1} r={1.15} fill="#fff" opacity={0.95} />
      <circle cx={cx + 2.2} cy={106.2} r={0.55} fill="#fff" opacity={0.55} />
      <path d={`M${cx - 10.5} 104.6 Q${cx} 95.6 ${cx + 10.5} 104.6`} stroke={look.eyeLine} strokeWidth={1.7} fill="none" strokeLinecap="round" />
      <path d={`M${cx - 7} 108.4 Q${cx} 112.2 ${cx + 7} 108.4`} stroke={look.skin[2]} strokeWidth={0.9} fill="none" opacity={0.65} />
      {look.lashes && (
        <g stroke={look.eyeLine} strokeWidth={1.1} strokeLinecap="round">
          <path d={`M${cx - 9.6} 103.4 L${cx - 12} 101.2`} />
          <path d={`M${cx + 9.6} 103.4 L${cx + 12} 101.2`} />
        </g>
      )}
    </g>
  );

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
      data-avatar={avatarId}
    >
      <svg viewBox="0 0 240 240" preserveAspectRatio={fit === 'cover' ? 'xMidYMin slice' : 'xMidYMid meet'} className="relative block h-full w-full" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={look.bg} />
            <stop offset="55%" stopColor="#0c0c0f" />
            <stop offset="100%" stopColor="#070708" />
          </linearGradient>
          <radialGradient id={`${uid}-glow`} cx="50%" cy="18%" r="78%">
            <stop offset="0%" stopColor={look.accent} stopOpacity="0.32" />
            <stop offset="52%" stopColor={look.accent} stopOpacity="0.08" />
            <stop offset="100%" stopColor={look.accent} stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${uid}-vignette`} cx="50%" cy="42%" r="76%">
            <stop offset="55%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id={`${uid}-skin`} cx="38%" cy="30%" r="82%">
            <stop offset="0%" stopColor={look.skin[0]} />
            <stop offset="48%" stopColor={look.skin[1]} />
            <stop offset="100%" stopColor={look.skin[2]} />
          </radialGradient>
          <linearGradient id={`${uid}-hair`} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor={look.hair[0]} />
            <stop offset="42%" stopColor={look.hair[1]} />
            <stop offset="100%" stopColor={look.hair[2]} />
          </linearGradient>
          <linearGradient id={`${uid}-jacket`} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor={look.jacket[0]} />
            <stop offset="55%" stopColor={look.jacket[1]} />
            <stop offset="100%" stopColor={look.jacket[2]} />
          </linearGradient>
          <radialGradient id={`${uid}-iris`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor={look.iris[0]} />
            <stop offset="62%" stopColor={look.iris[1]} />
            <stop offset="100%" stopColor="#100a06" />
          </radialGradient>
          <linearGradient id={`${uid}-lip`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={look.lips[1]} />
            <stop offset="52%" stopColor={look.lips[0]} />
            <stop offset="100%" stopColor={look.lips[2]} />
          </linearGradient>
          <filter id={`${uid}-soft`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
          <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* studio backdrop */}
        <rect width="240" height="240" fill={`url(#${uid}-bg)`} />
        <rect width="240" height="240" fill={`url(#${uid}-glow)`} />
        <circle cx="44" cy="58" r="4" fill={look.accent} opacity="0.22" filter={`url(#${uid}-soft)`} />
        <circle cx="196" cy="88" r="5" fill={look.accent} opacity="0.16" filter={`url(#${uid}-soft)`} />
        <circle cx="206" cy="42" r="2" fill="#fff" opacity="0.18" />
        <circle cx="34" cy="120" r="1.6" fill="#fff" opacity="0.12" />
        <ellipse cx="120" cy="232" rx="118" ry="30" fill="#000" opacity="0.5" filter={`url(#${uid}-blur)`} />

        {/* neck, behind the shoulders and face */}
        <path d="M105 138 L135 138 L137 181 C137 190 129 195 120 195 C111 195 103 190 103 181 Z" fill={look.skin[2]} />
        <path d="M105 138 C109 152 131 152 135 138 L135 152 C129 161 111 161 105 152 Z" fill={look.skin[3]} opacity="0.45" filter={`url(#${uid}-soft)`} />

        {/* shoulders / outfit */}
        <g ref={bodyRef}>
          <path d="M10 240 C20 198 56 180 94 172 L120 197 L146 172 C184 180 220 198 230 240 Z" fill={`url(#${uid}-jacket)`} />

          {look.crew ? (
            <>
              <path d="M94 172 C100 190 109 198 120 198 C131 198 140 190 146 172 C138 181 129 186 120 186 C111 186 102 181 94 172 Z" fill={look.shirt} />
              <path d="M94 172 C100 190 109 198 120 198" stroke={look.shirtShade} strokeWidth="2" fill="none" opacity="0.7" />
            </>
          ) : (
            <>
              <path d="M94 172 L120 201 L146 172 C139 167 130 164 120 164 C110 164 101 167 94 172 Z" fill={look.shirt} />
              <path d="M104 171 L120 190 L112 196 L95 177 Z" fill={look.shirtShade} opacity="0.85" />
              <path d="M136 171 L120 190 L128 196 L145 177 Z" fill={look.shirtShade} opacity="0.85" />
            </>
          )}

          <path d="M94 172 L120 201 L107 240 L68 198 C76 185 84 178 94 172 Z" fill={look.lapel} />
          <path d="M146 172 L120 201 L133 240 L172 198 C164 185 156 178 146 172 Z" fill={look.lapel} />
          <path d="M94 172 L120 201" stroke={look.jacket[0]} strokeWidth="1.2" opacity="0.5" fill="none" />
          <path d="M146 172 L120 201" stroke={look.jacket[0]} strokeWidth="1.2" opacity="0.5" fill="none" />

          <path d="M70 210 C78 220 82 230 82 240" stroke={look.jacket[2]} strokeWidth="2.4" opacity="0.65" fill="none" />
          <path d="M170 210 C162 220 158 230 158 240" stroke={look.jacket[2]} strokeWidth="2.4" opacity="0.65" fill="none" />
          <path d="M58 198 C72 204 82 216 86 228" stroke="#fff" strokeWidth="1.2" opacity="0.06" fill="none" />
          <path d="M182 198 C168 204 158 216 154 228" stroke="#fff" strokeWidth="1" opacity="0.05" fill="none" />

          {look.necklace && (
            <g>
              <path d="M104 184 Q120 199 136 184" stroke="#d9b36a" strokeWidth="1.3" fill="none" opacity="0.9" />
              <circle cx="120" cy="197" r="2.1" fill="#e5c27c" />
            </g>
          )}

          {look.headphones && (
            <g>
              <path d="M84 207 C88 180 152 180 156 207" stroke="#17171b" strokeWidth="8" fill="none" strokeLinecap="round" />
              <path d="M84 207 C88 180 152 180 156 207" stroke={look.accent} strokeWidth="1.2" opacity="0.45" fill="none" />
              <rect x="74" y="196" width="17" height="25" rx="6" fill="#1b1b20" stroke="#35363d" strokeWidth="1" />
              <rect x="149" y="196" width="17" height="25" rx="6" fill="#1b1b20" stroke="#35363d" strokeWidth="1" />
              <circle cx="82.5" cy="208.5" r="4" fill="none" stroke={look.accent} strokeWidth="1.2" opacity="0.7" />
              <circle cx="157.5" cy="208.5" r="4" fill="none" stroke={look.accent} strokeWidth="1.2" opacity="0.7" />
            </g>
          )}
        </g>

        <g ref={headRef}>
          {/* back hair */}
          {look.hairStyle === 'wavy' && (
            <>
              <path d="M120 28 C79 28 55 59 57 108 C58 140 49 168 58 195 C64 213 85 217 95 204 C86 180 90 154 89 128 C88 106 101 90 120 90 C139 90 152 106 151 128 C150 154 154 180 145 204 C155 217 176 213 182 195 C191 168 182 140 183 108 C185 59 161 28 120 28 Z" fill={`url(#${uid}-hair)`} />
              <path d="M69 96 C67 140 61 176 67 198" stroke={look.hair[0]} strokeWidth="2" opacity="0.3" fill="none" strokeLinecap="round" />
              <path d="M171 96 C173 140 179 176 173 198" stroke={look.hair[0]} strokeWidth="1.6" opacity="0.22" fill="none" strokeLinecap="round" />
            </>
          )}
          {look.hairStyle === 'crop' && (
            <path d="M69 106 C67 63 92 41 120 41 C148 41 173 63 171 106 L171 117 C168 92 152 78 120 78 C88 78 72 92 69 117 Z" fill={`url(#${uid}-hair)`} />
          )}
          {look.hairStyle === 'sleek' && (
            <>
              <path d="M120 26 C79 26 57 57 59 108 L59 201 C59 212 70 216 80 209 L82 122 C82 100 97 88 120 88 C143 88 158 100 158 122 L160 209 C170 216 181 212 181 201 L181 108 C183 57 161 26 120 26 Z" fill={`url(#${uid}-hair)`} />
              <path d="M70 100 C68 142 68 176 72 202" stroke={look.hair[0]} strokeWidth="1.8" opacity="0.28" fill="none" strokeLinecap="round" />
              <path d="M170 100 C172 142 172 176 168 202" stroke={look.hair[0]} strokeWidth="1.5" opacity="0.2" fill="none" strokeLinecap="round" />
            </>
          )}
          {look.hairStyle === 'buzz' && (
            <path d="M73 102 C73 66 94 45 120 45 C146 45 167 66 167 102 L167 111 C161 86 144 73 120 73 C96 73 79 86 73 111 Z" fill={`url(#${uid}-hair)`} opacity="0.92" />
          )}
          {look.hairStyle === 'bun' && (
            <>
              <circle cx="120" cy="29" r="19" fill={`url(#${uid}-hair)`} />
              <circle cx="114" cy="24" r="7" fill={look.hair[0]} opacity="0.25" filter={`url(#${uid}-soft)`} />
              <path d="M120 33 C83 33 61 62 62 110 L62 160 C62 172 74 176 84 169 L84 122 C84 102 99 90 120 90 C141 90 156 102 156 122 L156 169 C166 176 178 172 178 160 L178 110 C179 62 157 33 120 33 Z" fill={`url(#${uid}-hair)`} />
              <path d="M74 108 C72 136 72 152 75 166" stroke={look.hair[0]} strokeWidth="1.6" opacity="0.24" fill="none" strokeLinecap="round" />
            </>
          )}
          {look.hairStyle === 'messy' && (
            <>
              <path d="M120 28 C81 28 57 59 59 108 C60 138 53 165 62 188 C68 204 86 208 96 197 C88 173 92 150 90 126 C89 106 101 90 120 90 C139 90 151 106 150 126 C148 150 152 173 144 197 C154 208 172 204 178 188 C187 165 180 138 181 108 C183 59 159 28 120 28 Z" fill={`url(#${uid}-hair)`} />
              <path d="M70 96 C68 138 63 170 69 190" stroke={look.hair[0]} strokeWidth="1.8" opacity="0.24" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* ears */}
          <ellipse cx="72" cy="108" rx="7" ry="11" fill={look.skin[2]} />
          <ellipse cx="168" cy="108" rx="7" ry="11" fill={look.skin[2]} />
          <path d="M70 104 Q75 108 71 114" stroke={look.skin[3]} strokeWidth="1.4" fill="none" opacity="0.6" />
          <path d="M170 104 Q165 108 169 114" stroke={look.skin[3]} strokeWidth="1.4" fill="none" opacity="0.6" />

          {/* face */}
          <g transform={look.faceScale !== 1 ? `translate(120 104) scale(${look.faceScale} 1) translate(-120 -104)` : undefined}>
            <path d="M120 50 C151 50 167 71 167 102 C167 133 149 159 120 160 C91 159 73 133 73 102 C73 71 89 50 120 50 Z" fill={`url(#${uid}-skin)`} />

            {/* lighting and occlusion */}
            <path d="M82 118 C86 144 102 156 120 156 C138 156 154 144 158 118 C150 140 136 148 120 148 C104 148 90 140 82 118 Z" fill={look.skin[3]} opacity="0.24" filter={`url(#${uid}-soft)`} />
            <path d="M75 94 C77 76 87 63 100 58 C89 71 83 84 81 100 Z" fill={look.skin[2]} opacity="0.28" filter={`url(#${uid}-soft)`} />
            <ellipse cx="103" cy="78" rx="23" ry="13" fill="#fff" opacity="0.09" filter={`url(#${uid}-blur)`} />
            <ellipse cx="92" cy="121" rx="11" ry="7" fill={look.skin[0]} opacity="0.4" filter={`url(#${uid}-soft)`} />
            <ellipse cx="148" cy="121" rx="10" ry="6" fill={look.skin[0]} opacity="0.28" filter={`url(#${uid}-soft)`} />
            <ellipse cx="88" cy="123" rx="10" ry="5" fill="#d97a63" opacity="0.15" filter={`url(#${uid}-soft)`} />
            <ellipse cx="152" cy="123" rx="9" ry="4.5" fill="#d97a63" opacity="0.12" filter={`url(#${uid}-soft)`} />
            {/* rim light along the right jaw */}
            <path d="M164 94 C165 120 153 145 128 157" stroke={look.accent} strokeWidth="3" opacity="0.38" fill="none" strokeLinecap="round" filter={`url(#${uid}-soft)`} />
            <path d="M78 96 C77 118 84 138 98 149" stroke="#fff" strokeWidth="2" opacity="0.06" fill="none" strokeLinecap="round" filter={`url(#${uid}-soft)`} />

            {/* front hair */}
            {look.hairStyle === 'wavy' && (
              <>
                <path d="M75 97 C77 59 96 39 122 39 C141 39 155 46 163 60 C150 57 139 61 129 69 C115 81 99 84 87 78 C81 75 77 85 75 97 Z" fill={`url(#${uid}-hair)`} />
                <path d="M82 78 C92 85 109 82 121 71" stroke={look.hair[0]} strokeWidth="2.2" opacity="0.38" fill="none" strokeLinecap="round" />
                <path d="M74 96 C70 84 72 68 80 56" stroke={look.hair[2]} strokeWidth="3" opacity="0.5" fill="none" strokeLinecap="round" />
                <path d="M156 60 C160 68 163 80 163 92" stroke={look.hair[0]} strokeWidth="1.6" opacity="0.3" fill="none" strokeLinecap="round" />
              </>
            )}
            {look.hairStyle === 'crop' && (
              <>
                <path d="M73 97 C73 57 94 39 120 39 C146 39 167 57 167 97 C158 74 142 64 120 64 C98 64 82 74 73 97 Z" fill={`url(#${uid}-hair)`} />
                <path d="M80 74 C94 62 111 58 127 61" stroke={look.hair[0]} strokeWidth="2" opacity="0.32" fill="none" strokeLinecap="round" />
                <path d="M158 72 C162 80 165 88 166 96" stroke={look.hair[2]} strokeWidth="2" opacity="0.5" fill="none" strokeLinecap="round" />
              </>
            )}
            {look.hairStyle === 'sleek' && (
              <>
                <path d="M73 99 C73 59 94 39 119 39 C113 58 104 72 92 82 C86 87 79 93 73 99 Z" fill={`url(#${uid}-hair)`} />
                <path d="M167 99 C167 59 146 39 121 39 C127 58 136 72 148 82 C154 87 161 93 167 99 Z" fill={`url(#${uid}-hair)`} />
                <path d="M120 40 L120 63" stroke={look.hair[2]} strokeWidth="1.4" opacity="0.5" />
                <path d="M84 78 C90 70 96 60 100 50" stroke={look.hair[0]} strokeWidth="1.8" opacity="0.32" fill="none" strokeLinecap="round" />
                <path d="M156 78 C150 70 144 60 140 50" stroke={look.hair[0]} strokeWidth="1.4" opacity="0.26" fill="none" strokeLinecap="round" />
              </>
            )}
            {look.hairStyle === 'buzz' && (
              <>
                <path d="M75 99 C75 63 96 45 120 45 C144 45 165 63 165 99 C158 78 142 69 120 69 C98 69 82 78 75 99 Z" fill={`url(#${uid}-hair)`} opacity="0.94" />
                <path d="M84 76 C96 66 108 62 120 62" stroke={look.hair[0]} strokeWidth="1.6" opacity="0.2" fill="none" strokeLinecap="round" />
              </>
            )}
            {look.hairStyle === 'bun' && (
              <>
                <path d="M75 97 C76 61 95 43 120 43 C145 43 164 61 165 97 C157 76 141 66 120 66 C99 66 83 76 75 97 Z" fill={`url(#${uid}-hair)`} />
                <path d="M90 60 C102 52 116 49 130 53" stroke={look.hair[0]} strokeWidth="1.8" opacity="0.32" fill="none" strokeLinecap="round" />
              </>
            )}
            {look.hairStyle === 'messy' && (
              <>
                <path d="M73 99 C75 59 94 39 120 39 C146 39 165 59 167 99 C157 76 142 66 122 68 C104 70 88 78 73 99 Z" fill={`url(#${uid}-hair)`} />
                <path d="M86 58 L72 39 L93 49 Z M116 45 L112 23 L130 41 Z M144 49 L161 31 L154 56 Z" fill={`url(#${uid}-hair)`} />
                <path d="M90 64 C104 54 122 50 138 58" stroke={look.hair[0]} strokeWidth="1.8" opacity="0.34" fill="none" strokeLinecap="round" />
              </>
            )}

            {/* earrings sit over the ear, under the jaw line */}
            {look.earrings === 'hoop' && (
              <>
                <circle cx="72" cy="121" r="4" fill="none" stroke="#d9b36a" strokeWidth="1.4" />
                <circle cx="168" cy="121" r="4" fill="none" stroke="#d9b36a" strokeWidth="1.4" />
              </>
            )}
            {look.earrings === 'stud' && (
              <>
                <circle cx="72" cy="119" r="1.9" fill="#e5c27c" />
                <circle cx="168" cy="119" r="1.9" fill="#e5c27c" />
              </>
            )}

            {/* brows */}
            <g ref={browRef}>
              {look.brow === 'thick' ? (
                <>
                  <path d="M89 91.5 Q101 86.5 112 91" stroke={look.hair[1]} strokeWidth="3.6" strokeLinecap="round" fill="none" />
                  <path d="M128 91 Q139 86.5 151 91.5" stroke={look.hair[1]} strokeWidth="3.6" strokeLinecap="round" fill="none" />
                </>
              ) : look.brow === 'arch' ? (
                <>
                  <path d="M90 92 Q101 85.5 112 90" stroke={look.hair[1]} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  <path d="M128 90 Q139 85.5 150 92" stroke={look.hair[1]} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                </>
              ) : (
                <>
                  <path d="M90 91 Q101 86.5 111 90.5" stroke={look.hair[1]} strokeWidth="2.9" strokeLinecap="round" fill="none" />
                  <path d="M129 90.5 Q139 86.5 150 91" stroke={look.hair[1]} strokeWidth="2.9" strokeLinecap="round" fill="none" />
                </>
              )}
            </g>

            {/* eyes */}
            {eye(101)}
            {eye(139)}
            <rect ref={lidLeftRef} x="90.4" y="97.6" width="21.2" height="0" rx="10" fill={look.skin[1]} />
            <rect ref={lidRightRef} x="128.4" y="97.6" width="21.2" height="0" rx="10" fill={look.skin[1]} />

            {/* glasses */}
            {look.glasses === 'rect' && (
              <g>
                <rect x="88" y="97" width="26" height="17" rx="4" fill="#dfe9f2" fillOpacity="0.06" stroke="#2a2f36" strokeWidth="2" />
                <rect x="126" y="97" width="26" height="17" rx="4" fill="#dfe9f2" fillOpacity="0.06" stroke="#2a2f36" strokeWidth="2" />
                <path d="M114 103 Q120 100 126 103" stroke="#2a2f36" strokeWidth="2" fill="none" />
                <path d="M88 102 L79 100 M152 102 L161 100" stroke="#2a2f36" strokeWidth="2" fill="none" strokeLinecap="round" />
                <path d="M92 100 L98 109" stroke="#fff" strokeWidth="1.4" opacity="0.18" />
                <path d="M130 100 L136 109" stroke="#fff" strokeWidth="1.2" opacity="0.12" />
              </g>
            )}
            {look.glasses === 'round' && (
              <g>
                <circle cx="101" cy="105" r="13" fill="#f6e7c8" fillOpacity="0.05" stroke="#c9a55e" strokeWidth="1.8" />
                <circle cx="139" cy="105" r="13" fill="#f6e7c8" fillOpacity="0.05" stroke="#c9a55e" strokeWidth="1.8" />
                <path d="M114 103 Q120 100 126 103" stroke="#c9a55e" strokeWidth="1.8" fill="none" />
                <path d="M88 103 L79 101 M152 103 L161 101" stroke="#c9a55e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                <path d="M94 100 Q98 97 103 97" stroke="#fff" strokeWidth="1.3" opacity="0.2" fill="none" />
              </g>
            )}

            {/* nose */}
            <path d="M120 106 C118 114 115 119 111 122 Q120 126 129 122" stroke={look.skin[2]} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d="M118 108 C117 114 115 118 113 121" stroke="#fff" strokeWidth="2" opacity="0.1" fill="none" strokeLinecap="round" />
            <ellipse cx="120" cy="122" rx="6" ry="2.4" fill={look.skin[0]} opacity="0.18" />
            <circle cx="111" cy="122" r="1.1" fill={look.skin[3]} opacity="0.5" />
            <circle cx="129" cy="122" r="1.1" fill={look.skin[3]} opacity="0.5" />

            {/* facial hair */}
            {look.beard !== 'none' && (
              <g opacity={look.beard === 'full' ? 0.96 : 0.22}>
                <path d="M78 111 C80 146 97 164 120 164 C143 164 160 146 162 111 C158 140 144 154 120 154 C96 154 82 140 78 111 Z" fill={`url(#${uid}-hair)`} />
                <path d="M103 131 Q120 125 137 131 Q120 136 103 131 Z" fill={`url(#${uid}-hair)`} />
                <path d="M88 120 C92 142 104 152 120 152" stroke={look.hair[0]} strokeWidth="1.4" opacity="0.25" fill="none" />
              </g>
            )}

            {/* mouth */}
            <path d="M106 138.5 Q112 133.5 120 136 Q128 133.5 134 138.5 Q127 139.6 120 139.1 Q113 139.6 106 138.5 Z" fill={look.lips[2]} />
            <ellipse ref={mouthRef} cx="120" cy="139.2" rx="11" ry="1.3" fill="#3b1a18" />
            <rect ref={teethRef} x="110" y="138.3" width="20" height="0" rx="1.5" fill="#f8f1e7" />
            <path ref={lowerLipRef} d="M105 139.8 Q120 150.5 135 139.8 Q120 146.5 105 139.8 Z" fill={`url(#${uid}-lip)`} />
            <path d="M108 143 Q120 148 132 143" stroke="#fff" strokeWidth="1.2" opacity="0.18" fill="none" />
            <ellipse cx="120" cy="152" rx="12" ry="3" fill={look.skin[3]} opacity="0.12" filter={`url(#${uid}-soft)`} />
          </g>
        </g>

        <rect width="240" height="240" fill={`url(#${uid}-vignette)`} />
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
