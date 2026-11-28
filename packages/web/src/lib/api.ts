import axios from 'axios';
import { ApplicationStatus, CandidateApplication, CandidateJob, CandidateProfile, LearningTrackView, LoginResponse, MockRoundStatus, MockRoundResult, OnboardingProgress, PlacementOutcome, PreparationArtifact, PreparationModule, PracticeAnswerResult, PracticeAvatarsResult, PracticeDifficulty, PracticeFinishResult, PracticePresentationMetrics, PracticeQuestion, PracticeSessionSummary, PracticeSubscription, PracticeUpgradeRequest, AdminCreditWallet, AdminInterviewDetail, AdminInterviewSession, CreditLedgerEntry, CreditPage, CreditsOverview, AiCall, AiConfig, AiOverview } from './types';
import { AdminUserDetail, AdminUserOverview, AdminUserRow, AdminVisitorResponse } from './admin-user-types';
import { API_URL } from '@/lib/env';

const api = axios.create({
  baseURL: API_URL,
  // Starting an interview generates questions; allow room for a slow
  // provider without the browser timing out before the template fallback.
  timeout: 60000,
});

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

// Auth endpoints must never go through the refresh path. A 401 from /auth/refresh
// that re-enters this interceptor would queue itself behind the very lock it is
// holding, so the leader's `finally` never runs and every request stalls forever.
const AUTH_FREE_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !AUTH_FREE_URLS.some((u) => (originalRequest.url || '').startsWith(u))
    ) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve) => {
          addRefreshSubscriber((token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        const mod = await import('@/stores/auth');
        const useAuthStore = mod.useAuthStore;
        const refreshToken = useAuthStore.getState().refreshToken;

        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const res = await api.post('/auth/refresh', { refresh_token: refreshToken });
        const newToken = res.data.access_token;

        useAuthStore.getState().setTokens(newToken, res.data.refresh_token || refreshToken);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        onRefreshed(newToken);

        return api(originalRequest);
      } catch (refreshError) {
        const { useAuthStore } = await import('@/stores/auth');
        // Drop credentials first so nothing in flight can replay the dead token,
        // then hand off to the login route.
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    const message =
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  },
);

export const auth = {
  login: async (email: string, password: string, role?: 'admin' | 'user'): Promise<LoginResponse> => {
    const res = await api.post('/auth/login', { email, password, role });
    return res.data;
  },
  register: async (email: string, password: string) => {
    const res = await api.post('/auth/register', { email, password });
    return res.data;
  },
  logout: async () => {
    await api.post('/auth/logout');
  },
};

export const leads = {
  list: async (params?: Record<string, any>) => {
    const res = await api.get('/leads', { params });
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get(`/leads/${id}`);
    return res.data;
  },
  enrich: async (id: string, provider?: string) => {
    const res = await api.post(`/leads/${id}/enrich`, { provider });
    return res.data;
  },
  verify: async (id: string) => {
    const res = await api.post(`/leads/${id}/verify`);
    return res.data;
  },
  draft: async (id: string, channel: 'email' | 'whatsapp' | 'both' = 'both') => {
    const res = await api.post(`/leads/${id}/draft`, { channel });
    return res.data;
  },
  editDraft: async (leadId: string, draftId: string, data: { subject?: string; body?: string }) => {
    const res = await api.patch(`/leads/${leadId}/draft/${draftId}`, data);
    return res.data;
  },
  send: async (id: string, channel: 'email' | 'whatsapp' | 'both' = 'both', draftId?: string) => {
    const res = await api.post(`/leads/${id}/send`, { channel, draft_id: draftId });
    return res.data;
  },
  verifyAndSend: async (id: string, channel: 'email' | 'whatsapp' | 'both' = 'both', draftId?: string) => {
    const res = await api.post(`/leads/${id}/verify-and-send`, { channel, draft_id: draftId });
    return res.data;
  },
  scoreExplanation: async (id: string) => {
    const res = await api.get(`/leads/${id}/score`);
    return res.data as {
      score: number;
      band: string;
      breakdown: Record<string, { points: number; reason: string } | undefined>;
    };
  },
  timeline: async (id: string) => {
    const res = await api.get(`/leads/${id}/timeline`);
    return res.data;
  },
  bulkDraft: async (leadIds: string[], channel: 'email' | 'whatsapp' | 'both' = 'both') => {
    const res = await api.post('/leads/bulk-draft', { lead_ids: leadIds, channel });
    return res.data;
  },
  setDoNotContact: async (id: string, doNotContact: boolean) => {
    const res = await api.patch(`/leads/${id}/do-not-contact`, { do_not_contact: doNotContact });
    return res.data;
  },
  assign: async (id: string, assignedTo: string | null) => {
    const res = await api.patch(`/leads/${id}/assign`, { assigned_to: assignedTo });
    return res.data;
  },
  getDuplicates: async () => {
    const res = await api.get('/leads/duplicates');
    return res.data;
  },
  mergeDuplicate: async (id: string, mergeIntoId: string) => {
    const res = await api.post(`/leads/${id}/merge-duplicate`, { merge_into_id: mergeIntoId });
    return res.data;
  },
};

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
  lead_count?: number;
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
  company_name?: string;
  contact_source?: string | null;
  contact_method?: string | null;
  contact_url?: string | null;
  verification?: { email_status?: string; phone_status?: string; checked_at?: string } | null;
}

