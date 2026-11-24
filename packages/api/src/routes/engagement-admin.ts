import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { authorize } from '../middleware/auth';

/** Admin read-only view of voluntary placement outcomes. */
const querySchema = z.object({
  search: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export const engagementAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authorize(['admin']));

  fastify.get('/placements', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid placement query', details: parsed.error.issues });
    }
    const { search, limit, offset } = parsed.data;
    const sql = getDB();
    const term = search ? `%${search}%` : null;
    const where = term
      ? `WHERE u.email ILIKE $1 OR p.company_name ILIKE $1 OR p.role_title ILIKE $1`
      : '';
    const countParams = term ? [term] : [];
    const countRows = await sql.unsafe(
      `SELECT COUNT(*)::int AS total
         FROM placement_outcomes p
         JOIN users u ON u.id = p.user_id
         ${where}`,
      countParams,
    );
    const params = term ? [term, limit, offset] : [limit, offset];
    const limitParam = term ? '$2' : '$1';
    const offsetParam = term ? '$3' : '$2';
    const rows = await sql.unsafe(
      `SELECT p.id, p.user_id, u.email AS user_email, p.application_id, p.job_posting_id,
              p.company_name, p.role_title, p.outcome, p.joined_on, p.notes,
              p.created_at, p.updated_at
         FROM placement_outcomes p
         JOIN users u ON u.id = p.user_id
         ${where}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );
    return {
      data: rows,
      pagination: { limit, offset, total: Number((countRows[0] as any)?.total || 0) },
    };
  });
};

export default engagementAdminRoutes;
