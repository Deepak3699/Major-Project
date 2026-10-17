import { authenticate, authorize } from '../src/middleware/auth';

// A JWT is valid for 7 days, so it outlives the account it belongs to whenever a
// user is deleted or the database is re-seeded. Signature verification alone lets
// those requests reach the route handlers with an id that has no row in `users`,
// and each handler then answers its own way (404 on one endpoint, 500 on another)
// -- which the web client cannot recognise as "re-authenticate". These pin the
// middleware contract instead of mocking it away.

const mockVerify = jest.fn();
const mockUnsafe = jest.fn();
const mockRedisGet = jest.fn();

jest.mock('../src/utils/redis', () => ({ getRedis: () => ({ get: mockRedisGet }) }));
jest.mock('../src/utils/db', () => ({ getDB: () => ({ unsafe: mockUnsafe }) }));

const makeRequest = (payload: any) => {
  const req: any = {
    headers: { authorization: 'Bearer signed-token' },
    user: payload,
    jwtVerify: mockVerify,
  };
  return req;
};

const makeReply = () => {
  const reply: any = { code: null, body: null };
  reply.status = (n: number) => { reply.code = n; return reply; };
  reply.send = (b: any) => { reply.body = b; return reply; };
  return reply;
};

describe('authenticate / authorize', () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockUnsafe.mockReset();
    mockRedisGet.mockReset();
    mockRedisGet.mockResolvedValue(null);      // token not revoked
    mockVerify.mockImplementation(async function (this: any) { this.user = { id: 'u1', email: 'a@b.c', role: 'admin' }; });
  });

  test('accepts a token whose subject still exists', async () => {
    mockUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    const req = makeRequest(null); const reply = makeReply();
    await authenticate(req, reply);
    expect(reply.code).toBeNull();
    expect(mockVerify).toHaveBeenCalled();
  });

  test('rejects a structurally-valid token for a deleted user with 401', async () => {
    mockUnsafe.mockResolvedValue([]);           // no such row
    const req = makeRequest(null); const reply = makeReply();
    await authenticate(req, reply);
    expect(reply.code).toBe(401);
    expect(reply.body).toEqual({ error: 'Unauthorized' });
  });

  test('authorize() rejects a deleted user even though the signature is valid', async () => {
    mockUnsafe.mockResolvedValue([]);
    const req = makeRequest(null); const reply = makeReply();
    await authorize(['admin'])(req, reply);
    expect(reply.code).toBe(401);
  });

  test('authorize() still enforces roles for existing users', async () => {
    mockUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    mockVerify.mockImplementation(async function (this: any) { this.user = { id: 'u2', email: 'r@b.c', role: 'sales_rep' }; });
    const req = makeRequest(null); const reply = makeReply();
    await authorize(['admin'])(req, reply);
    expect(reply.code).toBe(403);
    expect(reply.body.error).toMatch(/insufficient permissions/);
  });

  test('revoked tokens are rejected without touching the database', async () => {
    mockRedisGet.mockResolvedValue('1');
    const req = makeRequest(null); const reply = makeReply();
    await authenticate(req, reply);
    expect(reply.code).toBe(401);
    expect(mockUnsafe).not.toHaveBeenCalled();
  });

  test('a failed signature check is 401, never a 500', async () => {
    mockVerify.mockRejectedValue(new Error('bad signature'));
    const req = makeRequest(null); const reply = makeReply();
    await expect(authenticate(req, reply)).resolves.toBeUndefined();
    expect(reply.code).toBe(401);
  });

  test('a database blip fails closed rather than letting the request through', async () => {
    mockUnsafe.mockRejectedValue(new Error('connection reset'));
    const req = makeRequest(null); const reply = makeReply();
    await authenticate(req, reply);
    expect(reply.code).toBe(401);
  });
});
