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

jest.mock('../src/utils/redis', () => ({
  getRedis: () => mockRedis,
}));

jest.mock('../src/utils/audit', () => ({
  logAuditEvent: (...args: any[]) => mockAudit(...args),
}));

const mockSqlUnsafe = jest.fn();
const mockAudit = jest.fn().mockResolvedValue(undefined);

// Minimal stateful Redis LIST fake: the redrive path is only correct if real
// rpoplpush/lrange/llen semantics hold, which bare jest.fn() mocks cannot show.
const lists: Record<string, string[]> = {};
const seedList = (key: string, items: string[]) => { lists[key] = [...items]; };
const at = (arr: string[], idx: number) => (idx < 0 ? arr.length + idx : idx);
const redisImpl = {
  // Every accessor resolves the list by key at call time (never a captured
  // reference) so lset edits land in lists[k] even when the key is created
  // mid-request by rpoplpush.
  ensure: (k: string) => (lists[k] ||= []),
  llen: async (k: string) => (lists[k] || []).length,
  lrange: async (k: string, s: number, e: number) => {
    const arr = lists[k] || [];
    const stop = e < 0 ? arr.length + e + 1 : e + 1;
    return arr.slice(at(arr, s), stop);
  },
  // Verified against real redis:7-alpine — RPOPLPUSH takes the SOURCE TAIL
  // (the consumer end) and pushes it onto the DEST HEAD.
  rpoplpush: async (src: string, dst: string) => {
    const s = lists[src];
    if (!s || !s.length) return null;
    const item = s.pop()!;
    redisImpl.ensure(dst).unshift(item);
    return item;
  },
  // rpush appends to the tail (the end consumers take from).
  rpush: async (k: string, v: string) => Number(redisImpl.ensure(k).push(v)),
  // lpush prepends (matches Redis); returns new length.
  lpush: async (k: string, v: string) => Number(redisImpl.ensure(k).unshift(v)),
  // lset index 0 targets the head — where rpoplpush leaves the moved item.
  lset: async (k: string, idx: number, v: string) => {
    const arr = redisImpl.ensure(k);
    const i = at(arr, idx);
    if (i < 0 || i >= arr.length) throw new Error('ERR index out of range');
    arr[i] = v;
    return 'OK';
  },
  lrem: async (k: string, count: number, v: string) => {
    const arr = lists[k] || [];
    const i = count < 0 ? arr.lastIndexOf(v) : arr.indexOf(v);
    if (i === -1) return 0;
    arr.splice(i, 1);
    return 1;
  },
  del: (...keys: string[]) => {
    let n = 0;
    for (const k of keys) if (lists[k]) { delete lists[k]; n += 1; }
    return n;
  },
};
const mockRedis = {
  llen: jest.fn(redisImpl.llen),
  lrange: jest.fn(redisImpl.lrange),
  rpoplpush: jest.fn(redisImpl.rpoplpush),
  lpush: jest.fn(redisImpl.lpush),
  lset: jest.fn(redisImpl.lset),
  rpush: jest.fn(redisImpl.rpush),
  lrem: jest.fn(redisImpl.lrem),
  del: jest.fn(redisImpl.del),
};

