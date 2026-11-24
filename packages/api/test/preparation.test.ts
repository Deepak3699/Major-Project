import { FastifyInstance } from 'fastify';

const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JOB_ID = '11111111-1111-4111-8111-111111111111';
const ARTIFACT_ID = '22222222-2222-4222-8222-222222222222';

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

const job = {
  id: JOB_ID,
  title: 'Frontend Engineer',
  description: 'Build accessible React interfaces with a focus on design systems and performance. Collaborate with product and design daily. '.repeat(2),
  about_job: '',
  experience_level: 'mid',
  location: 'Bengaluru',
  skills: ['React', 'Accessibility', 'CSS'],
  apply_url: 'https://jobs.example.invalid/frontend',
  job_url: '',
  source_site: 'example',
  posted_at: '2026-01-01T00:00:00.000Z',
  first_seen_at: '2026-01-02T00:00:00.000Z',
  company_name: 'Acme',
  company_domain: 'acme.invalid',
  company_website: 'https://acme.invalid',
  company_industry: 'Software',
};

const profile = {
  full_name: 'Test Candidate',
  skills: ['React', 'TypeScript'],
  summary: 'Frontend developer with design-system experience.',
  projects: [{ name: 'Design system' }, { name: 'Dashboard' }],
  experience: [{ title: 'Frontend Engineer' }],
};

const artifact = {
  id: ARTIFACT_ID,
  user_id: USER_ID,
  job_id: JOB_ID,
  module: 'interview_prep',
  status: 'ready',
  payload: {
    role: 'Frontend Engineer',
    questions: [{ category: 'intro', question: 'Introduce yourself', framework: 'Background' }],
    sources: [],
    generated_by: 'truthful-template',
  },
  sources: [],
  model: 'template',
  credits_charged: 0,
  error: '',
  created_at: '2026-02-02T10:00:00.000Z',
  updated_at: '2026-02-02T10:00:00.000Z',
};

async function buildApp(): Promise<FastifyInstance> {
  const fastify = (require('fastify') as () => FastifyInstance)();
  const { preparationRoutes } = require('../src/routes/preparation');
  await fastify.register(preparationRoutes, { prefix: '/candidate/preparation' });
  await fastify.ready();
  return fastify;
}

describe('job-specific preparation', () => {
  let app: FastifyInstance;
  let storedKey: string | null = null;

  beforeEach(async () => {
    mockSql.mockReset();
    mockRole = 'user';
    storedKey = null;
    mockSql.mockImplementation(async (query: string, params: any[] = []) => {
      if (query.includes('WHERE user_id = $1 AND idempotency_key = $2')) {
        return storedKey === params[1] ? [artifact] : [];
      }
      if (query.includes('FROM job_postings jp')) return [job];
      if (query.includes('FROM candidate_profiles')) return [profile];
      if (query.includes('INSERT INTO preparation_artifacts')) {
        storedKey = params[7];
        return [artifact];
      }
      if (query.includes('COUNT(*)::int AS total FROM preparation_artifacts')) return [{ total: 1 }];
      if (query.includes('FROM preparation_artifacts')) return [artifact];
      return [];
    });
    delete process.env.GEMINI_API_KEY;
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('generates a grounded interview-prep artifact without charging credits', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/preparation/generate',
      payload: { job_id: JOB_ID, module: 'interview_prep', idempotency_key: 'generate-test-001' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.artifact.module).toBe('interview_prep');
    expect(body.artifact.credits_charged).toBe(0);
    expect(body.artifact.model).toBe('template');
  });

  test('replaying the same idempotency key returns the stored artifact once', async () => {
    await app.inject({
      method: 'POST',
      url: '/candidate/preparation/generate',
      payload: { job_id: JOB_ID, module: 'interview_prep', idempotency_key: 'generate-test-002' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/preparation/generate',
      payload: { job_id: JOB_ID, module: 'interview_prep', idempotency_key: 'generate-test-002' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).already_processed).toBe(true);
    const inserts = mockSql.mock.calls.filter((call) => String(call[0]).includes('INSERT INTO preparation_artifacts'));
    expect(inserts).toHaveLength(1);
  });

  test('an unavailable or untrusted job cannot be prepared for', async () => {
    mockSql.mockImplementation(async (query: string) => (query.includes('FROM job_postings jp') ? [] : []));
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/preparation/generate',
      payload: { job_id: JOB_ID, module: 'presentation', idempotency_key: 'generate-test-003' },
    });
    expect(res.statusCode).toBe(404);
  });

  test('company research cites sources and admits what is unverified', async () => {
    const captured: any[] = [];
    mockSql.mockImplementation(async (query: string, params: any[] = []) => {
      if (query.includes('FROM job_postings jp')) return [job];
      if (query.includes('FROM candidate_profiles')) return [profile];
      if (query.includes('INSERT INTO preparation_artifacts')) {
        captured.push(params);
        return [{ ...artifact, module: 'company_research' }];
      }
      return [];
    });
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/preparation/generate',
      payload: { job_id: JOB_ID, module: 'company_research', idempotency_key: 'generate-test-004' },
    });
    expect(res.statusCode).toBe(201);
    const payload = captured[0][3];
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    expect(parsed.products_or_services).toEqual([]);
    expect(parsed.recent_developments[0].status).toBe('unverified');
    expect(parsed.sources).toEqual(expect.arrayContaining([expect.objectContaining({ url: job.apply_url })]));
  });

  test('artifact listings are scoped to the caller and filter by job', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/candidate/preparation/artifacts?job_id=${JOB_ID}&module=interview_prep`,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).pagination.total).toBe(1);
    expect(mockSql.mock.calls.some((call) => String(call[0]).includes('user_id = $1'))).toBe(true);
  });

  test('a single artifact cannot be read by another candidate', async () => {
    mockSql.mockImplementation(async (query: string) => {
      if (query.includes('WHERE id = $1 AND user_id = $2')) return [];
      return [];
    });
    const res = await app.inject({ method: 'GET', url: `/candidate/preparation/artifacts/${ARTIFACT_ID}` });
    expect(res.statusCode).toBe(404);
  });

  test('an admin cannot use candidate preparation routes', async () => {
    mockRole = 'admin';
    const res = await app.inject({ method: 'GET', url: '/candidate/preparation/artifacts' });
    expect(res.statusCode).toBe(403);
  });

  test('invalid module names are rejected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/preparation/generate',
      payload: { job_id: JOB_ID, module: 'hack', idempotency_key: 'generate-test-005' },
    });
    expect(res.statusCode).toBe(400);
  });
});
