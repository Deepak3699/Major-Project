export interface Company {
  id: string;
  name: string;
  domain: string | null;
  about: string | null;
  industry: string | null;
  size_estimate: string | null;
  default_email: string | null;
  default_phone: string | null;
  website_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface HRContact {
  id: string;
  full_name: string | null;
  linkedin_url: string | null;
  personal_email: string | null;
  personal_mobile: string | null;
  current_company_id: string | null;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

export type PipelineStage =
  | 'discovered'
  | 'enriched'
  | 'verified'
  | 'drafted'
  | 'contacted'
  | 'replied'
  | 'bounced'
  | 'contact_unavailable'
  | 'suppressed'
  | 'send_failed'
  | 'provider_error'
  | 'retry_pending';

export type ScoreBand = 'hot' | 'warm' | 'cold';
export type DataQuality = 'complete' | 'incomplete';
export type EmailStatus = 'valid' | 'invalid' | 'catch_all' | 'disposable' | 'unknown' | 'expired' | null;
export type WhatsAppStatus = 'registered' | 'not_registered' | 'unknown' | 'expired' | null;

export interface Lead {
  id: string;
  job_posting_id: string;
  company_id: string;
  hr_contact_id: string | null;
  lead_score: number;
  score_band: ScoreBand;
  pipeline_stage: PipelineStage;
  data_quality: DataQuality;
  email_status: EmailStatus;
  whatsapp_status: WhatsAppStatus;
  do_not_contact: boolean;
  possible_duplicate_of: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  hr_extraction_provenance?: any;
  enrichment_provenance?: any;

  company_name: string;
  company_domain: string | null;
  job_title: string | null;
  hr_name: string | null;
  hr_linkedin_url: string | null;
  hr_email: string | null;
  hr_mobile: string | null;
  source_site: string | null;
  confidence_score?: number;
  contact_source?: string;
  contact_method?: string;
  contact_url?: string;
  job_description: string | null;
  experience_level: string | null;
  salary_range: string | null;
  job_url: string | null;
}

export interface LeadDetail extends Lead {
  about_company: string | null;
  industry: string | null;
  size_estimate: string | null;
  hr_extraction_provenance?: any;
  enrichment_log: EnrichmentLog[];
  verification_log: VerificationLog[];
  drafts: OutreachDraft[];
  outreach_log: OutreachLog[];
}


export interface EnrichmentLog {
  id: string;
  lead_id: string;
  provider: string;
  requested_by: string | null;
  request_payload: any;
  response_payload: any;
  credits_used: number;
  status: 'success' | 'failed' | 'no_match';
  created_at: string;
}

export interface VerificationLog {
  id: string;
  lead_id: string;
  channel: 'email' | 'whatsapp';
  result: string;
  raw_response: any;
  created_at: string;
}

export interface OutreachDraft {
  id: string;
  lead_id: string;
  channel: 'email' | 'whatsapp';
  version: number;
  subject: string | null;
  body: string;
  generated_by: string;
  is_edited: boolean;
  created_at: string;
}

export interface OutreachLog {
  id: string;
  lead_id: string;
  draft_id: string | null;
  channel: 'email' | 'whatsapp';
  sent_by: string | null;
  provider_message_id: string | null;
  delivery_status: 'sent' | 'delivered' | 'bounced' | 'replied' | 'failed';
  sent_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'sales_rep' | 'viewer' | 'candidate' | 'user';
}

export interface CandidateProfile {
  user_id?: string;
  full_name: string;
  headline: string;
  contact_email?: string | null;
  phone?: string | null;
  location: string;
  summary: string;
  skills: string[];
  preferred_roles: string[];
  preferred_locations: string[];
  remote_preference: 'any' | 'remote' | 'hybrid' | 'onsite';
  experience_years: number;
  education_level: string;
  salary_min?: number | null;
  salary_currency: 'INR' | 'USD' | 'EUR' | 'GBP';
  experience: Array<{ title: string; company: string; period: string; description: string }>;
  projects: Array<{ name: string; description: string; technologies: string[] }>;
  certifications: string[];
  resume_filename?: string | null;
  profile_confirmed_at?: string | null;
}

export interface JobTrustEvidence { signal: string; points: number; detail: string }
export interface CandidateJob {
  id: string;
  title: string;
  description?: string | null;
  about_job?: string | null;
  experience_level?: string | null;
  salary_range?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  location?: string | null;
  location_type?: string | null;
  employment_type?: string | null;
  apply_url?: string | null;
  job_url: string;
  source_site: string;
  skills: string[];
  posted_at?: string | null;
  first_seen_at?: string | null;
  company_name: string;
  company_domain?: string | null;
  company_website?: string | null;
  company_industry?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  public_hr_name?: string | null;
  public_hr_linkedin?: string | null;
  public_hr_source?: string | null;
  trust_score: number;
  source_count?: number;
  trust_band: 'very_high' | 'high' | 'review' | 'low';
  trust_evidence?: JobTrustEvidence[];
  match_score?: number;
  model_score?: number;
  score_breakdown?: Record<string, { score: number; weight: number; contribution: number }>;
  match_reasons?: string[];
  missing_skills?: string[];
  matched_skills?: string[];
}

export type ApplicationStatus = 'SAVED' | 'RECOMMENDED' | 'READY_TO_APPLY' | 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN' | 'JOINED';
export interface CandidateApplication {
  id: string;
  status: ApplicationStatus;
  notes: string;
  job_id: string;
  job_title: string;
  company_name: string;
  location?: string;
  location_type?: string | null;
  employment_type?: string | null;
  apply_url?: string;
  job_url?: string;
  source_site?: string | null;
  posted_at?: string | null;
  skills?: string[];
  experience_level?: string | null;
  salary_range?: string | null;
  trust_score?: number;
  trust_band?: 'very_high' | 'high' | 'review' | 'low';
  company_industry?: string | null;
  updated_at: string;
  events: Array<{ from_status?: string | null; to_status: string; note: string; created_at: string }>;
  documents: Array<{ id: string; document_type: string; title: string; content: string; created_at: string }>;
}

export interface PracticeUpgradeRequest {
  id: string;
  user_id: string;
  requested_plan: string;
  note: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
  user_email: string;
  current_plan: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user: { id: string; email: string; role: string };
}

/* ----------------------- Plans, credits and ledger ----------------------- */

export interface CreditPlan {
  code: string;
  name: string;
  price_paise: number;
  currency: string;
  credits_included: number | null;
  features: string[];
  status?: string;
  source?: string;
  started_at?: string | null;
  expires_at?: string | null;
}

export interface CreditWallet {
  user_id: string;
  balance: number;
  lifetime_granted: number;
  lifetime_used: number;
  signup_granted: boolean;
  plan: CreditPlan;
}

export type CreditKind = 'signup_grant' | 'purchase' | 'consumption' | 'refund' | 'admin_adjustment' | 'expiry';

export interface CreditLedgerEntry {
  id: string;
  user_id?: string;
  user_email?: string | null;
  delta: number;
  balance_after: number;
  kind: CreditKind;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  idempotency_key?: string | null;
  created_at: string;
  actor_email?: string | null;
}

export interface PaymentState {
  enabled: boolean;
  provider: string | null;
  reason: string;
}

export interface CreditsOverview {
  wallet: CreditWallet;
  plan: CreditPlan;
  plans: CreditPlan[];
  payments: PaymentState;
  free_initial_credits: number;
  free_plan_code: string;
}

export interface CreditPage<T> {
  data: T[];
  pagination: { limit: number; offset: number; total: number };
}

export interface AdminCreditWallet {
  user_id: string;
  email: string;
  role: string;
  balance: number;
  lifetime_granted: number;
  lifetime_used: number;
  updated_at: string;
  plan_code: string | null;
  plan_status: string | null;
  plan_name: string | null;
  last_activity_at: string | null;
}

/* --------------------- Placement outcomes / onboarding -------------------- */

export type PlacementOutcomeKind = 'offer_received' | 'joined';

export interface PlacementOutcome {
  id: string;
  user_id?: string;
  user_email?: string | null;
  application_id: string | null;
  job_posting_id: string | null;
  company_name: string;
  role_title: string;
  outcome: PlacementOutcomeKind;
  joined_on: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface OnboardingProgress {
  completed_steps: string[];
  last_step: number;
  completed: boolean;
  skipped: boolean;
  updated_at: string | null;
}

/* -------------------------- Job preparation -------------------------- */

export type PreparationModule = 'interview_prep' | 'group_discussion' | 'presentation' | 'company_research';

export interface PreparationSource {
  title: string;
  url: string;
  retrieved_at: string;
  status: 'ingested' | 'unverified';
}

export interface PreparationArtifact {
  id: string;
  user_id: string;
  job_id: string | null;
  module: PreparationModule;
  status: 'pending' | 'ready' | 'failed';
  payload: Record<string, any>;
  sources: PreparationSource[];
  model: string;
  credits_charged: number;
  error: string;
  created_at: string;
  updated_at: string;
}

/* ----------------------- AI practice (interviews + learning) ----------------------- */

export type PracticeDifficulty = 'calm' | 'standard' | 'brutal';
export type PracticeAnswerLanguage = 'english' | 'hinglish' | 'hindi';

export interface PracticeVoiceProfile {
  gender: 'female' | 'male';
  lang: string;
  rate: number;
  pitch: number;
  hints: string[];
}

export interface PracticeAvatar {
  id: string;
  name: string;
  title: string;
  tagline: string;
  personality: string;
  ability: string;
  specialties: string[];
  accent: string;
  voice: PracticeVoiceProfile;
  palette: { accent: string; surface: string };
}

export interface PracticeJobContext {
  id: string;
  title: string;
  company: string;
  skills?: string[];
}

export interface PracticeAvatarRecommendation {
  avatar_id: string;
  name: string;
  reason: string;
  score: number;
}

export interface PracticeAvatarsResult {
  avatars: PracticeAvatar[];
  recommended: PracticeAvatarRecommendation;
  job: PracticeJobContext | null;
  role_focus: string;
}

export interface PracticeSubscription {
  plan: 'free' | 'pro';
  status: string;
  source: string;
  used_this_month: number;
  monthly_limit: number | null;
  unlimited: boolean;
  requested_upgrade: boolean;
}

export interface PracticePresentationMetrics {
  camera_on: boolean;
  duration_seconds: number;
  samples: number;
  face_visible_ratio: number;
  avg_brightness: number;
  motion_score: number;
  steady_ratio: number;
  framed_ratio: number;
  /** Downscaled JPEG data URLs. Sent for feedback and never stored. */
  snapshots?: string[];
}

export interface PracticePresentationFeedback {
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

export interface PracticeReportDimension {
  key: string;
  label: string;
  score: number;
  note: string;
}

export interface PracticeReportMistake {
  question: string;
  answer_excerpt: string;
  score: number;
  mistake: string;
  fix: string;
  model_answer: string;
}

export interface PracticeSessionReport {
  dimensions: PracticeReportDimension[];
  strengths: string[];
  mistakes: PracticeReportMistake[];
  next_steps: string[];
  model: string;
}

export interface PracticeSessionSummary {
  id: string;
  role_focus: string;
  difficulty: PracticeDifficulty;
  question_count: number;
  status: 'in_progress' | 'completed' | 'abandoned';
  model: string;
  avatar?: PracticeAvatar;
  job?: PracticeJobContext | null;
  opening_line?: string;
  overall_score: number | null;
  verdict: string;
  summary: string;
  report?: PracticeSessionReport | null;
  presentation?: PracticePresentationFeedback | null;
  started_at: string;
  completed_at: string | null;
  answered_count?: number;
}

export interface PracticeQuestion {
  id: string;
  idx: number;
  category: string;
  topic: string;
  question: string;
  answer: string;
  answer_language?: PracticeAnswerLanguage;
  interviewer_reply?: string;
  feedback: { score: number; strengths: string[]; improvements: string[] } | null;
  score: number | null;
  answered_at: string | null;
}

export interface PracticeAnswerResult {
  question: PracticeQuestion;
  grade: { score: number; strengths: string[]; improvements: string[] };
  language?: PracticeAnswerLanguage;
  next_question?: PracticeQuestion | null;
  follow_up?: PracticeQuestion | null;
  complete?: boolean;
  reply?: string;
}

export interface PracticeFinishResult {
  session: PracticeSessionSummary;
  by_category?: Record<string, number>;
  report?: PracticeSessionReport | null;
  presentation?: PracticePresentationFeedback | null;
  already_completed?: boolean;
}

export interface AdminInterviewSession {
  id: string;
  user_id: string;
  user_email: string;
  role_focus: string;
  difficulty: string;
  avatar_id: string;
  job_title: string;
  job_company: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  model: string;
  overall_score: number | null;
  verdict: string;
  question_count: number;
  question_total: number;
  answered_count: number;
  has_report: boolean;
  camera_review: boolean;
  report: PracticeSessionReport | null;
  presentation: PracticePresentationFeedback | null;
  started_at: string;
  completed_at: string | null;
}

export interface AdminInterviewDetail {
  session: AdminInterviewSession & { summary?: string; opening_line?: string; report: PracticeSessionReport | null; presentation: PracticePresentationFeedback | null };
  candidate: { id: string; email: string };
  questions: Array<PracticeQuestion & { ideal_points?: string[] }>;
}

export interface LearningResourceView {
  type: string;
  name: string;
  url: string;
}

export interface LearningTopicView {
  title: string;
  what_to_learn: string;
  resources: LearningResourceView[];
}

export interface LearningModuleView {
  title: string;
  why: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  topics: LearningTopicView[];
  practice_exercise: string;
  index: number;
  done: boolean;
}

export interface LearningTrackView {
  id: string;
  role_focus: string;
  model: string;
  created_at: string;
  updated_at: string;
  modules: LearningModuleView[];
  progress: { done: number; total: number };
}

export interface AiConfig {
  enabled: boolean;
  model: string;
  features: Record<string, boolean>;
  monthly_budget_usd: number;
  daily_request_cap: number;
  monthly_request_cap: number;
  max_output_tokens: number;
}

export interface AiUsageSummary {
  calls_today: number;
  calls_this_month: number;
  calls_all_time: number;
  cost_today_usd: number;
  cost_this_month_usd: number;
  cost_all_time_usd: number;
  tokens_this_month: number;
  errors_this_month: number;
}

export interface AiUsageSnapshot {
  daily_requests: number;
  monthly_requests: number;
  monthly_cost_usd: number;
}

export interface AiCall {
  id: string;
  user_id: string | null;
  feature: string;
  model: string;
  status: 'success' | 'error' | 'blocked';
  error_code: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | string;
  latency_ms: number;
  created_at: string;
}

export interface AiOverview {
  config: AiConfig;
  usage: AiUsageSnapshot;
  summary: AiUsageSummary;
  daily: Array<{ day: string; calls: number; cost_usd: number }>;
  key_configured: boolean;
  features: string[];
  defaults: AiConfig;
}
