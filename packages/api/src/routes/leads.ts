import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { getRedis } from '../utils/redis';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/auth';
import { recomputeLeadScore, scoreExplain } from '../utils/scoring';
import { logAuditEvent } from '../utils/audit';
import { publishSSE } from '../utils/sse';
import { calculateCandidateSimilarity } from '../utils/dedup';

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
  sort_by: z.enum(['lead_score', 'created_at', 'updated_at', 'company_name', 'job_title', 'source_site', 'hr_name']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  score_band: z.enum(['hot', 'warm', 'cold']).optional(),
  pipeline_stage: z
    .enum(['discovered', 'enriching', 'enriched', 'verifying', 'verified', 'drafted', 'contacted',
      'ready_for_outreach', 'message_generated', 'send_pending', 'sent', 'delivered', 'replied',
      'converted', 'bounced', 'enrichment_failed', 'verification_failed', 'contact_unavailable',
      'suppressed', 'send_failed', 'provider_error', 'retry_pending'])
    .optional(),
  source_site: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  experience: z.string().optional(),
  filter: z.string().optional(),
});

const leadIdSchema = z.object({
  id: z.string().uuid(),
});

const enrichSchema = z.object({
  provider: z.enum(['auto', 'contactout', 'snovio', 'osint', 'hunter', 'apollo', 'apollo_io', 'lusha', 'rocketreach', 'prospeo', 'findymail']).optional(),
});

const draftSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'both']).default('both'),
});

const sendSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'both']).default('both'),
  draft_id: z.string().uuid().optional(),
});

const verifyAndSendSchema = z.object({
  channel: z.enum(['email', 'whatsapp', 'both']).default('both'),
  draft_id: z.string().uuid().optional(),
});


