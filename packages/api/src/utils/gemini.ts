import { getDB } from './db';
import { decryptApiKeys } from './crypto';

/**
 * Single gateway for every Gemini call.
 *
 * Why this exists:
 *  - key resolution: an admin-stored encrypted key wins over the process env
 *    key, so the UI can rotate credentials without a redeploy;
 *  - cost control: enabled/feature toggles, model, monthly budget and daily /
 *    monthly request caps are enforced HERE, server-side, before a call;
 *  - observability: every attempt is logged with token counts, estimated USD
 *    cost, latency, feature and outcome.
 *
 * Provider failures are represented as a non-ok response so every caller keeps
 * its existing deterministic template fallback. A key-less install never
 * throws and never blocks a candidate.
 */

export type GeminiFeature =
  | 'questions'
  | 'grading'
  | 'summary'
  | 'follow_up'
  | 'opening'
  | 'reply'
  | 'learning'
  | 'adaptive_question'
  | 'presentation'
  | 'report'
  | 'preparation'
  | 'application_documents'
  | 'admin_test';

export interface AiConfig {
  enabled: boolean;
  model: string;
  features: Record<string, boolean>;
  monthly_budget_usd: number;
  daily_request_cap: number;
  monthly_request_cap: number;
  max_output_tokens: number;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: true,
  model: 'gemini-3.5-flash-lite',
  features: {},
  monthly_budget_usd: 50,
  daily_request_cap: 300,
  monthly_request_cap: 6000,
  max_output_tokens: 4096,
};

export const AI_CONFIG_KEY = 'ai_config';
export const AI_FEATURES: GeminiFeature[] = [
  'questions', 'grading', 'summary', 'follow_up', 'opening', 'reply', 'learning',
  'adaptive_question', 'presentation', 'report',
  'preparation', 'application_documents', 'admin_test',
];