export const companies = {
  list: async (params?: Record<string, any>) => {
    const res = await api.get('/companies', { params });
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get(`/companies/${id}`);
    return res.data;
  },
  create: async (data: Partial<Company>) => {
    const res = await api.post('/companies', data);
    return res.data;
  },
  update: async (id: string, data: Partial<Company>) => {
    const res = await api.patch(`/companies/${id}`, data);
    return res.data;
  },
  remove: async (id: string) => {
    const res = await api.delete(`/companies/${id}`);
    return res.data;
  },
};

export const contacts = {
  list: async (params?: Record<string, any>) => {
    const res = await api.get('/contacts', { params });
    return res.data;
  },
  get: async (id: string) => {
    const res = await api.get(`/contacts/${id}`);
    return res.data;
  },
  create: async (data: Partial<HRContact>) => {
    const res = await api.post('/contacts', data);
    return res.data;
  },
  update: async (id: string, data: Partial<HRContact>) => {
    const res = await api.patch(`/contacts/${id}`, data);
    return res.data;
  },
  remove: async (id: string) => {
    const res = await api.delete(`/contacts/${id}`);
    return res.data;
  },
  discover: async () => {
    const res = await api.post('/contacts/discover');
    return res.data as { status: string; limit: number; message: string };
  },
  verify: async (id: string) => {
    const res = await api.post(`/contacts/${id}/verify`);
    return res.data as { message: string; job_id: string; contact_id: string };
  },
};

export interface CreditUsageResponse {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  by_provider: Record<string, { used: number; limit: number }>;
  period_start: string;
  period_end: string;
}

export interface RunLog {
  id: string;
  started_at: string;
  finished_at: string | null;
  sources_attempted: number;
  sources_succeeded: number;
  sources_circuit_broken: string[];
  leads_found: number;
  leads_deduped: number;
  errors: any;
}

export const dashboard = {
  stats: async () => {
    const res = await api.get('/dashboard/stats');
    return res.data;
  },
  credits: async () => {
    const res = await api.get('/dashboard/credits');
    return res.data as CreditUsageResponse;
  },
};