export const leadsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (req, reply) => {
    const parseResult = paginationSchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid query parameters', details: parseResult.error.issues });
    }
    const q = parseResult.data;

    const offset = (q.page - 1) * q.limit;
    const sql = getDB();

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    // RBAC: sales_rep sees only assigned leads, admin sees all
    const user = req.user as { id: string; role: string };
    if (user.role === 'sales_rep') {
      conditions.push(`l.assigned_to = $${paramIdx}`);
      values.push(user.id);
      paramIdx++;
    }

    if (q.score_band) {
      conditions.push(`l.score_band = $${paramIdx}`);
      values.push(q.score_band);
      paramIdx++;
    }
    if (q.pipeline_stage) {
      conditions.push(`l.pipeline_stage = $${paramIdx}`);
      values.push(q.pipeline_stage);
      paramIdx++;
    }
    if (q.source_site) {
      conditions.push(`jp.source_site = $${paramIdx}`);
      values.push(q.source_site);
      paramIdx++;
    }
    if (q.date_from) {
      conditions.push(`l.created_at >= $${paramIdx}::timestamptz`);
      values.push(q.date_from);
      paramIdx++;
    }
    if (q.date_to) {
      conditions.push(`l.created_at <= $${paramIdx}::timestamptz`);
      values.push(q.date_to);
      paramIdx++;
    }
    if (q.experience) {
      conditions.push(`jp.experience_level = $${paramIdx}`);
      values.push(q.experience);
      paramIdx++;
    }
    if (q.filter) {
      conditions.push(`(c.name ILIKE $${paramIdx} OR c.domain ILIKE $${paramIdx} OR jp.title ILIKE $${paramIdx})`);
      values.push(`%${q.filter}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderDir = q.sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    // Whitelisted output aliases/columns; anything else falls back to created_at
    const sortColumns: Record<string, string> = {
      lead_score: 'l.lead_score',
      created_at: 'l.created_at',
      updated_at: 'l.updated_at',
      company_name: 'company_name',
      job_title: 'job_title',
      source_site: 'source_site',
      hr_name: 'hr_name',
    };
    const sortColumn = sortColumns[q.sort_by] || 'l.created_at';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM leads l
      JOIN companies c ON l.company_id = c.id
      JOIN job_postings jp ON l.job_posting_id = jp.id
      LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
      ${whereClause}
    `;
    const countResult = await sql.unsafe(countQuery, values as any);
    const countRow = countResult[0] as unknown as { total: number } | undefined;
    const total = Number(countRow?.total ?? 0);

    const rows = await sql.unsafe(`
      SELECT
        l.id, l.lead_score, l.score_band, l.pipeline_stage, l.data_quality,
        l.email_status, l.whatsapp_status, l.do_not_contact, l.assigned_to,
        l.created_at, l.updated_at,
        jp.source_site, jp.title AS job_title,
        c.name as company_name, c.domain as company_domain,
        hc.full_name as hr_name, hc.linkedin_url as hr_linkedin_url,
        hc.personal_email as hr_email, hc.personal_mobile as hr_mobile
      FROM leads l
      JOIN companies c ON l.company_id = c.id
      JOIN job_postings jp ON l.job_posting_id = jp.id
      LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
      ${whereClause}
      ORDER BY ${sortColumn} ${orderDir}
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...values, q.limit, offset] as any);

    const pages = Math.ceil(total / q.limit);

    return {
      data: rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total,
        pages,
      },
    };
  });

  fastify.get<{ Params: { id: string } }>(
    '/:id',
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;
      const sql = getDB();

      const user = req.user as { id: string; role: string };

      let query = `
        SELECT
          l.*,
          c.name as company_name, c.domain, c.about as about_company,
          c.industry, c.size_estimate, c.default_email, c.default_phone, c.website_url,
          hc.full_name as hr_name,
          hc.linkedin_url as hr_linkedin_url, hc.personal_email as hr_email,
          hc.personal_mobile as hr_mobile, hc.confidence_score as hr_confidence,
          jp.title as job_title, jp.description as job_description,
          jp.experience_level, jp.salary_range, jp.job_url, jp.source_site
        FROM leads l
        JOIN companies c ON l.company_id = c.id
        LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
        JOIN job_postings jp ON l.job_posting_id = jp.id
        WHERE l.id = $1`;
      
      const values: (string | number)[] = [id];
      
      if (user.role === 'sales_rep') {
        query += ' AND l.assigned_to = $2';
        values.push(user.id);
      }

      const lead = await sql.unsafe(query, values);

      if (!lead || lead.length === 0) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      const enrichmentLogs = await sql.unsafe(
        `SELECT * FROM enrichment_log WHERE lead_id = $1 ORDER BY created_at DESC`,
        [id],
      );

      const verificationLogs = await sql.unsafe(
        `SELECT * FROM verification_log WHERE lead_id = $1 ORDER BY created_at DESC`,
        [id],
      );

      const drafts = await sql.unsafe(
        `SELECT * FROM outreach_drafts WHERE lead_id = $1 ORDER BY version`,
        [id],
      );

      const outreachLogs = await sql.unsafe(
        `SELECT * FROM outreach_log WHERE lead_id = $1 ORDER BY sent_at DESC`,
        [id],
      );

      return {
        lead: {
          ...lead[0],
          enrichment_log: enrichmentLogs,
          verification_log: verificationLogs,
          drafts,
          outreach_log: outreachLogs,
        },
      };
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id/score',
    { preValidation: [authorize(['admin', 'sales_rep'])] },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) return reply.status(400).send({ error: 'Invalid lead ID' });
      const { id } = idResult.data;
      const sql = getDB();
      const user = req.user as { id: string; role: string };

      // Authorization: a sales_rep may only see their own assigned leads (server-side).
      const owned = await sql.unsafe(
        `SELECT 1 FROM leads WHERE id = $1${user.role === 'sales_rep' ? ' AND assigned_to = $2' : ''}`,
        (user.role === 'sales_rep' ? [id, user.id] : [id]) as any,
      );
      if (!owned || owned.length === 0) return reply.status(404).send({ error: 'Lead not found' });

      const explained = await scoreExplain(sql, id);
      if (!explained) return reply.status(404).send({ error: 'Lead not found' });
      return explained;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/:id/enrich',
    {
      preValidation: [authorize(['admin', 'sales_rep'])],
    },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;
      const parseResult = enrichSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body', details: parseResult.error.issues });
      }
      const { provider } = parseResult.data;

      const redis = getRedis();
      const jobId = await redis.lpush(
        'enrichment_queue:requests',
        JSON.stringify({
          lead_id: id,
          provider: provider || 'auto',
          requested_by: (req.user as { id: string }).id,
          requested_at: new Date().toISOString(),
        }),
      );

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'enqueue_enrichment',
        resource_type: 'lead',
        resource_id: id,
        details: { provider: provider || 'auto', job_id: String(jobId) },
      });

      await publishSSE((req.user as { id: string }).id, {
        type: 'enrichment_queued',
        lead_id: id,
        job_id: String(jobId),
        provider: provider || 'auto',
      });

      await recomputeLeadScore(getDB(), id);

      return reply.status(202).send({
        message: 'Enrichment job queued',
        job_id: String(jobId),
        lead_id: id,
        provider: provider || 'auto',
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/:id/verify',
    {
      preValidation: [authorize(['admin', 'sales_rep'])],
    },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;

      const redis = getRedis();
      const jobId = await redis.lpush(
        'verification_queue:requests',
        JSON.stringify({
          lead_id: id,
          requested_by: (req.user as { id: string }).id,
          requested_at: new Date().toISOString(),
        }),
      );

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'enqueue_verification',
        resource_type: 'lead',
        resource_id: id,
        details: { job_id: String(jobId) },
      });

      await publishSSE((req.user as { id: string }).id, {
        type: 'verification_queued',
        lead_id: id,
        job_id: String(jobId),
      });

      await recomputeLeadScore(getDB(), id);

      return reply.status(202).send({
        message: 'Verification job queued',
        job_id: String(jobId),
        lead_id: id,
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/:id/draft',
    {
      preValidation: [authorize(['admin', 'sales_rep'])],
    },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;
      const parseResult = draftSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body', details: parseResult.error.issues });
      }
      const { channel } = parseResult.data;

      const redis = getRedis();
      const jobId = await redis.lpush(
        'draft_queue:requests',
        JSON.stringify({
          lead_id: id,
          channel,
          requested_by: (req.user as { id: string }).id,
          requested_at: new Date().toISOString(),
        }),
      );

       await logAuditEvent({
         user_id: (req.user as { id: string }).id,
         action: 'enqueue_draft',
         resource_type: 'lead',
         resource_id: id,
         details: { channel, job_id: String(jobId) },
       });

       await publishSSE((req.user as { id: string }).id, {
         type: 'draft_queued',
         lead_id: id,
         job_id: String(jobId),
         channel,
       });

       await recomputeLeadScore(getDB(), id);

       return reply.status(202).send({
         message: 'Draft generation job queued',
        job_id: String(jobId),
        lead_id: id,
        channel,
      });
    },
  );

  fastify.patch<{ Params: { id: string; draftId: string } }>(
    '/:id/draft/:draftId',
    {
      preValidation: [authorize(['admin', 'sales_rep'])],
    },
    async (req, reply) => {
      const paramsSchema = z.object({
        id: z.string().uuid(),
        draftId: z.string().uuid(),
      });
      const parseResult = paramsSchema.safeParse(req.params);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid parameters' });
      }
      const { id, draftId } = parseResult.data;

      const bodySchema = z.object({
        subject: z.string().optional(),
        body: z.string().optional(),
      });
      const bodyResult = bodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const { subject, body } = bodyResult.data;

      const sql = getDB();
      const updateFields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (subject !== undefined) {
        updateFields.push(`subject = $${idx}`);
        values.push(subject);
        idx++;
      }
      if (body !== undefined) {
        updateFields.push(`body = $${idx}`);
        values.push(body);
        idx++;
      }
      if (updateFields.length === 0) {
        return reply.status(400).send({ error: 'No fields to update' });
      }

      updateFields.push(`is_edited = true`);
      updateFields.push(`updated_at = now()`);
      values.push(draftId, id);

      const result = await sql.unsafe(
        `UPDATE outreach_drafts
         SET ${updateFields.join(', ')}
         WHERE id = $${values.length - 1} AND lead_id = $${values.length}
         RETURNING id, lead_id, channel, version, subject, body, is_edited, created_at`,
        values as any,
      );

      if (!result || result.length === 0) {
        return reply.status(404).send({ error: 'Draft not found' });
      }

      return { draft: result[0] };
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/:id/send',
    {
      preValidation: [authorize(['admin', 'sales_rep'])],
    },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;
      const parseResult = sendSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body', details: parseResult.error.issues });
      }
      const { channel, draft_id } = parseResult.data;

      const sql = getDB();
      const lead = await sql.unsafe(
        `SELECT l.email_status, l.whatsapp_status, l.do_not_contact,
                hc.personal_email AS hr_email, hc.personal_mobile AS hr_mobile
         FROM leads l LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
         WHERE l.id = $1`,
        [id],
      );

      if (!lead || lead.length === 0) {
        return reply.status(404).send({ error: 'Lead not found' });
      }
      const leadRow = lead[0] as unknown as { email_status: string | null; whatsapp_status: string | null; do_not_contact: boolean; hr_email: string | null; hr_mobile: string | null } | null;
      if (!leadRow) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      if (leadRow.do_not_contact) {
        await logAuditEvent({
          user_id: (req.user as { id: string }).id,
          action: 'send_blocked_do_not_contact',
          resource_type: 'lead',
          resource_id: id,
          details: { reason: 'Lead is flagged do_not_contact' },
        });
        return reply.status(403).send({
          error: 'Cannot send to do-not-contact lead',
          detail: 'This lead is flagged do_not_contact (bounced or opted out).',
        });
      }

      // Server-side suppression check (never rely on frontend or flag sync alone).
      const contactsToCheck = [leadRow.hr_email?.toLowerCase().trim(), leadRow.hr_mobile?.toLowerCase().trim()].filter(Boolean) as string[];
      if (contactsToCheck.length > 0) {
        const suppressed = await sql.unsafe(
          `SELECT 1 FROM suppressions WHERE normalized_contact = ANY($1::text[])
             OR (channel = 'any' AND normalized_contact = ANY($1::text[])) LIMIT 1`,
          [contactsToCheck],
        );
        if (suppressed && suppressed.length > 0) {
          await logAuditEvent({
            user_id: (req.user as { id: string }).id,
            action: 'send_blocked_suppressed',
            resource_type: 'lead',
            resource_id: id,
            details: { reason: 'Contact found in suppressions blocklist' },
          });
          return reply.status(403).send({
            error: 'Cannot send to suppressed contact',
            detail: 'This contact is on the do-not-contact / suppression list.',
          });
        }
      }

      if (channel === 'email' || channel === 'both') {
        if (leadRow.email_status !== 'valid') {
          return reply.status(400).send({
            error: 'Email not verified',
            detail: 'Email status is ' + (leadRow.email_status || 'unknown') + '. Verify before sending.',
          });
        }
      }
      if (channel === 'whatsapp' || channel === 'both') {
        if (leadRow.whatsapp_status !== 'registered') {
          return reply.status(400).send({
            error: 'WhatsApp not verified',
            detail: 'WhatsApp status is ' + (leadRow.whatsapp_status || 'unknown') + '. Verify before sending.',
          });
        }
      }

      const redis = getRedis();
      const jobId = await redis.lpush(
        'send_queue:requests',
        JSON.stringify({
          lead_id: id,
          channel,
          draft_id: draft_id || null,
          requested_by: (req.user as { id: string }).id,
          requested_at: new Date().toISOString(),
        }),
      );

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'enqueue_send',
        resource_type: 'lead',
        resource_id: id,
        details: { channel, draft_id: draft_id || null, job_id: String(jobId) },
      });

      await publishSSE((req.user as { id: string }).id, {
        type: 'send_queued',
        lead_id: id,
        job_id: String(jobId),
        channel,
      });

      // NOTE: do NOT optimistically set pipeline_stage='contacted' here. The
      // worker sets it ONLY after the provider reports a real send. Marking it
      // on enqueue would be a fake-success state (button clicked ≠ message sent).
      return reply.status(202).send({
        message: 'Send job queued',
        job_id: String(jobId),
        lead_id: id,
        channel,
      });
    },
  );

  fastify.post<{ Params: { id: string } }>(
    '/:id/verify-and-send',
    {
      preValidation: [authorize(['admin', 'sales_rep'])],
    },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;
      const parseResult = verifyAndSendSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const { channel, draft_id } = parseResult.data;

      // Fail fast on suppressed/unverified leads instead of queueing work that
      // the worker would only reject later. Worker re-checks server-side too.
      const sql = getDB();
      const preLead = await sql.unsafe(
        `SELECT l.email_status, l.whatsapp_status, l.do_not_contact,
                hc.personal_email AS hr_email, hc.personal_mobile AS hr_mobile
         FROM leads l LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
         WHERE l.id = $1`,
        [id],
      );
      const pre = preLead?.[0] as unknown as { email_status: string | null; whatsapp_status: string | null; do_not_contact: boolean; hr_email: string | null; hr_mobile: string | null } | undefined;
      if (!pre) return reply.status(404).send({ error: 'Lead not found' });
      if (pre.do_not_contact) {
        await logAuditEvent({ user_id: (req.user as { id: string }).id, action: 'send_blocked_do_not_contact', resource_type: 'lead', resource_id: id, details: { flow: 'verify-and-send' } });
        return reply.status(403).send({ error: 'Cannot send to do-not-contact lead' });
      }
      const preContacts = [pre.hr_email?.toLowerCase().trim(), pre.hr_mobile?.toLowerCase().trim()].filter(Boolean) as string[];
      if (preContacts.length > 0) {
        const hit = await sql.unsafe(`SELECT 1 FROM suppressions WHERE normalized_contact = ANY($1::text[]) LIMIT 1`, [preContacts]);
        if (hit && hit.length > 0) {
          await logAuditEvent({ user_id: (req.user as { id: string }).id, action: 'send_blocked_suppressed', resource_type: 'lead', resource_id: id, details: { flow: 'verify-and-send' } });
          return reply.status(403).send({ error: 'Cannot send to suppressed contact' });
        }
      }

      const redis = getRedis();
      const jobId = await redis.lpush(
        'verify_send_queue:requests',
        JSON.stringify({
          lead_id: id,
          channel,
          draft_id: draft_id || null,
          requested_by: (req.user as { id: string }).id,
          requested_at: new Date().toISOString(),
        }),
      );

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'enqueue_verify_and_send',
        resource_type: 'lead',
        resource_id: id,
        details: { channel, draft_id: draft_id || null, job_id: String(jobId) },
      });

      await publishSSE((req.user as { id: string }).id, {
        type: 'verify_and_send_queued',
        lead_id: id,
        job_id: String(jobId),
        channel,
      });

      // No premature 'contacted': the verify-send worker sets it only on a real
      // provider success (and blocks on do-not-contact / failed verification).
      return reply.status(202).send({
        message: 'Verify & Send job queued',
        job_id: String(jobId),
        lead_id: id,
        channel,
      });
    },
  );

  fastify.get<{ Params: { id: string } }>(
    '/:id/timeline',
    { preValidation: [authorize(['admin', 'sales_rep'])] },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;
      const sql = getDB();

      const enrichment = await sql.unsafe(
        `SELECT id, provider, status, credits_used, created_at FROM enrichment_log WHERE lead_id = $1 ORDER BY created_at DESC`,
        [id],
      );

      const verification = await sql.unsafe(
        `SELECT id, channel, result, created_at FROM verification_log WHERE lead_id = $1 ORDER BY created_at DESC`,
        [id],
      );

      const drafts = await sql.unsafe(
        `SELECT id, channel, version, generated_by, is_edited, created_at FROM outreach_drafts WHERE lead_id = $1 ORDER BY version`,
        [id],
      );

      const outreach = await sql.unsafe(
        `SELECT id, channel, provider_message_id, delivery_status, sent_at FROM outreach_log WHERE lead_id = $1 ORDER BY sent_at DESC`,
        [id],
      );

      const timeline: Array<Record<string, unknown>> = [];

      for (const e of enrichment) {
        timeline.push({
          type: 'enrichment',
          provider: e.provider,
          status: e.status,
          credits_used: e.credits_used,
          timestamp: e.created_at,
        });
      }
      for (const v of verification) {
        timeline.push({
          type: 'verification',
          channel: v.channel,
          result: v.result,
          timestamp: v.created_at,
        });
      }
      for (const d of drafts) {
        timeline.push({
          type: 'draft_created',
          channel: d.channel,
          version: d.version,
          generated_by: d.generated_by,
          is_edited: d.is_edited,
          timestamp: d.created_at,
        });
      }
      for (const o of outreach) {
        timeline.push({
          type: 'outreach',
          channel: o.channel,
          delivery_status: o.delivery_status,
          timestamp: o.sent_at,
        });
      }

      timeline.sort((a, b) => {
        const ta = new Date(a.timestamp as string).getTime();
        const tb = new Date(b.timestamp as string).getTime();
        return tb - ta;
      });

      return { timeline };
    },
  );

  fastify.post(
    '/bulk-draft',
    {
      preValidation: [authorize(['admin', 'sales_rep'])],
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const bodySchema = z.object({
        lead_ids: z.array(z.string().uuid()).min(1).max(50),
        channel: z.enum(['email', 'whatsapp', 'both']).default('both'),
      });
      const parseResult = bodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body', details: parseResult.error.issues });
      }
      const { lead_ids, channel } = parseResult.data;

      const redis = getRedis();
      const jobId = await redis.lpush(
        'bulk_draft_queue:requests',
        JSON.stringify({
          lead_ids,
          channel,
          requested_by: (req.user as { id: string }).id,
          requested_at: new Date().toISOString(),
        }),
      );

      return reply.status(202).send({
        message: 'Bulk draft job queued',
        job_id: String(jobId),
        lead_ids,
        channel,
      });
    },
  );

  fastify.patch<{ Params: { id: string } }>(
    '/:id/do-not-contact',
    { preValidation: [authorize(['admin', 'sales_rep'])] },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;

      const bodySchema = z.object({
        do_not_contact: z.boolean(),
      });
      const parseResult = bodySchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const { do_not_contact } = parseResult.data;

      const sql = getDB();
      const result = await sql.unsafe(
        `UPDATE leads SET do_not_contact = $1, updated_at = NOW() WHERE id = $2 RETURNING id, do_not_contact`,
        [do_not_contact, id],
      );

      if (!result || result.length === 0) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: do_not_contact ? 'set_do_not_contact' : 'clear_do_not_contact',
        resource_type: 'lead',
        resource_id: id,
        details: { do_not_contact },
      });

      return { lead: result[0] };
    },
  );

  fastify.patch<{ Params: { id: string } }>(
    '/:id/assign',
    { preValidation: [authorize(['admin'])] },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;

      const bodySchema = z.object({
        assigned_to: z.string().uuid().nullable().optional(),
      });
      const parseResult = bodySchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const { assigned_to } = parseResult.data;

      const sql = getDB();

      if (assigned_to) {
        const user = await sql.unsafe(`SELECT id FROM users WHERE id = $1`, [assigned_to]);
        if (!user || user.length === 0) {
          return reply.status(400).send({ error: 'Assigned user not found' });
        }
      }

      const result = await sql.unsafe(
        `UPDATE leads SET assigned_to = $1, updated_at = NOW() WHERE id = $2 RETURNING id, assigned_to`,
        [assigned_to as any, id],
      );

      if (!result || result.length === 0) {
        return reply.status(404).send({ error: 'Lead not found' });
      }

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'assign_lead',
        resource_type: 'lead',
        resource_id: id,
        details: { assigned_to: assigned_to || null },
      });

      return { lead: result[0] };
    },
  );

  fastify.get('/duplicates', { preValidation: [authorize(['admin', 'sales_rep'])] }, async (req, reply) => {
    const sql = getDB();

    const candidates = await sql.unsafe(`
      SELECT l1.id as lead_id, l1.lead_score, l1.pipeline_stage, l1.created_at,
             c1.name as company_name, jp1.title as job_title, jp1.job_url as job_url,
             l2.id as duplicate_of_id, l2.lead_score as dup_score, l2.pipeline_stage as dup_stage,
             c2.name as dup_company_name, jp2.title as dup_job_title, jp2.job_url as dup_job_url
      FROM leads l1
      JOIN companies c1 ON l1.company_id = c1.id
      JOIN job_postings jp1 ON l1.job_posting_id = jp1.id
      JOIN leads l2 ON l1.possible_duplicate_of = l2.id
      JOIN companies c2 ON l2.company_id = c2.id
      JOIN job_postings jp2 ON l2.job_posting_id = jp2.id
      WHERE l1.possible_duplicate_of IS NOT NULL
      ORDER BY l1.created_at DESC
    `);

    const rows = (candidates as any[]).map((row) => ({
      lead_id: row.lead_id,
      lead_score: row.lead_score,
      pipeline_stage: row.pipeline_stage,
      created_at: row.created_at,
      company_name: row.company_name,
      job_title: row.job_title,
      duplicate_of_id: row.duplicate_of_id,
      dup_score: row.dup_score,
      dup_stage: row.dup_stage,
      dup_company_name: row.dup_company_name,
      dup_job_title: row.dup_job_title,
      similarity: calculateCandidateSimilarity(
        { companyName: row.company_name, jobTitle: row.job_title, jobUrl: row.job_url },
        { companyName: row.dup_company_name, jobTitle: row.dup_job_title, jobUrl: row.dup_job_url }
      ),
    }));

    return { duplicates: rows };
  });

  fastify.post<{ Params: { id: string } }>(
    '/:id/merge-duplicate',
    { preValidation: [authorize(['admin', 'sales_rep'])] },
    async (req, reply) => {
      const idResult = leadIdSchema.safeParse(req.params);
      if (!idResult.success) {
        return reply.status(400).send({ error: 'Invalid lead ID' });
      }
      const { id } = idResult.data;

      const bodySchema = z.object({
        merge_into_id: z.string().uuid(),
      });
      const parseResult = bodySchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const { merge_into_id } = parseResult.data;

      if (id === merge_into_id) {
        return reply.status(400).send({ error: 'Cannot merge a lead into itself' });
      }

      const sql = getDB();

      const target = await sql.unsafe(`SELECT id FROM leads WHERE id = $1`, [merge_into_id]);
      if (!target || target.length === 0) {
        return reply.status(404).send({ error: 'Target lead not found' });
      }

      await sql.unsafe(
        `UPDATE enrichment_log SET lead_id = $1 WHERE lead_id = $2`,
        [merge_into_id, id],
      );
      await sql.unsafe(
        `UPDATE verification_log SET lead_id = $1 WHERE lead_id = $2`,
        [merge_into_id, id],
      );
      await sql.unsafe(
        `UPDATE outreach_drafts SET lead_id = $1 WHERE lead_id = $2`,
        [merge_into_id, id],
      );
      await sql.unsafe(
        `UPDATE outreach_log SET lead_id = $1 WHERE lead_id = $2`,
        [merge_into_id, id],
      );

      await sql.unsafe(`DELETE FROM leads WHERE id = $1`, [id]);

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'merge_duplicate',
        resource_type: 'lead',
        resource_id: id,
        details: { merged_into: merge_into_id },
      });

      return { message: 'Merged', merged_from: id, merged_into: merge_into_id };
    },
  );
};
