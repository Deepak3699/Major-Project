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

type SpeechLanguage = 'english' | 'hinglish' | 'hindi';
const DEVANAGARI = /[\u0900-\u097F]/;

// Deliberately strong markers. Generic English words that also exist in Hindi
// ("main", "the", "do") are excluded so an English question never switches to
// a Hindi voice by accident.
const HINGLISH_MARKERS = new Set([
  'nahi', 'nahin', 'kya', 'kyun', 'kyu', 'hai', 'hain', 'tha', 'thi',
  'maine', 'mera', 'meri', 'mere', 'hum', 'humne', 'aap', 'aapka', 'aapki',
  'aapne', 'apna', 'apni', 'apne', 'bhai', 'yaar', 'matlab', 'accha', 'acha',
  'theek', 'thik', 'bahut', 'bohot', 'karna', 'karta', 'karti', 'kiya', 'kiye',
  'raha', 'rahi', 'rahe', 'chahiye', 'chahti', 'chahte', 'kaise', 'abhi',
  'phir', 'bhi', 'aur', 'lekin', 'toh', 'wala', 'wali', 'hoga', 'hota', 'hoti',
  'sakta', 'sakti', 'diya', 'liya', 'gaya', 'gayi', 'jaisa', 'jaise', 'samajh',
  'pata', 'bata', 'batao', 'dekho', 'suno', 'kaam', 'cheez', 'baat', 'zyada',
  'thoda', 'thodi', 'wapas', 'chaliye', 'sunna', 'sahi', 'mujhe', 'yahi', 'ji',
]);

/** Classify a line so the right browser voice and script can be chosen. */
export function detectSpeechLanguage(text: string): SpeechLanguage {
  const value = String(text || '');
  const devanagari = (value.match(new RegExp(DEVANAGARI.source, 'g')) || []).length;
  if (devanagari >= 4) return 'hindi';
  const words = value.toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).filter(Boolean);
  const hits = words.filter((word) => HINGLISH_MARKERS.has(word)).length;
  if (hits >= 2) return 'hinglish';
  if (hits === 1 && words.length >= 10) return 'hinglish';
  return 'english';
}

/**
 * A compact Roman-Hindi → Devanagari dictionary. Only words we know are
 * converted; English technical terms are left untouched so a hi-IN voice can
 * still pronounce "React" or "API" naturally in a code-mixed sentence.
 */
const ROMAN_TO_DEVANAGARI: Record<string, string> = {
  nahi: 'नहीं', nahin: 'नहीं', kya: 'क्या', kyun: 'क्यों', kyu: 'क्यों',
  hai: 'है', hain: 'हैं', tha: 'था', thi: 'थी', ho: 'हो',
  maine: 'मैंने', main: 'मैं', mera: 'मेरा', meri: 'मेरी', mere: 'मेरे',
  hum: 'हम', humne: 'हमने', aap: 'आप', aapka: 'आपका', aapki: 'आपकी',
  aapne: 'आपने', apna: 'अपना', apni: 'अपनी', apne: 'अपने',
  bhai: 'भाई', yaar: 'यार', matlab: 'मतलब', accha: 'अच्छा', acha: 'अच्छा',
  acchi: 'अच्छी', theek: 'ठीक', thik: 'ठीक', sahi: 'सही', bahut: 'बहुत',
  bohot: 'बहुत', karna: 'करना', karta: 'करता', karti: 'करती', karte: 'करते',
  kiya: 'किया', kiye: 'किए', raha: 'रहा', rahi: 'रही', rahe: 'रहे',
  chahiye: 'चाहिए', chahti: 'चाहती', chahte: 'चाहते', chaliye: 'चलिए',
  kaise: 'कैसे', abhi: 'अभी', phir: 'फिर', bhi: 'भी', aur: 'और',
  lekin: 'लेकिन', toh: 'तो', wala: 'वाला', wali: 'वाली', hoga: 'होगा',
  hota: 'होता', hoti: 'होती', sakta: 'सकता', sakti: 'सकती', diya: 'दिया',
  liya: 'लिया', gaya: 'गया', gayi: 'गई', gaye: 'गए', jaisa: 'जैसा',
  jaise: 'जैसे', samajh: 'समझ', pata: 'पता', batao: 'बताओ', dekho: 'देखो',
  suno: 'सुनो', sunna: 'सुनना', kaam: 'काम', cheez: 'चीज़', baat: 'बात',
  zyada: 'ज़्यादा', thoda: 'थोड़ा', thodi: 'थोड़ी', wapas: 'वापस',
  mujhe: 'मुझे', yahi: 'यही', bas: 'बस', ek: 'एक', se: 'से', ka: 'का',
  ki: 'की', ke: 'के', ko: 'को', mein: 'में', aa: 'आ',
  aaya: 'आया', aayi: 'आई', chal: 'चल', chalo: 'चलो', ab: 'अब',
  pehle: 'पहले', phirse: 'फिर से', dobara: 'दोबारा', samajhna: 'समझना',
  namaste: 'नमस्ते', dhanyavaad: 'धन्यवाद', shukriya: 'शुक्रिया',
  swagat: 'स्वागत', ji: 'जी', haan: 'हाँ',
};

