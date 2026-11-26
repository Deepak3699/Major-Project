export interface AdminUserTotals {
  users: number;
  candidates: number;
  admins: number;
  suspended: number;
  new_this_month: number;
  new_today: number;
  new_7d: number;
  active_now: number;
  active_today: number;
  active_7d: number;
  active_30d: number;
  visits: number;
  unique_visitors: number;
  page_views: number;
  active_seconds: number;
  tracked_users: number;
  avg_session_seconds: number;
  interviews: number;
  completed_interviews: number;
  applications: number;
}

export interface AdminUserDailyPoint {
  day: string;
  active_users: number;
  page_views: number;
  active_seconds: number;
  visits: number;
  unique_visitors: number;
  signups: number;
  interviews: number;
  applications: number;
}

export interface AdminUserOverview {
  days: number;
  totals: AdminUserTotals;
  daily: AdminUserDailyPoint[];
  roles: Array<{ role: string; count: number }>;
  devices: Array<{ device: string; visitors: number; sessions: number }>;
  top_pages: Array<{ path: string; views: number; active_seconds: number }>;
  countries: Array<{ country: string; visitors: number }>;
  recent_users: AdminUserRow[];
  top_users: Array<{ id: string; email: string; full_name: string; active_seconds: number; sessions: number }>;
  platform: {
    active_jobs: number;
    applications_total: number;
    interviews_total: number;
    feedback_pending: number;
    ai_calls: number;
    credits_used: number;
    preparation_artifacts: number;
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  role: string;
  status: 'active' | 'suspended';
  full_name: string;
  headline?: string | null;
  location?: string | null;
  phone?: string | null;
  plan_code?: string;
  plan_name?: string | null;
  credits?: number;
  total_active_seconds?: number;
  session_count?: number;
  interviews_total?: number;
  interviews_completed?: number;
  avg_score?: number | null;
  applications_total?: number;
  created_at: string;
  last_login_at?: string | null;
  last_seen_at?: string | null;
  last_active?: string | null;
}

export interface AdminUserActivityDetail {
  sessions: number;
  active_seconds: number;
  page_views: number;
  avg_session_seconds: number;
  sessions_30d: number;
  active_seconds_30d: number;
  last_seen: string | null;
}

export interface AdminUserDetail {
  user: AdminUserRow & {
    contact_email?: string | null;
    summary?: string;
    skills?: string[];
    preferred_roles?: string[];
    preferred_locations?: string[];
    remote_preference?: string;
    experience_years?: number;
    education_level?: string;
    salary_min?: number | null;
    salary_currency?: string;
    experience?: unknown;
    projects?: unknown;
    certifications?: string[];
    resume_filename?: string | null;
    profile_confirmed_at?: string | null;
    lifetime_granted?: number;
    lifetime_used?: number;
    updated_at?: string;
  };
  activity: AdminUserActivityDetail;
  daily: Array<{ day: string; active_seconds: number; page_views: number }>;
  recent_pages: Array<{ path: string; title: string | null; active_seconds: number; created_at: string }>;
  sessions: Array<{
    session_id: string;
    started_at: string;
    last_seen_at: string;
    ended_at: string | null;
    active_seconds: number;
    page_views: number;
    entry_path: string;
    last_path: string;
    referrer: string | null;
    device: string;
    browser: string;
    os: string;
    country: string | null;
  }>;
  interviews: Array<{
    id: string;
    role_focus: string;
    difficulty: string;
    status: string;
    overall_score: number | null;
    question_count: number;
    job_title: string;
    job_company: string;
    started_at: string;
    completed_at: string | null;
  }>;
  applications: Array<{
    id: string;
    status: string;
    created_at: string;
    applied_at: string | null;
    updated_at: string;
    notes: string;
    job_title: string | null;
    company_name: string | null;
  }>;
  credits_ledger: Array<{
    id: string;
    delta: number;
    balance_after: number;
    kind: string;
    reason: string;
    created_at: string;
  }>;
  feedback: Array<{
    id: string;
    rating: number;
    feedback: string;
    moderation_status: string;
    created_at: string;
  }>;
}

export interface AdminVisitorRow {
  session_id: string;
  user_id: string | null;
  visitor_id: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  active_seconds: number;
  page_views: number;
  entry_path: string;
  last_path: string;
  referrer: string | null;
  device: string;
  browser: string;
  os: string;
  country: string | null;
  email: string | null;
  full_name: string;
}

export interface AdminVisitorResponse {
  data: AdminVisitorRow[];
  stats: {
    sessions: number;
    visitors: number;
    anonymous_visitors: number;
    avg_seconds: number;
  };
  pagination: { limit: number; offset: number; total: number };
}
