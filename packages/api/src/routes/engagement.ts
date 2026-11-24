import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { authorize } from '../middleware/auth';

/**
 * Voluntary placement outcomes and server-side onboarding progress.
 *
 * Placement reporting is explicitly optional. Only the reporting candidate and
 * administrators can read it; nothing here changes the candidate's role, plan
 * or credits.
 */

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const placementSchema = z.object({
  application_id: z.string().uuid().optional(),
  company_name: z.string().trim().min(1).max(200).optional(),
  role_title: z.string().trim().min(1).max(200).optional(),
  outcome: z.enum(['offer_received', 'joined']),
  joined_on: z.preprocess(
    (value) => (value === '' || value == null ? undefined : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ),
  notes: z.string().trim().max(2000).default(''),
}).refine(
  (value) => Boolean(value.application_id || (value.company_name && value.role_title)),
  { message: 'Provide an application, or both company_name and role_title.' },
);

const onboardingSchema = z.object({
  completed_steps: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  last_step: z.coerce.number().int().min(0).max(50).default(0),
  completed: z.boolean().default(false),
  skipped: z.boolean().default(false),
});

function currentUser(request: FastifyRequest) {
  return request.user as { id: string; role: string; email?: string };
}

const PLACEMENT_COLUMNS = `id, application_id, job_posting_id, company_name, role_title,
  outcome, joined_on, notes, created_at, updated_at`;

export const engagementRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authorize(['candidate', 'user']));

  fastify.get('/placements', async (request, reply) => {
    const parsed = pageSchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid pagination', details: parsed.error.issues });
    }
    const limit = parsed.data.limit ?? 20;
    const offset = parsed.data.offset ?? 0;
    const userId = currentUser(request).id;
    const sql = getDB();
    const countRows = await sql.unsafe(
      `SELECT COUNT(*)::int AS total FROM placement_outcomes WHERE user_id = $1`,
      [userId],
    );
    const rows = await sql.unsafe(
      `SELECT ${PLACEMENT_COLUMNS}
         FROM placement_outcomes
        WHERE user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    return {
      data: rows,
      pagination: { limit, offset, total: Number((countRows[0] as any)?.total || 0) },
    };
  });

  fastify.post('/placements', async (request, reply) => {
    const parsed = placementSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid placement report', details: parsed.error.issues });
    }
    const userId = currentUser(request).id;
    const sql = getDB();
    let jobPostingId: string | null = null;
    let companyName = parsed.data.company_name || '';
    let roleTitle = parsed.data.role_title || '';

    if (parsed.data.application_id) {
      const rows = await sql.unsafe(
        `SELECT a.job_posting_id, jp.title, c.name AS company_name
           FROM applications a
           JOIN job_postings jp ON jp.id = a.job_posting_id
           JOIN companies c ON c.id = jp.company_id
          WHERE a.id = $1 AND a.user_id = $2
          LIMIT 1`,
        [parsed.data.application_id, userId],
      );
      const application = rows[0] as any;
      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }
      jobPostingId = application.job_posting_id;
      companyName = companyName || String(application.company_name || '');
      roleTitle = roleTitle || String(application.title || '');
    }

    if (!companyName.trim() || !roleTitle.trim()) {
      return reply.status(400).send({ error: 'Company and role are required.' });
    }

    const inserted = await sql.unsafe(
      `INSERT INTO placement_outcomes
         (user_id, application_id, job_posting_id, company_name, role_title, outcome, joined_on, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${PLACEMENT_COLUMNS}`,
      [
        userId,
        parsed.data.application_id || null,
        jobPostingId,
        companyName.trim(),
        roleTitle.trim(),
        parsed.data.outcome,
        parsed.data.joined_on || null,
        parsed.data.notes || '',
      ],
    );
    return reply.status(201).send({ placement: inserted[0] });
  });

  fastify.get('/onboarding', async (request) => {
    const rows = await getDB().unsafe(
      `SELECT completed_steps, last_step, completed, skipped, updated_at
         FROM onboarding_progress WHERE user_id = $1 LIMIT 1`,
      [currentUser(request).id],
    );
    const row = rows[0] as any;
    return {
      progress: row
        ? {
            completed_steps: Array.isArray(row.completed_steps) ? row.completed_steps : [],
            last_step: Number(row.last_step || 0),
            completed: Boolean(row.completed),
            skipped: Boolean(row.skipped),
            updated_at: row.updated_at,
          }
        : { completed_steps: [], last_step: 0, completed: false, skipped: false, updated_at: null },
    };
  });

  fastify.put('/onboarding', async (request, reply) => {
    const parsed = onboardingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid onboarding progress', details: parsed.error.issues });
    }
    const userId = currentUser(request).id;
    const sql = getDB();
    const existingRows = await sql.unsafe(
      `SELECT completed_steps, last_step, completed, skipped FROM onboarding_progress WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const existing = existingRows[0] as any;
    const completedSteps = parsed.data.completed_steps.length > 0
      ? parsed.data.completed_steps
      : Array.isArray(existing?.completed_steps) ? existing.completed_steps : [];
    const lastStep = parsed.data.last_step || Number(existing?.last_step || 0);
    const completed = parsed.data.completed || Boolean(existing?.completed);
    const skipped = parsed.data.skipped || Boolean(existing?.skipped);

    const rows = await sql.unsafe(
      `INSERT INTO onboarding_progress (user_id, completed_steps, last_step, completed, skipped, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         completed_steps = EXCLUDED.completed_steps,
         last_step = EXCLUDED.last_step,
         completed = EXCLUDED.completed,
         skipped = EXCLUDED.skipped,
         updated_at = now()
       RETURNING completed_steps, last_step, completed, skipped, updated_at`,
      [userId, sql.json ? sql.json(completedSteps) : completedSteps, lastStep, completed, skipped],
    );
    return { progress: rows[0] };
  });
};

export default engagementRoutes;
