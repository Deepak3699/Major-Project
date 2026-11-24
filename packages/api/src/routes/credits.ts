import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authorize } from '../middleware/auth';
import {
  FREE_PLAN_CODE,
  SIGNUP_GRANT_CREDITS,
  getCreditWallet,
  listCandidateLedger,
  listPlans,
} from '../utils/credits';

/**
 * Candidate-facing plans and credits.
 *
 * Payment activation is deliberately absent: no provider is configured in this
 * repository. The purchase endpoint returns an honest 503 instead of faking a
 * success state, and the catalog surfaces that reason to the UI.
 */

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

function currentUser(request: any) {
  return request.user as { id: string; role: string; email?: string };
}

function paymentState() {
  const provider = String(process.env.PAYMENT_PROVIDER || '').trim();
  return {
    enabled: false,
    provider: provider || null,
    reason: provider
      ? 'A payment provider name is configured, but checkout and webhook verification are not implemented yet. Purchase stays disabled.'
      : 'No payment provider is configured. Plans can be reviewed, but purchase stays disabled until an administrator configures billing.',
  };
}

export const creditsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authorize(['candidate', 'user']));

  fastify.get('/plans', async () => {
    const plans = await listPlans();
    return { plans, payments: paymentState(), free_initial_credits: SIGNUP_GRANT_CREDITS };
  });

  fastify.get('/credits', async (request) => {
    const wallet = await getCreditWallet(currentUser(request).id);
    const plans = await listPlans();
    return {
      wallet,
      plan: wallet.plan,
      plans,
      payments: paymentState(),
      free_initial_credits: SIGNUP_GRANT_CREDITS,
      free_plan_code: FREE_PLAN_CODE,
    };
  });

  fastify.get('/credits/ledger', async (request, reply) => {
    const parsed = pageSchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid pagination', details: parsed.error.issues });
    }
    const result = await listCandidateLedger(currentUser(request).id, {
      limit: parsed.data.limit ?? 20,
      offset: parsed.data.offset ?? 0,
    });
    return {
      data: result.data,
      pagination: {
        limit: parsed.data.limit ?? 20,
        offset: parsed.data.offset ?? 0,
        total: result.total,
      },
    };
  });

  fastify.post('/credits/purchase', async (_request, reply) => {
    const payments = paymentState();
    return reply.status(503).send({
      error: payments.reason,
      code: 'PAYMENTS_NOT_CONFIGURED',
    });
  });
};

export default creditsRoutes;
