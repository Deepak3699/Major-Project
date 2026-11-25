/** Shared contracts for the AI practice feature (interviews + learning). */

import type { AvatarPersona } from '../utils/interview-avatars';

export type Profile = Record<string, any>;

export interface QuestionSpec {
  question: string;
  category: string;
  topic: string;
  ideal_points: string[];
}

export interface GeneratedQuestion extends QuestionSpec {
  idx: number;
  source: 'gemini' | 'template';
}

export interface AnswerGrade {
  score: number;
  strengths: string[];
  improvements: string[];
  model?: string;
}

/** A follow-up the interviewer asks based on what the candidate just said. */
export interface FollowUpQuestion {
  question: string;
  topic: string;
  ideal_points: string[];
  source: 'gemini' | 'template';
}

/** The language register the candidate used, so the interviewer can mirror it. */
export type AnswerLanguage = 'english' | 'hinglish' | 'hindi';

/**
 * Aggregate webcam signals measured in the browser. Snapshots are processed
 * for feedback and never persisted; only this summary and the written review
 * are stored on the session.
 */
export interface PresentationMetrics {
  camera_on: boolean;
  duration_seconds: number;
  samples: number;
  face_visible_ratio: number;
  avg_brightness: number;
  motion_score: number;
  steady_ratio: number;
  framed_ratio: number;
  snapshots?: string[];
}

export interface PresentationFeedback {
  available: boolean;
  score: number | null;
  summary: string;
  dress: string;
  grooming: string;
  expression: string;
  posture: string;
  eye_contact: string;
  lighting: string;
  tips: string[];
  model: string;
}

export interface ReportDimension {
  key: string;
  label: string;
  score: number;
  note: string;
}

export interface ReportMistake {
  question: string;
  answer_excerpt: string;
  score: number;
  mistake: string;
  fix: string;
  model_answer: string;
}

export interface SessionReport {
  dimensions: ReportDimension[];
  strengths: string[];
  mistakes: ReportMistake[];
  next_steps: string[];
  model: string;
}

export type ResourceKind = 'docs' | 'roadmap' | 'book' | 'video';

export interface LearningResource {
  type: ResourceKind;
  name: string;
  url: string;
}

export interface LearningTopic {
  title: string;
  what_to_learn: string;
  resources: LearningResource[];
}

export interface LearningModule {
  title: string;
  why: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  topics: LearningTopic[];
  practice_exercise: string;
}

export interface SessionAnswerItem {
  id: string;
  idx: number;
  category: string;
  topic: string;
  question: string;
  answer: string;
  answer_language: AnswerLanguage;
  interviewer_reply: string;
  feedback: AnswerGrade | null;
  score: number | null;
  answered_at: string | null;
}

export interface SessionJobContext {
  id: string;
  title: string;
  company: string;
}

export interface SessionRecord {
  id: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  role_focus: string;
  difficulty: string;
  question_count: number;
  model: string;
  avatar: AvatarPersona;
  job: SessionJobContext | null;
  opening_line: string;
  overall_score: number | null;
  verdict: string;
  summary: string;
  report: SessionReport | null;
  presentation: PresentationFeedback | null;
  started_at: string;
  completed_at: string | null;
}

export interface SubscriptionState {
  plan: 'free' | 'pro';
  status: string;
  source: string;
  used_this_month: number;
  monthly_limit: number | null;
  unlimited: boolean;
  requested_upgrade: boolean;
}
