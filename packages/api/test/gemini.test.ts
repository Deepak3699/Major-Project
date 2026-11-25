import {
  DEFAULT_AI_CONFIG,
  estimateCostUsd,
  geminiFetch,
  getAiConfig,
  invalidateGeminiCache,
  normalizeAiConfig,
} from '../src/utils/gemini';

const mockSql = jest.fn();

jest.mock('../src/utils/db', () => ({
  getDB: () => ({ unsafe: mockSql }),
}));

const originalFetch = global.fetch;

function mockDb(options: {
  config?: Record<string, unknown> | null;
  usage?: Record<string, unknown>;
  adminKeys?: unknown;
} = {}) {
  mockSql.mockReset();
  mockSql.mockImplementation(async (query: string, _params?: unknown[]) => {
    if (query.includes('FROM users WHERE role')) return options.adminKeys ?? [];
    if (query.includes('FROM settings WHERE key')) {
      return options.config === null ? [] : [{ value: options.config ?? {} }];
    }
    if (query.includes('FROM ai_usage_events')) {
      return [{
        daily_requests: options.usage?.daily_requests ?? 0,
        monthly_requests: options.usage?.monthly_requests ?? 0,
        monthly_cost_usd: options.usage?.monthly_cost_usd ?? 0,
      }];
    }
    if (query.includes('INSERT INTO ai_usage_events')) return [];
    return [];
  });
}

function mockProvider(body: Record<string, unknown> = {}, ok = true, status = 200) {
  const fn = jest.fn(async () => ({
    ok,
    status,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }],
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, totalTokenCount: 1200 },
    }),
  }));
  (global as any).fetch = fn;
  return fn;
}

describe('Gemini gateway', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    invalidateGeminiCache();
    mockDb();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
  });

  test('normalizeAiConfig fills defaults, clamps values and keeps feature flags', () => {
    const config = normalizeAiConfig({
      enabled: true,
      model: '',
      monthly_budget_usd: -5,
      daily_request_cap: -2,
      monthly_request_cap: 1e9,
      max_output_tokens: 99999,
      features: { grading: false, unknown_feature: false },
    });
    expect(config.model).toBe(DEFAULT_AI_CONFIG.model);
    expect(config.monthly_budget_usd).toBe(0);
    expect(config.daily_request_cap).toBe(0);
    expect(config.monthly_request_cap).toBe(10000000);
    expect(config.max_output_tokens).toBe(8192);
    expect(config.features.grading).toBe(false);
    expect(config.features.unknown_feature).toBe(false);
    expect(config.features.questions).toBe(true);
  });

  test('estimateCostUsd uses the flash rate and unknown-model fallback', () => {
    expect(estimateCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000)).toBeCloseTo(2.8, 5);
    expect(estimateCostUsd('mystery-model', 1_000_000, 0)).toBeCloseTo(0.1, 5);
  });

  test('no configured key produces a safe non-ok response without a network call', async () => {
    delete process.env.GEMINI_API_KEY;
    invalidateGeminiCache();
    const fetchMock = mockProvider();
    const response = await geminiFetch({ feature: 'questions', parts: [{ text: 'hello' }] });
    expect(response.ok).toBe(false);
    expect(response.errorCode).toBe('no_api_key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a disabled provider blocks the call before any network request', async () => {
    mockDb({ config: { enabled: false } });
    const fetchMock = mockProvider();
    const response = await geminiFetch({ feature: 'questions', parts: [{ text: 'hello' }] });
    expect(response.ok).toBe(false);
    expect(response.errorCode).toBe('ai_disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('a disabled feature falls back while other features still work', async () => {
    mockDb({ config: { features: { grading: false } } });
    const fetchMock = mockProvider();
    const blocked = await geminiFetch({ feature: 'grading', parts: [{ text: 'hello' }] });
    expect(blocked.errorCode).toBe('feature_disabled');
    const allowed = await geminiFetch({ feature: 'questions', parts: [{ text: 'hello' }] });
    expect(allowed.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('budget and request caps block calls and log the reason', async () => {
    mockDb({ usage: { daily_requests: 5, monthly_requests: 20, monthly_cost_usd: 10 } });
    const config = await getAiConfig();
    expect(config.daily_request_cap).toBe(DEFAULT_AI_CONFIG.daily_request_cap);
    mockDb({ config: { daily_request_cap: 5 }, usage: { daily_requests: 5 } });
    invalidateGeminiCache();
    const fetchMock = mockProvider();
    const response = await geminiFetch({ feature: 'questions', parts: [{ text: 'hello' }] });
    expect(response.ok).toBe(false);
    expect(response.errorCode).toBe('daily_request_cap');
    expect(fetchMock).not.toHaveBeenCalled();
    const logged = mockSql.mock.calls.some((call) => String(call[0]).includes('INSERT INTO ai_usage_events'));
    expect(logged).toBe(true);
  });

  test('maxOutputTokens is clamped to the admin cap and usage is logged', async () => {
    mockDb({ config: { max_output_tokens: 256 } });
    const fetchMock = mockProvider();
    const response = await geminiFetch({
      feature: 'questions',
      parts: [{ text: 'hello' }],
      generationConfig: { maxOutputTokens: 4096 },
    });
    expect(response.ok).toBe(true);
    expect(response.model).toBe(DEFAULT_AI_CONFIG.model);
    const body = JSON.parse((fetchMock.mock.calls[0] as any)[1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(256);
    const insert = mockSql.mock.calls.find((call) => String(call[0]).includes('INSERT INTO ai_usage_events'));
    expect(insert).toBeDefined();
    expect((insert?.[1] as any[])[3]).toBe('success');
    expect((insert?.[1] as any[])[5]).toBe(1000);
  });

  test('a provider error is surfaced as non-ok and logged as an error', async () => {
    const fetchMock = mockProvider({}, false, 429);
    const response = await geminiFetch({ feature: 'questions', parts: [{ text: 'hello' }] });
    expect(response.ok).toBe(false);
    expect(response.errorCode).toBe('http_429');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const insert = mockSql.mock.calls.find((call) => String(call[0]).includes('INSERT INTO ai_usage_events'));
    expect((insert?.[1] as any[])[3]).toBe('error');
  });
});
