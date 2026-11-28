import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from 'react-query';
import {
  ArrowLeft, Camera, CameraOff, Check, ChevronRight, Clock3, Hand,
  Lightbulb, Lock, Maximize2, MessageSquare, Mic, MicOff, Minimize2,
  Play, Quote, RotateCcw, Shuffle, Sparkles, Users, Waves,
} from 'lucide-react';
import { candidate, practice } from '@/lib/api';
import type { PracticeAvatar, PracticeVoiceProfile } from '@/lib/types';
import { AvatarPortrait, type Viseme } from '@/components/interview/AvatarPortrait';
import { FALLBACK_AVATARS } from '@/components/interview/roster';
import { ProfileAvatar } from '@/components/candidate/ProfileAvatar';
import { cn } from '@/components/ui/cn';
import { exitFullscreenOnLeave } from '@/lib/fullscreen';
import { usePracticeFocus } from '@/stores/practiceFocus';

const EASE = [0.22, 1, 0.36, 1] as const;
const POINT_PAUSE = 5_000;
const MENTOR_PAUSE = 2_000;

type Phase = 'setup' | 'running' | 'hands' | 'done';
type RoundKey = 'intro' | 'round1' | 'coach' | 'round2' | 'round3' | 'closing';

interface Line { id: number; speakerId: string; speaker: string; text: string; mentor?: boolean; learner?: boolean }
interface Turn { speakerId: string; speakerName: string; text: string; mentor?: boolean; pause: number; round: RoundKey }

interface Topic {
  title: string;
  short: string;
  india: string;
  angles: [string, string, string];
}

const FLOW: Array<{ key: RoundKey; label: string }> = [
  { key: 'intro', label: 'Briefing' },
  { key: 'round1', label: 'Round 1' },
  { key: 'coach', label: 'Coaching' },
  { key: 'round2', label: 'Round 2' },
  { key: 'round3', label: 'Round 3' },
  { key: 'closing', label: 'Conclusion' },
];

const FLAVOURS: Record<string, string> = {
  aria: 'I say this with care.',
  vikram: 'Let me be precise about that.',
  priya: 'Here is the human angle.',
  arjun: 'From a delivery standpoint, that matters.',
  neha: 'I look at the data before I agree.',
  rohan: 'I will keep it practical.',
};

const CONCLUSIONS = [
  'To conclude, a fair process needs structure and empathy in equal measure.',
  'My conclusion is that verified work samples should sit alongside, not replace, conversation.',
  'I conclude that the system should give every student a visible path to improve.',
  'My concluding view: standardise the rules, personalise the feedback.',
  'To wrap up, trust grows when candidates understand both the decision and the reason behind it.',
];

const COACH_TIPS = [
  'Open with your strongest point, not background.',
  'Use one India-specific example and one role-specific example.',
  'If you disagree, disagree with a reason, not with volume.',
  'Pause for a second before you speak — clarity beats speed.',
  'Link your point back to the role every time.',
];

const voiceCache = new Map<string, SpeechSynthesisVoice | null>();
let speechGeneration = 0;

export function cancelSpeech() {
  speechGeneration += 1;
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

const MALE_VOICE = /ravi|prabhat|madhur|guy|david|george|daniel|fred|male|man\b/i;
const FEMALE_VOICE = /aria|zira|neerja|swara|veena|lekha|samantha|victoria|karen|moira|jenny|female|woman\b/i;

function pickVoice(profile: PracticeVoiceProfile): SpeechSynthesisVoice | null {
  const key = `${profile.gender}:${profile.hints.join('|')}`;
  const cached = voiceCache.get(key);
  if (cached !== undefined) return cached;
  const voices = (() => { try { return window.speechSynthesis?.getVoices?.() || []; } catch { return []; } })();
  if (!voices.length) return null;
  const hints = profile.hints.map((hint) => hint.toLowerCase());
  const target = profile.gender === 'male' ? MALE_VOICE : FEMALE_VOICE;
  const english = voices.filter((voice) => /^en/i.test(voice.lang));
  const hinted = english.filter((voice) => hints.some((hint) => voice.name.toLowerCase().includes(hint)));
  const gendered = english.filter((voice) => target.test(voice.name));
  const pool = [...hinted.filter((voice) => target.test(voice.name)), ...gendered, ...hinted];
  const chosen = pool.find((voice) => /en[-_]in/i.test(voice.lang)) || pool.find((voice) => /en[-_]gb/i.test(voice.lang)) || pool[0] || null;
  voiceCache.set(key, chosen);
  return chosen;
}

function spokenText(text: string) {
  return text.replace(/\bAI\b/g, 'A I').replace(/\bAPI\b/g, 'A P I').replace(/\bURL\b/g, 'U R L')
    .replace(/\bGDP\b/g, 'G D P').replace(/\b&\b/g, ' and ').replace(/\s+/g, ' ').trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Coarse phoneme hint from the word starting at a speech boundary. */
function visemeAt(text: string, charIndex = 0): Viseme {
  const rest = text.slice(Math.max(0, charIndex)).toLowerCase();
  for (const letter of rest) {
    if (!/[a-z]/.test(letter)) continue;
    if ('fvw'.includes(letter)) return 'ff';
    if ('mbp'.includes(letter)) return 'mm';
    if ('dt'.includes(letter)) return 'th';
    if ('aeiou'.includes(letter)) return letter === 'o' || letter === 'u' ? 'oo' : letter === 'e' || letter === 'i' ? 'ee' : 'aa';
    return 'aa';
  }
  return 'sil';
}

function speakLine(text: string, profile: PracticeVoiceProfile, speakerId = '', hooks: { onBoundary?: (event: SpeechSynthesisEvent) => void; onEnd?: () => void } = {}): Promise<void> {
  const generation = speechGeneration;
  const spoken = spokenText(text);
  const voice = pickVoice(profile);
  let hash = 0;
  for (let index = 0; index < speakerId.length; index += 1) hash = (hash * 31 + speakerId.charCodeAt(index)) >>> 0;
  const basePitch = profile.gender === 'male'
    ? clamp(Math.min(profile.pitch || 0.8, 0.82) + ((hash % 3) - 1) * 0.025, 0.68, 0.84)
    : clamp(Math.max(profile.pitch || 1.15, 1.14) + ((hash % 3) - 1) * 0.025, 1.1, 1.3);
  const baseRate = clamp((profile.rate || 0.96) + ((hash % 5) - 2) * 0.01, 0.9, 1);
  const lang = /en[-_]in/i.test(profile.lang || '') ? 'en-IN' : 'en-GB';

  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) { globalThis.setTimeout(resolve, Math.min(3500, text.length * 45)); return; }
    if (generation !== speechGeneration) { resolve(); return; }
    try {
      // One utterance per turn keeps the sentence flow natural; the browser
      // handles intonation inside the sentence better than manual chunking.
      const utterance = new SpeechSynthesisUtterance(spoken);
      if (voice) utterance.voice = voice;
      utterance.lang = lang;
      utterance.rate = baseRate;
      utterance.pitch = basePitch;
      utterance.volume = 1;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(fallback);
        hooks.onEnd?.();
        resolve();
      };
      const fallback = window.setTimeout(finish, Math.max(5000, spoken.length * 85 + 3500));
      utterance.onend = finish;
      utterance.onerror = finish;
      utterance.onboundary = (event) => {
        if (generation !== speechGeneration) return;
        if (event.name && event.name !== 'word' && event.name !== 'char') return;
        hooks.onBoundary?.(event);
      };
      window.speechSynthesis.speak(utterance);
    } catch { resolve(); }
  });
}

/** Builds three distinct, topic-aware points without repeating one keyword. */
function pointsFor(topic: Topic, role: string, memberIndex: number): [string, string, string] {
  const focus = role.trim() || 'software engineer';
  const [a0, a1, a2] = topic.angles;
  const openers = [
    `I will start with ${a0}. ${topic.india} That is why the answer cannot be a single line.`,
    `My opening point is about ${a0}. For a ${focus}, ${topic.india} The real test is implementation.`,
    `Let me begin on ${a0}. ${topic.india} I would judge any proposal by what changes on the ground.`,
    `First, ${a0}. ${topic.india} This matters more than the headline.`,
    `I would frame it through ${a0}. ${topic.india} Good intent is not enough without a feedback loop.`,
  ];
  const builders = [
    `The second angle is ${a1}. I have seen sound ideas fail because nobody owned the last mile.`,
    `I would push back gently here: ${a1}. A rule without measurable feedback rarely survives real teams.`,
    `Another way to look at it is ${a1}. Hiring managers will trust the change only when they can see the result.`,
    `My addition is about ${a1}. In practice, the constraint is time and mentoring capacity, not intent.`,
    `I want to stress ${a1}. Without a clear outcome, this becomes a checkbox exercise.`,
  ];
  const closers = [
    `Finally, ${a2}. That is the benchmark I would apply before supporting the change.`,
    `My last point is ${a2}. It is the difference between a policy on paper and a system that works.`,
    `To finish, ${a2}. I would ask for a pilot and a review before making it permanent.`,
    `One closing thought: ${a2}. The candidate experience tells us whether it succeeded.`,
    `I will end with ${a2}. If that is measurable, the rest follows.`,
  ];
  return [openers[memberIndex % 5], builders[memberIndex % 5], closers[memberIndex % 5]];
}