const ROMAN_PHRASES: Array<[RegExp, string]> = [
  [/\bbahut accha\b/gi, 'बहुत अच्छा'],
  [/\btheek hai\b/gi, 'ठीक है'],
  [/\bchaliye\b/gi, 'चलिए'],
  [/\bapna contribution\b/gi, 'अपना योगदान'],
  [/\bcontribution samajh aa gaya\b/gi, 'योगदान समझ आ गया'],
];

function toNativeScript(text: string): string {
  let value = text;
  for (const [pattern, replacement] of ROMAN_PHRASES) value = value.replace(pattern, replacement);
  return value.split(/(\s+)/).map((token) => {
    if (!token || /^\s+$/.test(token)) return token;
    const match = token.match(/^([a-zA-Z']+)([^a-zA-Z']*)$/);
    if (!match) return token;
    const mapped = ROMAN_TO_DEVANAGARI[match[1].toLowerCase()];
    return mapped ? `${mapped}${match[2]}` : token;
  }).join('');
}

/**
 * Devanagari sounds far more natural in an hi-IN voice, but only when there is
 * enough Hindi content. Code-mixed lines that are mostly English keep their
 * original text and an Indian-English voice so technical words stay clear.
 */
function prepareSpeech(text: string, detected: SpeechLanguage): { text: string; language: SpeechLanguage } {
  if (detected === 'english') return { text, language: 'english' };
  const native = toNativeScript(text);
  const devChars = (native.match(new RegExp(DEVANAGARI.source, 'g')) || []).length;
  const devWords = (native.match(/[\u0900-\u097F]+/g) || []).length;
  const letters = (native.match(/[a-zA-Z\u0900-\u097F]/g) || []).length || 1;
  if (devChars >= 4 && (devChars / letters >= 0.18 || devWords >= 3)) {
    return { text: native, language: detected };
  }
  return { text, language: 'english' };
}

/**
 * Pick the closest available voice for an avatar and language.
 *
 * Hinglish/Hindi prefers an hi-IN voice (falling back to en-IN, then any
 * English voice); English prefers en-IN. Within that pool explicit voice-name
 * hints beat gender heuristics and natural/neural voices get a small nudge.
 */
function pickVoice(
  voices: SpeechSynthesisVoice[],
  profile: PracticeVoiceProfile | undefined,
  language: SpeechLanguage = 'english',
): SpeechSynthesisVoice | null {
  const hindi = (v: SpeechSynthesisVoice) => /^hi[-_]IN/i.test(v.lang);
  const indianEnglish = (v: SpeechSynthesisVoice) => /^en[-_]IN/i.test(v.lang);
  const english = (v: SpeechSynthesisVoice) => /^en(-|_)/i.test(v.lang);
  const primary = language === 'english' ? voices.filter(indianEnglish) : voices.filter(hindi);
  const secondary = language === 'english'
    ? voices.filter((v) => english(v) && !indianEnglish(v))
    : voices.filter(indianEnglish);
  const fallback = language === 'english' ? [] : voices.filter((v) => english(v) && !indianEnglish(v));
  const pool = primary.length ? primary : secondary.length ? secondary : fallback;
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
    if (language === 'english') {
      if (indianEnglish(voice)) score += 6;
      else if (english(voice)) score += 2;
    } else {
      if (hindi(voice)) score += 8;
      else if (indianEnglish(voice)) score += 4;
      else if (english(voice)) score += 1;
    }
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
        const picked = pickVoice(voices, profileRef.current, 'english');
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

    parts.forEach((line) => {
      // Choose voice + script per line: a Hindi/Hinglish reply uses a hi-IN
      // voice with Devanagari where it is safe, while English lines keep the
      // avatar's Indian-English voice unchanged.
      const prepared = prepareSpeech(line, detectSpeechLanguage(line));
      const isHindi = prepared.language !== 'english';
      const selected = pickVoice(voices, voiceProfile, prepared.language);
      if (selected) {
        utteranceLabel(selected);
      }
      const utterance = new SpeechSynthesisUtterance(prepared.text);
      if (selected) utterance.voice = selected;
      utterance.lang = isHindi ? 'hi-IN' : (voiceProfile?.lang || 'en-IN');
      utterance.rate = clamp(rate * (isHindi ? 0.95 : 1), 0.7, 1.3);
      utterance.pitch = clamp(pitch, isHindi ? 0.8 : 0.5, isHindi ? 1.35 : 2);
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

export function useVoiceAnswers(
  handlers: { onFinal: (text: string) => void },
  options: { language?: 'en-IN' | 'hi-IN' } = {},
) {
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
    rec.lang = options.language || 'en-IN';
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
  }, [Ctor, options.language]);

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
