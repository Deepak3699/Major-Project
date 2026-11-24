import { getDB } from './db';

/**
 * Candidate plans, wallet and credit ledger.
 *
 * The database is the source of truth. Every mutation:
 *  - runs inside a transaction when the driver supports it,
 *  - locks the wallet row,
 *  - writes a ledger row with the resulting balance.
 *
 * The signup grant is exactly 2 credits, once per user, protected by both the
 * `signup:<userId>` idempotency key and a partial unique index.
 */

export const FREE_PLAN_CODE = 'FREE';
export const SIGNUP_GRANT_CREDITS = 2;
export const SIGNUP_GRANT_REASON = 'Welcome grant — 2 initial preparation credits';

export type CreditKind =
  | 'signup_grant'
  | 'purchase'
  | 'consumption'
  | 'refund'
  | 'admin_adjustment'
  | 'expiry';

export interface SqlLike {
  unsafe: (query: string, params?: any[]) => Promise<any[]>;
  json?: (value: unknown) => any;
}

export interface CreditPlan {
  code: string;
  name: string;
  price_paise: number;
  currency: string;
  credits_included: number | null;
  features: unknown;
  status?: string;
  source?: string;
  started_at?: string | null;
  expires_at?: string | null;
}

export interface CreditWallet {
  user_id: string;
  balance: number;
  lifetime_granted: number;
  lifetime_used: number;
  signup_granted: boolean;
  plan: CreditPlan;
}

export interface CreditLedgerRow {
  id: string;
  user_id?: string;
  delta: number;
  balance_after: number;
  kind: CreditKind;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  idempotency_key?: string | null;
  created_at: string;
  actor_email?: string | null;
  user_email?: string | null;
}

export interface CreditMutation {
  balance: number;
  entry: CreditLedgerRow | null;
  already_processed: boolean;
}

export interface PageInput {
  limit: number;
  offset: number;
}

export class InsufficientCreditsError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS';
  readonly statusCode = 402;
  readonly balance: number;
  readonly required: number;

  constructor(balance: number, required: number) {
    super(`Not enough credits: balance ${balance}, required ${required}.`);
    this.name = 'InsufficientCreditsError';
    this.balance = balance;
    this.required = required;
  }
}

function integer(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
}

async function runInTransaction<T>(sql: any, fn: (tx: SqlLike) => Promise<T>): Promise<T> {
  if (typeof sql?.begin === 'function') {
    return sql.begin((tx: SqlLike) => fn(tx));
  }
  return fn(sql as SqlLike);
}

/**
 * Must be called inside a transaction. Creates the FREE subscription and wallet
 * if absent, then grants exactly 2 credits once.
 */
export async function provisionCandidateAccount(tx: SqlLike, userId: string): Promise<void> {
  await tx.unsafe(
    `INSERT INTO candidate_subscriptions (user_id, plan_code, status, source)
     VALUES ($1, 'FREE', 'active', 'signup')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  await tx.unsafe(
    `INSERT INTO credit_wallets (user_id, balance, lifetime_granted, lifetime_used)
     VALUES ($1, 0, 0, 0)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );

  const walletRows = await tx.unsafe(
    `SELECT balance FROM credit_wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  const wallet = walletRows[0];
  if (!wallet) throw new Error('Credit wallet could not be created.');

  const existingGrant = await tx.unsafe(
    `SELECT id FROM credit_ledger WHERE user_id = $1 AND kind = 'signup_grant' LIMIT 1`,
    [userId],
  );
  if (existingGrant.length > 0) return;

  const nextBalance = Number(wallet.balance) + SIGNUP_GRANT_CREDITS;
  await tx.unsafe(
    `UPDATE credit_wallets
        SET balance = $2,
            lifetime_granted = lifetime_granted + $3,
            updated_at = now()
      WHERE user_id = $1`,
    [userId, nextBalance, SIGNUP_GRANT_CREDITS],
  );
  await tx.unsafe(
    `INSERT INTO credit_ledger (user_id, delta, balance_after, kind, reason, idempotency_key)
     VALUES ($1, $2, $3, 'signup_grant', $4, $5)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [userId, SIGNUP_GRANT_CREDITS, nextBalance, SIGNUP_GRANT_REASON, `signup:${userId}`],
  );
}

/** Safe entry point for routes/services that are not already in a transaction. */
export async function initializeCandidateAccount(userId: string): Promise<void> {
  const sql = getDB() as any;
  await runInTransaction(sql, (tx) => provisionCandidateAccount(tx, userId));
}

