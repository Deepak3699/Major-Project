import { useCallback, useEffect, useRef, useState } from 'react';
import type { PracticeVoiceProfile } from '@/lib/types';

/**
 * Browser speech seams for the voice interview.
 *
 * Two separate primitives:
 *  - useInterviewerSpeech — text-to-speech for the AI interviewer. Word-boundary
 *    events emit a `pulse` counter the avatar uses to drive lip movement
 *    (a real viseme feed would need provider audio; boundary pulses give an
 *    honest, word-paced approximation).
 *  - useVoiceAnswers — continuous speech recognition for the candidate's answer.
 *    Chrome/Edge auto-stop on silence, so the hook restarts the recognizer until
 *    the candidate explicitly stops it.
 *
 * Both degrade to silent/disabled on unsupported browsers; typing always works.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  return typeof Ctor === 'function' ? (Ctor as new () => SpeechRecognitionLike) : null;
}

export function synthSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function recognitionSupported(): boolean {
  return !!recognitionCtor();
}

const FEMALE_HINTS = /female|woman|heera|neerja|swara|kalpana|lekha|veena|priya|aria|jenny|samantha|zira|susan|karen|tessa|google uk english female/i;
const MALE_HINTS = /male|man|ravi|prabhat|madhur|vikram|arjun|rohan|david|mark|george|daniel|alex|rishi|google uk english male/i;

/**
 * Pick the closest available English voice for an avatar.
 *
 * Indian English wins over other English voices. Within that pool, explicit
 * voice-name hints beat gender heuristics, and natural/neural voices get a
 * small nudge. All interviewer speech is proper English.
 */
