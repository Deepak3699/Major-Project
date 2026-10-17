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

jest.mock('../src/utils/audit', () => ({
  logAuditEvent: (...args: any[]) => mockAudit(...args),
}));

const mockSqlUnsafe = jest.fn();
const mockAudit = jest.fn().mockResolvedValue(undefined);

// Scenario 20: admin-visible audit trail for contact correction/deletion.
describe('Contacts API - mutations write audit events (scenario 20)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockSqlUnsafe.mockReset();
    mockAudit.mockClear();
    const fastify = (require('fastify') as () => FastifyInstance)();
    const { contactsRoutes } = require('../src/routes/contacts');
    fastify.register(contactsRoutes, { prefix: '/contacts' });
    app = fastify;
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('PATCH /:id logs correct_contact with the changed fields', async () => {
    mockSqlUnsafe.mockResolvedValue([{ id: 'c1', full_name: 'Fixed Name' }]);
    const response = await app.inject({
      method: 'PATCH',
      url: '/contacts/550e8400-e29b-41d4-a716-446655440000',
      payload: { full_name: 'Fixed Name' },
    });
    expect(response.statusCode).toBe(200);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'correct_contact', resource_type: 'hr_contact' }),
    );
  });

  test('DELETE /:id logs delete_contact', async () => {
    mockSqlUnsafe.mockResolvedValue([{ id: 'c1' }]);
    const response = await app.inject({
      method: 'DELETE',
      url: '/contacts/550e8400-e29b-41d4-a716-446655440000',
    });
    expect(response.statusCode).toBe(200);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete_contact', resource_type: 'hr_contact' }),
    );
  });
});
