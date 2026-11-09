/** Shared contracts for the AI practice feature (interviews + learning). */

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
  feedback: AnswerGrade | null;
  score: number | null;
  answered_at: string | null;
}

export interface SessionRecord {
  id: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  role_focus: string;
  difficulty: string;
  question_count: number;
  model: string;
  overall_score: number | null;
  verdict: string;
  summary: string;
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
