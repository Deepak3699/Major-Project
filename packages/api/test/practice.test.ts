import { FastifyInstance } from 'fastify';

// AI practice routes. Real practice-ai engine runs (template fallbacks, no
// GEMINI_API_KEY set), while DB/auth/redis/audit are mocked at the seams like
// dashboard.test.ts. These pin the subscription gate and the route contracts.

jest.mock('../src/middleware/auth', () => ({
  authenticate: jest.fn(async (req: any, _reply: any) => {
    req.user = { id: 'cand-1', email: 'c@example.com', role: 'candidate' };
  }),
  authorize: () => jest.fn(async (req: any, _reply: any) => {
    req.user = { id: 'admin-1', email: 'a@example.com', role: 'admin' };
  }),
}));

jest.mock('../src/utils/db', () => ({
  getDB: () => ({ unsafe: mockSqlUnsafe }),
}));

jest.mock('../src/utils/redis', () => ({
  getRedis: () => ({ set: mockRedisSet }),
}));

jest.mock('../src/utils/audit', () => ({
  logAuditEvent: jest.fn(async () => undefined),
}));

const mockSqlUnsafe = jest.fn();
const mockRedisSet = jest.fn(async () => 'OK');

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const QUESTION_ID = '22222222-2222-4222-8222-222222222222';
const TRACK_ID = '33333333-3333-4333-8333-333333333333';
const UPREQ_ID = '44444444-4444-4444-8444-444444444444';
const FOLLOW_UP_ID = '66666666-6666-4666-8666-666666666666';
const JOB_ID = '77777777-7777-4777-8777-777777777777';

delete process.env.GEMINI_API_KEY;

const defaultImpl = (query: string): any => {
  if (query.includes('FROM practice_subscriptions')) return [];
  if (query.includes('COUNT(*)::int AS used')) return [{ used: 0 }];
  if (query.includes('FROM practice_upgrade_requests')) return [];
  if (query.includes('preferred_roles')) return [{ preferred_roles: ['Frontend Developer'] }];
  if (query.includes('SELECT DISTINCT topic')) return [{ topic: 'old topic' }];
  if (query.includes('SELECT * FROM candidate_profiles')) {
    return [{ experience_years: 2.5, headline: 'Frontend dev', skills: ['react'] }];
  }
  if (query.includes('INSERT INTO interview_sessions')) {
    return [{
      id: SESSION_ID, status: 'in_progress', role_focus: 'Frontend Developer', difficulty: 'standard',
      question_count: 6, model: 'template', overall_score: null, verdict: '', summary: '',
      started_at: new Date().toISOString(), completed_at: null,
    }];
  }
  if (query.includes('INSERT INTO practice_upgrade_requests')) {
    return [{ id: UPREQ_ID, created_at: new Date().toISOString() }];
  }
  if (query.includes("SET status = 'abandoned'")) return [{ id: SESSION_ID }];
  if (query.includes('INSERT INTO interview_questions')) return [];
  if (query.includes('FROM interview_questions') && query.includes('session_id = $1 ORDER BY idx')) {
    return [{ id: QUESTION_ID, idx: 0, category: 'technical', topic: 'State management', question: 'Q?', answer: 'text', feedback: null, score: 70, answered_at: new Date().toISOString() }];
  }
  return [];
};