function pickVoice(voices: SpeechSynthesisVoice[], profile?: PracticeVoiceProfile): SpeechSynthesisVoice | null {
  const indian = voices.filter((v) => /^en[-_]IN/i.test(v.lang));
  const english = voices.filter((v) => /^en(-|_)/i.test(v.lang));
  const pool = indian.length ? indian : english;
  if (pool.length === 0) return null;

  const hints = (profile?.hints || []).map((hint) => hint.toLowerCase()).filter(Boolean);
  const gender = profile?.gender;
  let best: SpeechSynthesisVoice | null = null;
  let bestScore = -Infinity;

  for (const voice of pool) {
    const name = voice.name.toLowerCase();
    let score = 0;
    hints.forEach((hint, index) => { if (name.includes(hint)) score += 24 - index * 2; });
    if (gender === 'female') {
      if (FEMALE_HINTS.test(name)) score += 9;
      if (MALE_HINTS.test(name) && !FEMALE_HINTS.test(name)) score -= 7;
    } else if (gender === 'male') {
      if (MALE_HINTS.test(name)) score += 9;
      if (FEMALE_HINTS.test(name) && !MALE_HINTS.test(name)) score -= 7;
    }
    if (/natural|neural|online|enhanced/i.test(name)) score += 2;
    if (/^en[-_]IN/i.test(voice.lang)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return best || pool[0] || null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useInterviewerSpeech(profile?: PracticeVoiceProfile) {
  const supported = synthSupported();
  const [speaking, setSpeaking] = useState(false);
  // Increments on every spoken word boundary. The avatar watches this counter
  // to kick the mouth open in step with speech.
  const [pulse, setPulse] = useState(0);
  const [voiceLabel, setVoiceLabel] = useState('');
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const endCallbackRef = useRef<(() => void) | undefined>(undefined);
  const generationRef = useRef(0);
  const remainingRef = useRef(0);

  const profileKey = JSON.stringify(profile || null);

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      try {
        const voices = window.speechSynthesis.getVoices();
        voicesRef.current = voices;
        const picked = pickVoice(voices, profileRef.current);
        setVoiceLabel(picked ? `${picked.name} · ${picked.lang}` : '');
      } catch { /* voices unavailable */ }
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', load);
    };
  }, [supported, profileKey]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    remainingRef.current = 0;
    endCallbackRef.current = undefined;
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    setSpeaking(false);
  }, [supported]);

  const finish = useCallback((generation: number) => {
    if (generation !== generationRef.current) return;
    setSpeaking(false);
    const cb = endCallbackRef.current;
    endCallbackRef.current = undefined;
    cb?.();
  }, []);

  /** Speak one or more lines in order. Lines are queued by the browser. */
  const speakAll = useCallback((lines: string[], options?: { onEnd?: () => void }) => {
    const parts = (Array.isArray(lines) ? lines : [lines])
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    if (!supported || parts.length === 0) {
      options?.onEnd?.();
      return;
    }
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    remainingRef.current = parts.length;
    endCallbackRef.current = options?.onEnd;

    const voiceProfile = profileRef.current;
    const rate = clamp(Number(voiceProfile?.rate ?? 0.97), 0.7, 1.3);
    const pitch = clamp(Number(voiceProfile?.pitch ?? 1.03), 0.5, 2);

    let voices = voicesRef.current;
    if (!voices || voices.length === 0) {
      try { voices = window.speechSynthesis.getVoices(); } catch { voices = []; }
      voicesRef.current = voices;
    }
    const utteranceLabel = (voice: SpeechSynthesisVoice) => {
      setVoiceLabel(`${voice.name} · ${voice.lang}`);
    };

    const selected = pickVoice(voices, voiceProfile);
    if (selected) utteranceLabel(selected);
    const lang = voiceProfile?.lang || 'en-IN';

    parts.forEach((line) => {
      const utterance = new SpeechSynthesisUtterance(line);
      if (selected) utterance.voice = selected;
      utterance.lang = lang;
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.volume = 1;
      let settled = false;
      utterance.onstart = () => {
        if (generation !== generationRef.current) return;
        setSpeaking(true);
      };
      utterance.onboundary = (event) => {
        if (generation !== generationRef.current) return;
        if (event.name === 'word' || event.name === undefined) setPulse((n) => n + 1);
      };
      const done = () => {
        if (settled) return;
        settled = true;
        if (generation !== generationRef.current) return;
        remainingRef.current -= 1;
        if (remainingRef.current <= 0) finish(generation);
      };
      utterance.onend = done;
      utterance.onerror = done;
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        done();
      }
    });
  }, [supported, finish]);

  const speak = useCallback((text: string, options?: { onEnd?: () => void }) => {
    speakAll([text], options);
  }, [speakAll]);

  // Never leave the interviewer talking after navigating away.
  useEffect(() => () => {
    generationRef.current += 1;
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
  }, [supported]);

  return { supported, speaking, pulse, voiceLabel, speak, speakAll, cancel };
}

export function useVoiceAnswers(handlers: { onFinal: (text: string) => void }) {
  const Ctor = recognitionCtor();
  const supported = !!Ctor;
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const build = useCallback(() => {
    if (!Ctor) return null;
    const rec = new Ctor();
    rec.lang = 'en-IN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = String(result?.[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (result.isFinal) handlersRef.current.onFinal(transcript);
        else interim += ` ${transcript}`;
      }
      setPartial(interim.trim());
    };
    rec.onerror = (event: any) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        wantRef.current = false;
        setListening(false);
        setError('Microphone access is blocked. Allow it in the browser, or type your answer.');
      } else if (event?.error === 'audio-capture') {
        wantRef.current = false;
        setListening(false);
        setError('No microphone was found. Type your answer instead.');
      }
      // 'no-speech' / 'aborted' fall through to onend, which restarts if wanted.
    };
    rec.onend = () => {
      setListening(false);
      setPartial('');
      if (wantRef.current) {
        try {
          rec.start();
          setListening(true);
        } catch {
          wantRef.current = false;
        }
      }
    };
    return rec;
  }, [Ctor]);

  const start = useCallback(() => {
    const rec = recRef.current || build();
    if (!rec) return;
    recRef.current = rec;
    wantRef.current = true;
    setError(null);
    setPartial('');
    try {
      rec.start();
      setListening(true);
    } catch { /* already started — the current stream continues */ }
  }, [build]);

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    setPartial('');
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    try { recRef.current?.abort(); } catch { /* noop */ }
  }, []);

  return { supported, listening, partial, error, start, stop };
}
