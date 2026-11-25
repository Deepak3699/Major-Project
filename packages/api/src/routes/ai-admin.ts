import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authorize, authenticate } from '../middleware/auth';
import { getDB } from '../utils/db';
import { logAuditEvent } from '../utils/audit';
import {
  AI_CONFIG_KEY,
  AI_FEATURES,
  DEFAULT_AI_CONFIG,
  geminiFetch,
  getAiConfig,
  normalizeAiConfig,
  readUsageSnapshot,
  resolveGeminiKey,
  invalidateGeminiCache,
} from '../utils/gemini';

/**
 * Admin-only Gemini governance. Nothing here returns a secret: the UI sees
 * whether a key is configured, spend/call aggregates and redacted call logs.
 * Limits themselves are enforced inside the shared gateway (utils/gemini.ts),
 * so changing a setting here takes effect without restarting the API.
 */

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().min(1).max(100).optional(),
  features: z.record(z.boolean()).optional(),
  monthly_budget_usd: z.number().min(0).max(100000).optional(),
  daily_request_cap: z.number().int().min(0).max(1000000).optional(),
  monthly_request_cap: z.number().int().min(0).max(10000000).optional(),
  max_output_tokens: z.number().int().min(128).max(8192).optional(),
});

function rowsArray(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value) ? value as Array<Record<string, any>> : [];
}

async function readSpendSummary() {
  const empty = {
    calls_today: 0, calls_this_month: 0, calls_all_time: 0,
    cost_today_usd: 0, cost_this_month_usd: 0, cost_all_time_usd: 0,
    tokens_this_month: 0, errors_this_month: 0,
  };
  try {
    const rows = rowsArray(await getDB().unsafe(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS calls_today,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS calls_this_month,
        COUNT(*)::int AS calls_all_time,
        COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at >= date_trunc('day', now())), 0)::float AS cost_today_usd,
        COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::float AS cost_this_month_usd,
        COALESCE(SUM(estimated_cost_usd), 0)::float AS cost_all_time_usd,
        COALESCE(SUM(total_tokens) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::int AS tokens_this_month,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()) AND status = 'error')::int AS errors_this_month
      FROM ai_usage_events
    `));
    if (!rows[0]) return empty;
    const row = rows[0];
    return {
      calls_today: Number(row.calls_today) || 0,
      calls_this_month: Number(row.calls_this_month) || 0,
      calls_all_time: Number(row.calls_all_time) || 0,
      cost_today_usd: Number(row.cost_today_usd) || 0,
      cost_this_month_usd: Number(row.cost_this_month_usd) || 0,
      cost_all_time_usd: Number(row.cost_all_time_usd) || 0,
      tokens_this_month: Number(row.tokens_this_month) || 0,
      errors_this_month: Number(row.errors_this_month) || 0,
    };
  } catch {
    return empty;
  }
}

async function readDailySeries() {
  try {
    const rows = rowsArray(await getDB().unsafe(`
      SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS calls,
             COALESCE(SUM(estimated_cost_usd), 0)::float AS cost_usd
      FROM ai_usage_events
      WHERE created_at >= now() - interval '29 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `));
    return rows.map((row) => ({
      day: String(row.day),
      calls: Number(row.calls) || 0,
      cost_usd: Number(row.cost_usd) || 0,
    }));
  } catch {
    return [];
  }
}

export const aiAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', { preValidation: [authorize(['admin'])] }, async () => {
    const [config, usage, summary, daily, key] = await Promise.all([
      getAiConfig(true),
      readUsageSnapshot(),
      readSpendSummary(),
      readDailySeries(),
      resolveGeminiKey(true),
    ]);
    return {
      config,
      usage,
      summary,
      daily,
      key_configured: Boolean(key),
      features: AI_FEATURES,
      defaults: DEFAULT_AI_CONFIG,
    };
  });

  fastify.get('/settings', { preValidation: [authorize(['admin'])] }, async () => {
    return { config: await getAiConfig(true), features: AI_FEATURES, defaults: DEFAULT_AI_CONFIG };
  });

  fastify.put('/settings', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parsed = settingsSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }
    const current = await getAiConfig(true);
    const config = normalizeAiConfig({ ...current, ...parsed.data });
    const sql = getDB();
    try {
      await sql.unsafe(
        `INSERT INTO settings (key, value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [AI_CONFIG_KEY, sql.json(config as any), (req.user as { id: string }).id],
      );
    } catch (err) {
      return reply.status(502).send({ error: 'Could not save AI settings', detail: (err as Error).message });
    }
    invalidateGeminiCache();
    await logAuditEvent({
      user_id: (req.user as { id: string }).id,
      action: 'update_ai_settings',
      resource_type: 'settings',
      resource_id: AI_CONFIG_KEY,
    });
    return { message: 'AI settings updated', config };
  });

  fastify.get('/calls', { preValidation: [authorize(['admin'])] }, async (req) => {
    const { limit, offset } = req.query as { limit?: string; offset?: string };
    const take = Math.min(200, Math.max(1, Number(limit) || 50));
    const skip = Math.max(0, Number(offset) || 0);
    let calls: Array<Record<string, any>> = [];
    try {
      calls = rowsArray(await getDB().unsafe(
        `SELECT id, user_id, feature, model, status, error_code, prompt_tokens,
                completion_tokens, total_tokens, estimated_cost_usd, latency_ms, created_at
         FROM ai_usage_events
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [take, skip],
      ));
    } catch {
      calls = [];
    }
    return { calls };
  });

  // A real (but tiny) provider call so admins can verify the key and see the
  // event appear in the ledger immediately.
  fastify.post('/test', { preValidation: [authorize(['admin'])] }, async (_req, reply) => {
    const response = await geminiFetch({
      feature: 'admin_test',
      timeoutMs: 15_000,
      parts: [{ text: 'Reply with exactly the single word: ok' }],
      generationConfig: { temperature: 0, maxOutputTokens: 32 },
    });
    if (!response.ok) {
      return reply.status(502).send({
        ok: false,
        error_code: response.errorCode || 'provider_error',
        message: response.reason || 'The Gemini test call failed.',
      });
    }
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text || '')
      .join('') || '';
    return {
      ok: true,
      model: response.model,
      text: String(text).slice(0, 200),
      usage: payload?.usageMetadata || null,
    };
  });
};
