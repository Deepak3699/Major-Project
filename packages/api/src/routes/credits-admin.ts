import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { authorize } from '../middleware/auth';
import { logAuditEvent } from '../utils/audit';
import {
  InsufficientCreditsError,
  adjustCredits,
  getCreditWallet,
  listAdminLedger,
  listAdminWallets,
} from '../utils/credits';

/**
 * Admin credit operations. Every balance change is ledgered and audited with
 * the acting administrator. There is no endpoint to edit or delete ledger rows.
 */

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const adjustSchema = z.object({
  user_id: z.string().uuid(),
  delta: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, 'delta must not be zero'),
  reason: z.string().trim().min(3).max(500),
  idempotency_key: z.string().trim().min(8).max(200).optional(),
});

const kinds = ['signup_grant', 'purchase', 'consumption', 'refund', 'admin_adjustment', 'expiry'] as const;

function currentUser(request: FastifyRequest) {
  return request.user as { id: string; role: string; email?: string };
}

export const creditsAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authorize(['admin']));

  fastify.get('/credits/wallets', async (request, reply) => {
    const querySchema = pageSchema.extend({ search: z.string().trim().max(200).default('') });
    const parsed = querySchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid wallet query', details: parsed.error.issues });
    }
    const result = await listAdminWallets(parsed.data.search ?? '', {
      limit: parsed.data.limit ?? 25,
      offset: parsed.data.offset ?? 0,
    });
    return {
      data: result.data,
      pagination: {
        limit: parsed.data.limit ?? 25,
        offset: parsed.data.offset ?? 0,
        total: result.total,
      },
    };
  });

  fastify.get('/credits/ledger', async (request, reply) => {
    const querySchema = pageSchema.extend({
      user_id: z.string().uuid().optional(),
      kind: z.enum(kinds).optional(),
    });
    const parsed = querySchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid ledger query', details: parsed.error.issues });
    }
    const result = await listAdminLedger(
      { userId: parsed.data.user_id, kind: parsed.data.kind },
      { limit: parsed.data.limit ?? 25, offset: parsed.data.offset ?? 0 },
    );
    return {
      data: result.data,
      pagination: {
        limit: parsed.data.limit ?? 25,
        offset: parsed.data.offset ?? 0,
        total: result.total,
      },
    };
  });

  fastify.get('/credits/wallet/:userId', async (request, reply) => {
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Invalid user id' });
    const rows = await getDB().unsafe('SELECT id, role FROM users WHERE id = $1', [params.data.userId]);
    const target = rows[0] as any;
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (!['candidate', 'user'].includes(String(target.role))) {
      return reply.status(400).send({ error: 'Credits belong to candidate accounts only.' });
    }
    const wallet = await getCreditWallet(params.data.userId);
    return { wallet };
  });

  fastify.post('/credits/adjust', async (request, reply) => {
    const parsed = adjustSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid credit adjustment', details: parsed.error.issues });
    }
    const { user_id, delta, reason, idempotency_key } = parsed.data;

    const users = await getDB().unsafe('SELECT id, role FROM users WHERE id = $1', [user_id]);
    const target = users[0] as any;
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (!['candidate', 'user'].includes(String(target.role))) {
      return reply.status(400).send({ error: 'Credits belong to candidate accounts only.' });
    }

    try {
      const result = await adjustCredits({
        userId: user_id,
        delta,
        reason,
        actorId: currentUser(request).id,
        idempotencyKey: idempotency_key,
      });
      await logAuditEvent({
        user_id: currentUser(request).id,
        action: 'admin.credit_adjustment',
        resource_type: 'credit_wallet',
        resource_id: user_id,
        details: {
          delta,
          reason,
          balance_after: result.balance,
          idempotency_key: idempotency_key || null,
          already_processed: result.already_processed,
        },
      });
      const wallet = await getCreditWallet(user_id);
      return { wallet, entry: result.entry, already_processed: result.already_processed };
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        return reply.status(402).send({
          error: err.message,
          code: err.code,
          balance: err.balance,
          required: err.required,
        });
      }
      throw err;
    }
  });
};

export default creditsAdminRoutes;