const TOPIC_BANK: Topic[] = [
  { title: 'Should Indian engineering colleges make a verified internship mandatory before final placements?', short: 'a verified internship requirement', india: 'Indian campuses produce graduates at scale, but the bridge to real work is often missing.', angles: ['job readiness and evidence of work', 'the burden on colleges and small companies', 'fairness for students without industry contacts'] },
  { title: 'Is remote work still the best option for early-career engineers in India?', short: 'remote work for freshers', india: 'India has strong remote demand, but mentoring differs sharply across cities and homes.', angles: ['learning through proximity and review', 'focus and independent ownership', 'access to opportunities beyond tier-one cities'] },
  { title: 'How should Indian companies evaluate candidates when marks are no longer the only signal?', short: 'evaluation beyond marks', india: 'Marks still dominate campus shortlists even when the job needs communication and judgement.', angles: ['work samples over percentages', 'structured interviews and rubrics', 'transparency in feedback'] },
  { title: 'Can campus hiring survive the rise of AI-assisted interviews in India?', short: 'AI-assisted campus interviews', india: 'Campus drives are expanding, and AI screening is arriving faster than preparation.', angles: ['consistency versus human nuance', 'preparation access across campuses', 'trust in the final decision'] },
  { title: 'Should freshers in India prioritise salary or learning velocity in their first role?', short: 'salary versus learning in the first job', india: 'Freshers face family expectations and a competitive market at the same time.', angles: ['compounding skill growth', 'financial reality and responsibility', 'the value of a strong first mentor'] },
  { title: 'Should Indian startups hire freshers without prior professional experience?', short: 'hiring freshers in startups', india: 'Startups move fast in India, but they often lack the time to train beginners.', angles: ['raw potential and adaptability', 'the real cost of onboarding', 'building an internal mentoring culture'] },
  { title: 'Is a four-year degree still necessary for a software role in India?', short: 'the four-year degree requirement', india: 'Skill-first hiring is growing, while degree filters remain common in campus placement.', angles: ['what a degree actually proves', 'portfolios and verified projects', 'the risk of removing the standard path'] },
  { title: 'How should campus placement training change for AI-first roles in India?', short: 'placement training for AI-first roles', india: 'AI-first roles need judgement and communication as much as coding speed.', angles: ['problem framing over memorised answers', 'ethical use of AI tools', 'communication with non-technical stakeholders'] },
];

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function LiveWave({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('flex h-4 items-end gap-[2px]', className)}>
      {[0, 1, 2, 3, 4].map((index) => (
        <motion.span
          key={index}
          className="w-[2.5px] rounded-full bg-current"
          animate={{ height: [3, 8 + ((index * 5) % 8), 4, 13, 3] }}
          transition={{ duration: 0.9 + index * 0.09, repeat: Infinity, ease: 'easeInOut', delay: index * 0.05 }}
        />
      ))}
    </span>
  );
}

function CountdownRing({ value, max = 5, size = 42, className }: { value: number; max?: number; size?: number; className?: string }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={3} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e9b98f"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circumference}
          animate={{ strokeDashoffset: circumference * (1 - Math.max(0, value) / max) }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </svg>
      <span className="absolute font-mono text-[11px] font-semibold tabular-nums text-[#fff6ed]">{Math.max(0, value)}</span>
    </span>
  );
}

const PARTICLES = Array.from({ length: 16 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  top: `${(index * 23 + 9) % 88}%`,
  size: index % 4 === 0 ? 3 : 2,
  delay: (index % 6) * 0.7,
  duration: 7 + (index % 5) * 1.7,
}));

