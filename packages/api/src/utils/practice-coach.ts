import type {
  AnswerLanguage,
  GeneratedQuestion,
  PresentationFeedback,
  PresentationMetrics,
  Profile,
  ReportDimension,
  ReportMistake,
  SessionReport,
} from '../types/practice';
import {
  templateFollowUp,
  templateQuestions,
  type Difficulty,
} from './practice-ai';
import type { AvatarPersona, JobContext } from './interview-avatars';
import { geminiFetch, getAiConfig, type GeminiFeature } from './gemini';

/**
 * The live-interview layer: conversation-driven questioning, webcam
 * presentation feedback and the end-of-round report.
 *
 * All interviewer output is proper English. Everything here has a
 * deterministic fallback, so a provider hiccup never blocks the candidate.
 */

const MAX_SNAPSHOTS = 3;
const MAX_SNAPSHOT_CHARS = 700_000;

/** Shared instruction: never mirror into Hindi/Hinglish, always proper English. */
function languageInstruction(_language?: AnswerLanguage): string {
  return 'Reply in natural, proper Indian English. Do not use Hindi, Hinglish or Roman-script Hindi, even if the candidate does.';
}

/* ------------------------------------------------------------------ */
/* Shared Gemini helper                                                */
/* ------------------------------------------------------------------ */

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

async function geminiJson(
  feature: GeminiFeature,
  parts: GeminiPart[],
  options: { temperature?: number; maxOutputTokens?: number; timeoutMs?: number } = {},
): Promise<any | null> {
  try {
    const response = await geminiFetch({
      feature,
      parts,
      timeoutMs: options.timeoutMs ?? 30_000,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: options.temperature ?? 0.5,
        maxOutputTokens: options.maxOutputTokens ?? 1200,
      },
    });
    if (!response.ok) return null;
    const payload: any = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text || '')
      .join('') || '';
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Adaptive next question                                              */
/* ------------------------------------------------------------------ */

export interface AdaptiveQuestionInput {
  profile: Profile;
  role: string;
  difficulty: Difficulty;
  job?: JobContext | null;
  avatar?: AvatarPersona | null;
  asked: Array<{
    question: string;
    topic: string;
    category?: string;
    answer: string;
    score?: number | null;
  }>;
  targetCount: number;
  language: AnswerLanguage;
  recentTopics?: string[];
}