export const admin = {
  triggerRun: async (sources?: string[]) => {
    const res = await api.post('/runs/trigger', { sources });
    return res.data;
  },
  runArmy: async () => {
    const res = await api.post('/runs/army', {});
    return res.data;
  },
  armyStatus: async () => {
    const res = await api.get('/army/status');
    return res.data as { raw: number; enrichment: number; verification: number; draft: number };
  },
  getRun: async (id: string) => {
    const res = await api.get(`/runs/${id}`);
    return res.data;
  },
  getRuns: async (limit = 10) => {
    const res = await api.get('/runs', { params: { limit } });
    return res.data;
  },
  updateApiKeys: async (keys: Record<string, string>) => {
    const res = await api.put('/settings/api-keys', { api_keys: keys });
    return res.data;
  },
  getApiKeys: async () => {
    const res = await api.get('/settings/api-keys');
    return res.data;
  },
  getSetting: async (key: string) => {
    const res = await api.get(`/settings/${key}`);
    return res.data;
  },
  updateSettings: async (settings: Record<string, any>) => {
    const res = await api.put('/settings', settings);
    return res.data;
  },
  sourceHealth: async () => {
    const res = await api.get('/sources/health');
    return res.data;
  },
  providerStatus: async () => {
    const res = await api.get('/providers/status');
    return res.data as {
      enrichment: Record<string, boolean>;
      sending: { email: boolean; whatsapp: boolean };
      ai: { gemini: boolean };
    };
  },
  bulkDraftEnrich: async (leadIds: string[], channel: 'email' | 'whatsapp' | 'both' = 'both') => {
    const res = await api.post('/leads/bulk-draft', { lead_ids: leadIds, channel });
    return res.data;
  },
  getUsers: async () => {
    const res = await api.get('/users');
    return res.data;
  },
};

function profileCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch { /* legacy plain-text profile values are handled as one entry */ }
    return [trimmed];
  }
  return value && typeof value === 'object' ? [value] : [];
}

function profileStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    } catch { /* comma-separated legacy fields are supported below */ }
    return trimmed.split(/[,;|\n]/).map((item) => item.trim()).filter(Boolean);
  }
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeCandidateProfile(value: unknown): CandidateProfile | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, any>;
  const text = (field: unknown) => typeof field === 'string' ? field : field == null ? '' : String(field);
  return {
    ...raw,
    full_name: text(raw.full_name), headline: text(raw.headline), contact_email: text(raw.contact_email),
    phone: text(raw.phone), location: text(raw.location), summary: text(raw.summary),
    skills: profileStrings(raw.skills), preferred_roles: profileStrings(raw.preferred_roles),
    preferred_locations: profileStrings(raw.preferred_locations), certifications: profileStrings(raw.certifications),
    remote_preference: ['any', 'remote', 'hybrid', 'onsite'].includes(raw.remote_preference) ? raw.remote_preference : 'any',
    experience_years: Number(raw.experience_years) || 0,
    education_level: text(raw.education_level), salary_currency: raw.salary_currency || 'INR',
    avatar_id: text(raw.avatar_id) || 'ember',
    avatar_url: typeof raw.avatar_url === 'string' && raw.avatar_url ? raw.avatar_url : null,
    experience: profileCollection(raw.experience).map((item: any) => typeof item === 'string'
      ? { title: '', company: '', period: '', description: item }
      : { title: text(item?.title), company: text(item?.company), period: text(item?.period), description: text(item?.description) }),
    projects: profileCollection(raw.projects).map((item: any) => typeof item === 'string'
      ? { name: item, description: '', technologies: [] }
      : { name: text(item?.name), description: text(item?.description), technologies: profileStrings(item?.technologies) }),
  } as CandidateProfile;
}

