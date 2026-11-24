import { useCallback, useEffect, useRef, useState } from 'react';

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

/** Pick a pleasant English voice when the OS offers several. */
function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en(-|_)/i.test(v.lang));
  const preferred = english.find((v) => /natural|neural|aria|jenny|neerja|google (uk|us|india)/i.test(v.name));
  return preferred || english.find((v) => /en[-_]IN/i.test(v.lang)) || english[0] || null;
}

export function useInterviewerSpeech() {
  const supported = synthSupported();
  const [speaking, setSpeaking] = useState(false);
  // Increments on every spoken word boundary. The avatar watches this counter
  // to kick the mouth open in step with speech.
  const [pulse, setPulse] = useState(0);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const endCallbackRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      try { voiceRef.current = pickVoice(window.speechSynthesis.getVoices()); } catch { /* voices unavailable */ }
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', load);
    };
  }, [supported]);

  const cancel = useCallback(() => {
    endCallbackRef.current = undefined;
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback((text: string, options?: { onEnd?: () => void }) => {
    if (!supported || !String(text || '').trim()) {
      options?.onEnd?.();
      return;
    }
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    const utterance = new SpeechSynthesisUtterance(String(text));
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.rate = 0.97;
    utterance.pitch = 1.03;
    utterance.volume = 1;
    endCallbackRef.current = options?.onEnd;
    utterance.onstart = () => setSpeaking(true);
    utterance.onboundary = (event) => {
      if (event.name === 'word' || event.name === undefined) setPulse((n) => n + 1);
    };
    const finish = () => {
      setSpeaking(false);
      const cb = endCallbackRef.current;
      endCallbackRef.current = undefined;
      cb?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      finish();
    }
  }, [supported]);

  // Never leave the interviewer talking after navigating away.
  useEffect(() => () => {
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
  }, [supported]);

  return { supported, speaking, pulse, speak, cancel };
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
