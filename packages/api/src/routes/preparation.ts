import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authorize } from '../middleware/auth';
import { getDB } from '../utils/db';
import { env } from '../utils/env';
import { InsufficientCreditsError, refundCredits, spendCredits } from '../utils/credits';
import {
  PREPARATION_MODULES,
  buildPreparationContext,
  generatePreparation,
  type PreparationModule,
} from '../utils/preparation';

/**
 * Job- and company-specific preparation. The artifact is persisted, resumable
 * and idempotent. Credit charging is disabled by default: no allocation or
 * refund policy has been approved, so PREPARATION_CREDIT_COST stays 0.
 */

const generateSchema = z.object({
  job_id: z.string().uuid(),
  module: z.enum(PREPARATION_MODULES as [PreparationModule, ...PreparationModule[]]),
  idempotency_key: z.string().trim().min(8).max(120).optional(),
});

const listSchema = z.object({
  job_id: z.string().uuid().optional(),
  module: z.enum(PREPARATION_MODULES as [PreparationModule, ...PreparationModule[]]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const ARTIFACT_COLUMNS = `id, user_id, job_id, module, status, payload, sources, model,
  credits_charged, error, created_at, updated_at`;

function currentUser(request: FastifyRequest) {
  return request.user as { id: string; role: string };
}

function parseStoredList(value: unknown): string[] {
  let parsed = value;
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean).slice(0, 20) : [];
}

function configuredCost(): number {
  const value = Number(env.PREPARATION_CREDIT_COST || 0);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export const preparationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authorize(['candidate', 'user']));

  fastify.get('/artifacts', async (request, reply) => {
    const parsed = listSchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid preparation query', details: parsed.error.issues });
    }
    const { job_id, module, limit, offset } = parsed.data;
    const sql = getDB();
    const where = ['user_id = $1'];
    const params: any[] = [currentUser(request).id];
    if (job_id) { where.push(`job_id = $${params.length + 1}`); params.push(job_id); }
    if (module) { where.push(`module = $${params.length + 1}`); params.push(module); }
    const clause = `WHERE ${where.join(' AND ')}`;
    const countRows = await sql.unsafe(
      `SELECT COUNT(*)::int AS total FROM preparation_artifacts ${clause}`,
      params,
    );
    const rows = await sql.unsafe(
      `SELECT ${ARTIFACT_COLUMNS} FROM preparation_artifacts ${clause}
        ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    return { data: rows, pagination: { limit, offset, total: Number((countRows[0] as any)?.total || 0) } };
  });

  fastify.get('/artifacts/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Invalid artifact id' });
    const rows = await getDB().unsafe(
      `SELECT ${ARTIFACT_COLUMNS} FROM preparation_artifacts WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [params.data.id, currentUser(request).id],
    );
    if (!rows.length) return reply.status(404).send({ error: 'Preparation artifact not found' });
    return { artifact: rows[0] };
  });

  fastify.post('/generate', async (request, reply) => {
    const parsed = generateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid preparation request', details: parsed.error.issues });
    }
    const userId = currentUser(request).id;
    const { job_id, module } = parsed.data;
    const key = parsed.data.idempotency_key || `prep:${userId}:${job_id}:${module}:${Date.now()}`;
    const sql = getDB();

    const existing = await sql.unsafe(
      `SELECT ${ARTIFACT_COLUMNS} FROM preparation_artifacts
        WHERE user_id = $1 AND idempotency_key = $2 LIMIT 1`,
      [userId, key],
    );
    if (existing.length) return { artifact: existing[0], already_processed: true };

    // Only published, trusted jobs in the candidate feed can be prepared for.
    const jobs = await sql.unsafe(
      `SELECT jp.id, jp.title, jp.description, jp.about_job, jp.experience_level,
              jp.location, jp.skills, jp.apply_url, jp.job_url, jp.source_site,
              jp.posted_at, jp.first_seen_at,
              c.name AS company_name, c.domain AS company_domain,
              c.website_url AS company_website, c.industry AS company_industry
         FROM job_postings jp
         JOIN companies c ON c.id = jp.company_id
        WHERE jp.id = $1 AND jp.review_status = 'published' AND jp.is_active = true
          AND jp.trust_score >= 70 AND jp.india_confirmed = true
          AND length(btrim(COALESCE(NULLIF(jp.description,''),jp.about_job,''))) >= 80
        LIMIT 1`,
      [job_id],
    );
    if (!jobs.length) return reply.status(404).send({ error: 'Job not available for preparation' });

    const profileRows = await sql.unsafe('SELECT * FROM candidate_profiles WHERE user_id = $1 LIMIT 1', [userId]);
    const profile = profileRows[0] as any;
    if (profile) {
      profile.skills = parseStoredList(profile.skills);
      profile.projects = parseStoredList(profile.projects);
      profile.experience = parseStoredList(profile.experience);
    }

    const context = buildPreparationContext(profile, jobs[0]);
    const cost = configuredCost();
    let charged = 0;
    if (cost > 0) {
      try {
        await spendCredits({
          userId,
          amount: cost,
          reason: `Preparation artifact: ${module}`,
          refType: 'preparation_artifact',
          refId: job_id,
          idempotencyKey: `prep-spend:${key}`,
          metadata: { module, job_id },
        });
        charged = cost;
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          return reply.status(402).send({
            error: error.message,
            code: error.code,
            balance: error.balance,
            required: error.required,
          });
        }
        throw error;
      }
    }

    try {
      const { payload, model } = await generatePreparation(module, context, process.env.GEMINI_API_KEY);
      const inserted = await sql.unsafe(
        `INSERT INTO preparation_artifacts
           (user_id, job_id, module, status, payload, sources, model, credits_charged, error, idempotency_key)
         VALUES ($1, $2, $3, 'ready', $4, $5, $6, $7, '', $8)
         RETURNING ${ARTIFACT_COLUMNS}`,
        [
          userId, job_id, module,
          sql.json ? sql.json(payload as any) : JSON.stringify(payload),
          sql.json ? sql.json(context.sources as any) : JSON.stringify(context.sources),
          model, charged, key,
        ],
      );
      return reply.status(201).send({ artifact: inserted[0], already_processed: false });
    } catch (error) {
      if (charged > 0) {
        await refundCredits({
          userId,
          amount: charged,
          reason: 'Preparation generation failed; credit refunded',
          refType: 'preparation_artifact',
          refId: key,
          idempotencyKey: `prep-refund:${key}`,
          metadata: { module, job_id },
        });
      }
      throw error;
    }
  });
};

export default preparationRoutes;
