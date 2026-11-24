import { FastifyInstance } from 'fastify';

// Candidate credits: wallet, ledger, signup grant and admin adjustments.
//
// The DB is an in-memory fake that understands only the SQL shapes used by
// src/utils/credits.ts. That keeps the real transaction/locking logic and the
// real route handlers under test without a live PostgreSQL.

const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CANDIDATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

jest.mock('../src/utils/db', () => ({ getDB: () => mockSql }));

jest.mock('../src/utils/audit', () => ({ logAuditEvent: jest.fn(async () => undefined) }));

import { logAuditEvent } from '../src/utils/audit';

interface WalletRow {
  user_id: string;
  balance: number;
  lifetime_granted: number;
  lifetime_used: number;
  updated_at: string;
}

interface LedgerRow {
  id: string;
  user_id: string;
  delta: number;
  balance_after: number;
  kind: string;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  idempotency_key: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface State {
  users: Array<{ id: string; email: string; password_hash: string; role: string }>;
  subscriptions: Map<string, any>;
  wallets: Map<string, WalletRow>;
  ledger: LedgerRow[];
  seq: number;
}

const NOW = () => new Date().toISOString();

const PLANS = [
  { code: 'FREE', name: 'Free', price_paise: 0, currency: 'INR', credits_included: 2, features: ['Discover jobs'], active: true, sort_order: 0 },
  { code: 'CLASSIC', name: 'Classic', price_paise: 19900, currency: 'INR', credits_included: null, features: [], active: true, sort_order: 1 },
  { code: 'CLASSIC_PLUS', name: 'Classic Plus', price_paise: 49900, currency: 'INR', credits_included: null, features: [], active: true, sort_order: 2 },
  { code: 'BRO', name: 'BRO', price_paise: 79900, currency: 'INR', credits_included: null, features: [], active: true, sort_order: 3 },
];

let state: State;
let mockSql: any;

function createState(): State {
  return {
    users: [
      { id: ADMIN_ID, email: 'admin@example.com', password_hash: '$2a$10$fake', role: 'admin' },
      { id: CANDIDATE_ID, email: 'cand@example.com', password_hash: 'not-used', role: 'user' },
      { id: OTHER_ID, email: 'other@example.com', password_hash: 'not-used', role: 'user' },
    ],
    subscriptions: new Map(),
    wallets: new Map(),
    ledger: [],
    seq: 1,
  };
}

function nextId(prefix: string): string {
  state.seq += 1;
  return `${prefix}-${String(state.seq).padStart(8, '0')}`;
}

function ledgerEntry(overrides: Partial<LedgerRow>): LedgerRow {
  return {
    id: nextId('ledger'),
    user_id: '',
    delta: 0,
    balance_after: 0,
    kind: '',
    reason: '',
    ref_type: null,
    ref_id: null,
    idempotency_key: null,
    actor_id: null,
    metadata: {},
    created_at: NOW(),
    ...overrides,
  };
}

function ledgerPage(userId: string | null, kind: string | null, limit: number, offset: number) {
  const rows = state.ledger
    .filter((row) => (userId ? row.user_id === userId : true))
    .filter((row) => (kind ? row.kind === kind : true))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(offset, offset + limit);
  return rows.map((row) => ({
    ...row,
    user_email: state.users.find((u) => u.id === row.user_id)?.email ?? null,
    actor_email: row.actor_id ? state.users.find((u) => u.id === row.actor_id)?.email ?? null : null,
  }));
}

function walletRowFor(userId: string) {
  const wallet = state.wallets.get(userId)!;
  const sub = state.subscriptions.get(userId) || {};
  const plan = PLANS.find((p) => p.code === (sub.plan_code || 'FREE'))!;
  return {
    user_id: wallet.user_id,
    balance: wallet.balance,
    lifetime_granted: wallet.lifetime_granted,
    lifetime_used: wallet.lifetime_used,
    plan_code: plan.code,
    status: sub.status || 'active',
    source: sub.source || 'system',
    started_at: sub.started_at || null,
    expires_at: sub.expires_at || null,
    plan_name: plan.name,
    price_paise: plan.price_paise,
    currency: plan.currency,
    credits_included: plan.credits_included,
    features: plan.features,
    signup_granted: state.ledger.some((row) => row.user_id === userId && row.kind === 'signup_grant'),
  };
}

async function unsafe(query: string, params: any[] = []): Promise<any[]> {
  // Users ---------------------------------------------------------------
  if (query.includes('INSERT INTO users')) {
    const [email, passwordHash] = params;
    const role = query.includes("'admin'") ? 'admin' : 'user';
    if (state.users.some((u) => u.email === email)) return [];
    const user = { id: nextId('user'), email, password_hash: passwordHash, role };
    state.users.push(user);
    return [{ id: user.id, email: user.email, role: user.role }];
  }
  if (query.includes('FROM users WHERE email = $1')) {
    return state.users.filter((u) => u.email === params[0]).map((u) => ({ id: u.id, email: u.email, password_hash: u.password_hash, role: u.role }));
  }
  if (query.includes('SELECT id, role FROM users WHERE id = $1') || query.includes('SELECT id FROM users WHERE id = $1')) {
    return state.users.filter((u) => u.id === params[0]).map((u) => ({ id: u.id, role: u.role }));
  }

  // Subscriptions --------------------------------------------------------
  if (query.includes('INSERT INTO candidate_subscriptions')) {
    if (!state.subscriptions.has(params[0])) {
      state.subscriptions.set(params[0], {
        plan_code: 'FREE', status: 'active', source: 'signup',
        started_at: NOW(), expires_at: null,
      });
    }
    return [];
  }

  // Wallets --------------------------------------------------------------
  if (query.includes('INSERT INTO credit_wallets')) {
    if (!state.wallets.has(params[0])) {
      state.wallets.set(params[0], {
        user_id: params[0], balance: 0, lifetime_granted: 0, lifetime_used: 0, updated_at: NOW(),
      });
    }
    return [];
  }
  if (query.includes('SELECT balance FROM credit_wallets WHERE user_id = $1')) {
    const wallet = state.wallets.get(params[0]);
    return wallet ? [{ balance: wallet.balance }] : [];
  }
  if (query.includes('UPDATE credit_wallets') && query.includes('lifetime_used = lifetime_used +')) {
    const wallet = state.wallets.get(params[0])!;
    wallet.balance = Number(params[1]);
    wallet.lifetime_used += Number(params[2]);
    wallet.updated_at = NOW();
    return [];
  }
  if (query.includes('UPDATE credit_wallets') && query.includes('lifetime_granted = lifetime_granted +')) {
    const wallet = state.wallets.get(params[0])!;
    wallet.balance = Number(params[1]);
    wallet.lifetime_granted += Number(params[2]);
    wallet.updated_at = NOW();
    return [];
  }
  if (query.includes('UPDATE credit_wallets') && query.includes('SET balance = $2')) {
    const wallet = state.wallets.get(params[0])!;
    wallet.balance = Number(params[1]);
    wallet.updated_at = NOW();
    return [];
  }
  if (query.includes('FROM credit_wallets w') && query.includes('signup_granted')) {
    const wallet = state.wallets.get(params[0]);
    return wallet ? [walletRowFor(params[0])] : [];
  }

  // Ledger ---------------------------------------------------------------
  if (query.includes('FROM credit_ledger WHERE user_id = $1 AND kind = \'signup_grant\'')) {
    return state.ledger.filter((row) => row.user_id === params[0] && row.kind === 'signup_grant').map((row) => ({ id: row.id }));
  }
  if (query.includes('FROM credit_ledger') && query.includes('WHERE idempotency_key = $1')) {
    return state.ledger.filter((row) => row.idempotency_key === params[0]).slice(0, 1);
  }
  if (query.includes('COUNT(*)::int AS total FROM credit_ledger WHERE user_id = $1')) {
    return [{ total: state.ledger.filter((row) => row.user_id === params[0]).length }];
  }
  if (query.includes('COUNT(*)::int AS total FROM credit_ledger l')) {
    const userId = query.includes('l.user_id = $1') ? params[0] : null;
    const kind = query.includes('l.kind = $') ? params[query.includes('l.user_id = $1') ? 1 : 0] : null;
    return [{ total: state.ledger.filter((row) => (userId ? row.user_id === userId : true)).filter((row) => (kind ? row.kind === kind : true)).length }];
  }
  if (query.includes('INSERT INTO credit_ledger')) {
    const [userId, delta, balanceAfter, reason] = params;
    let entry: LedgerRow;
    if (query.includes("'consumption'")) {
      entry = ledgerEntry({
        user_id: userId, delta: Number(delta), balance_after: Number(balanceAfter),
        kind: 'consumption', reason, ref_type: params[4] ?? null, ref_id: params[5] ?? null,
        idempotency_key: params[6] ?? null, actor_id: params[7] ?? null,
        metadata: JSON.parse(params[8] || '{}'),
      });
    } else if (query.includes("'refund'")) {
      entry = ledgerEntry({
        user_id: userId, delta: Number(delta), balance_after: Number(balanceAfter),
        kind: 'refund', reason, ref_type: params[4] ?? null, ref_id: params[5] ?? null,
        idempotency_key: params[6] ?? null, actor_id: params[7] ?? null,
        metadata: JSON.parse(params[8] || '{}'),
      });
    } else if (query.includes("'admin_adjustment'")) {
      entry = ledgerEntry({
        user_id: userId, delta: Number(delta), balance_after: Number(balanceAfter),
        kind: 'admin_adjustment', reason, idempotency_key: params[4] ?? null,
        actor_id: params[5] ?? null, metadata: JSON.parse(params[6] || '{}'),
      });
    } else {
      entry = ledgerEntry({
        user_id: userId, delta: Number(delta), balance_after: Number(balanceAfter),
        kind: 'signup_grant', reason, idempotency_key: params[4] ?? null,
      });
    }
    if (entry.idempotency_key && state.ledger.some((row) => row.idempotency_key === entry.idempotency_key)) {
      return [];
    }
    state.ledger.push(entry);
    return query.includes('RETURNING')
      ? [{ ...entry }]
      : [];
  }
  if (query.includes('FROM credit_ledger') && query.includes('WHERE user_id = $1') && !query.includes('FROM credit_wallets')) {
    const [userId, limit, offset] = params;
    return ledgerPage(userId, null, Number(limit), Number(offset));
  }
  if (query.includes('FROM credit_ledger l') && !query.includes('FROM credit_wallets')) {
    const hasUser = query.includes('l.user_id = $1');
    const hasKind = query.includes('l.kind = $');
    const userId = hasUser ? params[0] : null;
    const kind = hasKind ? params[hasUser ? (query.includes('l.kind = $2') ? 1 : 0) : 0] : null;
    const limit = params[params.length - 2];
    const offset = params[params.length - 1];
    return ledgerPage(userId, kind, Number(limit), Number(offset)).map((row) => ({
      ...row,
      actor_email: row.actor_id ? state.users.find((u) => u.id === row.actor_id)?.email ?? null : null,
    }));
  }

  // Admin wallet list ----------------------------------------------------
  if (query.includes('COUNT(*)::int AS total') && query.includes('FROM credit_wallets w')) {
    const term = query.includes('ILIKE $1') ? String(params[0]).replace(/%/g, '').toLowerCase() : '';
    const count = [...state.wallets.keys()].filter((id) => {
      const email = state.users.find((u) => u.id === id)?.email || '';
      return term ? email.toLowerCase().includes(term) : true;
    }).length;
    return [{ total: count }];
  }
  if (query.includes('FROM credit_wallets w') && query.includes('LEFT JOIN candidate_subscriptions')) {
    const term = query.includes('ILIKE $1') ? String(params[0]).replace(/%/g, '').toLowerCase() : '';
    const limit = Number(params[params.length - 2]);
    const offset = Number(params[params.length - 1]);
    return [...state.wallets.keys()]
      .filter((id) => {
        const email = state.users.find((u) => u.id === id)?.email || '';
        return term ? email.toLowerCase().includes(term) : true;
      })
      .slice(offset, offset + limit)
      .map((id) => {
        const wallet = state.wallets.get(id)!;
        const sub = state.subscriptions.get(id);
        const plan = PLANS.find((p) => p.code === (sub?.plan_code || 'FREE'));
        return {
          user_id: id,
          email: state.users.find((u) => u.id === id)?.email,
          role: state.users.find((u) => u.id === id)?.role,
          balance: wallet.balance,
          lifetime_granted: wallet.lifetime_granted,
          lifetime_used: wallet.lifetime_used,
          updated_at: wallet.updated_at,
          plan_code: sub?.plan_code || null,
          plan_status: sub?.status || null,
          plan_name: plan?.name || null,
          last_activity_at: state.ledger.filter((row) => row.user_id === id).at(-1)?.created_at || null,
        };
      });
  }

  // Plan catalog ---------------------------------------------------------
  if (query.includes('FROM plan_catalog')) {
    return PLANS.filter((plan) => plan.active).sort((a, b) => a.sort_order - b.sort_order);
  }

  return [];
}

function makeSql() {
  return {
    unsafe,
    begin: async (fn: (tx: any) => Promise<any>) => fn({ unsafe }),
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const fastify = (require('fastify') as () => FastifyInstance)();
  const { creditsRoutes } = require('../src/routes/credits');
  const { creditsAdminRoutes } = require('../src/routes/credits-admin');
  const { authRoutes } = require('../src/routes/auth');
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(creditsRoutes, { prefix: '/candidate' });
  await fastify.register(creditsAdminRoutes, { prefix: '/admin' });
  await fastify.ready();
  return fastify;
}

describe('candidate credits', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    state = createState();
    mockSql = makeSql();
    mockRole = 'user';
    (logAuditEvent as jest.Mock).mockClear();
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
  });

