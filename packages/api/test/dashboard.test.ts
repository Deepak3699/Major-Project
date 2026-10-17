import { FastifyInstance } from 'fastify';

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

const mockSqlUnsafe = jest.fn();

describe('Dashboard stats series', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockSqlUnsafe.mockReset();
    mockSqlUnsafe.mockImplementation(async (query: string) => {
      if (query.includes('GROUP BY pipeline_stage')) return [{ pipeline_stage: 'verified', count: '3' }];
      if (query.includes('score_band')) return [];
      if (query.includes('FROM source_health')) return [];
      if (query.includes('FROM scrape_runs')) return [];
      if (query.includes('enrichment_log')) return [];
      if (query.includes('do_not_contact')) return [{ total: '0' }];
      if (query.includes("to_char(created_at, 'YYYY-MM-DD')")) {
        return [{ day: '2026-09-13', discovered: '5' }, { day: '2026-09-14', discovered: '7' }];
      }
      if (query.includes('FROM verification_log')) {
        return [{ channel: 'email', result: 'valid', count: '4' }];
      }
      if (query.includes('FROM outreach_log')) {
        return [{ channel: 'email', delivery_status: 'sent', count: '2' }];
      }
      if (query.includes('INTERVAL \'24 hours\'')) return [{ total: '7' }];
      if (query.includes('COUNT(*) as total')) return [{ total: '3' }];
      return [];
    });
    const fastify = (require('fastify') as () => FastifyInstance)();
    const { dashboardRoutes } = require('../src/routes/dashboard');
    fastify.register(dashboardRoutes, { prefix: '/dashboard' });
    app = fastify;
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('GET /stats includes trend, outcome series and 24h delta', async () => {
    const res = await app.inject({ method: 'GET', url: '/dashboard/stats' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totals.new_24h).toBe(7);
    expect(body.trend_14d).toEqual([
      { day: '2026-09-13', discovered: '5' },
      { day: '2026-09-14', discovered: '7' },
    ]);
    expect(body.verification_7d).toEqual([{ channel: 'email', result: 'valid', count: '4' }]);
    expect(body.outreach_7d).toEqual([{ channel: 'email', delivery_status: 'sent', count: '2' }]);
  });
});
