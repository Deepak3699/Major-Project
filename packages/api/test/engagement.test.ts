import { FastifyInstance } from 'fastify';

// Voluntary placement outcomes + server-side onboarding progress.

const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const APPLICATION_ID = '11111111-1111-4111-8111-111111111111';
const PLACEMENT_ID = '22222222-2222-4222-8222-222222222222';
const JOB_ID = '33333333-3333-4333-8333-333333333333';

let mockRole: 'admin' | 'user' = 'user';

jest.mock('../src/middleware/auth', () => ({
  authenticate: jest.fn(async (req: any) => {
    req.user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'cand@example.com', role: 'user' };
  }),
  authorize: (roles: string[]) => jest.fn(async (req: any, reply: any) => {
    if (!roles.includes(mockRole)) {
      reply.status(403).send({ error: 'Forbidden: insufficient permissions' });
      return;
    }
    req.user = mockRole === 'admin'
      ? { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'admin@example.com', role: 'admin' }
      : { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'cand@example.com', role: 'user' };
  }),
}));

const mockSql = jest.fn();
jest.mock('../src/utils/db', () => ({ getDB: () => ({ unsafe: mockSql }) }));

const placement = {
  id: PLACEMENT_ID,
  application_id: null,
  job_posting_id: null,
  company_name: 'Acme',
  role_title: 'Frontend Engineer',
  outcome: 'joined',
  joined_on: '2026-02-01',
  notes: 'Joined the platform team.',
  created_at: '2026-02-02T10:00:00.000Z',
  updated_at: '2026-02-02T10:00:00.000Z',
};

async function buildApp(): Promise<FastifyInstance> {
  const fastify = (require('fastify') as () => FastifyInstance)();
  const { engagementRoutes } = require('../src/routes/engagement');
  const { engagementAdminRoutes } = require('../src/routes/engagement-admin');
  await fastify.register(engagementRoutes, { prefix: '/candidate' });
  await fastify.register(engagementAdminRoutes, { prefix: '/admin' });
  await fastify.ready();
  return fastify;
}

describe('placement outcomes and onboarding', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockSql.mockReset();
    mockRole = 'user';
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('a candidate can report a placement voluntarily', async () => {
    mockSql.mockImplementation(async (query: string) => {
      if (query.includes('INSERT INTO placement_outcomes')) return [placement];
      return [];
    });
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/placements',
      payload: {
        company_name: 'Acme', role_title: 'Frontend Engineer', outcome: 'joined',
        joined_on: '2026-02-01', notes: 'Joined the platform team.',
      },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).placement).toMatchObject({
      company_name: 'Acme', role_title: 'Frontend Engineer', outcome: 'joined',
    });
  });

  test('a linked application must belong to the candidate', async () => {
    mockSql.mockImplementation(async (query: string) => {
      if (query.includes('FROM applications a')) return [];
      return [];
    });
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/placements',
      payload: { application_id: APPLICATION_ID, outcome: 'offer_received' },
    });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error).toBe('Application not found');
  });

  test('company and role are derived from a linked application', async () => {
    let insertedParams: any[] = [];
    mockSql.mockImplementation(async (query: string, params: any[] = []) => {
      if (query.includes('FROM applications a')) {
        return [{ job_posting_id: JOB_ID, title: 'Backend Engineer', company_name: 'Globex' }];
      }
      if (query.includes('INSERT INTO placement_outcomes')) {
        insertedParams = params;
        return [{ ...placement, application_id: APPLICATION_ID, job_posting_id: JOB_ID, company_name: 'Globex', role_title: 'Backend Engineer', outcome: 'offer_received' }];
      }
      return [];
    });
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/placements',
      payload: { application_id: APPLICATION_ID, outcome: 'offer_received' },
    });
    expect(res.statusCode).toBe(201);
    expect(insertedParams[3]).toBe('Globex');
    expect(insertedParams[4]).toBe('Backend Engineer');
    expect(insertedParams[2]).toBe(JOB_ID);
  });

  test('placement reporting rejects a report with no company or application', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/placements',
      payload: { outcome: 'joined' },
    });
    expect(res.statusCode).toBe(400);
  });

  test('candidate history is paginated and scoped to the caller', async () => {
    mockSql.mockImplementation(async (query: string) => {
      if (query.includes('COUNT(*)::int AS total FROM placement_outcomes')) return [{ total: 1 }];
      if (query.includes('FROM placement_outcomes')) return [placement];
      return [];
    });
    const res = await app.inject({ method: 'GET', url: '/candidate/placements?limit=10&offset=0' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      data: [expect.objectContaining({ id: PLACEMENT_ID })],
      pagination: { limit: 10, offset: 0, total: 1 },
    });
  });

  test('admin placement view searches by candidate email', async () => {
    mockRole = 'admin';
    mockSql.mockImplementation(async (query: string) => {
      if (query.includes('COUNT(*)::int AS total')) return [{ total: 1 }];
      if (query.includes('FROM placement_outcomes p')) {
        return [{ ...placement, user_id: USER_ID, user_email: 'cand@example.com' }];
      }
      return [];
    });
    const res = await app.inject({ method: 'GET', url: '/admin/placements?search=cand' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data[0]).toMatchObject({ user_email: 'cand@example.com', company_name: 'Acme' });
  });

  test('a candidate cannot read the admin placement view', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/placements' });
    expect(res.statusCode).toBe(403);
  });

  test('onboarding progress defaults to not-started and persists updates', async () => {
    let stored: any = null;
    mockSql.mockImplementation(async (query: string, params: any[] = []) => {
      if (query.includes('FROM onboarding_progress') && query.includes('SELECT completed_steps')) {
        return stored ? [stored] : [];
      }
      if (query.includes('INSERT INTO onboarding_progress')) {
        stored = {
          completed_steps: Array.isArray(params[1]) ? params[1] : JSON.parse(params[1]),
          last_step: params[2],
          completed: params[3],
          skipped: params[4],
          updated_at: '2026-02-02T10:00:00.000Z',
        };
        return [stored];
      }
      return [];
    });

    let res = await app.inject({ method: 'GET', url: '/candidate/onboarding' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).progress).toMatchObject({ completed: false, skipped: false, last_step: 0, completed_steps: [] });

    res = await app.inject({
      method: 'PUT',
      url: '/candidate/onboarding',
      payload: { completed_steps: ['welcome', 'navigation'], last_step: 2, completed: false, skipped: false },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).progress).toMatchObject({
      completed_steps: ['welcome', 'navigation'], last_step: 2, completed: false, skipped: false,
    });
  });
});