function normalize(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const GENERIC_PROBES: Array<{ category: string; topic: string; question: string; ideal_points: string[] }> = [
  { category: 'technical', topic: 'Depth check', question: 'What is one decision in that work that you would defend today, and what evidence supports it?', ideal_points: ['specific decision', 'evidence', 'trade-off'] },
  { category: 'project', topic: 'Ownership', question: 'Which part of that was yours alone, and where did you depend on someone else?', ideal_points: ['clear personal ownership', 'honest dependency', 'outcome'] },
  { category: 'behavioral', topic: 'Friction', question: 'Tell me about a moment in that work when someone disagreed with you. What did you do next?', ideal_points: ['specific disagreement', 'their action', 'resolution'] },
  { category: 'case', topic: 'What if', question: 'If you had to do it again with half the time, what would you cut first and what would you protect?', ideal_points: ['prioritisation logic', 'trade-off', 'success measure'] },
];

export function templateNextQuestion(input: AdaptiveQuestionInput): GeneratedQuestion {
  const asked = Array.isArray(input.asked) ? input.asked : [];
  const askedQuestions = new Set(asked.map((item) => normalize(item.question)));
  const askedTopics = new Set(asked.map((item) => normalize(item.topic)));
  const idx = asked.length;

  if (idx === 0) {
    const first = templateQuestions(
      input.profile,
      input.role,
      input.difficulty,
      Math.max(4, input.targetCount),
      input.recentTopics,
      input.job,
    )[0];
    return {
      idx: 0,
      category: 'intro',
      topic: first?.topic || 'Background',
      question: first?.question || 'Walk me through the experience that makes you a strong fit for this role.',
      ideal_points: first?.ideal_points || ['relevant experience', 'specific evidence', 'honest gap'],
      source: 'template',
    };
  }

  const last = asked[asked.length - 1];
  const dig = templateFollowUp(last.question, last.answer || '', last.topic || '');

  // Only one intro-anchored dig in a row. The turn after the introduction and
  // every second turn after that pulls a fresh role-specific question so the
  // round moves into technical/behavioral/case territory instead of circling
  // the candidate's self-introduction. Every probe is proper English.
  const followUpTurn = idx % 2 === 1;
  if (followUpTurn && !askedQuestions.has(normalize(dig.question))) {
    return {
      idx,
      category: 'follow_up',
      topic: dig.topic,
      question: dig.question,
      ideal_points: dig.ideal_points,
      source: 'template',
    };
  }

  const bank = templateQuestions(
    input.profile,
    input.role,
    input.difficulty,
    input.targetCount + 8,
    input.recentTopics,
    input.job,
  );
  const fresh = bank.find((question) => (
    question.category !== 'intro' // the opening is the only introduction
    && !askedQuestions.has(normalize(question.question))
    && !askedTopics.has(normalize(question.topic))
  ));
  if (fresh) {
    return {
      idx,
      category: fresh.category,
      topic: fresh.topic,
      question: fresh.question,
      ideal_points: fresh.ideal_points,
      source: 'template',
    };
  }

  const probe = GENERIC_PROBES.find((item) => !askedQuestions.has(normalize(item.question)))
    || GENERIC_PROBES[idx % GENERIC_PROBES.length];
  return { idx, ...probe, source: 'template' };
}

const NEXT_QUESTION_PROMPT = [
  'You are a live interviewer conducting a mock interview. Ask exactly ONE next question.',
  'It must react to something concrete in the candidate\'s latest answer whenever there is one: a claim, number, tool, team, failure or trade-off they mentioned.',
  'Do not repeat any earlier question or topic. Ask at most ONE follow-up in a row; the next turn must be a fresh role-specific question.',
  'The opening question is an introduction. After the introduction answer, move on to role-specific technical, project or behavioural questions — do not keep asking for more background or introductions.',
  'Keep the question answerable in 2-4 minutes from their own experience. One or two spoken sentences, max 45 words, no numbering.',
  'If there is no transcript yet, ask a warm, job-specific introduction question.',
  'Return JSON: {"question":string,"category":"intro"|"technical"|"project"|"behavioral"|"case"|"follow_up","topic":string (2-4 words),"ideal_points":string[3]}.',
].join('\n');

export async function generateNextQuestion(input: AdaptiveQuestionInput): Promise<GeneratedQuestion> {
  const fallback = () => templateNextQuestion(input);
  const asked = Array.isArray(input.asked) ? input.asked : [];
  const transcript = asked.map((item, index) => (
    `Q${index + 1} (${item.category || 'question'}, ${item.topic}): ${String(item.question).slice(0, 300)}\nA${index + 1}: ${String(item.answer || '(no answer)').slice(0, 1200)}`
  )).join('\n\n');

  const parsed = await geminiJson('adaptive_question', [
    {
      text: [
        NEXT_QUESTION_PROMPT,
        input.avatar ? [
          `You are ${input.avatar.name}, ${input.avatar.title}.`,
          `Personality: ${input.avatar.personality}`,
          `Interviewing ability: ${input.avatar.ability}`,
        ].join('\n') : '',
        languageInstruction(input.language),
        input.job ? [
          `Job: ${input.job.title}${input.job.company ? ` at ${input.job.company}` : ''}.`,
          (input.job.skills || []).length ? `Job skills: ${JSON.stringify((input.job.skills || []).slice(0, 18))}` : '',
          (input.job.description || input.job.about_job) ? `Job description excerpt: ${String(input.job.description || input.job.about_job).slice(0, 1600)}` : '',
        ].filter(Boolean).join('\n') : '',
        `Target role: ${input.role}. Difficulty: ${input.difficulty}.`,
        `This will be question ${asked.length + 1} of ${input.targetCount}.`,
        transcript ? `Conversation so far:\n${transcript}` : 'This is the opening question; there is no transcript yet.',
        (input.recentTopics || []).length ? `Avoid recently practised topics: ${JSON.stringify((input.recentTopics || []).slice(0, 20))}` : '',
        `Candidate profile: ${JSON.stringify({
          skills: input.profile?.skills,
          experience_years: input.profile?.experience_years,
          headline: input.profile?.headline,
        })}`,
      ].filter(Boolean).join('\n\n'),
    },
  ], { temperature: 0.75, maxOutputTokens: 500, timeoutMs: 25_000 });

  const question = typeof parsed?.question === 'string' ? parsed.question.trim() : '';
  if (!question || question.length < 12 || question.length > 600) return fallback();
  if (asked.some((item) => normalize(item.question) === normalize(question))) return fallback();
  const category = ['intro', 'technical', 'project', 'behavioral', 'case', 'follow_up'].includes(parsed?.category)
    ? parsed.category
    : (asked.length === 0 ? 'intro' : 'follow_up');
  // Even if the provider drifts back to the introduction or stacks another
  // dig, the template brain takes over so the interview keeps progressing.
  const lastTwo = asked.slice(-2).map((item) => item.category);
  const stackedFollowUps = lastTwo.length === 2 && lastTwo.every((item) => item === 'follow_up');
  if (asked.length >= 1 && category === 'intro') return fallback();
  if (stackedFollowUps && category === 'follow_up') return fallback();
  return {
    idx: asked.length,
    category,
    topic: typeof parsed?.topic === 'string' ? parsed.topic.slice(0, 80) : 'Next',
    question,
    ideal_points: Array.isArray(parsed?.ideal_points)
      ? parsed.ideal_points.filter((point: any) => typeof point === 'string').slice(0, 5)
      : [],
    source: 'gemini',
  };
}

/* ------------------------------------------------------------------ */
/* Presentation feedback                                               */
/* ------------------------------------------------------------------ */

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function brightnessScore(brightness: number): number {
  if (!Number.isFinite(brightness) || brightness <= 0) return 0.5;
  if (brightness < 55) return Math.max(0, brightness / 110);
  if (brightness > 215) return Math.max(0.35, 1 - (brightness - 215) / 120);
  return 1;
}

export function templatePresentationFeedback(metrics: PresentationMetrics): PresentationFeedback {
  if (!metrics.camera_on) {
    return {
      available: false,
      score: null,
      summary: 'The camera stayed off, so presentation could not be reviewed. The interview score is unaffected.',
      dress: 'Not assessed — the camera was off.',
      grooming: 'Not assessed — the camera was off.',
      expression: 'Not assessed — the camera was off.',
      posture: 'Not assessed — the camera was off.',
      eye_contact: 'Not assessed — the camera was off.',
      lighting: 'Not assessed — the camera was off.',
      tips: ['For the next round, allow the camera so you get dress, expression and eye-contact feedback.'],
      model: 'template',
    };
  }

  const face = Math.max(0, Math.min(1, metrics.face_visible_ratio));
  const steady = Math.max(0, Math.min(1, metrics.steady_ratio));
  const framed = Math.max(0, Math.min(1, metrics.framed_ratio));
  const light = brightnessScore(metrics.avg_brightness);
  const score = clampScore(45 + face * 22 + steady * 12 + framed * 9 + light * 12);

  const lighting = metrics.avg_brightness < 55
    ? 'The room was dim for parts of the round — add a light in front of you, not behind.'
    : metrics.avg_brightness > 215
      ? 'The frame was overexposed in places — move away from a window or lower the key light.'
      : 'Lighting was even and your face stayed readable.';

  const eyeContact = face < 0.55
    ? `You were clearly in frame for about ${Math.round(face * 100)}% of the round. Keep the camera at eye level and stay inside the frame.`
    : framed < 0.6
      ? 'You were in frame, but the framing drifted. Centre your face and leave a little headroom.'
      : 'You held the frame well — aim your gaze at the lens for the strongest eye contact.';

  const posture = steady < 0.45
    ? 'There was a lot of movement between samples. Plant both feet, keep your shoulders still, and use your hands sparingly.'
    : 'Your posture stayed steady through the round.';

  return {
    available: true,
    score,
    summary: `Camera presence scored ${score}/100 from ${metrics.samples} sample${metrics.samples === 1 ? '' : 's'}. ${lighting}`,
    dress: 'I could not assess the outfit from the sampled frames. For the next round, a solid, ironed shirt or blouse with a neat neckline reads well on camera.',
    grooming: 'I could not assess grooming from the sampled frames. Keep hair clear of your eyes and check the camera preview before you start.',
    expression: metrics.motion_score > 0.2
      ? 'Your expression changed often; slow down at the start of an answer so the key point lands.'
      : 'Your expression stayed composed. Add a small smile at the greeting and at the close.',
    posture,
    eye_contact: eyeContact,
    lighting,
    tips: [
      lighting.includes('dim') ? 'Put a lamp in front of you at face height.' : 'Keep the current lighting setup — it read well.',
      'Look into the lens on your opening sentence, not at your own preview.',
      'Keep your hands below the collarbone and still between points.',
    ],
    model: 'template',
  };
}

function parseSnapshot(dataUrl: string): { mimeType: string; data: string } | null {
  const value = String(dataUrl || '');
  if (value.length > MAX_SNAPSHOT_CHARS) return null;
  const match = value.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  return { mimeType: match[1] === 'image/jpg' ? 'image/jpeg' : match[1], data: match[2] };
}

const PRESENTATION_PROMPT = [
  'You are a kind, specific presentation coach reviewing webcam snapshots from a mock job interview.',
  'Comment on what is visible: dress, grooming, facial expression, posture, eye contact, lighting and confidence.',
  'Be practical and respectful. Never comment on body size, attractiveness, skin colour, caste, religion, disability or any protected attribute. Never guess identity or age.',
  'If an image is unclear, say what you cannot assess instead of inventing it.',
  'Return JSON: {"score":0-100,"summary":string (max 260 chars),"dress":string,"grooming":string,"expression":string,"posture":string,"eye_contact":string,"lighting":string,"tips":string[3]}.',
].join('\n');

export async function generatePresentationFeedback(input: {
  metrics: PresentationMetrics;
  role: string;
  avatar: AvatarPersona;
}): Promise<PresentationFeedback> {
  const fallback = () => templatePresentationFeedback(input.metrics);
  const snapshots = (input.metrics.snapshots || []).slice(0, MAX_SNAPSHOTS).map(parseSnapshot).filter(Boolean) as Array<{ mimeType: string; data: string }>;
  if (!input.metrics.camera_on || snapshots.length === 0) return fallback();

  const parsed = await geminiJson('presentation', [
    {
      text: [
        PRESENTATION_PROMPT,
        `Role: ${input.role}. Interviewer: ${input.avatar.name}.`,
        `Measured signals: ${JSON.stringify({
          samples: input.metrics.samples,
          face_visible_ratio: input.metrics.face_visible_ratio,
          avg_brightness: input.metrics.avg_brightness,
          steady_ratio: input.metrics.steady_ratio,
          framed_ratio: input.metrics.framed_ratio,
          duration_seconds: input.metrics.duration_seconds,
        })}`,
        'These snapshots are deleted after this request; only your written feedback is stored.',
      ].join('\n\n'),
    },
    ...snapshots.map((snapshot) => ({ inlineData: snapshot })),
  ], { temperature: 0.35, maxOutputTokens: 900, timeoutMs: 30_000 });

  const score = typeof parsed?.score === 'number' ? clampScore(parsed.score) : null;
  const text = (value: unknown, max = 420) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const summary = text(parsed?.summary, 320);
  if (score === null || !summary) return fallback();

  return {
    available: true,
    score,
    summary,
    dress: text(parsed?.dress) || 'No specific dress issue was visible.',
    grooming: text(parsed?.grooming) || 'Grooming looked tidy on camera.',
    expression: text(parsed?.expression) || 'Expression was composed.',
    posture: text(parsed?.posture) || 'Posture stayed steady.',
    eye_contact: text(parsed?.eye_contact) || 'Eye contact was reasonable.',
    lighting: text(parsed?.lighting) || 'Lighting was usable.',
    tips: Array.isArray(parsed?.tips)
      ? parsed.tips.filter((tip: any) => typeof tip === 'string').slice(0, 4).map((tip: string) => tip.slice(0, 220))
      : [],
    model: (await getAiConfig()).model,
  };
}

/* ------------------------------------------------------------------ */
/* End-of-round report                                                 */
/* ------------------------------------------------------------------ */

export interface ReportItem {
  category: string;
  topic: string;
  question: string;
  answer: string;
  score: number;
  ideal_points: string[];
  feedback: { strengths?: string[]; improvements?: string[] } | null;
}

export interface ReportInput {
  session: {
    role_focus: string;
    difficulty: string;
    job_title?: string;
    job_company?: string;
  };
  avatar: AvatarPersona;
  items: ReportItem[];
  byCategory: Record<string, number>;
  presentation: PresentationFeedback | null;
}

const DIMENSION_META: Array<{ key: string; label: string; categories: string[] }> = [
  { key: 'clarity', label: 'Clarity', categories: ['intro', 'behavioral', 'general'] },
  { key: 'depth', label: 'Depth', categories: ['technical', 'project', 'case', 'follow_up'] },
  { key: 'structure', label: 'Structure', categories: ['behavioral', 'project', 'intro'] },
  { key: 'confidence', label: 'Confidence', categories: ['intro', 'behavioral'] },
  { key: 'communication', label: 'Communication', categories: [] },
];

function average(values: number[]): number {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function dimensionNote(key: string, score: number): string {
  const strong = score >= 80;
  const okay = score >= 60;
  switch (key) {
    case 'clarity':
      return strong ? 'Answers were easy to follow and the point landed early.' : okay ? 'The direction was clear, but a few answers buried the point.' : 'Several answers needed a clearer first sentence.';
    case 'depth':
      return strong ? 'You went a layer below the surface and named trade-offs.' : okay ? 'Depth was uneven — technical answers were stronger than project detail.' : 'Answers stayed high-level; the interviewer had to pull for specifics.';
    case 'structure':
      return strong ? 'Situation, action and result were visible without prompting.' : okay ? 'Structure appeared in some answers but drifted in others.' : 'Most answers need a deliberate situation → action → result shape.';
    case 'confidence':
      return strong ? 'You stated decisions without hedging.' : okay ? 'You were credible, with some hedging around the harder claims.' : 'Hedging and self-correction weakened otherwise reasonable answers.';
    default:
      return strong ? 'Pacing and wording worked well on camera.' : okay ? 'Communication was serviceable; tighten the opening and the close.' : 'Shorten the setup and finish each answer with the result.';
  }
}

function modelAnswerFromPoints(points: string[]): string {
  const clean = points.map((point) => String(point || '').trim()).filter(Boolean).slice(0, 4);
  if (!clean.length) {
    return 'A stronger answer would name the situation, state exactly what you owned, explain the trade-off, and close with the measurable result.';
  }
  return `A stronger answer would: ${clean.map((point, index) => `(${index + 1}) ${point}`).join(' ')} Then close with the measurable result.`;
}

export function templateSessionReport(input: ReportInput): SessionReport {
  const items = input.items.filter((item) => Number.isFinite(item.score));
  const overall = average(items.map((item) => item.score));
  const categoryScores: Record<string, number[]> = {};
  for (const item of items) {
    const key = String(item.category || 'general');
    (categoryScores[key] = categoryScores[key] || []).push(item.score);
  }

  const depthScores = items
    .filter((item) => ['technical', 'project', 'case', 'follow_up'].includes(item.category))
    .map((item) => item.score);
  const structureScores = items
    .filter((item) => ['behavioral', 'project', 'intro'].includes(item.category))
    .map((item) => item.score);
  const hedges = items.filter((item) => /\bmaybe\b|\bi guess\b|\bnot sure\b|\bidk\b|\bkind of\b|\bsort of\b|\bactually\b/i.test(item.answer)).length;
  const confidence = clampScore(overall - hedges * 3 + (input.presentation?.score != null ? (input.presentation.score - 65) * 0.12 : 0));
  const communication = input.presentation?.score != null
    ? Math.round((overall + input.presentation.score) / 2)
    : clampScore(overall + 2);

  const dimensions: ReportDimension[] = [
    { key: 'clarity', label: 'Clarity', score: overall, note: dimensionNote('clarity', overall) },
    { key: 'depth', label: 'Depth', score: average(depthScores.length ? depthScores : items.map((item) => item.score)), note: dimensionNote('depth', average(depthScores.length ? depthScores : items.map((item) => item.score))) },
    { key: 'structure', label: 'Structure', score: average(structureScores.length ? structureScores : items.map((item) => item.score)), note: dimensionNote('structure', average(structureScores.length ? structureScores : items.map((item) => item.score))) },
    { key: 'confidence', label: 'Confidence', score: confidence, note: dimensionNote('confidence', confidence) },
    { key: 'communication', label: 'Communication', score: communication, note: dimensionNote('communication', communication) },
  ];

  const strengths = Array.from(new Set(items
    .sort((a, b) => b.score - a.score)
    .flatMap((item) => item.feedback?.strengths || [])
    .map((strength) => String(strength || '').trim())
    .filter(Boolean)))
    .slice(0, 4);
  if (!strengths.length) strengths.push('You completed the round and engaged with every question — that is the right starting point.');

  const weakest = [...items].sort((a, b) => a.score - b.score).slice(0, 3);
  const mistakes: ReportMistake[] = weakest.map((item) => {
    const improvement = item.feedback?.improvements?.[0]
      || 'The answer stayed general where the interviewer wanted a concrete example.';
    return {
      question: item.question,
      answer_excerpt: String(item.answer || '').slice(0, 240),
      score: item.score,
      mistake: improvement,
      fix: item.ideal_points?.length
        ? `Cover at least two of: ${item.ideal_points.slice(0, 3).join('; ')}.`
        : 'Use one specific situation, your own action, and a measurable result.',
      model_answer: modelAnswerFromPoints(item.ideal_points || []),
    };
  });

  const lowest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  const nextSteps = [
    `Rewrite your weakest answer out loud, then record it once: ${weakest[0]?.question?.slice(0, 140) || 'the question you found hardest'}.`,
    `Drill ${lowest?.label?.toLowerCase() || 'depth'}: one answer a day with a number, a trade-off and a result.`,
    input.presentation?.available
      ? (input.presentation.tips[0] || 'Run one more round with the camera on and watch your framing.')
      : 'Run the next round with the camera on to unlock presentation feedback.',
  ];

  return {
    dimensions,
    strengths,
    mistakes,
    next_steps: nextSteps,
    model: 'template',
  };
}

const REPORT_PROMPT = [
  'You are writing the end-of-round report for a mock interview candidate.',
  'Be specific, fair and useful. Reference only what the candidate actually said.',
  'Return JSON: {"dimensions":[{"key":"clarity"|"depth"|"structure"|"confidence"|"communication","label":string,"score":0-100,"note":string (max 180 chars)}],"strengths":string[3-4],"mistakes":[{"question":string,"answer_excerpt":string (max 220 chars),"score":0-100,"mistake":string (max 200 chars),"fix":string (max 200 chars),"model_answer":string (max 320 chars)}],"next_steps":string[3]}.',
  'Produce exactly five dimensions in that order. Produce 2-3 mistakes, prioritising the lowest-scoring answers.',
  'A model_answer is a compact outline of what a strong answer would contain, not a fabricated story about the candidate.',
].join('\n');

export async function generateSessionReport(input: ReportInput): Promise<SessionReport> {
  const fallback = () => templateSessionReport(input);
  const items = input.items.filter((item) => Number.isFinite(item.score));
  if (!items.length) return fallback();

  const parsed = await geminiJson('report', [
    {
      text: [
        REPORT_PROMPT,
        `Role: ${input.session.role_focus}${input.session.job_title ? ` (${input.session.job_title}${input.session.job_company ? ` at ${input.session.job_company}` : ''})` : ''}. Difficulty: ${input.session.difficulty}. Interviewer: ${input.avatar.name}.`,
        `Category means: ${JSON.stringify(input.byCategory)}`,
        `Presentation review: ${JSON.stringify(input.presentation)}`,
        `Transcript: ${JSON.stringify(items.map((item) => ({
          category: item.category,
          topic: item.topic,
          question: String(item.question).slice(0, 400),
          answer: String(item.answer).slice(0, 1600),
          score: item.score,
          strengths: item.feedback?.strengths || [],
          improvements: item.feedback?.improvements || [],
          ideal_points: item.ideal_points,
        })))}`,
      ].join('\n\n'),
    },
  ], { temperature: 0.35, maxOutputTokens: 2000, timeoutMs: 30_000 });

  const rawDimensions = Array.isArray(parsed?.dimensions) ? parsed.dimensions : [];
  const dimensions: ReportDimension[] = [];
  for (const meta of DIMENSION_META) {
    const found = rawDimensions.find((dimension: any) => dimension?.key === meta.key);
    if (!found || typeof found.score !== 'number') return fallback();
    dimensions.push({
      key: meta.key,
      label: typeof found.label === 'string' ? found.label.slice(0, 40) : meta.label,
      score: clampScore(found.score),
      note: typeof found.note === 'string' ? found.note.slice(0, 220) : dimensionNote(meta.key, clampScore(found.score)),
    });
  }

  const strengths = Array.isArray(parsed?.strengths)
    ? parsed.strengths.filter((value: any) => typeof value === 'string').slice(0, 4).map((value: string) => value.slice(0, 240))
    : [];
  if (!strengths.length) return fallback();

  const mistakes: ReportMistake[] = Array.isArray(parsed?.mistakes)
    ? parsed.mistakes
      .filter((mistake: any) => typeof mistake?.question === 'string' && typeof mistake?.mistake === 'string')
      .slice(0, 3)
      .map((mistake: any) => ({
        question: mistake.question.slice(0, 400),
        answer_excerpt: typeof mistake.answer_excerpt === 'string' ? mistake.answer_excerpt.slice(0, 260) : '',
        score: typeof mistake.score === 'number' ? clampScore(mistake.score) : 0,
        mistake: mistake.mistake.slice(0, 240),
        fix: typeof mistake.fix === 'string' ? mistake.fix.slice(0, 240) : '',
        model_answer: typeof mistake.model_answer === 'string' ? mistake.model_answer.slice(0, 360) : '',
      }))
    : [];
  if (!mistakes.length) return fallback();

  const nextSteps = Array.isArray(parsed?.next_steps)
    ? parsed.next_steps.filter((value: any) => typeof value === 'string').slice(0, 3).map((value: string) => value.slice(0, 240))
    : [];

  return {
    dimensions,
    strengths,
    mistakes,
    next_steps: nextSteps.length ? nextSteps : fallback().next_steps,
    model: (await getAiConfig()).model,
  };
}
