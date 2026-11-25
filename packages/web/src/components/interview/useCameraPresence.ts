import { useCallback, useEffect, useRef, useState } from 'react';
import type { PracticePresentationMetrics } from '@/lib/types';

/**
 * Optional webcam presence sampling for the mock interview.
 *
 * The browser measures only aggregate signals — brightness, motion and a
 * skin-tone-in-the-centre heuristic for "face in frame". Up to three small JPEG
 * snapshots are kept in memory so the provider can comment on dress, expression
 * and posture; they are sent with the finish request and never written to the
 * database. Everything degrades quietly when the camera or API is unavailable.
 */

export type CameraStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unsupported';

interface Sample {
  brightness: number;
  face: number;
  motion: number;
  framed: number;
}

const SAMPLE_INTERVAL_MS = 2200;
const MAX_SNAPSHOTS = 3;
const FIRST_SNAPSHOT_AT = 4;
const SNAPSHOT_GAP = 10;
const ANALYSIS_W = 96;
const ANALYSIS_H = 72;

export function useCameraPresence() {
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  const [status, setStatus] = useState<CameraStatus>(supported ? 'idle' : 'unsupported');
  const [error, setError] = useState('');
  const [sampleCount, setSampleCount] = useState(0);
  const [faceNow, setFaceNow] = useState<boolean | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const samplesRef = useRef<Sample[]>([]);
  const snapshotsRef = useRef<string[]>([]);
  const nextSnapshotRef = useRef(FIRST_SNAPSHOT_AT);
  const lastFrameRef = useRef<Uint8ClampedArray | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const startedAtRef = useRef(0);
  const everEnabledRef = useRef(false);

  const captureSnapshot = useCallback((video: HTMLVideoElement) => {
    if (snapshotsRef.current.length >= MAX_SNAPSHOTS || !video.videoWidth || !video.videoHeight) return;
    try {
      const canvas = document.createElement('canvas');
      const width = 480;
      const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.62);
      if (dataUrl.length > 40 && dataUrl.length < 700_000) snapshotsRef.current.push(dataUrl);
    } catch { /* tainted canvas or codec issue — feedback falls back to metrics */ }
  }, []);

  const sample = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return;
    const canvas = canvasRef.current || (canvasRef.current = document.createElement('canvas'));
    canvas.width = ANALYSIS_W;
    canvas.height = ANALYSIS_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    try {
      ctx.drawImage(video, 0, 0, ANALYSIS_W, ANALYSIS_H);
      const { data } = ctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);

      let luma = 0;
      let facePixels = 0;
      let centerPixels = 0;
      let edgeSkin = 0;
      let edgePixels = 0;

      for (let y = 0; y < ANALYSIS_H; y += 1) {
        for (let x = 0; x < ANALYSIS_W; x += 1) {
          const i = (y * ANALYSIS_W + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          luma += 0.299 * r + 0.587 * g + 0.114 * b;

          // YCbCr separates chrominance from brightness, so the same gate
          // finds light and deep skin tones in a dim room. The RGB floor keeps
          // near-black furniture and grey walls out of the face count.
          const px = 0.299 * r + 0.587 * g + 0.114 * b;
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
          const skin = px > 40
            && r > 45 && r >= g && g >= b * 0.8
            && cb >= 72 && cb <= 137
            && cr >= 130 && cr <= 183;
          const nx = x / ANALYSIS_W;
          const ny = y / ANALYSIS_H;
          const inCenter = nx > 0.24 && nx < 0.76 && ny > 0.08 && ny < 0.8;
          if (inCenter) {
            centerPixels += 1;
            if (skin) facePixels += 1;
          } else {
            edgePixels += 1;
            if (skin) edgeSkin += 1;
          }
        }
      }

      const brightness = luma / (ANALYSIS_W * ANALYSIS_H);
      const faceRatio = centerPixels ? facePixels / centerPixels : 0;
      const edgeRatio = edgePixels ? edgeSkin / edgePixels : 0;
      const faceVisible = faceRatio > 0.16 && brightness > 35;
      const framed = faceVisible && edgeRatio < 0.16;

      let motion = 0;
      const prev = lastFrameRef.current;
      if (prev && prev.length === data.length) {
        let diff = 0;
        for (let i = 0; i < data.length; i += 4) {
          diff += Math.abs(data[i] - prev[i]) + Math.abs(data[i + 1] - prev[i + 1]) + Math.abs(data[i + 2] - prev[i + 2]);
        }
        motion = diff / (ANALYSIS_W * ANALYSIS_H * 3 * 255);
      }
      lastFrameRef.current = new Uint8ClampedArray(data);

      samplesRef.current.push({ brightness, face: faceVisible ? 1 : 0, motion, framed: framed ? 1 : 0 });
      const sampleIndex = samplesRef.current.length;
      if (faceVisible && sampleIndex >= nextSnapshotRef.current) {
        captureSnapshot(video);
        nextSnapshotRef.current = sampleIndex + SNAPSHOT_GAP;
      }
      setSampleCount(sampleIndex);
      setFaceNow(faceVisible);
    } catch { /* the preview keeps working even if a frame cannot be read */ }
  }, [captureSnapshot]);

  const enable = useCallback(async () => {
    if (!supported) { setStatus('unsupported'); return; }
    setStatus('requesting');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      everEnabledRef.current = true;
      if (!startedAtRef.current) startedAtRef.current = Date.now();
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try { await video.play(); } catch { /* autoplay can need a gesture; muted preview usually starts */ }
      }
      setStatus('live');
      window.setTimeout(sample, 400);
      if (timerRef.current == null) {
        timerRef.current = window.setInterval(sample, SAMPLE_INTERVAL_MS);
      }
    } catch (err) {
      const name = (err as { name?: string })?.name || '';
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'idle');
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Camera permission was blocked. Allow it in the browser, or continue without camera feedback.'
        : 'The camera could not be started. You can continue without camera feedback.');
    }
  }, [supported, sample]);

  const disable = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => { try { track.stop(); } catch { /* already stopped */ } });
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setFaceNow(null);
    setStatus(supported ? 'idle' : 'unsupported');
  }, [supported]);

  const reset = useCallback(() => {
    samplesRef.current = [];
    snapshotsRef.current = [];
    lastFrameRef.current = null;
    nextSnapshotRef.current = FIRST_SNAPSHOT_AT;
    startedAtRef.current = 0;
    everEnabledRef.current = false;
    setSampleCount(0);
    setFaceNow(null);
  }, []);

  const buildMetrics = useCallback((): PracticePresentationMetrics => {
    const samples = samplesRef.current;
    const n = samples.length;
    const mean = (pick: (sample: Sample) => number) => (
      n ? samples.reduce((sum, item) => sum + pick(item), 0) / n : 0
    );
    return {
      camera_on: everEnabledRef.current || n > 0,
      duration_seconds: startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0,
      samples: n,
      face_visible_ratio: Number(mean((item) => item.face).toFixed(3)),
      avg_brightness: Math.round(mean((item) => item.brightness)),
      motion_score: Number(mean((item) => item.motion).toFixed(4)),
      steady_ratio: n ? Number((samples.filter((item) => item.motion < 0.045).length / n).toFixed(3)) : 0,
      framed_ratio: n ? Number((samples.filter((item) => item.framed).length / n).toFixed(3)) : 0,
      snapshots: [...snapshotsRef.current],
    };
  }, []);

  useEffect(() => {
    if (status === 'live' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
  }, [status]);

  useEffect(() => () => {
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => { try { track.stop(); } catch { /* noop */ } });
  }, []);

  return {
    supported,
    status,
    error,
    videoRef,
    sampleCount,
    faceNow,
    enabled: status === 'live',
    enable,
    disable,
    reset,
    buildMetrics,
  };
}

export type CameraPresence = ReturnType<typeof useCameraPresence>;