describe('Admin integrity + DLQ ops (Track 3)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    mockSqlUnsafe.mockReset();
    mockAudit.mockClear();
    Object.keys(lists).forEach((k) => delete lists[k]);
    // mockReset() strips implementations, so reattach the stateful fake each time.
    Object.entries(mockRedis).forEach(([name, m]: [string, any]) => {
      m.mockReset().mockImplementation(async (...args: any[]) => {
        const r = await (redisImpl as any)[name](...args);
        console.log('FAKE', name, JSON.stringify(args), '=>', JSON.stringify(r), '| q=', JSON.stringify(lists['send_queue:requests']));
        return r;
      });
    });
    const fastify = (require('fastify') as () => FastifyInstance)();
    const { adminRoutes } = require('../src/routes/admin');
    fastify.register(adminRoutes, { prefix: '/admin' });
    app = fastify;
    await app.ready();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('GET /integrity reports stuck leads and per-queue depths', async () => {
    mockSqlUnsafe.mockImplementation(async (query: string) => {
      if (query.includes('FROM job_postings')) {
        return [{ job_url: 'https://boards.greenhouse.io/acmeco/jobs/1' }];
      }
      return [{ id: 'l1', pipeline_stage: 'verifying', updated_at: 'x' }];
    });
    mockRedis.llen.mockImplementation(async (k: string) => (k.endsWith(':dlq') ? 2 : 0));
    const res = await app.inject({ method: 'GET', url: '/admin/integrity' });    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.stuck_leads).toHaveLength(1);
    expect(body.queues['send_queue:requests'].dlq).toBe(2);
    expect(body.suggested_slugs.greenhouse).toEqual(['acmeco']);
    expect(mockSqlUnsafe).toHaveBeenCalledWith(expect.stringContaining('6 hours'));
  });

  test('GET /dlq/:queue rejects unknown queues', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/dlq/bogus' });
    expect(res.statusCode).toBe(400);
  });

  test('POST /dlq/:queue redrives into the queue with a fresh attempt budget', async () => {
    const q = 'send_queue:requests';
    seedList(`${q}:dlq`, [
      JSON.stringify({ lead_id: 'L1', _attempts: 5 }),
      JSON.stringify({ lead_id: 'L2', _attempts: 5 }),
    ]);
    const res = await app.inject({ method: 'POST', url: `/admin/dlq/${q}/redrive` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({ queue: q, redriven: 2 }),
    );
    // Real list state, not call spy: DLQ drained AND both jobs present once,
    // without the exhausted counter.
    expect(lists[`${q}:dlq`]).toHaveLength(0);
    expect(lists[q]).toHaveLength(2);
    for (const raw of lists[q]) {
      expect(raw).not.toContain('_attempts');
    }
    expect(lists[q].map((r) => JSON.parse(r).lead_id).sort()).toEqual(['L1', 'L2']);

    // Ordering matters: consumers take from the TAIL (LPUSH/BRPOP). A redrive
    // that leaves jobs at the head starves behind live traffic forever.
    seedList(q, [JSON.stringify({ lead_id: 'BACKLOG' })]);
    seedList(`${q}:dlq`, [JSON.stringify({ lead_id: 'L3', _attempts: 5 })]);
    const r3 = await app.inject({ method: 'POST', url: `/admin/dlq/${q}/redrive` });
    expect(JSON.parse(r3.body)).toEqual(expect.objectContaining({ redriven: 1 }));
    expect(lists[q].map((r) => JSON.parse(r).lead_id)).toEqual(['BACKLOG', 'L3']);
    // Simulated consumer takes the tail first — it must get the redriven job.
    expect(JSON.parse(lists[q].pop()!).lead_id).toBe('L3');

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dlq_redrive' }),
    );
  });

  test('DELETE /dlq/:queue purges and audits', async () => {
    const q = 'send_queue:requests';
    seedList(`${q}:dlq`, ['a', 'b', 'c']);
    const res = await app.inject({ method: 'DELETE', url: `/admin/dlq/${q}` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(
      expect.objectContaining({ purged: 3 }),
    );
    expect(lists[`${q}:dlq`]).toBeUndefined();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'dlq_purge' }),
    );
  });

  test('GET /metrics exposes Prometheus aggregates, no PII', async () => {    mockSqlUnsafe.mockImplementation(async (query: string) => {
      if (query.includes('GROUP BY pipeline_stage')) return [{ pipeline_stage: 'verified', n: '4' }];
      if (query.includes('GROUP BY score_band')) return [{ score_band: 'hot', n: '1' }];
      if (query.includes('stuck') || query.includes('6 hours')) return [{ n: '0' }];
      if (query.includes('FROM source_health')) return [];
      if (query.includes('verification_log')) return [];
      if (query.includes('outreach_log')) return [];
      if (query.includes('FROM suppressions')) return [{ n: '2' }];
      return [];
    });
    mockRedis.llen.mockResolvedValue(0);
    const res = await app.inject({ method: 'GET', url: '/admin/metrics' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('hiregen_leads_total{stage="verified"} 4');
    expect(res.body).toContain('hiregen_suppressions_total{} 2');
    expect(res.body).not.toMatch(/@|example\.com|\+91/);
  });

  test('GET /providers/status reports booleans, never secrets', async () => {
    mockSqlUnsafe.mockResolvedValue([{ api_keys: JSON.stringify({ contactout: 'ENCRYPTED-BLOB', resend: 'ENCRYPTED-BLOB' }) }]);
    const res = await app.inject({ method: 'GET', url: '/admin/providers/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enrichment.contactout).toBe(true);
    expect(body.enrichment.snovio).toBe(false);
    expect(body.sending.email).toBe(true);
    expect(typeof body.enrichment.contactout).toBe('boolean');
    expect(res.body).not.toContain('ENCRYPTED-BLOB');
  });

  test('GET /providers/status with no keys is all false', async () => {
    mockSqlUnsafe.mockResolvedValue([]);
    const OLD_ENV = process.env;
    process.env = { ...OLD_ENV };
    delete process.env.RESEND_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.CONTACT_OUT_API_KEY;
    delete process.env.SNOVIO_API_KEY;
    const res = await app.inject({ method: 'GET', url: '/admin/providers/status' });
    process.env = OLD_ENV;
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.enrichment.contactout).toBe(false);
    expect(body.ai.gemini).toBe(false);
  });
});