// USD per 1M tokens. Kept in one place so admin estimates match what the
// gateway enforces. Unknown models use the conservative flash rate.
const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-3.5-flash': { input: 0.30, output: 2.50 },
  'gemini-3.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-3.8-flash': { input: 0.30, output: 2.50 },
  'gemini-3.1-pro-preview': { input: 1.25, output: 10.00 },
  // Historical models are kept so older usage events stay costed correctly.
  'gemini-2.5-flash': { input: 0.30, output: 2.50 },
  'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
  'gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40 },
};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number {
  const rate = PRICING[model] || PRICING['gemini-3.5-flash-lite'];
  const cost = (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Coerce a stored/partial settings object into a safe, complete config. */
export function normalizeAiConfig(raw: unknown): AiConfig {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const features: Record<string, boolean> = {};
  const incomingFeatures = value.features && typeof value.features === 'object'
    ? value.features as Record<string, unknown>
    : {};
  for (const feature of AI_FEATURES) {
    features[feature] = incomingFeatures[feature] !== false;
  }
  // Preserve any extra feature keys an older config might carry.
  for (const [key, enabled] of Object.entries(incomingFeatures)) {
    if (typeof enabled === 'boolean') features[key] = enabled;
  }
  return {
    enabled: value.enabled !== false,
    model: typeof value.model === 'string' && value.model.trim() ? value.model.trim().slice(0, 100) : DEFAULT_AI_CONFIG.model,
    features,
    monthly_budget_usd: num(value.monthly_budget_usd, DEFAULT_AI_CONFIG.monthly_budget_usd, 0, 100000),
    daily_request_cap: Math.round(num(value.daily_request_cap, DEFAULT_AI_CONFIG.daily_request_cap, 0, 1000000)),
    monthly_request_cap: Math.round(num(value.monthly_request_cap, DEFAULT_AI_CONFIG.monthly_request_cap, 0, 10000000)),
    max_output_tokens: Math.round(num(value.max_output_tokens, DEFAULT_AI_CONFIG.max_output_tokens, 128, 8192)),
  };
}

/* --------------------------- cached key/config --------------------------- */

const KEY_TTL_MS = 60_000;
const CONFIG_TTL_MS = 30_000;

let cachedKey: string | null | undefined;
let cachedKeyUntil = 0;
let cachedConfig: AiConfig | undefined;
let cachedConfigUntil = 0;

/** Call after changing keys or ai_config so the next call sees fresh state. */
export function invalidateGeminiCache(): void {
  cachedKey = undefined;
  cachedKeyUntil = 0;
  cachedConfig = undefined;
  cachedConfigUntil = 0;
}

function rowsArray(value: unknown): Array<Record<string, any>> {
  if (!Array.isArray(value)) return [];
  return value as Array<Record<string, any>>;
}

function parseJsonb(value: unknown): Record<string, any> | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return typeof value === 'object' ? value as Record<string, any> : null;
}

async function readAdminKey(): Promise<string | undefined> {
  // The key saved in the admin UI is authoritative. Read any admin row that
  // has one; ordering keeps the result deterministic if several admins exist.
  const rows = rowsArray(await getDB().unsafe(
    `SELECT api_keys FROM users WHERE role = 'admin' AND api_keys IS NOT NULL ORDER BY created_at ASC LIMIT 20`,
  ));
  for (const row of rows) {
    const encrypted = parseJsonb(row?.api_keys);
    if (!encrypted?.gemini) continue;
    try {
      const plain = decryptApiKeys({ gemini: String(encrypted.gemini) }).gemini;
      if (plain) return plain;
    } catch {
      // Unreadable/corrupt ciphertext: skip it rather than leaking an error.
    }
  }
  return undefined;
}

export async function resolveGeminiKey(force = false): Promise<string | undefined> {
  if (!force && cachedKey !== undefined && Date.now() < cachedKeyUntil) {
    return cachedKey || undefined;
  }
  let key: string | undefined;
  try { key = await readAdminKey(); } catch { key = undefined; }
  if (!key) key = process.env.GEMINI_API_KEY || undefined;
  cachedKey = key || null;
  cachedKeyUntil = Date.now() + KEY_TTL_MS;
  return key;
}

export async function getAiConfig(force = false): Promise<AiConfig> {
  if (!force && cachedConfig && Date.now() < cachedConfigUntil) return cachedConfig;
  let config = DEFAULT_AI_CONFIG;
  try {
    const rows = rowsArray(await getDB().unsafe(`SELECT value FROM settings WHERE key = $1`, [AI_CONFIG_KEY]));
    const stored = parseJsonb(rows[0]?.value);
    if (stored) config = normalizeAiConfig(stored);
  } catch {
    // No settings row / DB unavailable: use safe defaults.
  }
  cachedConfig = config;
  cachedConfigUntil = Date.now() + CONFIG_TTL_MS;
  return config;
}

/* ------------------------------- limits -------------------------------- */

export interface AiUsageSnapshot {
  daily_requests: number;
  monthly_requests: number;
  monthly_cost_usd: number;
}

export async function readUsageSnapshot(): Promise<AiUsageSnapshot> {
  const empty: AiUsageSnapshot = { daily_requests: 0, monthly_requests: 0, monthly_cost_usd: 0 };
  try {
    const rows = rowsArray(await getDB().unsafe(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS daily_requests,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS monthly_requests,
        COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::float AS monthly_cost_usd
      FROM ai_usage_events
    `));
    const row = rows[0];
    if (!row) return empty;
    return {
      daily_requests: Number(row.daily_requests) || 0,
      monthly_requests: Number(row.monthly_requests) || 0,
      monthly_cost_usd: Number(row.monthly_cost_usd) || 0,
    };
  } catch {
    return empty;
  }
}

function limitExceeded(config: AiConfig, usage: AiUsageSnapshot): { code: string; message: string } | null {
  if (config.daily_request_cap > 0 && usage.daily_requests >= config.daily_request_cap) {
    return { code: 'daily_request_cap', message: 'Daily Gemini request cap reached. Template answers remain available.' };
  }
  if (config.monthly_request_cap > 0 && usage.monthly_requests >= config.monthly_request_cap) {
    return { code: 'monthly_request_cap', message: 'Monthly Gemini request cap reached. Template answers remain available.' };
  }
  if (config.monthly_budget_usd > 0 && usage.monthly_cost_usd >= config.monthly_budget_usd) {
    return { code: 'monthly_budget', message: 'Monthly Gemini budget reached. Template answers remain available.' };
  }
  return null;
}

/* ---------------------------- usage logging ----------------------------- */

export interface GeminiFetchOptions {
  feature: GeminiFeature | string;
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
  generationConfig?: Record<string, unknown>;
  timeoutMs?: number;
  userId?: string | null;
}

export interface GeminiFetchResponse {
  ok: boolean;
  status: number;
  errorCode?: string;
  reason?: string;
  model: string;
  json: () => Promise<any>;
}

export async function logAiUsage(event: {
  userId?: string | null;
  feature: string;
  model: string;
  status: 'success' | 'error' | 'blocked';
  errorCode?: string | null;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  costUsd?: number;
}): Promise<void> {
  const promptTokens = Math.max(0, Math.round(Number(event.promptTokens) || 0));
  const completionTokens = Math.max(0, Math.round(Number(event.completionTokens) || 0));
  const totalTokens = promptTokens + completionTokens;
  const costUsd = event.costUsd ?? estimateCostUsd(event.model, promptTokens, completionTokens);
  try {
    const sql = getDB();
    await sql.unsafe(
      `INSERT INTO ai_usage_events
        (user_id, feature, model, status, error_code, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, latency_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        event.userId || null,
        String(event.feature).slice(0, 80),
        String(event.model).slice(0, 100),
        event.status,
        event.errorCode || null,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd,
        Math.max(0, Math.round(Number(event.latencyMs) || 0)),
      ],
    );
  } catch (err) {
    // Observability must never break an interview.
    console.warn('[gemini] failed to log usage event:', err instanceof Error ? err.message : String(err));
  }
}

function blockedResponse(model: string, status: number, code: string, reason: string): GeminiFetchResponse {
  return { ok: false, status, errorCode: code, reason, model, json: async () => ({}) };
}

/**
 * Make one Gemini generateContent call through the shared gateway.
 * Returns a fetch-like object so callers keep their existing validation code.
 */
export async function geminiFetch(options: GeminiFetchOptions): Promise<GeminiFetchResponse> {
  const startedAt = Date.now();
  const config = await getAiConfig();
  const model = config.model || DEFAULT_AI_CONFIG.model;

  if (!config.enabled) {
    return blockedResponse(model, 503, 'ai_disabled', 'Gemini is disabled by the administrator.');
  }
  if (config.features[options.feature] === false) {
    return blockedResponse(model, 403, 'feature_disabled', `Gemini feature "${options.feature}" is disabled.`);
  }
  const apiKey = await resolveGeminiKey();
  if (!apiKey) {
    return blockedResponse(model, 401, 'no_api_key', 'No Gemini API key is configured.');
  }

  const usage = await readUsageSnapshot();
  const limit = limitExceeded(config, usage);
  if (limit) {
    await logAiUsage({
      userId: options.userId,
      feature: options.feature,
      model,
      status: 'blocked',
      errorCode: limit.code,
      latencyMs: Date.now() - startedAt,
    });
    return blockedResponse(model, 429, limit.code, limit.message);
  }

  const generationConfig: Record<string, unknown> = { ...(options.generationConfig || {}) };
  if (typeof generationConfig.maxOutputTokens === 'number') {
    generationConfig.maxOutputTokens = Math.min(generationConfig.maxOutputTokens, config.max_output_tokens);
  }

  let status = 0;
  let ok = false;
  let errorCode: string | undefined;
  let parsed: any = {};
  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: options.parts }],
          generationConfig,
        }),
      },
    );
    status = response.status;
    ok = response.ok;
    try { parsed = await response.json(); } catch { parsed = {}; }
    const meta = parsed?.usageMetadata || {};
    promptTokens = Number(meta.promptTokenCount) || 0;
    completionTokens = Number(meta.candidatesTokenCount) || 0;
    if (!ok) errorCode = `http_${status}`;
    if (parsed?.promptFeedback?.blockReason) errorCode = 'prompt_blocked';
  } catch (err: any) {
    errorCode = err?.name === 'TimeoutError' ? 'timeout' : 'network_error';
    status = 0;
    parsed = {};
  }

  const latencyMs = Date.now() - startedAt;
  await logAiUsage({
    userId: options.userId,
    feature: options.feature,
    model,
    status: ok ? 'success' : 'error',
    errorCode,
    promptTokens,
    completionTokens,
    latencyMs,
  });

  return { ok, status, errorCode, reason: errorCode, model, json: async () => parsed };
}