async function loadWallet(sql: SqlLike, userId: string): Promise<CreditWallet | null> {
  const rows = await sql.unsafe(
    `SELECT w.user_id, w.balance, w.lifetime_granted, w.lifetime_used,
            s.plan_code, s.status, s.source, s.started_at, s.expires_at,
            p.name AS plan_name, p.price_paise, p.currency, p.credits_included, p.features,
            EXISTS(
              SELECT 1 FROM credit_ledger l
               WHERE l.user_id = w.user_id AND l.kind = 'signup_grant'
            ) AS signup_granted
       FROM credit_wallets w
       JOIN candidate_subscriptions s ON s.user_id = w.user_id
       LEFT JOIN plan_catalog p ON p.code = s.plan_code
      WHERE w.user_id = $1
      LIMIT 1`,
    [userId],
  );
  const row = rows[0] as any;
  if (!row) return null;
  return {
    user_id: row.user_id,
    balance: Number(row.balance),
    lifetime_granted: Number(row.lifetime_granted),
    lifetime_used: Number(row.lifetime_used),
    signup_granted: Boolean(row.signup_granted),
    plan: {
      code: String(row.plan_code || FREE_PLAN_CODE),
      name: String(row.plan_name || 'Free'),
      price_paise: Number(row.price_paise || 0),
      currency: String(row.currency || 'INR'),
      credits_included: row.credits_included == null ? null : Number(row.credits_included),
      features: row.features ?? [],
      status: row.status,
      source: row.source,
      started_at: row.started_at,
      expires_at: row.expires_at,
    },
  };
}

export async function getCreditWallet(userId: string): Promise<CreditWallet> {
  await initializeCandidateAccount(userId);
  const wallet = await loadWallet(getDB() as unknown as SqlLike, userId);
  if (!wallet) throw new Error('Credit wallet is unavailable.');
  return wallet;
}

export async function listPlans(): Promise<CreditPlan[]> {
  const rows = await getDB().unsafe(
    `SELECT code, name, price_paise, currency, credits_included, features
       FROM plan_catalog
      WHERE active = TRUE
      ORDER BY sort_order ASC, code ASC`,
  );
  return (rows as any[]).map((row) => ({
    code: String(row.code),
    name: String(row.name),
    price_paise: Number(row.price_paise || 0),
    currency: String(row.currency || 'INR'),
    credits_included: row.credits_included == null ? null : Number(row.credits_included),
    features: row.features ?? [],
  }));
}