describe('AI practice routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockSqlUnsafe.mockReset();
    mockSqlUnsafe.mockImplementation(defaultImpl);
    mockRedisSet.mockReset();
    mockRedisSet.mockImplementation(async () => 'OK');
    const fastify = (require('fastify') as () => FastifyInstance)();
    const { practiceRoutes } = require('../src/routes/practice');
    fastify.register(practiceRoutes, { prefix: '/candidate/practice' });
    app = fastify;
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('subscription state reports the free plan with a monthly limit', async () => {
    const res = await app.inject({ method: 'GET', url: '/candidate/practice/subscription' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.subscription).toMatchObject({ plan: 'free', unlimited: false, monthly_limit: 3, used_this_month: 0, requested_upgrade: false });
  });

  test('upgrade-request creates a pending request once, then idempotent 202', async () => {
    let res = await app.inject({ method: 'POST', url: '/candidate/practice/upgrade-request', payload: { note: 'want pro' } });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).status).toBe('pending');

    mockSqlUnsafe.mockImplementation(async (query: string) => {
      if (query.includes('FROM practice_upgrade_requests') && query.includes('WHERE user_id')) {
        return [{ id: UPREQ_ID, status: 'pending' }];
      }
      if (query.includes('FROM practice_subscriptions')) return [];
      return defaultImpl(query);
    });
    res = await app.inject({ method: 'POST', url: '/candidate/practice/upgrade-request', payload: {} });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).request_id).toBe(UPREQ_ID);
  });

  test('POST /sessions is rejected once the monthly free quota is exhausted (402)', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string) => {
      if (query.includes('FROM practice_subscriptions')) return [];
      if (query.includes('COUNT(*)::int AS used')) return [{ used: 3 }];
      if (query.includes('FROM practice_upgrade_requests')) return [];
      return defaultImpl(query);
    });
    const res = await app.inject({ method: 'POST', url: '/candidate/practice/sessions', payload: {} });
    expect(res.statusCode).toBe(402);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('subscription_required');
    expect(body.subscription.unlimited).toBe(false);
  });

  test('POST /sessions creates a session with template questions and provider field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/candidate/practice/sessions',
      payload: { role_focus: 'Frontend Developer', difficulty: 'standard', question_count: 6 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.session).toMatchObject({ status: 'in_progress', role_focus: 'Frontend Developer', model: 'template', question_count: 6 });
    expect(body.session.overall_score).toBeNull();
  });

  test('GET /avatars recommends a data interviewer for an analytics job', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string) => {
      if (query.includes('FROM job_postings jp')) {
        return [{
          id: JOB_ID,
          title: 'Data Analyst',
          skills: ['SQL', 'Tableau', 'Experimentation'],
          description: 'Build dashboards and run A/B tests for the growth team.',
          about_job: '',
          company_name: 'Acme Analytics',
        }];
      }
      return defaultImpl(query);
    });

    const res = await app.inject({ method: 'GET', url: `/candidate/practice/avatars?job_id=${JOB_ID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.avatars).toHaveLength(6);
    expect(body.avatars[0]).toMatchObject({ id: 'aria', voice: { lang: 'en-IN' } });
    expect(body.recommended.avatar_id).toBe('neha');
    expect(body.recommended.reason).toMatch(/data analyst/i);
    expect(body.job).toMatchObject({ title: 'Data Analyst', company: 'Acme Analytics' });

    // An unrecognised role has no keyword evidence, so the generalist leads.
    const generic = await app.inject({ method: 'GET', url: '/candidate/practice/avatars?role_focus=Astronaut' });
    expect(generic.statusCode).toBe(200);
    expect(JSON.parse(generic.body).recommended.avatar_id).toBe('aria');
  });

  test('POST /sessions pins the chosen avatar and job to the session', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string, params?: any[]) => {
      if (query.includes('FROM job_postings jp')) {
        return [{
          id: JOB_ID,
          title: 'Data Analyst',
          skills: ['SQL', 'Tableau'],
          description: 'Dashboards and experiments.',
          about_job: '',
          company_name: 'Acme Analytics',
        }];
      }
      if (query.includes('INSERT INTO interview_sessions')) {
        return [{
          id: SESSION_ID,
          status: 'in_progress',
          role_focus: 'Data Analyst',
          difficulty: 'standard',
          question_count: 6,
          model: 'template',
          avatar_id: params?.[5],
          job_id: params?.[6],
          job_title: params?.[7],
          job_company: params?.[8],
          opening_line: params?.[9],
          overall_score: null,
          verdict: '',
          summary: '',
          started_at: new Date().toISOString(),
          completed_at: null,
        }];
      }
      return defaultImpl(query);
    });

    const res = await app.inject({
      method: 'POST',
      url: '/candidate/practice/sessions',
      payload: { job_id: JOB_ID, avatar_id: 'vikram', difficulty: 'standard', question_count: 6 },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.session.avatar).toMatchObject({ id: 'vikram', name: 'Vikram Rao' });
    expect(body.session.job).toMatchObject({ id: JOB_ID, title: 'Data Analyst', company: 'Acme Analytics' });
    expect(body.session.opening_line).toMatch(/Vikram Rao/);
    expect(body.session.opening_line).toMatch(/Data Analyst/);
  });

  test('POST /sessions/:id/answer grades a submission and returns feedback', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('FROM practice_subscriptions')) return [];
      if (query.includes('COUNT(*)::int AS used')) return [{ used: 0 }];
      if (query.includes('FROM practice_upgrade_requests')) return [];
      if (query.includes('FROM interview_sessions WHERE id = $1')) {
        return [{ id: SESSION_ID, user_id: 'cand-1', status: 'in_progress', difficulty: 'standard', role_focus: 'Frontend Developer' }];
      }
      if (query.includes('FROM interview_questions WHERE id = $1')) {
        return [{
          id: QUESTION_ID, idx: 0, category: 'technical', topic: 'State management', question: 'Q?', ideal_points: ['concrete numbers', 'structured approach'], feedback: null, score: null, answered_at: null,
        }];
      }
      if (query.includes('UPDATE interview_questions')) {
        return [{ id: QUESTION_ID, idx: 0, category: 'technical', topic: 'State management', question: 'Q?', answer: 'ans', feedback: { score: 62, strengths: [], improvements: [] }, score: 62, answered_at: new Date().toISOString() }];
      }
      return defaultImpl(query);
    });
    const res = await app.inject({
      method: 'POST',
      url: `/candidate/practice/sessions/${SESSION_ID}/answer`,
      payload: { question_id: QUESTION_ID, answer: 'I built a new interface and it shipped with measurable results.' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.grade.score).toBe('number');
    expect(body.grade.score).toBeGreaterThanOrEqual(0);
    expect(body.grade.score).toBeLessThanOrEqual(100);
    expect(body.question.answered_at).toBeTruthy();
  });

  test('answering the last queued question appends an adaptive follow-up question', async () => {
    const FOLLOWUP_ID = '55555555-5555-4555-8555-555555555555';
    mockSqlUnsafe.mockImplementation(async (query: string, params?: any[]): Promise<any> => {
      if (query.includes('FROM practice_subscriptions')) return [];
      if (query.includes('COUNT(*)::int AS used')) return [{ used: 0 }];
      if (query.includes('FROM practice_upgrade_requests')) return [];
      if (query.includes('FROM interview_sessions WHERE id = $1')) {
        return [{ id: SESSION_ID, user_id: 'cand-1', status: 'in_progress', difficulty: 'standard', role_focus: 'Frontend Developer', question_count: 6 }];
      }
      if (query.includes('FROM interview_questions WHERE id = $1')) {
        return [{ id: QUESTION_ID, idx: 5, category: 'project', topic: 'Trade-offs', question: 'Q?', ideal_points: ['x'], feedback: null, score: null, answered_at: null }];
      }
      if (query.includes('UPDATE interview_questions')) {
        return [{ id: QUESTION_ID, idx: 5, category: 'project', topic: 'Trade-offs', question: 'Q?', answer: 'ans', feedback: { score: 60, strengths: [], improvements: [] }, score: 60, answered_at: new Date().toISOString() }];
      }
      if (query.includes('COUNT(*)::int AS total')) return [{ total: 6, max_idx: 5 }];
      if (query.includes('ORDER BY idx DESC LIMIT 3')) return [{ question: 'Earlier q', answer: 'Earlier a' }];
      if (query.includes('INSERT INTO interview_questions')) {
        const idealPoints = Array.isArray(params?.[5]) ? (params as any)[5] : [];
        return [{ id: FOLLOWUP_ID, idx: 6, category: 'follow_up', topic: 'Metrics probe', question: 'That number carries the whole claim — how did you measure it, and what would make you doubt the result?', answer: '', feedback: null, score: null, answered_at: null, ideal_points: idealPoints }];
      }
      if (query.includes('UPDATE interview_sessions')) {
        return [{ id: SESSION_ID, question_count: 7 }];
      }
      return defaultImpl(query);
    });
    const res = await app.inject({
      method: 'POST',
      url: `/candidate/practice/sessions/${SESSION_ID}/answer`,
      payload: { question_id: QUESTION_ID, answer: 'I led a team of 4 and shipped with 30% fewer defects within 2 months.' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.follow_up).toBeTruthy();
    expect(body.follow_up.category).toBe('follow_up');
    expect(typeof body.follow_up.question).toBe('string');
    expect(body.follow_up.question.length).toBeGreaterThan(12);
    // The session length grows so progress and finalize semantics stay coherent.
    const lengthUpdate = mockSqlUnsafe.mock.calls.find(([q]: [string]) => q.includes('UPDATE interview_sessions SET question_count'));
    expect(lengthUpdate).toBeTruthy();
  });

  test('an intro answer queues the follow-up as the very next question', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string, params?: any[]): Promise<any> => {
      if (query.includes('FROM practice_subscriptions')) return [];
      if (query.includes('COUNT(*)::int AS used')) return [{ used: 0 }];
      if (query.includes('FROM practice_upgrade_requests')) return [];
      if (query.includes('FROM interview_sessions WHERE id = $1')) {
        return [{ id: SESSION_ID, user_id: 'cand-1', status: 'in_progress', difficulty: 'standard', role_focus: 'Frontend Developer', question_count: 6 }];
      }
      if (query.includes('FROM interview_questions WHERE id = $1')) {
        return [{ id: QUESTION_ID, idx: 0, category: 'intro', topic: 'Background', question: 'Tell me about yourself.', ideal_points: ['x'], feedback: null, score: null, answered_at: null }];
      }
      if (query.includes('SET idx = idx + 1')) return [];
      if (query.includes('UPDATE interview_questions') && query.includes('SET answer')) {
        return [{ id: QUESTION_ID, idx: 0, category: 'intro', topic: 'Background', question: 'Tell me about yourself.', answer: 'ans', feedback: { score: 65, strengths: [], improvements: [] }, score: 65, answered_at: new Date().toISOString() }];
      }
      if (query.includes('COUNT(*)::int AS total')) return [{ total: 6, max_idx: 5 }];
      if (query.includes('ORDER BY idx DESC LIMIT 3')) return [{ question: 'Tell me about yourself.', answer: 'I work with react and sql on analytics dashboards.' }];
      if (query.includes('INSERT INTO interview_questions')) {
        return [{ id: FOLLOW_UP_ID, idx: params?.[2] ?? 1, category: 'follow_up', topic: 'Tool deep-dive', question: 'You mentioned react — what was the hardest decision you made while working with it?', answer: '', feedback: null, score: null, answered_at: null }];
      }
      if (query.includes('UPDATE interview_sessions')) return [{ id: SESSION_ID, question_count: 7 }];
      return defaultImpl(query);
    });
    const res = await app.inject({
      method: 'POST',
      url: `/candidate/practice/sessions/${SESSION_ID}/answer`,
      payload: { question_id: QUESTION_ID, answer: 'I work with react and sql on analytics dashboards.' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.follow_up.category).toBe('follow_up');
    // Sits immediately after the intro, with the rest of the queue shifted back.
    const shift = mockSqlUnsafe.mock.calls.find(([q]: [string]) => q.includes('UPDATE interview_questions SET idx = idx + 1'));
    expect(shift).toBeTruthy();
    expect(shift[1]).toEqual([SESSION_ID, 1]);
    const insertCall = mockSqlUnsafe.mock.calls.find(([q]: [string]) => q.includes('INSERT INTO interview_questions'));
    expect(insertCall?.[1]?.[2]).toBe(1);
  });

  test('POST /sessions/:id/finish averages scores and returns per-category means', async () => {
    let res = await app.inject({ method: 'GET', url: '/candidate/practice/sessions/left' });
    expect(res.statusCode).toBe(400); // not a uuid

    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('FROM interview_questions') && query.includes("COALESCE(feedback, 'null'::jsonb)")) {
        return [
          { category: 'technical', question: 'q1', answer: 'a1', feedback: { score: 80 }, score: 80 },
          { category: 'technical', question: 'q2', answer: 'a2', feedback: { score: 60 }, score: 60 },
          { category: 'intro', question: 'q3', answer: 'a3', feedback: { score: 75 }, score: 75 },
        ];
      }
      if (query.includes("SET status = 'completed'")) {
        return [{ id: SESSION_ID, status: 'completed', overall_score: 72, verdict: 'Strong', summary: 'Done', started_at: new Date().toISOString(), completed_at: new Date().toISOString(), role_focus: 'Frontend Developer', difficulty: 'standard', question_count: 3, model: 'template' }];
      }
      if (query.includes('FROM interview_sessions WHERE id = $1')) {
        return [{ id: SESSION_ID, status: 'in_progress', difficulty: 'standard', role_focus: 'Frontend Developer' }];
      }
      return defaultImpl(query);
    });

    res = await app.inject({ method: 'POST', url: `/candidate/practice/sessions/${SESSION_ID}/finish`, payload: {} });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.session.status).toBe('completed');
    expect(body.session.overall_score).toBe(72); // (80+60+75)/3
    expect(body.by_category).toEqual({ technical: 70, intro: 75 });
  });

  test('DELETE /sessions/:id discards an in-progress session', async () => {
    let res = await app.inject({ method: 'DELETE', url: `/candidate/practice/sessions/${SESSION_ID}` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);

    mockSqlUnsafe.mockImplementation(async (query: string) => {
      if (query.includes("SET status = 'abandoned'")) return [];
      return defaultImpl(query);
    });
    res = await app.inject({ method: 'DELETE', url: `/candidate/practice/sessions/${SESSION_ID}` });
    expect(res.statusCode).toBe(404);
  });

  test('GET /learning returns unfinished plans with per-module progress', async () => {
    const res = await app.inject({ method: 'GET', url: '/candidate/practice/learning' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).track).toBeNull();

    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('jsonb_object_agg')) {
        return [{
          id: TRACK_ID, role_focus: 'Frontend Developer', model: 'template', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          payload: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
          done_map: { '0': true, '2': true },
        }];
      }
      return defaultImpl(query);
    });
    const res2 = await app.inject({ method: 'GET', url: '/candidate/practice/learning?role_focus=Frontend%20Developer' });
    expect(res2.statusCode).toBe(200);
    const body = JSON.parse(res2.body);
    expect(body.track.progress).toEqual({ done: 2, total: 3 });
    expect(body.track.modules[0].done).toBe(true);
    expect(body.track.modules[1].done).toBe(false);
  });

  test('POST /learning/:trackId/progress toggles a module and respects the index range', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('jsonb_array_length')) return [{ total: 3 }];
      if (query.includes('SELECT done FROM learning_module_progress')) return [];
      if (query.includes('INSERT INTO learning_module_progress')) return [];
      if (query.includes('COUNT(*)::int AS done')) return [{ done: 1 }];
      return defaultImpl(query);
    });
    const res = await app.inject({
      method: 'POST',
      url: `/candidate/practice/learning/${TRACK_ID}/progress`,
      payload: { module_index: 1 },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.done_state).toBe(true);
    expect(body.done).toBe(1);
    expect(body.total).toBe(3);

    const range = await app.inject({
      method: 'POST',
      url: `/candidate/practice/learning/${TRACK_ID}/progress`,
      payload: { module_index: 9 },
    });
    expect(range.statusCode).toBe(400);
  });

  test('POST /learning/refresh generates a template track for an unknown role', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string): Promise<any> => {
      if (query.includes('preferred_roles')) return [{ preferred_roles: ['Product Manager'] }];
      if (query.includes('SELECT id FROM learning_tracks')) return [];
      if (query.includes('INSERT INTO learning_tracks')) {
        return [{ id: TRACK_ID, role_focus: 'Product Manager', model: 'template', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
      }
      return defaultImpl(query);
    });
    const res = await app.inject({ method: 'POST', url: '/candidate/practice/learning/refresh', payload: { role_focus: 'Product Manager' } });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.track.model).toBe('template');
    expect(body.track.modules.length).toBeGreaterThan(0);
  });

  test('non-candidate accounts are refused', async () => {
    jest.requireMock('../src/middleware/auth').authenticate.mockImplementation(async (req: any) => {
      req.user = { id: 'admin-1', email: 'a@example.com', role: 'admin' };
    });
    const res = await app.inject({ method: 'GET', url: '/candidate/practice/subscription' });
    expect(res.statusCode).toBe(403);
  });
});
