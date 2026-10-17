import { FastifyInstance } from 'fastify';

// Scenario 19: no auth bypass — REAL middleware, no mocks for auth.
// Unauthenticated calls must 401 before touching the database.
describe('Leads API - unauthenticated access is rejected (scenario 19)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const fastify = (require('fastify') as () => FastifyInstance)();
    const { leadsRoutes } = require('../src/routes/leads');
    fastify.register(leadsRoutes, { prefix: '/leads' });
    app = fastify;
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('GET /:id/timeline without a token returns 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/leads/550e8400-e29b-41d4-a716-446655440000/timeline',
    });
    expect(response.statusCode).toBe(401);
  });

  test('POST /:id/send without a token returns 401', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/leads/550e8400-e29b-41d4-a716-446655440000/send',
      payload: { channel: 'email' },
    });
    expect(response.statusCode).toBe(401);
  });
});
