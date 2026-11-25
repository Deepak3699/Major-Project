import { FastifyInstance } from 'fastify';

// Admin practice endpooints: pending upgrade list, approve/reject decisions and
// the direct plan grant. DB/audit are mocked; the query -> decision -> plan-row
// sequencing is what these tests pin.

jest.mock('../src/middleware/auth', () => ({
  authenticate: jest.fn(async (req: any, _reply: any) => {
    req.user = { id: 'admin-1', email: 'a@example.com', role: 'admin' };
  }),
  authorize: () => jest.fn(async (req: any, _reply: any) => {
    req.user = { id: 'admin-1', email: 'a@example.com', role: 'admin' };
  }),
}));

jest.mock('../src/utils/db', () => ({
  getDB: () => ({ unsafe: mockSqlUnsafe }),
}));

jest.mock('../src/utils/redis', () => ({
  getRedis: () => ({ set: jest.fn(async () => 'OK'), lpush: jest.fn(), llen: jest.fn(async () => 0), lrange: jest.fn(async () => []), del: jest.fn(), rpoplpush: jest.fn(async () => null), lrem: jest.fn(), rpush: jest.fn() }),
}));

jest.mock('../src/utils/audit', () => ({
  logAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

const mockSqlUnsafe = jest.fn();

const REQ_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = '66666666-6666-4666-8666-666666666666';
const SESSION_ID = '77777777-7777-4777-8777-777777777777';
const QUESTION_ID = '88888888-8888-4888-8888-888888888888';

beforeEach(() => {
  mockSqlUnsafe.mockReset();
});

describe('Admin practice subscriptions', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const fastify = (require('fastify') as () => FastifyInstance)();
    const { adminRoutes } = require('../src/routes/admin');
    fastify.register(adminRoutes, { prefix: '' });
    app = fastify;
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('pending upgrades list joins the user email and current plan', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('FROM practice_upgrade_requests')) {
        return [{
          id: REQ_ID, user_id: USER_ID, requested_plan: 'pro', note: 'interview soon', status: 'pending',
          created_at: new Date().toISOString(), decided_by: null, decided_at: null,
          user_email: 'c@example.com', current_plan: 'free',
        }];
      }
      return [];
    });
    const res = await app.inject({ method: 'GET', url: '/practice/upgrades' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0]).toMatchObject({ user_email: 'c@example.com', current_plan: 'free', status: 'pending' });
  });

  test('approve flips the request and upserts the pro row', async () => {
    const statements: string[] = [];
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      statements.push(query);
      if (query.includes('JOIN users u') && query.includes('LIMIT 1')) {
        return [{ id: REQ_ID, user_id: USER_ID, status: 'pending', user_email: 'c@example.com' }];
      }
      if (query.includes('UPDATE practice_upgrade_requests')) return [];
      if (query.includes('practice_subscriptions')) return [];
      return [];
    });
    const res = await app.inject({ method: 'POST', url: `/practice/upgrades/${REQ_ID}/approve`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).plan).toBe('pro');
    expect(statements.some((s) => s.includes("SET status = 'approved'"))).toBe(true);
    expect(statements.some((s) => s.includes("SET plan = 'pro'"))).toBe(true);
  });

  test('reject refuses a request that is no longer pending', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('FROM practice_upgrade_requests')) return [{ id: REQ_ID, status: 'approved' }];
      return [];
    });
    const res = await app.inject({ method: 'POST', url: `/practice/upgrades/${REQ_ID}/reject`, payload: {} });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toContain('already approved');
  });

  test('grant upserts the plan for an existing account and 404s unknown emails', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('FROM users WHERE lower(email)')) return [{ id: USER_ID }];
      if (query.includes('practice_subscriptions')) return [];
      return [];
    });
    let res = await app.inject({ method: 'POST', url: '/practice/grant', payload: { email: 'c@example.com', plan: 'pro', expires_in_days: 30 } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: true, plan: 'pro' });
    expect(JSON.parse(res.body).expires_at).toBeTruthy();

    res = await app.inject({ method: 'POST', url: '/practice/grant', payload: { email: 'nope' } });
    expect(res.statusCode).toBe(400);

    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('FROM users WHERE lower(email)')) return [];
      return [];
    });
    res = await app.inject({ method: 'POST', url: '/practice/grant', payload: { email: 'ghost@example.com', plan: 'pro' } });
    expect(res.statusCode).toBe(404);
  });

  test('interview list joins the candidate and counts answered questions', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('COUNT(*) OVER()')) {
        return [{
          id: SESSION_ID, user_id: USER_ID, user_email: 'c@example.com',
          role_focus: 'Data Analyst', difficulty: 'standard', avatar_id: 'neha',
          job_title: 'Data Analyst', job_company: 'Acme', status: 'completed', model: 'gemini-2.5-flash',
          overall_score: 78, verdict: 'Strong showing', question_count: 4,
          started_at: new Date().toISOString(), completed_at: new Date().toISOString(),
          report: { dimensions: [] }, presentation: { available: true },
          question_total: 4, answered_count: 4, total_count: 1,
        }];
      }
      return [];
    });
    const res = await app.inject({ method: 'GET', url: '/practice/sessions?status=completed&search=analyst' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({ user_email: 'c@example.com', answered_count: 4, has_report: true, camera_review: true });
    expect(body.total).toBe(1);
    const [query, params] = mockSqlUnsafe.mock.calls[0];
    expect(query).toContain('ILIKE');
    expect(params).toContain('%analyst%');
  });

  test('interview detail returns the full transcript including Hinglish answers', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('FROM interview_sessions s') && query.includes('JOIN users u')) {
        return [{ id: SESSION_ID, user_id: USER_ID, user_email: 'c@example.com', report: { dimensions: [] }, presentation: { available: true } }];
      }
      if (query.includes('FROM interview_questions')) {
        return [{ id: QUESTION_ID, idx: 0, category: 'intro', question: 'Tell me about yourself.', answer: 'Maine dashboard banaya tha.', answer_language: 'hinglish', interviewer_reply: 'Theek hai, aage badhte hain.', score: 70, ideal_points: [], answered_at: new Date().toISOString() }];
      }
      return [];
    });
    const res = await app.inject({ method: 'GET', url: `/practice/sessions/${SESSION_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.candidate.email).toBe('c@example.com');
    expect(body.questions[0].answer_language).toBe('hinglish');
    expect(body.questions[0].interviewer_reply).toMatch(/theek/i);
  });
});
