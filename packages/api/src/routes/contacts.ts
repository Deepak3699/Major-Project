import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/auth';
import { logAuditEvent } from '../utils/audit';

const contactSchema = z.object({
  full_name: z.string().optional(),
  linkedin_url: z.string().url().optional().or(z.literal('')),
  personal_email: z.string().email().optional().or(z.literal('')),
  personal_mobile: z.string().optional(),
  current_company_id: z.string().uuid().optional(),
  confidence_score: z.coerce.number().min(0).max(100).default(0),
});

const contactIdSchema = z.object({
  id: z.string().uuid(),
});

export const contactsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  fastify.get('/', async (req, reply) => {
    const sql = getDB();

    const parseResult = z.object({
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(50),
      search: z.string().optional(),
    }).safeParse(req.query);

    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid query parameters' });
    }

    const { page, limit, search } = parseResult.data;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(hc.full_name ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx})`);
      values.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await sql.unsafe(
      `SELECT COUNT(*) as total FROM hr_contacts hc LEFT JOIN companies c ON hc.current_company_id = c.id ${whereClause}`,
      values as any[],
    );
    const total = Number((countResult as unknown as Array<{ total: number }>)[0]?.total ?? 0);

    const rows = await sql.unsafe(
      `SELECT hc.id, hc.full_name, hc.linkedin_url, hc.personal_email, hc.personal_mobile,
              hc.confidence_score, hc.created_at, hc.updated_at,
              c.id as company_id, c.name as company_name
       FROM hr_contacts hc
       LEFT JOIN companies c ON hc.current_company_id = c.id
       ${whereClause}
       ORDER BY hc.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, limit, offset] as any[],
    );

    return {
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  });

  fastify.get('/:id', async (req, reply) => {
    const parseResult = contactIdSchema.safeParse(req.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid contact ID' });
    }
    const { id } = parseResult.data;
    const sql = getDB();

    const contact = await sql.unsafe(
      `SELECT hc.*, c.id as company_id, c.name as company_name
       FROM hr_contacts hc
       LEFT JOIN companies c ON hc.current_company_id = c.id
       WHERE hc.id = $1`,
      [id],
    );

    if (!contact || contact.length === 0) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    return { contact: contact[0] };
  });

  fastify.post('/', { preValidation: [authorize(['admin', 'sales_rep'])] }, async (req, reply) => {
    const parseResult = contactSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parseResult.error.issues });
    }
    const { full_name, linkedin_url, personal_email, personal_mobile, current_company_id, confidence_score } = parseResult.data;

    const sql = getDB();
    const result = await sql.unsafe(
      `INSERT INTO hr_contacts (full_name, linkedin_url, personal_email, personal_mobile, current_company_id, confidence_score)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, linkedin_url, personal_email, personal_mobile, current_company_id, confidence_score, created_at, updated_at`,
      [full_name || null, linkedin_url || null, personal_email || null, personal_mobile || null, current_company_id || null, confidence_score],
    );

    return reply.status(201).send({ contact: result[0] });
  });

  fastify.patch('/:id', { preValidation: [authorize(['admin', 'sales_rep'])] }, async (req, reply) => {
    const paramsResult = contactIdSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'Invalid contact ID' });
    }
    const { id } = paramsResult.data;

    const bodyResult = contactSchema.partial().safeParse(req.body);
    if (!bodyResult.success) {
      return reply.status(400).send({ error: 'Invalid body', details: bodyResult.error.issues });
    }

    const updateFields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(bodyResult.data)) {
      updateFields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }

    if (updateFields.length === 0) {
      return reply.status(400).send({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(id);

    const sql = getDB();
    const result = await sql.unsafe(
      `UPDATE hr_contacts SET ${updateFields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values as any[],
    );

    if (!result || result.length === 0) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    await logAuditEvent({
      user_id: (req.user as { id: string }).id,
      action: 'correct_contact',
      resource_type: 'hr_contact',
      resource_id: id,
      details: { fields: Object.keys(bodyResult.data) },
    });

    return { contact: result[0] };
  });

  fastify.delete('/:id', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parseResult = contactIdSchema.safeParse(req.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid contact ID' });
    }
    const { id } = parseResult.data;
    const sql = getDB();

    const result = await sql.unsafe(
      `DELETE FROM hr_contacts WHERE id = $1 RETURNING id`,
      [id],
    );

    if (!result || result.length === 0) {
      return reply.status(404).send({ error: 'Contact not found' });
    }

    await logAuditEvent({
      user_id: (req.user as { id: string }).id,
      action: 'delete_contact',
      resource_type: 'hr_contact',
      resource_id: id,
      details: {},
    });

    return { message: 'Contact deleted' };
  });
};