/** Layered stage atmosphere: slow aurora, floor grid, drifting dust and a light sweep. */
function HallAtmosphere({ dense = false }: { dense?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-24%] h-[540px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(224,138,84,0.2),transparent_66%)] blur-2xl" />
      <motion.div
        className="absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-[#c96f4a]/15 blur-3xl"
        animate={{ x: [0, 44, 0], y: [0, 26, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-20 top-1/3 h-80 w-80 rounded-full bg-[#8a5a7a]/[0.12] blur-3xl"
        animate={{ x: [0, -36, 0], y: [0, -22, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[-18%] left-1/3 h-72 w-72 rounded-full bg-[#c99a5e]/10 blur-3xl"
        animate={{ x: [0, 28, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -top-20 left-8 h-[420px] w-40 origin-top bg-[linear-gradient(to_bottom,rgba(233,185,143,0.16),transparent)] blur-2xl"
        animate={{ rotate: [-10, 6, -10] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -top-20 right-12 h-[380px] w-36 origin-top bg-[linear-gradient(to_bottom,rgba(233,185,143,0.1),transparent)] blur-2xl"
        animate={{ rotate: [8, -5, 8] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 opacity-[0.16]"
        style={{
          backgroundImage: 'linear-gradient(rgba(233,185,143,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(233,185,143,0.28) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'linear-gradient(to top, black, transparent 82%)',
          WebkitMaskImage: 'linear-gradient(to top, black, transparent 82%)',
        }}
      />
      {dense && PARTICLES.map((particle, index) => (
        <motion.span
          key={index}
          className="absolute rounded-full bg-[#f2c39a]"
          style={{ left: particle.left, top: particle.top, width: particle.size, height: particle.size }}
          animate={{ y: [0, -18, 0], opacity: [0.05, 0.4, 0.05] }}
          transition={{ duration: particle.duration, repeat: Infinity, delay: particle.delay, ease: 'easeInOut' }}
        />
      ))}
      <motion.div
        className="absolute inset-y-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,240,225,0.05),transparent)]"
        animate={{ x: ['-60%', '360%'] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

interface ParticipantTileProps {
  avatar: PracticeAvatar;
  active: boolean;
  handRaised: boolean;
  chosen: boolean;
  index: number;
  pulse?: number;
  viseme?: Viseme;
  fullscreen?: boolean;
}

function ParticipantTile({ avatar, active, handRaised, chosen, index, pulse = 0, viseme = 'sil', fullscreen = false }: ParticipantTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.06 * index }}
      className={cn(
        'group relative aspect-[4/3] min-h-[112px] overflow-hidden rounded-2xl border bg-[#0f0a08] shadow-[0_10px_24px_-18px_rgba(0,0,0,0.9)] transition-colors duration-300 xl:aspect-auto xl:min-h-0',
        chosen ? 'border-[#e5b567]/70' : active ? 'border-[#e9b98f]/70' : handRaised ? 'border-[#e5b567]/45' : 'border-white/10',
        fullscreen && 'aspect-auto',
      )}
    >
      <motion.div
        className="absolute inset-0"
        animate={active
          ? { scale: [1, 1.035, 1], y: [0, -3, 0] }
          : { y: [0, -2, 0], rotate: [0, index % 2 === 0 ? -0.7 : 0.7, 0] }}
        transition={active
          ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 6 + index * 0.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <AvatarPortrait
          avatarId={avatar.id}
          name={avatar.name}
          title={avatar.title}
          state={active ? 'speaking' : 'idle'}
          pulse={pulse}
          viseme={viseme}
          animated
          showNameplate={false}
          className="h-full w-full rounded-none border-0 bg-[#0f0a08]"
        />
      </motion.div>

      {active && (
        <>
          <motion.span
            className="pointer-events-none absolute inset-0 rounded-2xl border border-[#e9b98f]/50"
            animate={{ opacity: [0.7, 0.1, 0.7], scale: [1, 1.015, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          />
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[#e9b98f] px-1.5 py-0.5 font-mono text-[7.5px] font-semibold uppercase tracking-[0.08em] text-[#2a1a12] shadow">
            <span className="h-1 w-1 animate-pulse rounded-full bg-[#2a1a12]" /> Speaking
          </span>
        </>
      )}

      {handRaised && !chosen && (
        <motion.span
          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#e5b567] text-[11px] shadow-lg"
          animate={{ rotate: [-10, 10, -10], scale: [1, 1.08, 1] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
          aria-label={`${avatar.name} raised a hand`}
        >
          ✋
        </motion.span>
      )}

      {chosen && (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-[#e5b567] px-1.5 py-0.5 font-mono text-[7.5px] font-semibold uppercase tracking-[0.08em] text-[#2a1a12] shadow">
          <Check className="h-2.5 w-2.5" /> Concluding
        </span>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgba(8,5,4,0.92),rgba(8,5,4,0.45)_55%,transparent)] px-2 pb-1.5 pt-7">
        <div className="flex items-center justify-between gap-1">
          <p className="truncate text-[10px] font-semibold leading-tight text-[#fff6ed]">{avatar.name.split(' ')[0]}</p>
          {active ? <Mic className="h-3 w-3 shrink-0 text-[#e9b98f]" /> : <MicOff className="h-3 w-3 shrink-0 text-white/30" />}
        </div>
        <p className="truncate text-[8px] leading-tight text-white/45">{avatar.specialties[0] || avatar.title}</p>
      </div>
    </motion.div>
  );
}


export function GroupDiscussion({ mockMode = false, onContinue }: { mockMode?: boolean; onContinue?: () => void } = {}) {
  const { data: avatarData } = useQuery(['practice-avatars-gd'], () => practice.avatars(), { staleTime: 60_000 });
  const { data: profileData } = useQuery('candidate-profile', candidate.profile, { staleTime: 60_000 });
  const avatars = avatarData?.avatars?.length ? avatarData.avatars : FALLBACK_AVATARS;
  const [selected, setSelected] = useState<string[]>(() => {
    const pool = (avatars.length ? avatars : FALLBACK_AVATARS).slice(0, 6);
    // The mock round picks a random panel automatically; the standalone room
    // keeps the default five so the learner can choose who speaks.
    const ordered = mockMode ? [...pool].sort(() => Math.random() - 0.5) : pool;
    return ordered.slice(0, 5).map((item) => item.id);
  });
  const [role, setRole] = useState('');
  const [topicIndex, setTopicIndex] = useState(() => Math.floor(Math.random() * TOPIC_BANK.length));
  const [phase, setPhase] = useState<Phase>('setup');
  const [lines, setLines] = useState<Line[]>([]);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [turnIndex, setTurnIndex] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [learnerActive, setLearnerActive] = useState(false);
  const [learnerInput, setLearnerInput] = useState('');
  const [raised, setRaised] = useState<string[]>([]);
  const [handPromptOpen, setHandPromptOpen] = useState(false);
  const [handPromptLeft, setHandPromptLeft] = useState(5);
  const [selectLeft, setSelectLeft] = useState(5);
  const [conclusionText, setConclusionText] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [learnerVoice, setLearnerVoice] = useState<'male' | 'female' | 'neutral'>('male');
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [lipPulse, setLipPulse] = useState<Record<string, number>>({});
  const [lipViseme, setLipViseme] = useState<Record<string, Viseme>>({});
  const lineId = useRef(0);
  const runToken = useRef(0);
  const learnerRef = useRef(false);
  const concludedRef = useRef(false);
  const concludingRef = useRef(false);
  const concludeRef = useRef<() => Promise<void>>(async () => {});
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hallRef = useRef<HTMLDivElement | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const autoStartedRef = useRef(false);

  const topic = TOPIC_BANK[topicIndex];
  const mentorAvatar = avatars.find((avatar) => avatar.id === 'aria') || FALLBACK_AVATARS[0];
  const displayName = profileData?.profile?.full_name?.trim() || 'Candidate';
  const firstName = displayName.split(' ')[0] || 'Candidate';
  const learnerProfile: PracticeVoiceProfile = {
    gender: learnerVoice === 'neutral' ? 'female' : learnerVoice,
    lang: 'en-IN',
    rate: 0.95,
    pitch: learnerVoice === 'male' ? 0.72 : learnerVoice === 'female' ? 1.2 : 1,
    hints: learnerVoice === 'male' ? ['ravi', 'male', 'david', 'india'] : ['neerja', 'female', 'zira', 'swara', 'india'],
  };
  const voiceFor = (speakerId: string): PracticeVoiceProfile => {
    if (speakerId === 'you') return learnerProfile;
    if (speakerId === 'mentor') return mentorAvatar.voice;
    return avatars.find((avatar) => avatar.id === speakerId)?.voice || mentorAvatar.voice;
  };
  const members = useMemo(
    () => selected
      .map((id) => avatars.find((avatar) => avatar.id === id))
      .filter((avatar): avatar is PracticeAvatar => Boolean(avatar))
      .slice(0, 5),
    [selected, avatars],
  );

  const currentTurn = turns[turnIndex];
  const activeName = activeSpeaker === 'you'
    ? displayName
    : activeSpeaker === 'mentor'
      ? 'Aria · Mentor'
      : (avatars.find((avatar) => avatar.id === activeSpeaker)?.name || 'Panellist');
  const captionLine = lines[lines.length - 1];
  const captionSpeaker = captionLine?.speaker || 'Aria · Mentor';
  const captionText = captionLine?.text || 'Welcome. I will introduce the topic, then each panellist gives one clear point per round. Raise your hand at the end to conclude.';
  const live = phase === 'running' || phase === 'hands';
  const running = live;
  const learnerSpeaking = learnerActive || activeSpeaker === 'you';
  const tipIndex = Math.min(COACH_TIPS.length - 1, Math.floor(turnIndex / 3));
  const flowIndex = phase === 'setup'
    ? -1
    : FLOW.findIndex((step) => step.key === (phase === 'running' ? (currentTurn?.round || 'intro') : 'closing'));
  const flowProgress = phase === 'done' ? 1 : phase === 'hands' ? 0.96 : turns.length ? Math.min(1, (turnIndex + 1) / turns.length) : 0;
  const stageLabel = FLOW[Math.max(0, flowIndex)]?.label || 'Briefing';
  const captionAvatar = captionLine
    ? avatarFor(captionLine, 'h-8 w-8 shrink-0 rounded-lg border-0')
    : <AvatarPortrait avatarId="aria" name="Aria" state="idle" animated={false} showNameplate={false} className="h-8 w-8 shrink-0 rounded-lg border-0" />;

  function avatarFor(line: Line, className: string) {
    if (line.speakerId === 'you') {
      return <ProfileAvatar avatarId={profileData?.profile?.avatar_id} src={profileData?.profile?.avatar_url} name="You" className={className} />;
    }
    if (line.speakerId === 'mentor') {
      return <AvatarPortrait avatarId="aria" name="Aria" state="idle" animated={false} showNameplate={false} className={className} />;
    }
    return <AvatarPortrait avatarId={line.speakerId} name={line.speaker} state="idle" animated={false} showNameplate={false} className={className} />;
  }

  const focusRole = usePracticeFocus((state) => state.focus?.role || '');
  useEffect(() => { learnerRef.current = learnerActive; }, [learnerActive]);
  useEffect(() => {
    if (!role && profileData?.profile?.preferred_roles?.[0]) setRole(profileData.profile.preferred_roles[0]);
  }, [profileData, role]);
  useEffect(() => {
    if (focusRole) setRole(focusRole);
  }, [focusRole]);
  useEffect(() => () => {
    cancelSpeech();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    exitFullscreenOnLeave(hallRef.current);
  }, []);

  useEffect(() => {
    if (phase !== 'running' && phase !== 'hands') return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    const element = transcriptRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lines.length, activeSpeaker]);

  useEffect(() => {
    if (document.fullscreenElement === document.documentElement) exitFullscreenOnLeave(document.documentElement);
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraOn]);

  const speechHooksFor = (speakerId: string, text: string, token: number) => ({
    onBoundary: (event: SpeechSynthesisEvent) => {
      if (token !== runToken.current) return;
      setLipPulse((current) => ({ ...current, [speakerId]: (current[speakerId] ?? 0) + 1 }));
      setLipViseme((current) => ({ ...current, [speakerId]: visemeAt(text, event.charIndex) }));
    },
    onEnd: () => {
      if (token !== runToken.current) return;
      setLipViseme((current) => ({ ...current, [speakerId]: 'sil' }));
    },
  });

  const addLine = (speakerId: string, speaker: string, text: string, flags: Partial<Pick<Line, 'mentor' | 'learner'>> = {}) => {
    lineId.current += 1;
    setLines((current) => [...current, { id: lineId.current, speakerId, speaker, text, ...flags }]);
  };

  const wait = (ms: number, token: number) => new Promise<void>((resolve) => {
    const step = () => {
      if (token !== runToken.current) return resolve();
      if (learnerRef.current) { window.setTimeout(step, 400); return; }
      window.setTimeout(resolve, ms);
    };
    step();
  });

  const shuffleTopic = () => setTopicIndex((current) => {
    const next = Math.floor(Math.random() * (TOPIC_BANK.length - 1));
    return next >= current ? next + 1 : next;
  });

  const buildTurns = (): Turn[] => {
    const nextTurns: Turn[] = [
      {
        speakerId: 'mentor', speakerName: 'Aria · Mentor', mentor: true, pause: MENTOR_PAUSE, round: 'intro',
        text: 'Hello everyone, I am Aria, your mentor for this discussion. I will give the topic, and then each of you will speak in turn. Please give one clear point when your turn comes.',
      },
      {
        speakerId: 'mentor', speakerName: 'Aria · Mentor', mentor: true, pause: MENTOR_PAUSE, round: 'intro',
        text: `Today's topic, relevant to India and to ${role || 'your target role'}, is this: ${topic.title}`,
      },
    ];
    for (let pass = 0; pass < 3; pass += 1) {
      members.forEach((member, index) => {
        nextTurns.push({
          speakerId: member.id,
          speakerName: member.name,
          text: `${pointsFor(topic, role, index)[pass]}${pass === 1 ? ` ${FLAVOURS[member.id] || ''}` : ''}`.trim(),
          pause: POINT_PAUSE,
          round: pass === 0 ? 'round1' : pass === 1 ? 'round2' : 'round3',
        });
      });
      if (pass === 0) {
        nextTurns.push({
          speakerId: 'mentor', speakerName: 'Aria · Mentor', mentor: true, pause: MENTOR_PAUSE, round: 'coach',
          text: 'A quick coaching note for the learner: listen for the strongest point so far, then add something new rather than repeating it.',
        });
      }
    }
    nextTurns.push({
      speakerId: 'mentor', speakerName: 'Aria · Mentor', mentor: true, pause: 0, round: 'closing',
      text: 'That completes three points from each of us. Who would like to conclude this discussion? Please raise your hand.',
    });
    return nextTurns;
  };

  const begin = async () => {
    if (!members.length) return;
    const token = ++runToken.current;
    cancelSpeech();
    const nextTurns = buildTurns();
    learnerRef.current = false;
    concludingRef.current = false;
    concludedRef.current = false;
    setTurns(nextTurns);
    setLines([]);
    setRaised([]);
    setChosen(null);
    setConclusionText('');
    setLearnerInput('');
    setLipPulse({});
    setLipViseme({});
    setLearnerActive(false);
    setHandPromptOpen(false);
    setHandPromptLeft(5);
    setSelectLeft(5);
    setElapsed(0);
    setTurnIndex(0);
    setPhase('running');
    for (const [index, turn] of nextTurns.entries()) {
      if (token !== runToken.current) return;
      setTurnIndex(index);
      addLine(turn.speakerId, turn.speakerName, turn.text, { mentor: turn.mentor });
      setActiveSpeaker(turn.speakerId);
      await speakLine(turn.text, voiceFor(turn.speakerId), turn.speakerId, speechHooksFor(turn.speakerId, turn.text, token));
      if (token !== runToken.current) return;
      if (!learnerRef.current) setActiveSpeaker(null);
      if (turn.pause) await wait(turn.pause, token);
    }
    if (token === runToken.current) {
      learnerRef.current = false;
      setLearnerActive(false);
      setActiveSpeaker(null);
      const pool = members.map((member) => member.id).sort(() => Math.random() - 0.5).slice(0, 3);
      pool.forEach((id, index) => window.setTimeout(() => {
        if (token === runToken.current) setRaised((current) => (current.includes(id) ? current : [...current, id]));
      }, index * 1200));
      setHandPromptLeft(5);
      setHandPromptOpen(true);
      setPhase('hands');
    }
  };

  const stop = () => {
    runToken.current += 1;
    cancelSpeech();
    learnerRef.current = false;
    concludingRef.current = false;
    concludedRef.current = false;
    setActiveSpeaker(null);
    setLearnerActive(false);
    setPhase('setup');
    setElapsed(0);
    setTurns([]);
    setTurnIndex(0);
    setLines([]);
    setRaised([]);
    setChosen(null);
    setConclusionText('');
    setLearnerInput('');
    setLipPulse({});
    setLipViseme({});
    setHandPromptOpen(false);
    setHandPromptLeft(5);
    setSelectLeft(5);
  };

  // Mock round: pick a random topic and panel, then open the room by itself.
  // The standalone room still waits for the learner to press start.
  useEffect(() => {
    if (!mockMode || autoStartedRef.current || phase !== 'setup') return;
    autoStartedRef.current = true;
    const timer = window.setTimeout(() => { void begin(); }, 700);
    return () => window.clearTimeout(timer);
  }, [mockMode, phase]);

  const addLearnerPoint = () => {
    const text = learnerInput.trim();
    if (!text) return;
    cancelSpeech();
    learnerRef.current = true;
    addLine('you', displayName, text, { learner: true });
    setLearnerInput('');
    setLearnerActive(true);
    setActiveSpeaker('you');
  };

  const finishLearnerTurn = () => {
    learnerRef.current = false;
    setLearnerActive(false);
    setActiveSpeaker(null);
  };

  const answerHand = (yes: boolean) => {
    if (yes) setRaised((current) => (current.includes('you') ? current : [...current, 'you']));
    setHandPromptOpen(false);
    setSelectLeft(5);
  };

  const conclude = async () => {
    if (!raised.length || concludingRef.current) return;
    concludingRef.current = true;
    concludedRef.current = true;
    const token = runToken.current;
    const winner = raised[Math.floor(Math.random() * raised.length)];
    setChosen(winner);
    const winnerName = winner === 'you' ? displayName : (avatars.find((avatar) => avatar.id === winner)?.name || 'Member');
    const mentorPrompt = `Thank you, ${winnerName}. Please give us the concluding view.`;
    addLine('mentor', 'Aria · Mentor', mentorPrompt, { mentor: true });
    setActiveSpeaker('mentor');
    await speakLine(mentorPrompt, voiceFor('mentor'), 'mentor', speechHooksFor('mentor', mentorPrompt, token));
    if (token !== runToken.current) return;
    setActiveSpeaker(null);
    const closing = winner === 'you'
      ? (conclusionText.trim() || 'My conclusion is that a fair process needs both clear rules and honest feedback.')
      : CONCLUSIONS[avatars.findIndex((avatar) => avatar.id === winner) % CONCLUSIONS.length];
    addLine(winner, winnerName, closing, { learner: winner === 'you' });
    setActiveSpeaker(winner);
    await speakLine(closing, voiceFor(winner), winner, speechHooksFor(winner, closing, token));
    if (token !== runToken.current) return;
    setActiveSpeaker(null);
    const thanks = 'Thank you everyone for a thoughtful discussion. That brings our group discussion to a close. Well done.';
    addLine('mentor', 'Aria · Mentor', thanks, { mentor: true });
    setActiveSpeaker('mentor');
    await speakLine(thanks, voiceFor('mentor'), 'mentor', speechHooksFor('mentor', thanks, token));
    if (token !== runToken.current) return;
    setActiveSpeaker(null);
    if (token === runToken.current) setPhase('done');
  };

  const concludeNow = () => {
    if (concludedRef.current || !raised.length) return;
    concludedRef.current = true;
    void conclude();
  };

  useEffect(() => { concludeRef.current = conclude; }, [conclude]);
  useEffect(() => {
    if (!handPromptOpen) return;
    const timer = window.setInterval(() => {
      setHandPromptLeft((value) => {
        if (value <= 1) { window.clearInterval(timer); setHandPromptOpen(false); setSelectLeft(5); return 0; }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [handPromptOpen]);
  useEffect(() => {
    if (phase !== 'hands' || handPromptOpen || selectLeft <= 0 || concludedRef.current) return;
    const timer = window.setTimeout(() => {
      if (concludedRef.current) return;
      concludedRef.current = true;
      void concludeRef.current();
    }, selectLeft * 1000);
    return () => window.clearTimeout(timer);
  }, [phase, handPromptOpen, selectLeft]);

  const toggleCamera = async () => {
    if (cameraOn) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      setCameraError('');
      setCameraOn(true);
    } catch {
      setCameraError('Camera unavailable. Your profile avatar is shown instead.');
      setCameraOn(false);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await hallRef.current?.requestFullscreen();
    } catch { /* ignore */ }
  };

  return (

    <div
      ref={hallRef}
      data-practice-room
      data-fullscreen={fullscreen ? '' : undefined}
      className={cn(
        'relative overflow-hidden rounded-[30px] border border-[#4a352a] bg-[#160f0c] text-[#fff6ed] shadow-[0_36px_90px_-48px_rgba(40,20,12,0.8)]',
        fullscreen && 'h-[100dvh] w-screen overflow-y-auto overflow-x-hidden rounded-none border-0',
      )}
    >
      <HallAtmosphere />
      <div className={cn('relative z-10 p-4 sm:p-5 xl:p-6', fullscreen && 'min-h-full p-3 sm:p-4')}>
        <div className="flex items-center justify-between gap-3">
          {!mockMode && (
          <Link
            to="/practice"
            className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10.5px] font-medium text-[#d8c4b3] transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Back to practice workspace
          </Link>
          )}
          <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/45 sm:inline-flex">
            <Lock className="h-3 w-3 text-[#8fbf9f]" /> Private room
          </span>
        </div>

        <header className={cn('mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between', fullscreen && 'mt-1.5 shrink-0 gap-1.5')}>
          <div className="min-w-0">
            <p className={cn('flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#e9b98f]', fullscreen && 'text-[8.5px]')}>
              <Users className="h-3.5 w-3.5" /> Conference hall · group discussion
            </p>
            <h1 className={cn('mt-1.5 text-[28px] font-semibold leading-[1.03] tracking-[-0.04em] text-[#fff6ed] sm:text-[34px]', fullscreen && 'mt-0.5 text-[24px] sm:text-[28px]')}>
              Group discussion
            </h1>
            <p className="mt-1.5 hidden max-w-2xl text-[11.5px] leading-relaxed text-white/45 sm:block sm:text-[12px]">
              A mentor sets an India-focused topic. Panellists speak in turn, the room pauses when you speak, and the session closes with a hand-raised conclusion.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em]',
              live ? 'border-[#e06a55]/30 bg-[#e06a55]/10 text-[#f2a08e]' : phase === 'done' ? 'border-[#8fbf9f]/30 bg-[#8fbf9f]/10 text-[#a8d3b7]' : 'border-white/10 bg-white/[0.04] text-white/45',
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-[#e06a55]' : phase === 'done' ? 'bg-[#8fbf9f]' : 'bg-white/35')} />
              {live ? 'Live' : phase === 'done' ? 'Complete' : 'Ready'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-white/60">
              <Clock3 className="h-3 w-3 text-[#e9b98f]" /> {formatTime(elapsed)}
            </span>
            <button
              type="button"
              onClick={() => void toggleCamera()}
              aria-pressed={cameraOn}
              aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
              title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
              className={cn(
                'grid h-8 w-8 place-items-center rounded-lg border transition-colors',
                cameraOn ? 'border-[#8fbf9f]/30 bg-[#8fbf9f]/10 text-[#a8d3b7]' : 'border-white/10 bg-white/[0.04] text-white/45 hover:border-white/20 hover:text-white/80',
              )}
            >
              {cameraOn ? <Camera className="h-3.5 w-3.5" /> : <CameraOff className="h-3.5 w-3.5" />}
            </button>
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
        </header>

        <section className={cn('relative mt-3 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] px-3.5 py-2.5 backdrop-blur-sm sm:px-4', fullscreen && 'mt-1.5 py-1.5')}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#e9b98f]/25 bg-[#e9b98f]/10 text-[#e9b98f]">
              <Quote className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#e9b98f]">Today's topic</p>
                <span className="font-mono text-[8.5px] tabular-nums text-white/30">{String(topicIndex + 1).padStart(2, '0')} / {String(TOPIC_BANK.length).padStart(2, '0')}</span>
                <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
                <span className="hidden text-[9px] text-white/40 sm:block">India · {role || 'target role'}</span>
              </div>
              <p className="mt-1 text-[12.5px] font-medium leading-snug text-[#fff6ed] sm:text-[13.5px]">{topic.title}</p>
              <p className="mt-1 line-clamp-1 text-[10px] leading-relaxed text-white/40">{topic.india}</p>
            </div>
            {!mockMode && (
            <button
              type="button"
              onClick={shuffleTopic}
              disabled={phase === 'running' || phase === 'hands'}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 text-[9.5px] font-semibold text-white/50 transition-colors hover:border-white/20 hover:text-white/85 disabled:opacity-30"
            >
              <Shuffle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Shuffle</span>
            </button>
            )}
          </div>
        </section>

        <div className={cn('room-main-grid mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start', fullscreen && 'mt-2 gap-2 xl:grid-cols-[minmax(0,1fr)_340px]')}>
          <div className={cn('min-w-0 space-y-3', fullscreen && 'space-y-2')}>
            <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#120c0a] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_-40px_rgba(0,0,0,0.9)]">
              <HallAtmosphere dense />
              <div className={cn('relative z-10 p-3', fullscreen && 'p-2.5')}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1" aria-hidden>
                      <span className="h-1.5 w-1.5 rounded-full bg-[#e06a55]/80" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[#e5b567]/80" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[#8fbf9f]/80" />
                    </span>
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/45">Hall 03 · Panel {members.length + 1}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeSpeaker && (
                      <span className="hidden items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#e9b98f] sm:flex">
                        <LiveWave className="h-3 text-[#e9b98f]" /> {activeName}
                      </span>
                    )}
                    {phase === 'hands' && (
                      <span className="rounded-full border border-[#e5b567]/25 bg-[#e5b567]/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[#f3d7a4]">
                        {raised.length} hands
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/40">
                      <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-[#e06a55]' : phase === 'done' ? 'bg-[#8fbf9f]' : 'bg-white/30')} />
                      {phase === 'running' ? 'On air' : phase === 'hands' ? 'Concluding' : phase === 'done' ? 'Closed' : 'Standby'}
                    </span>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {phase === 'hands' && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-[#e5b567]/25 bg-[#e5b567]/10 px-3 py-2"
                    >
                      <Hand className="h-3.5 w-3.5 text-[#e5b567]" />
                      <p className="text-[10px] font-medium text-[#f3d7a4]">
                        {raised.length} hand{raised.length === 1 ? '' : 's'} raised · Aria is choosing who concludes
                      </p>
                      {!handPromptOpen && !chosen && (
                        <span className="ml-auto flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/40">
                          <CountdownRing value={selectLeft} size={28} /> select
                        </span>
                      )}
                    </motion.div>
                  )}
                  {phase === 'done' && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="mt-2.5 flex items-center gap-2 rounded-xl border border-[#8fbf9f]/25 bg-[#8fbf9f]/10 px-3 py-2"
                    >
                      <Check className="h-3.5 w-3.5 text-[#a8d3b7]" />
                      <p className="text-[10px] font-medium text-[#c8e3d2]">Discussion complete. Aria has closed the room with thanks.</p>
                      <Sparkles className="ml-auto h-3.5 w-3.5 text-[#a8d3b7]" />
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-3 grid gap-2.5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className={cn(
                      'relative min-h-[240px] overflow-hidden rounded-[22px] border bg-[#0f0a08] shadow-[0_16px_36px_-24px_rgba(0,0,0,0.9)] sm:min-h-[280px] xl:h-[332px] xl:min-h-0',
                      activeSpeaker === 'mentor' ? 'border-[#e9b98f]/70' : 'border-white/10',
                    )}
                  >
                    <motion.div
                      className="absolute inset-0"
                      animate={activeSpeaker === 'mentor' ? { scale: [1, 1.02, 1] } : { scale: [1, 1.008, 1] }}
                      transition={{ duration: activeSpeaker === 'mentor' ? 2.2 : 7, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <AvatarPortrait
                        avatarId="aria"
                        name="Aria"
                        title="Mentor"
                        state={activeSpeaker === 'mentor' ? 'speaking' : 'idle'}
                        pulse={lipPulse['mentor'] ?? 0}
                        viseme={lipViseme['mentor'] ?? 'sil'}
                        animated
                        showNameplate={false}
                        className="h-full w-full rounded-none border-0 bg-[#0f0a08]"
                      />
                    </motion.div>
                    <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2 py-1 backdrop-blur">
                      <Sparkles className="h-3 w-3 text-[#e9b98f]" />
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/80">Mentor · Aria</span>
                    </div>
                    {activeSpeaker === 'mentor' && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-[#e9b98f] px-2 py-1 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-[#2a1a12]"
                      >
                        <LiveWave className="h-3 text-[#2a1a12]" /> Speaking
                      </motion.div>
                    )}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgba(8,5,4,0.95),rgba(8,5,4,0.4)_55%,transparent)] px-3 pb-2.5 pt-10">
                      <div className="flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[#fff6ed]">Aria Sharma</p>
                          <p className="truncate text-[9.5px] text-white/45">Mentor · Talent Partner</p>
                        </div>
                        <span className="hidden shrink-0 rounded-full border border-[#e9b98f]/25 bg-[#e9b98f]/10 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-[#e9b98f] sm:inline-flex">
                          Guiding the room
                        </span>
                      </div>
                    </div>
                    {activeSpeaker === 'mentor' && (
                      <motion.span
                        className="pointer-events-none absolute inset-0 rounded-[22px] border border-[#e9b98f]/40"
                        animate={{ opacity: [0.7, 0.1, 0.7] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                  </motion.div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:h-[332px] xl:auto-rows-fr xl:grid-cols-2">
                    {members.map((member, index) => (
                      <ParticipantTile
                        key={member.id}
                        avatar={member}
                        active={activeSpeaker === member.id}
                        handRaised={raised.includes(member.id)}
                        chosen={chosen === member.id}
                        index={index}
                        pulse={lipPulse[member.id] ?? 0}
                        viseme={lipViseme[member.id] ?? 'sil'}
                        fullscreen={fullscreen}
                      />
                    ))}

                    <motion.div
                      initial={{ opacity: 0, y: 18, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.45, ease: EASE, delay: 0.06 * members.length }}
                      className={cn(
                        'relative aspect-[4/3] min-h-[112px] overflow-hidden rounded-2xl border bg-[#0f0a08] shadow-[0_10px_24px_-18px_rgba(0,0,0,0.9)] xl:aspect-auto xl:min-h-0',
                        chosen === 'you' ? 'border-[#e5b567]/70' : learnerSpeaking ? 'border-[#e9b98f]/70' : raised.includes('you') ? 'border-[#e5b567]/50' : 'border-white/10',
                      )}
                    >
                      {cameraOn ? (
                        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,#3a281f,#170f0c_70%)]">
                          <ProfileAvatar
                            avatarId={profileData?.profile?.avatar_id}
                            src={profileData?.profile?.avatar_url}
                            name="You"
                            className="absolute left-1/2 top-1/2 h-[74px] w-[74px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/15"
                          />
                        </div>
                      )}
                      {learnerSpeaking && (
                        <motion.span
                          className="pointer-events-none absolute inset-0 rounded-2xl border border-[#e9b98f]/50"
                          animate={{ opacity: [0.7, 0.1, 0.7] }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
                      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 backdrop-blur">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#e9b98f]" />
                        <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-white/80">You</span>
                      </div>
                      {learnerSpeaking && chosen !== 'you' && (
                        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-[#e9b98f] px-1.5 py-0.5 font-mono text-[7.5px] font-semibold uppercase tracking-[0.08em] text-[#2a1a12]">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-[#2a1a12]" /> Speaking
                        </span>
                      )}
                      {raised.includes('you') && !learnerSpeaking && chosen !== 'you' && (
                        <motion.span
                          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-[#e5b567] text-[11px] shadow-lg"
                          animate={{ rotate: [-10, 10, -10], scale: [1, 1.08, 1] }}
                          transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                          aria-label="You raised a hand"
                        >
                          ✋
                        </motion.span>
                      )}
                      {chosen === 'you' && (
                        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-full bg-[#e5b567] px-1.5 py-0.5 font-mono text-[7.5px] font-semibold uppercase tracking-[0.08em] text-[#2a1a12] shadow">
                          <Check className="h-2.5 w-2.5" /> Concluding
                        </span>
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,rgba(8,5,4,0.92),rgba(8,5,4,0.45)_55%,transparent)] px-2 pb-1.5 pt-7">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-[10px] font-semibold leading-tight text-[#fff6ed]">{displayName}</p>
                          {cameraOn ? <Camera className="h-3 w-3 shrink-0 text-[#e9b98f]" /> : <CameraOff className="h-3 w-3 shrink-0 text-white/30" />}
                        </div>
                        <p className="truncate text-[8px] leading-tight text-white/45">{learnerActive ? 'Your point' : activeSpeaker === 'you' ? 'Concluding view' : 'Candidate · learner'}</p>
                      </div>
                    </motion.div>
                  </div>
                </div>

                <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 backdrop-blur-sm" aria-live="polite">
                  <div className="flex items-start gap-2.5">
                    {captionAvatar}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn('truncate font-mono text-[8.5px] uppercase tracking-[0.12em]', captionLine?.mentor ? 'text-[#e9b98f]' : captionLine?.learner ? 'text-[#e5b567]' : 'text-white/55')}>
                          {captionSpeaker}
                        </p>
                        {activeSpeaker && <LiveWave className="h-3 text-[#e9b98f]" />}
                        {phase === 'running' && (
                          <span className="ml-auto hidden font-mono text-[8px] uppercase tracking-[0.1em] text-white/25 sm:block">Live captions</span>
                        )}
                      </div>
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.p
                          key={captionLine?.id ?? 'intro'}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2 }}
                          className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-white/70 sm:text-[11.5px]"
                        >
                          {captionText}
                        </motion.p>
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {phase === 'running' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 flex items-center gap-1.5 rounded-xl border border-[#e5b567]/25 bg-[#e5b567]/[0.07] px-2 py-1.5"
                  >
                    <Mic className="h-3.5 w-3.5 shrink-0 text-[#e5b567]" />
                    <input
                      value={learnerInput}
                      onChange={(event) => setLearnerInput(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') addLearnerPoint(); }}
                      placeholder={learnerSpeaking ? 'You have the floor — finish when ready…' : mockMode ? 'Add your point to the discussion…' : 'Add your point — the room pauses while you speak…'}
                      aria-label="Add your point to the discussion"
                      className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[10.5px] text-white outline-none placeholder:text-white/30"
                    />
                    {learnerActive ? (
                      <button
                        type="button"
                        onClick={finishLearnerTurn}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#e5b567]/35 bg-black/20 px-2.5 text-[9.5px] font-semibold text-[#f3d7a4] transition hover:bg-[#e5b567]/10"
                      >
                        <Check className="h-3 w-3" /> Done
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={addLearnerPoint}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-[#e9b98f] px-2.5 text-[9.5px] font-semibold text-[#2a1a12] transition hover:bg-[#f2c9a8]"
                      >
                        <Mic className="h-3 w-3" /> Speak
                      </button>
                    )}
                    {learnerSpeaking && <LiveWave className="hidden h-3 shrink-0 text-[#e5b567] sm:block" />}
                  </motion.div>
                )}
              </div>

              <AnimatePresence>
                {phase === 'setup' && !mockMode && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-x-0 bottom-0 top-[48px] z-30 grid items-start justify-items-center bg-[#0d0807]/55 p-4 pt-3 backdrop-blur-[2px] sm:items-center sm:pt-4"
                  >
                    <motion.div
                      initial={{ opacity: 0, y: 12, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="w-full max-w-sm rounded-[22px] border border-white/15 bg-[#1d1411]/90 p-5 text-center shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
                    >
                      <span className="mx-auto grid h-10 w-10 place-items-center rounded-2xl border border-[#e9b98f]/30 bg-[#e9b98f]/10 text-[#e9b98f]">
                        <Users className="h-4 w-4" />
                      </span>
                      <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.18em] text-[#e9b98f]">Room ready</p>
                      <h2 className="mt-1 text-[19px] font-semibold tracking-[-0.02em] text-[#fff6ed]">Five seats. One topic.</h2>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">
                        Aria will open the room, set the topic, and guide three rounds before hands are raised to conclude.
                      </p>
                      <button
                        type="button"
                        disabled={!members.length}
                        onClick={() => void begin()}
                        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#e9b98f] text-[12px] font-semibold text-[#2a1a12] transition hover:bg-[#f2c9a8] disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" /> Start discussion
                      </button>
                      <p className="mt-2 font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/30">
                        {members.length} panellists · voice {learnerVoice}
                      </p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            <section className={cn('shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3', fullscreen && 'py-2')}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/40">Discussion flow</p>
                <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/30">
                  {phase === 'running' ? `Turn ${Math.min(turnIndex + 1, turns.length)} / ${turns.length}` : phase === 'hands' ? 'Selecting a voice' : phase === 'done' ? 'Complete' : 'Not started'}
                </p>
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
                {FLOW.map((step, index) => {
                  const complete = phase === 'done' || (flowIndex >= 0 && index < flowIndex);
                  const active = index === flowIndex;
                  return (
                    <React.Fragment key={step.key}>
                      <div className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 transition-colors',
                        active ? 'border-[#e9b98f]/40 bg-[#e9b98f]/10 text-[#f2d6ba]' : complete ? 'border-[#8fbf9f]/25 bg-[#8fbf9f]/[0.07] text-[#a8d3b7]' : 'border-white/10 bg-black/15 text-white/30',
                      )}>
                        {complete ? (
                          <Check className="h-2.5 w-2.5" />
                        ) : active ? (
                          <motion.span className="h-1.5 w-1.5 rounded-full bg-[#e9b98f]" animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                        )}
                        <span className="font-mono text-[8px] uppercase tracking-[0.08em]">{step.label}</span>
                      </div>
                      {index < FLOW.length - 1 && <span className={cn('h-px w-3 shrink-0 sm:w-5', complete ? 'bg-[#8fbf9f]/30' : 'bg-white/10')} />}
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#8fbf9f,#e5b567,#e9b98f)]"
                  animate={{ width: `${Math.round(flowProgress * 100)}%` }}
                  transition={{ duration: 0.6, ease: EASE }}
                />
              </div>
            </section>
          </div>

          <aside className={cn('flex flex-col gap-3', fullscreen && 'gap-2')}>
            <div className={cn(phase === 'setup' ? 'order-1' : phase === 'hands' ? 'order-3' : 'order-2', fullscreen && 'shrink-0')}>
            {phase === 'setup' && !mockMode ? (
              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">Room setup</p>
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 font-mono text-[8px] tabular-nums text-white/40">{members.length} / 5 seats</span>
                </div>

                <label className="mt-3 block">
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/35">Role focus</span>
                  <input
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="e.g. backend engineer"
                    className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/25 px-2.5 text-[11px] text-white outline-none transition placeholder:text-white/25 focus:border-[#e9b98f]/50 focus:ring-2 focus:ring-[#e9b98f]/10"
                  />
                </label>

                <div className="mt-3">
                  <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/35">Your voice</p>
                  <div className="mt-1 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
                    {(['male', 'female', 'neutral'] as const).map((voice) => (
                      <button
                        key={voice}
                        type="button"
                        aria-pressed={learnerVoice === voice}
                        onClick={() => setLearnerVoice(voice)}
                        className={cn(
                          'h-7 rounded-md text-[9.5px] font-semibold capitalize transition-colors',
                          learnerVoice === voice ? 'bg-[#e9b98f] text-[#2a1a12]' : 'text-white/45 hover:bg-white/5 hover:text-white/75',
                        )}
                      >
                        {voice}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[8.5px] uppercase tracking-[0.12em] text-white/35">Panel</p>
                    <p className="text-[8.5px] text-white/25">Pick up to five</p>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {avatars.slice(0, 6).map((avatar) => {
                      const isChosen = selected.includes(avatar.id);
                      const disabled = !isChosen && selected.length >= 5;
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          aria-pressed={isChosen}
                          disabled={disabled}
                          onClick={() => setSelected((current) => current.includes(avatar.id) ? current.filter((item) => item !== avatar.id) : current.length < 5 ? [...current, avatar.id] : current)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-xl border p-1.5 text-left transition-colors disabled:opacity-35',
                            isChosen ? 'border-[#e9b98f]/45 bg-[#e9b98f]/10' : 'border-white/10 bg-black/20 hover:border-white/20',
                          )}
                        >
                          <span className="relative shrink-0">
                            <AvatarPortrait avatarId={avatar.id} name={avatar.name} state="idle" animated={false} showNameplate={false} className="h-8 w-8 rounded-lg border-0" />
                            {isChosen && (
                              <span className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-[#e9b98f] text-[#2a1a12]">
                                <Check className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[9.5px] font-semibold text-white/85">{avatar.name.split(' ')[0]}</span>
                            <span className="block truncate text-[7.5px] text-white/35">{avatar.specialties[0] || avatar.title}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => void toggleCamera()}
                    className={cn(
                      'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border text-[9.5px] font-semibold transition-colors',
                      cameraOn ? 'border-[#8fbf9f]/30 bg-[#8fbf9f]/10 text-[#a8d3b7]' : 'border-white/10 bg-black/20 text-white/45 hover:text-white/75',
                    )}
                  >
                    {cameraOn ? <Camera className="h-3 w-3" /> : <CameraOff className="h-3 w-3" />}
                    {cameraOn ? 'Camera on' : 'Camera off'}
                  </button>
                  <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/20 text-[9px] font-medium capitalize text-white/35">
                    <Mic className="h-3 w-3" /> {learnerVoice}
                  </span>
                </div>

                {cameraError && <p className="mt-1.5 text-[9px] leading-relaxed text-[#e5b567]">{cameraError}</p>}

                <button
                  type="button"
                  disabled={!members.length}
                  onClick={() => void begin()}
                  className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#e9b98f] text-[11px] font-semibold text-[#2a1a12] transition hover:bg-[#f2c9a8] disabled:opacity-40"
                >
                  <Play className="h-3.5 w-3.5" /> Start discussion
                </button>
                <p className="mt-1.5 text-center text-[8.5px] leading-relaxed text-white/25">
                  Aria opens with the topic, then three rounds and a hand-raised conclusion.
                </p>
              </section>
            ) : phase === 'done' ? (
              <section className="rounded-2xl border border-[#8fbf9f]/25 bg-[#8fbf9f]/[0.06] p-3.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#8fbf9f]/25 bg-[#8fbf9f]/10 text-[#a8d3b7]">
                    <Check className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#a8d3b7]">Discussion complete</p>
                    <p className="text-[10px] text-white/40">Aria closed the room with thanks.</p>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                  {[
                    { value: formatTime(elapsed), label: 'Time' },
                    { value: `${members.length + 1}`, label: 'Speakers' },
                    { value: `${lines.length}`, label: 'Lines' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-white/10 bg-black/20 py-1.5">
                      <p className="font-mono text-[14px] font-semibold tabular-nums text-[#fff6ed]">{stat.value}</p>
                      <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-white/30">{stat.label}</p>
                    </div>
                  ))}
                </div>
                {mockMode ? (
                  <>
                    <p className="mt-2.5 text-[9px] leading-relaxed text-white/35">
                      The discussion round is complete. Continue when you are ready.
                    </p>
                    <button
                      type="button"
                      onClick={onContinue}
                      disabled={!onContinue}
                      className="mt-2.5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#e9b98f] text-[10px] font-semibold text-[#2a1a12] transition hover:bg-[#f2c9a8] disabled:opacity-40"
                    >
                      Continue to presentation <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <p className="mt-2.5 text-[9px] leading-relaxed text-white/35">
                      Run the room again with a new topic, or take the full mock round.
                    </p>
                    <div className="mt-2.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void begin()}
                        className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#e9b98f] text-[9.5px] font-semibold text-[#2a1a12] transition hover:bg-[#f2c9a8]"
                      >
                        <RotateCcw className="h-3 w-3" /> Run again
                      </button>
                      <Link
                        to="/practice/mock"
                        className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-white/15 bg-black/20 text-[9.5px] font-semibold text-white/60 transition hover:bg-white/5 hover:text-white/85"
                      >
                        Mock round <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </>
                )}
              </section>
            ) : (
              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">Session live</p>
                  <span className="flex items-center gap-1.5 font-mono text-[9px] tabular-nums text-white/50">
                    <Clock3 className="h-3 w-3 text-[#e9b98f]" /> {formatTime(elapsed)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#e9b98f]/25 bg-[#e9b98f]/10 text-[#e9b98f]">
                    <Waves className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-white/85">{activeName}</p>
                    <p className="truncate text-[9px] text-white/35">
                      {activeSpeaker === 'mentor' ? 'Mentor · guiding the room' : activeSpeaker === 'you' ? 'Your point · room paused' : 'Panellist · speaking now'}
                    </p>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  {[
                    { label: 'Stage', value: stageLabel },
                    { label: 'Turn', value: `${Math.min(turnIndex + 1, turns.length)}/${turns.length}` },
                    { label: 'Hands', value: raised.length ? `${raised.length}` : '—' },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-lg border border-white/10 bg-black/20 px-1 py-1.5 text-center">
                      <p className="truncate font-mono text-[9px] font-semibold text-white/75">{stat.value}</p>
                      <p className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-white/30">{stat.label}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#8fbf9f,#e5b567,#e9b98f)]"
                    animate={{ width: `${Math.round(flowProgress * 100)}%` }}
                    transition={{ duration: 0.6, ease: EASE }}
                  />
                </div>
                {!mockMode && (
                <button
                  type="button"
                  onClick={stop}
                  className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-black/20 text-[9.5px] font-semibold text-white/60 transition hover:bg-white/5 hover:text-white/85"
                >
                  <RotateCcw className="h-3 w-3" /> Stop and reset
                </button>
                )}
              </section>
            )}
            </div>

            {!mockMode && (
            <section className={cn('rounded-2xl border border-[#e9b98f]/20 bg-[#e9b98f]/[0.06] p-3.5', phase === 'hands' ? 'order-4' : 'order-3', fullscreen && 'shrink-0 p-2.5')}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#e9b98f]">
                  <Lightbulb className="h-3.5 w-3.5" /> Coach tip
                </p>
                {phase === 'running' && (
                  <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/30">Turn {turnIndex + 1}</span>
                )}
              </div>
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-[#f0ddcd]">{COACH_TIPS[tipIndex]}</p>
              {running && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className={cn('h-1.5 w-1.5 rounded-full', learnerActive ? 'animate-pulse bg-[#e5b567]' : 'animate-pulse bg-[#8fbf9f]')} />
                  <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/35">
                    {learnerActive ? 'Room paused · your point' : phase === 'hands' ? 'Hands raised · selecting' : `${activeName} has the floor`}
                  </p>
                </div>
              )}
            </section>
            )}

            {phase === 'hands' && (
              <section className={cn('order-2 rounded-2xl border border-[#e9b98f]/25 bg-[#e9b98f]/[0.06] p-3.5', fullscreen && 'shrink-0 p-2.5')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#e9b98f]">
                    <Hand className="h-3.5 w-3.5" /> Conclusion hands
                  </p>
                  {!chosen && <CountdownRing value={handPromptOpen ? handPromptLeft : selectLeft} size={34} />}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {raised.length ? raised.map((id) => {
                    const name = id === 'you' ? displayName : (avatars.find((avatar) => avatar.id === id)?.name || 'Panellist');
                    return (
                      <motion.span
                        key={id}
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] font-medium',
                          id === 'you' ? 'border-[#e5b567]/45 bg-[#e5b567]/10 text-[#f3d7a4]' : 'border-white/10 bg-black/20 text-white/60',
                        )}
                      >
                        <span aria-hidden>✋</span> {name.split(' ')[0]}
                      </motion.span>
                    );
                  }) : <span className="text-[9.5px] text-white/35">Hands are being raised…</span>}
                </div>
                {chosen ? (
                  <p className="mt-2 rounded-lg border border-[#8fbf9f]/25 bg-[#8fbf9f]/10 px-2 py-1.5 text-[9.5px] text-[#a8d3b7]">
                    Aria chose {chosen === 'you' ? 'you' : (avatars.find((avatar) => avatar.id === chosen)?.name.split(' ')[0] || 'a panellist')} to conclude.
                  </p>
                ) : (
                  <>
                    {raised.includes('you') && (
                      <input
                        value={conclusionText}
                        onChange={(event) => setConclusionText(event.target.value)}
                        placeholder="Your concluding line (optional)…"
                        className="mt-2 h-8 w-full rounded-lg border border-white/10 bg-black/25 px-2.5 text-[10px] text-white outline-none transition placeholder:text-white/25 focus:border-[#e9b98f]/50"
                      />
                    )}
                    {!handPromptOpen && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-white/35">Mentor selects in {selectLeft}s</p>
                        <button
                          type="button"
                          onClick={concludeNow}
                          className="rounded-md border border-white/15 px-2 py-1 text-[8.5px] font-semibold text-white/60 transition hover:bg-white/5 hover:text-white/85"
                        >
                          Select now
                        </button>
                      </div>
                    )}
                    {handPromptOpen && (
                      <p className="mt-2 text-[9px] leading-relaxed text-white/40">
                        Aria is asking whether you want to raise your hand. Decide in {handPromptLeft}s.
                      </p>
                    )}
                  </>
                )}
              </section>
            )}

            <section className={cn('rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 backdrop-blur-sm', phase === 'setup' ? 'order-2' : 'order-1', fullscreen && 'p-3')}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
                  <MessageSquare className="h-3.5 w-3.5 text-[#e9b98f]" /> Live transcript
                </p>
                <span className="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-white/30">
                  <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'animate-pulse bg-[#e06a55]' : 'bg-white/25')} /> {lines.length} lines
                </span>
              </div>
              <div ref={transcriptRef} className="mt-2 max-h-[250px] min-h-[180px] space-y-1.5 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,transparent,black_16px)] [scrollbar-width:thin]">
                {lines.length === 0 && (
                  <div className="flex h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/15 px-4 text-center">
                    <span className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-white/35">
                      <MessageSquare className="h-4 w-4" />
                    </span>
                    <p className="mt-2 text-[10px] leading-relaxed text-white/35">
                      Spoken words appear here with each speaker's name and avatar. The latest line stays in view.
                    </p>
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {lines.map((line) => (
                    <motion.div
                      key={line.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'flex gap-2 rounded-xl border p-2',
                        line.mentor ? 'border-[#e9b98f]/20 bg-[#e9b98f]/[0.06]' : line.learner ? 'border-[#e5b567]/25 bg-[#e5b567]/[0.07]' : 'border-white/10 bg-black/15',
                      )}
                    >
                      {avatarFor(line, 'h-7 w-7 shrink-0 rounded-lg border-0')}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('truncate font-mono text-[8px] uppercase tracking-[0.1em]', line.mentor ? 'text-[#e9b98f]' : line.learner ? 'text-[#e5b567]' : 'text-white/40')}>
                            {line.speaker}
                          </p>
                          {line.learner && <span className="shrink-0 font-mono text-[7px] uppercase tracking-[0.1em] text-[#e5b567]/60">You</span>}
                        </div>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-white/70">{line.text}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {activeSpeaker && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 px-1 py-1">
                    <LiveWave className="h-3 text-[#e9b98f]" />
                    <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-white/30">{activeName} is speaking…</p>
                  </motion.div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      <AnimatePresence>
        {handPromptOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] grid place-items-center bg-[#0b0705]/80 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Raise your hand?"
          >
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="relative w-full max-w-sm overflow-hidden rounded-[26px] border border-[#e9b98f]/25 bg-[#1d1411] p-5 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.8)]"
            >
              <HallAtmosphere />
              <div className="relative z-10">
                <div className="flex items-start gap-3">
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="shrink-0"
                  >
                    <AvatarPortrait avatarId="aria" name="Aria" title="Mentor" state="speaking" animated showNameplate={false} className="h-[84px] w-[70px] rounded-xl border border-[#e9b98f]/30" />
                  </motion.div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-[#e9b98f]">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e06a55]" /> Aria is asking
                    </p>
                    <h3 className="mt-1.5 text-[17px] font-semibold leading-tight tracking-[-0.02em] text-[#fff6ed]">
                      {firstName}, would you like to raise your hand?
                    </h3>
                    <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                      You have {handPromptLeft} second{handPromptLeft === 1 ? '' : 's'} to decide. If chosen, you will give the concluding view.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <CountdownRing value={handPromptLeft} size={40} />
                    <div>
                      <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-white/35">Decision window</p>
                      <p className="text-[10px] text-white/60">{handPromptLeft > 0 ? 'Aria is waiting for you' : 'Time is up'}</p>
                    </div>
                  </div>
                  <motion.span
                    animate={{ rotate: [-12, 12, -12] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-[24px]"
                    aria-hidden
                  >
                    ✋
                  </motion.span>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => answerHand(false)}
                    className="h-10 flex-1 rounded-xl border border-white/15 bg-white/[0.03] text-[11px] font-semibold text-white/65 transition hover:bg-white/[0.07] hover:text-white"
                  >
                    No thanks
                  </button>
                  <button
                    type="button"
                    onClick={() => answerHand(true)}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#e9b98f] text-[11px] font-semibold text-[#2a1a12] transition hover:bg-[#f2c9a8]"
                  >
                    <Hand className="h-3.5 w-3.5" /> Raise my hand
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
