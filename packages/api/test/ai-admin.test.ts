import { FastifyInstance } from 'fastify';

const mockSql = jest.fn();

jest.mock('../src/middleware/auth', () => ({
  authenticate: jest.fn(async (req: any) => {
    req.user = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
  }),
  authorize: () => jest.fn(async (req: any, _reply: any) => {
    req.user = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
  }),
}));

jest.mock('../src/utils/db', () => ({ getDB: () => ({ unsafe: mockSql, json: (v: unknown) => v }) }));
jest.mock('../src/utils/audit', () => ({ logAuditEvent: jest.fn(async () => undefined) }));

const originalFetch = global.fetch;
delete process.env.GEMINI_API_KEY;

const defaultImpl = (query: string): any => {
  if (query.includes('FROM users WHERE role')) return [];
  if (query.includes('FROM settings WHERE key')) return [];
  if (query.includes('FROM ai_usage_events')) {
    if (query.includes('GROUP BY')) return [{ day: '2026-11-25', calls: 3, cost_usd: 0.001 }];
    if (query.includes('ORDER BY created_at DESC')) {
      return [{
        id: 'call-1', user_id: null, feature: 'questions', model: 'gemini-2.5-flash',
        status: 'success', error_code: null, prompt_tokens: 100, completion_tokens: 20,
        total_tokens: 120, estimated_cost_usd: 0.00008, latency_ms: 340,
        created_at: new Date().toISOString(),
      }];
    }
    return [{
      daily_requests: 3, monthly_requests: 9, monthly_cost_usd: 0.002,
      calls_today: 3, calls_this_month: 9, calls_all_time: 12,
      cost_today_usd: 0.001, cost_this_month_usd: 0.002, cost_all_time_usd: 0.004,
      tokens_this_month: 1200, errors_this_month: 1,
    }];
  }
  if (query.includes('INSERT INTO settings')) return [];
  if (query.includes('INSERT INTO ai_usage_events')) return [];
  return [];
};

describe('Admin AI routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockSql.mockReset();
    mockSql.mockImplementation(defaultImpl);
    const fastify = (require('fastify') as () => FastifyInstance)();
    const { aiAdminRoutes } = require('../src/routes/ai-admin');
    fastify.register(aiAdminRoutes, { prefix: '/admin/ai' });
    app = fastify;
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
    global.fetch = originalFetch;
  });

  test('overview returns config, spend, limits, daily series and key state', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/ai' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.model).toBe('gemini-2.5-flash');
    expect(body.summary.calls_this_month).toBe(9);
    expect(body.usage.daily_requests).toBe(3);
    expect(body.daily[0].day).toBe('2026-11-25');
    expect(body.key_configured).toBe(false);
    expect(body.features).toContain('questions');
  });

  test('recent calls are returned without secrets', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/ai/calls' });
    expect(res.statusCode).toBe(200);
    const calls = JSON.parse(res.body).calls;
    expect(calls).toHaveLength(1);
    expect(calls[0].feature).toBe('questions');
    expect(JSON.stringify(calls)).not.toMatch(/AIza|test-key/);
  });

  test('settings update persists the config and applies defaults for missing keys', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/ai/settings',
      payload: { enabled: false, monthly_budget_usd: 12.5, features: { grading: false } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.config.enabled).toBe(false);
    expect(body.config.monthly_budget_usd).toBe(12.5);
    expect(body.config.features.grading).toBe(false);
    expect(body.config.features.questions).toBe(true);
    const saved = mockSql.mock.calls.find((call) => String(call[0]).includes('INSERT INTO settings'));
    expect(saved).toBeDefined();
    expect((saved?.[1] as any[])[0]).toBe('ai_config');
  });

  test('invalid settings are rejected', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/ai/settings',
      payload: { monthly_budget_usd: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  test('test call uses the gateway and reports provider failure honestly', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    (global as any).fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const res = await app.inject({ method: 'POST', url: '/admin/ai/test' });
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error_code).toBe('http_401');
    delete process.env.GEMINI_API_KEY;
  });
});