  test('registration creates a USER, FREE plan, wallet and exactly two credits', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'new@example.com', password: 'long-enough-password' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ security_role: 'USER', plan: 'FREE', initial_credits: 2 });
    expect(body.user.role).toBe('user');

    const user = state.users.find((u) => u.email === 'new@example.com')!;
    expect(user.role).toBe('user');
    expect(state.wallets.get(user.id)?.balance).toBe(2);
    expect(state.ledger.filter((row) => row.user_id === user.id && row.kind === 'signup_grant')).toHaveLength(1);
  });

  test('the signup grant is idempotent: provisioning again adds nothing', async () => {
    const { initializeCandidateAccount } = require('../src/utils/credits');
    await initializeCandidateAccount(CANDIDATE_ID);
    await initializeCandidateAccount(CANDIDATE_ID);
    await initializeCandidateAccount(CANDIDATE_ID);

    expect(state.wallets.get(CANDIDATE_ID)?.balance).toBe(2);
    expect(state.ledger.filter((row) => row.kind === 'signup_grant')).toHaveLength(1);
    expect(state.subscriptions.get(CANDIDATE_ID)?.plan_code).toBe('FREE');
  });

  test('GET /candidate/credits returns the wallet, plans and an honest billing state', async () => {
    const res = await app.inject({ method: 'GET', url: '/candidate/credits' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.wallet).toMatchObject({ balance: 2, lifetime_granted: 2, lifetime_used: 0, signup_granted: true });
    expect(body.plan).toMatchObject({ code: 'FREE', price_paise: 0 });
    expect(body.plans.map((p: any) => p.code)).toEqual(['FREE', 'CLASSIC', 'CLASSIC_PLUS', 'BRO']);
    expect(body.plans.find((p: any) => p.code === 'BRO').price_paise).toBe(79900);
    expect(body.plans.find((p: any) => p.code === 'CLASSIC').credits_included).toBeNull();
    expect(body.payments.enabled).toBe(false);
  });

  test('GET ledger shows the welcome grant and paginates', async () => {
    await app.inject({ method: 'GET', url: '/candidate/credits' });
    const res = await app.inject({ method: 'GET', url: '/candidate/credits/ledger?limit=10&offset=0' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pagination.total).toBe(1);
    expect(body.data[0]).toMatchObject({ kind: 'signup_grant', delta: 2, balance_after: 2 });
  });

  test('purchase is refused with an explicit not-configured error', async () => {
    const res = await app.inject({ method: 'POST', url: '/candidate/credits/purchase', payload: {} });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe('PAYMENTS_NOT_CONFIGURED');
  });

  test('spending never goes negative and every spend is ledgered', async () => {
    const { spendCredits, InsufficientCreditsError } = require('../src/utils/credits');
    await spendCredits({ userId: CANDIDATE_ID, amount: 1, reason: 'Practice session' });
    await spendCredits({ userId: CANDIDATE_ID, amount: 1, reason: 'Practice session' });
    expect(state.wallets.get(CANDIDATE_ID)?.balance).toBe(0);
    expect(state.wallets.get(CANDIDATE_ID)?.lifetime_used).toBe(2);

    await expect(
      spendCredits({ userId: CANDIDATE_ID, amount: 1, reason: 'One too many' }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(state.wallets.get(CANDIDATE_ID)?.balance).toBe(0);
    expect(state.ledger.filter((row) => row.kind === 'consumption')).toHaveLength(2);
  });

  test('a repeated idempotency key does not double-charge', async () => {
    const { spendCredits } = require('../src/utils/credits');
    const first = await spendCredits({
      userId: CANDIDATE_ID, amount: 1, reason: 'Resume export', idempotencyKey: 'resume-export-1',
    });
    const second = await spendCredits({
      userId: CANDIDATE_ID, amount: 1, reason: 'Resume export', idempotencyKey: 'resume-export-1',
    });
    expect(first.already_processed).toBe(false);
    expect(second.already_processed).toBe(true);
    expect(state.wallets.get(CANDIDATE_ID)?.balance).toBe(1);
    expect(state.ledger.filter((row) => row.kind === 'consumption')).toHaveLength(1);
  });

  test('refunds are idempotent and restore the balance once', async () => {
    const { spendCredits, refundCredits } = require('../src/utils/credits');
    await spendCredits({ userId: CANDIDATE_ID, amount: 2, reason: 'Session', idempotencyKey: 'spend-1' });
    await refundCredits({
      userId: CANDIDATE_ID, amount: 2, reason: 'Session failed', idempotencyKey: 'refund-1',
    });
    await refundCredits({
      userId: CANDIDATE_ID, amount: 2, reason: 'Session failed', idempotencyKey: 'refund-1',
    });
    expect(state.wallets.get(CANDIDATE_ID)?.balance).toBe(2);
    expect(state.ledger.filter((row) => row.kind === 'refund')).toHaveLength(1);
  });

  test('admin adjustment updates the wallet, writes a ledger row and audits it', async () => {
    mockRole = 'admin';
    const res = await app.inject({
      method: 'POST',
      url: '/admin/credits/adjust',
      payload: { user_id: OTHER_ID, delta: 3, reason: 'Support goodwill', idempotency_key: 'adj-support-1' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // The target is a legacy account with no wallet yet, so the audit path
    // provisions the FREE account and its 2-credit grant first.
    expect(body.wallet.balance).toBe(5);
    expect(body.already_processed).toBe(false);
    expect(state.ledger.filter((row) => row.user_id === OTHER_ID && row.kind === 'admin_adjustment')).toHaveLength(1);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'admin.credit_adjustment',
      resource_id: OTHER_ID,
      details: expect.objectContaining({ delta: 3, reason: 'Support goodwill' }),
    }));
  });

  test('admin adjustment cannot take a wallet below zero', async () => {
    mockRole = 'admin';
    const res = await app.inject({
      method: 'POST',
      url: '/admin/credits/adjust',
      payload: { user_id: CANDIDATE_ID, delta: -5, reason: 'Too large a deduction' },
    });
    expect(res.statusCode).toBe(402);
    expect(JSON.parse(res.body).code).toBe('INSUFFICIENT_CREDITS');
    expect(state.wallets.get(CANDIDATE_ID)?.balance).toBe(2);
  });

  test('admin wallet search and ledger views expose candidate credit state', async () => {
    await app.inject({ method: 'GET', url: '/candidate/credits' });
    mockRole = 'admin';
    const wallets = await app.inject({ method: 'GET', url: '/admin/credits/wallets?search=cand' });
    expect(wallets.statusCode).toBe(200);
    const walletsBody = JSON.parse(wallets.body);
    expect(walletsBody.pagination.total).toBe(1);
    expect(walletsBody.data[0]).toMatchObject({ email: 'cand@example.com', balance: 2, plan_code: 'FREE' });

    const ledger = await app.inject({ method: 'GET', url: `/admin/credits/ledger?user_id=${CANDIDATE_ID}&kind=signup_grant` });
    expect(ledger.statusCode).toBe(200);
    expect(JSON.parse(ledger.body).data[0]).toMatchObject({ kind: 'signup_grant', user_email: 'cand@example.com' });
  });

  test('a candidate cannot reach admin credit routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/credits/wallets' });
    expect(res.statusCode).toBe(403);
  });

  test('an admin cannot use the candidate credit routes', async () => {
    mockRole = 'admin';
    const res = await app.inject({ method: 'GET', url: '/candidate/credits' });
    expect(res.statusCode).toBe(403);
  });
});