export const candidate = {
  profile: async () => {
    const response = await api.get('/candidate/profile');
    return { ...response.data, profile: normalizeCandidateProfile(response.data?.profile) } as { profile: CandidateProfile | null; completion: number };
  },
  saveProfile: async (profile: CandidateProfile) => {
    const response = await api.put('/candidate/profile', profile);
    return { ...response.data, profile: normalizeCandidateProfile(response.data?.profile) };
  },
  saveAvatar: async (values: { avatar_id: string; avatar_url?: string | null }) =>
    (await api.patch('/candidate/avatar', values)).data as { avatar_id: string; avatar_url: string | null },
  deleteAccount: async (password:string) => (await api.delete('/candidate/account', { data:{ password } })).data as { deleted:boolean },
  parseResume: async (file: File) => (await api.post('/candidate/resume/parse', file, {
    headers: { 'Content-Type': 'application/octet-stream', 'X-Resume-Filename': file.name },
    timeout: 45000,
  })).data as { filename: string; suggested_profile: Partial<CandidateProfile>; review_required: true },
  jobs: async (params: Record<string, unknown> = {}) => (await api.get('/candidate/jobs', { params })).data as { data: CandidateJob[]; pagination: { page: number; limit: number; total: number; pages: number } },
  contacts: async () => (await api.get('/candidate/contacts')).data as { data: Array<Record<string, any>> },
  job: async (id: string) => (await api.get(`/candidate/jobs/${id}`)).data as { job: CandidateJob },
  recommendations: async () => (await api.get('/candidate/recommendations')).data as { needs_profile: boolean; threshold?: number; model?: string; data: CandidateJob[] },
  summary: async () => (await api.get('/candidate/summary')).data as { profile_completion: number; has_profile: boolean; fresh_jobs_7d: number; application_total: number; application_statuses: Record<string, number> },
  applications: async () => (await api.get('/candidate/applications')).data as { data: CandidateApplication[] },
  saveJob: async (job_id: string, status: ApplicationStatus = 'SAVED') => (await api.post('/candidate/applications', { job_id, status })).data,
  updateApplication: async (id: string, values: { status?: ApplicationStatus; notes?: string; note?: string }) => (await api.patch(`/candidate/applications/${id}`, values)).data,
  prepare: async (job_id: string) => (await api.post(`/candidate/jobs/${job_id}/prepare`)).data as { application: { id: string }; documents: Array<{ id: string; document_type: string; title: string; content: string }>; generated_by: string; user_review_required: boolean },
  feedback: async (values: { application_id?: string; rating: number; feedback: string }) => (await api.post('/candidate/feedback', values)).data,
  adminOverview: async () => (await api.get('/candidate/admin/overview')).data as any,
  recommendationModelStatus: async () => (await api.get('/candidate/admin/recommendation-model')).data as Record<string, any>,
  setRecommendationModelEnabled: async (enabled: boolean) => (await api.put('/candidate/admin/recommendation-model', { enabled })).data as Record<string, any>,
  adminJobs: async (params: Record<string, unknown> = {}) => (await api.get('/candidate/admin/jobs', { params })).data as { data: CandidateJob[] },
  reviewJob: async (id: string, review_status: 'published' | 'pending' | 'quarantined' | 'rejected') => (await api.patch(`/candidate/admin/jobs/${id}/review`, { review_status })).data,
  trainRecommendationModel: async () => (await api.post('/candidate/admin/recommendations/train')).data as { trained: boolean; model: string; training_examples: number; validation_examples?: number; training_source: string; training_task?: string; created_at: string; metrics?: Record<string, number> },
  adminFeedback: async (status: 'pending' | 'approved' | 'rejected' = 'pending') => (await api.get('/candidate/admin/feedback', { params:{ status } })).data as { data:Array<any> },
  moderateFeedback: async (id:string, moderation_status:'approved'|'rejected') => (await api.patch(`/candidate/admin/feedback/${id}`, { moderation_status })).data,
  placements: async (limit = 20, offset = 0) =>
    (await api.get('/candidate/placements', { params: { limit, offset } })).data as CreditPage<PlacementOutcome>,
  reportPlacement: async (values: {
    application_id?: string;
    company_name?: string;
    role_title?: string;
    outcome: PlacementOutcome['outcome'];
    joined_on?: string;
    notes?: string;
  }) => (await api.post('/candidate/placements', values)).data as { placement: PlacementOutcome },
  onboarding: async () => (await api.get('/candidate/onboarding')).data as { progress: OnboardingProgress },
  saveOnboarding: async (values: Partial<Pick<OnboardingProgress, 'completed_steps' | 'last_step' | 'completed' | 'skipped'>>) =>
    (await api.put('/candidate/onboarding', values)).data as { progress: OnboardingProgress },
};

export const engagementAdmin = {
  placements: async (search = '', limit = 25, offset = 0) =>
    (await api.get('/admin/placements', { params: { search, limit, offset } })).data as CreditPage<PlacementOutcome>,
};