export async function listCandidateLedger(userId: string, page: PageInput): Promise<{ data: CreditLedgerRow[]; total: number }> {
  await initializeCandidateAccount(userId);
  const sql = getDB() as unknown as SqlLike;
  const limit = Math.min(100, Math.max(1, integer(page.limit, 'limit')));
  const offset = Math.max(0, integer(page.offset, 'offset'));
  const countRows = await sql.unsafe(
    `SELECT COUNT(*)::int AS total FROM credit_ledger WHERE user_id = $1`,
    [userId],
  );
  const rows = await sql.unsafe(
    `SELECT id, user_id, delta, balance_after, kind, reason, ref_type, ref_id, idempotency_key, created_at
       FROM credit_ledger
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return { data: rows as CreditLedgerRow[], total: Number((countRows[0] as any)?.total || 0) };
}

async function existingMutation(tx: SqlLike, idempotencyKey: string | undefined, userId: string): Promise<CreditLedgerRow | null> {
  if (!idempotencyKey) return null;
  const rows = await tx.unsafe(
    `SELECT id, user_id, delta, balance_after, kind, reason, ref_type, ref_id, idempotency_key, created_at
       FROM credit_ledger
      WHERE idempotency_key = $1
      LIMIT 1`,
    [idempotencyKey],
  );
  const row = rows[0] as any;
  if (!row) return null;
  if (row.user_id && row.user_id !== userId) {
    throw new Error('This idempotency key belongs to another account.');
  }
  return row as CreditLedgerRow;
}

async function lockedBalance(tx: SqlLike, userId: string): Promise<number> {
  const rows = await tx.unsafe(
    `SELECT balance FROM credit_wallets WHERE user_id = $1 FOR UPDATE`,
    [userId],
  );
  if (!rows[0]) throw new Error('Credit wallet is unavailable.');
  return Number((rows[0] as any).balance);
}

export interface SpendInput {
  userId: string;
  amount: number;
  reason: string;
  refType?: string | null;
  refId?: string | null;
  idempotencyKey?: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function spendCredits(input: SpendInput): Promise<CreditMutation> {
  const amount = integer(input.amount, 'amount');
  if (amount <= 0) throw new Error('amount must be positive.');
  await initializeCandidateAccount(input.userId);
  const sql = getDB() as any;

  return runInTransaction(sql, async (tx) => {
    const duplicate = await existingMutation(tx, input.idempotencyKey, input.userId);
    if (duplicate) {
      return { balance: Number(duplicate.balance_after), entry: duplicate, already_processed: true };
    }
    const balance = await lockedBalance(tx, input.userId);
    // Re-check under the wallet lock: a concurrent request with the same key may
    // have committed while this transaction was waiting for the lock.
    const raced = await existingMutation(tx, input.idempotencyKey, input.userId);
    if (raced) {
      return { balance: Number(raced.balance_after), entry: raced, already_processed: true };
    }
    if (balance < amount) throw new InsufficientCreditsError(balance, amount);
    const next = balance - amount;
    await tx.unsafe(
      `UPDATE credit_wallets
          SET balance = $2, lifetime_used = lifetime_used + $3, updated_at = now()
        WHERE user_id = $1`,
      [input.userId, next, amount],
    );
    const rows = await tx.unsafe(
      `INSERT INTO credit_ledger
         (user_id, delta, balance_after, kind, reason, ref_type, ref_id, idempotency_key, actor_id, metadata)
       VALUES ($1, $2, $3, 'consumption', $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id, user_id, delta, balance_after, kind, reason, ref_type, ref_id, idempotency_key, created_at`,
      [
        input.userId, -amount, next, input.reason,
        input.refType || null, input.refId || null, input.idempotencyKey || null,
        input.actorId || null, tx.json ? tx.json(input.metadata || {}) : JSON.stringify(input.metadata || {}),
      ],
    );
    return { balance: next, entry: rows[0] as CreditLedgerRow, already_processed: false };
  });
}

export interface RefundInput {
  userId: string;
  amount: number;
  reason: string;
  refType?: string | null;
  refId?: string | null;
  idempotencyKey: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function refundCredits(input: RefundInput): Promise<CreditMutation> {
  const amount = integer(input.amount, 'amount');
  if (amount <= 0) throw new Error('amount must be positive.');
  await initializeCandidateAccount(input.userId);
  const sql = getDB() as any;

  return runInTransaction(sql, async (tx) => {
    const duplicate = await existingMutation(tx, input.idempotencyKey, input.userId);
    if (duplicate) {
      return { balance: Number(duplicate.balance_after), entry: duplicate, already_processed: true };
    }
    const balance = await lockedBalance(tx, input.userId);
    const raced = await existingMutation(tx, input.idempotencyKey, input.userId);
    if (raced) {
      return { balance: Number(raced.balance_after), entry: raced, already_processed: true };
    }
    const next = balance + amount;
    await tx.unsafe(
      `UPDATE credit_wallets
          SET balance = $2, updated_at = now()
        WHERE user_id = $1`,
      [input.userId, next],
    );
    const rows = await tx.unsafe(
      `INSERT INTO credit_ledger
         (user_id, delta, balance_after, kind, reason, ref_type, ref_id, idempotency_key, actor_id, metadata)
       VALUES ($1, $2, $3, 'refund', $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id, user_id, delta, balance_after, kind, reason, ref_type, ref_id, idempotency_key, created_at`,
      [
        input.userId, amount, next, input.reason,
        input.refType || null, input.refId || null, input.idempotencyKey,
        input.actorId || null, tx.json ? tx.json(input.metadata || {}) : JSON.stringify(input.metadata || {}),
      ],
    );
    return { balance: next, entry: rows[0] as CreditLedgerRow, already_processed: false };
  });
}

export interface AdjustInput {
  userId: string;
  delta: number;
  reason: string;
  actorId: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export async function adjustCredits(input: AdjustInput): Promise<CreditMutation> {
  const delta = integer(input.delta, 'delta');
  if (delta === 0) throw new Error('delta must not be zero.');
  await initializeCandidateAccount(input.userId);
  const sql = getDB() as any;

  return runInTransaction(sql, async (tx) => {
    const duplicate = await existingMutation(tx, input.idempotencyKey, input.userId);
    if (duplicate) {
      return { balance: Number(duplicate.balance_after), entry: duplicate, already_processed: true };
    }
    const balance = await lockedBalance(tx, input.userId);
    const raced = await existingMutation(tx, input.idempotencyKey, input.userId);
    if (raced) {
      return { balance: Number(raced.balance_after), entry: raced, already_processed: true };
    }
    const next = balance + delta;
    if (next < 0) throw new InsufficientCreditsError(balance, Math.abs(delta));
    await tx.unsafe(
      `UPDATE credit_wallets
          SET balance = $2,
              lifetime_granted = lifetime_granted + $3,
              updated_at = now()
        WHERE user_id = $1`,
      [input.userId, next, delta > 0 ? delta : 0],
    );
    const rows = await tx.unsafe(
      `INSERT INTO credit_ledger
         (user_id, delta, balance_after, kind, reason, idempotency_key, actor_id, metadata)
       VALUES ($1, $2, $3, 'admin_adjustment', $4, $5, $6, $7::jsonb)
       RETURNING id, user_id, delta, balance_after, kind, reason, ref_type, ref_id, idempotency_key, created_at`,
      [
        input.userId, delta, next, input.reason,
        input.idempotencyKey || null, input.actorId,
        tx.json ? tx.json(input.metadata || {}) : JSON.stringify(input.metadata || {}),
      ],
    );
    return { balance: next, entry: rows[0] as CreditLedgerRow, already_processed: false };
  });
}

export async function listAdminWallets(search: string, page: PageInput): Promise<{ data: any[]; total: number }> {
  const sql = getDB() as unknown as SqlLike;
  const limit = Math.min(100, Math.max(1, integer(page.limit, 'limit')));
  const offset = Math.max(0, integer(page.offset, 'offset'));
  const searchTerm = String(search || '').trim();
  const where = searchTerm
    ? `WHERE u.email ILIKE $1`
    : `WHERE TRUE`;
  const countParams = searchTerm ? [`%${searchTerm}%`] : [];
  const countRows = await sql.unsafe(
    `SELECT COUNT(*)::int AS total
       FROM credit_wallets w
       JOIN users u ON u.id = w.user_id
       ${where}`,
    countParams,
  );
  const params = searchTerm ? [`%${searchTerm}%`, limit, offset] : [limit, offset];
  const limitParam = searchTerm ? '$2' : '$1';
  const offsetParam = searchTerm ? '$3' : '$2';
  const rows = await sql.unsafe(
    `SELECT w.user_id, u.email, u.role, w.balance, w.lifetime_granted, w.lifetime_used, w.updated_at,
            s.plan_code, s.status AS plan_status, p.name AS plan_name,
            (SELECT MAX(l.created_at) FROM credit_ledger l WHERE l.user_id = w.user_id) AS last_activity_at
       FROM credit_wallets w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN candidate_subscriptions s ON s.user_id = w.user_id
       LEFT JOIN plan_catalog p ON p.code = s.plan_code
       ${where}
      ORDER BY w.updated_at DESC
      LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  );
  return { data: rows as any[], total: Number((countRows[0] as any)?.total || 0) };
}

export async function listAdminLedger(
  filters: { userId?: string; kind?: string },
  page: PageInput,
): Promise<{ data: CreditLedgerRow[]; total: number }> {
  const sql = getDB() as unknown as SqlLike;
  const limit = Math.min(100, Math.max(1, integer(page.limit, 'limit')));
  const offset = Math.max(0, integer(page.offset, 'offset'));
  const where: string[] = [];
  const params: any[] = [];
  if (filters.userId) {
    params.push(filters.userId);
    where.push(`l.user_id = $${params.length}`);
  }
  if (filters.kind) {
    params.push(filters.kind);
    where.push(`l.kind = $${params.length}`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countRows = await sql.unsafe(
    `SELECT COUNT(*)::int AS total FROM credit_ledger l ${clause}`,
    params,
  );
  const queryParams = [...params, limit, offset];
  const rows = await sql.unsafe(
    `SELECT l.id, l.user_id, u.email AS user_email, l.delta, l.balance_after, l.kind, l.reason,
            l.ref_type, l.ref_id, l.idempotency_key, l.created_at, l.actor_id,
            a.email AS actor_email
       FROM credit_ledger l
       JOIN users u ON u.id = l.user_id
       LEFT JOIN users a ON a.id = l.actor_id
       ${clause}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams,
  );
  return { data: rows as CreditLedgerRow[], total: Number((countRows[0] as any)?.total || 0) };
}