export const preparation = {
  artifacts: async (params: { job_id?: string; module?: PreparationModule; limit?: number; offset?: number } = {}) =>
    (await api.get('/candidate/preparation/artifacts', { params })).data as CreditPage<PreparationArtifact>,
  artifact: async (id: string) =>
    (await api.get(`/candidate/preparation/artifacts/${id}`)).data as { artifact: PreparationArtifact },
  generate: async (jobId: string, module: PreparationModule, idempotencyKey?: string) =>
    (await api.post('/candidate/preparation/generate', {
      job_id: jobId,
      module,
      idempotency_key: idempotencyKey,
    })).data as { artifact: PreparationArtifact; already_processed: boolean },
};

export const practice = {
  subscription: async () => (await api.get('/candidate/practice/subscription')).data as { subscription: PracticeSubscription },
  mockRoundStatus: async () => (await api.get('/candidate/practice/mock-round')).data as MockRoundStatus,
  saveMockRoundResult: async (result: Omit<MockRoundResult, 'completed_at'>) =>
    (await api.put('/candidate/practice/mock-round/result', result)).data as { ok: boolean; completed_at: string; attempts: number },
  startMockRound: async (sessionId?: string) =>
    (await api.post('/candidate/practice/mock-round', sessionId ? { session_id: sessionId } : {})).data as { used: boolean; used_at: string; can_use: boolean },
  sessions: async () => (await api.get('/candidate/practice/sessions')).data as { sessions: PracticeSessionSummary[] },
  avatars: async (jobId?: string) =>
    (await api.get('/candidate/practice/avatars', { params: jobId ? { job_id: jobId } : {} })).data as PracticeAvatarsResult,
  createSession: async (values: {
    role_focus?: string;
    difficulty?: PracticeDifficulty;
    question_count?: number;
    avatar_id?: string;
    job_id?: string;
  }) =>
    (await api.post('/candidate/practice/sessions', values)).data as { session: PracticeSessionSummary; first_question?: PracticeQuestion | null; subscription: PracticeSubscription },
  session: async (id: string) => (await api.get(`/candidate/practice/sessions/${id}`)).data as { session: PracticeSessionSummary; questions: PracticeQuestion[] },
  answer: async (sessionId: string, values: { question_id: string; answer: string }) =>
    (await api.post(`/candidate/practice/sessions/${sessionId}/answer`, values)).data as PracticeAnswerResult,
  finish: async (sessionId: string, presentation?: PracticePresentationMetrics) =>
    (await api.post(`/candidate/practice/sessions/${sessionId}/finish`, presentation ? { presentation } : {})).data as PracticeFinishResult,
  abandon: async (sessionId: string) => (await api.delete(`/candidate/practice/sessions/${sessionId}`)).data as { ok: boolean },
  upgradeRequest: async (note?: string) =>
    (await api.post('/candidate/practice/upgrade-request', { note })).data as { request_id: string; status: string; message: string },
  learning: async (roleFocus?: string) =>
    (await api.get('/candidate/practice/learning', { params: roleFocus ? { role_focus: roleFocus } : {} })).data as { track: LearningTrackView | null; role_focus: string },
  learningRefresh: async (roleFocus?: string) =>
    (await api.post('/candidate/practice/learning/refresh', { role_focus: roleFocus })).data as { track: LearningTrackView },
  learningProgress: async (trackId: string, moduleIndex: number) =>
    (await api.post(`/candidate/practice/learning/${trackId}/progress`, { module_index: moduleIndex })).data as { ok: boolean; done: number; total: number; module_index: number; done_state: boolean },
};

export const practiceAdmin = {
  upgrades: async (status: 'pending' | 'approved' | 'rejected' = 'pending') =>
    (await api.get('/practice/upgrades', { params: { status } })).data as { requests: PracticeUpgradeRequest[] },
  approve: async (id: string) => (await api.post(`/practice/upgrades/${id}/approve`)).data as { ok: boolean; user_id: string },
  reject: async (id: string, note?: string) => (await api.post(`/practice/upgrades/${id}/reject`, { note })).data as { ok: boolean },
  grant: async (values: { email: string; plan: 'free' | 'pro'; expires_in_days?: number }) =>
    (await api.post('/practice/grant', values)).data as { ok: boolean; user_id: string; plan: string; expires_at: string | null },
  sessions: async (params: { status?: 'all' | 'in_progress' | 'completed' | 'abandoned'; search?: string; limit?: number; offset?: number } = {}) =>
    (await api.get('/practice/sessions', { params })).data as { sessions: AdminInterviewSession[]; total: number; limit: number; offset: number },
  session: async (id: string) =>
    (await api.get(`/practice/sessions/${id}`)).data as AdminInterviewDetail,
};

export const credits = {
  overview: async () => (await api.get('/candidate/credits')).data as CreditsOverview,
  plans: async () => (await api.get('/candidate/plans')).data as { plans: CreditsOverview['plans']; payments: CreditsOverview['payments']; free_initial_credits: number },
  ledger: async (limit = 20, offset = 0) =>
    (await api.get('/candidate/credits/ledger', { params: { limit, offset } })).data as CreditPage<CreditLedgerEntry>,
  purchase: async () => (await api.post('/candidate/credits/purchase')).data as { ok: boolean },
};

export const creditsAdmin = {
  wallets: async (search = '', limit = 25, offset = 0) =>
    (await api.get('/admin/credits/wallets', { params: { search, limit, offset } })).data as CreditPage<AdminCreditWallet>,
  ledger: async (params: { user_id?: string; kind?: string; limit?: number; offset?: number } = {}) =>
    (await api.get('/admin/credits/ledger', { params })).data as CreditPage<CreditLedgerEntry>,
  wallet: async (userId: string) =>
    (await api.get(`/admin/credits/wallet/${userId}`)).data as { wallet: CreditsOverview['wallet'] },
  adjust: async (values: { user_id: string; delta: number; reason: string; idempotency_key?: string }) =>
    (await api.post('/admin/credits/adjust', values)).data as { wallet: CreditsOverview['wallet']; entry: CreditLedgerEntry | null; already_processed: boolean },
};

export const userAdmin = {
  overview: async (days = 30) =>
    (await api.get('/admin/users/overview', { params: { days } })).data as AdminUserOverview,
  list: async (params: {
    search?: string;
    role?: string;
    status?: string;
    sort?: string;
    limit?: number;
    offset?: number;
  } = {}) =>
    (await api.get('/admin/users', { params })).data as {
      data: AdminUserRow[];
      pagination: { limit: number; offset: number; total: number };
    },
  detail: async (id: string) =>
    (await api.get(`/admin/users/${id}`)).data as AdminUserDetail,
  update: async (id: string, values: {
    role?: string;
    status?: 'active' | 'suspended';
    full_name?: string;
    headline?: string;
    location?: string;
    phone?: string;
    revoke_sessions?: boolean;
  }) => (await api.patch(`/admin/users/${id}`, values)).data as { ok: boolean },
  resetPassword: async (id: string) =>
    (await api.post(`/admin/users/${id}/reset-password`, {})).data as {
      ok: boolean;
      password: string;
      message: string;
    },
  remove: async (id: string, confirm_email: string) =>
    (await api.delete(`/admin/users/${id}`, { data: { confirm_email } })).data as {
      ok: boolean;
      deleted: boolean;
    },
  visitors: async (params: {
    search?: string;
    type?: 'all' | 'anonymous' | 'registered';
    limit?: number;
    offset?: number;
  } = {}) =>
    (await api.get('/admin/users/visitors', { params })).data as AdminVisitorResponse,
};

export const adminAI = {  overview: async () => (await api.get('/admin/ai')).data as AiOverview,
  settings: async () => (await api.get('/admin/ai/settings')).data as { config: AiConfig; features: string[]; defaults: AiConfig },
  saveSettings: async (values: Partial<AiConfig>) =>
    (await api.put('/admin/ai/settings', values)).data as { message: string; config: AiConfig },
  calls: async (limit = 50, offset = 0) =>
    (await api.get('/admin/ai/calls', { params: { limit, offset } })).data as { calls: AiCall[] },
  test: async () => (await api.post('/admin/ai/test')).data as { ok: boolean; model?: string; text?: string; usage?: Record<string, number> | null; error_code?: string; message?: string },
};

export const health = {
  check: async () => {
    const res = await api.get('/health');
    return res.data;
  },
};

export default api;
