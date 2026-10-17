import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/auth';

const companySchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  about: z.string().optional(),
  industry: z.string().optional(),
  size_estimate: z.string().optional(),
  default_email: z.string().email().optional().or(z.literal('')),
  default_phone: z.string().optional(),
  website_url: z.string().url().optional().or(z.literal('')),
});

const companyIdSchema = z.object({
  id: z.string().uuid(),
});

export const companiesRoutes: FastifyPluginAsync = async (fastify) => {
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
      conditions.push(`(c.name ILIKE $${paramIdx} OR c.domain ILIKE $${paramIdx})`);
      values.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await sql.unsafe(
      `SELECT COUNT(*) as total FROM companies c ${whereClause}`,
      values as any[],
    );
    const total = Number((countResult as unknown as Array<{ total: number }>)[0]?.total ?? 0);

    const rows = await sql.unsafe(
      `SELECT c.id, c.name, c.domain, c.about, c.industry, c.size_estimate,
              c.default_email, c.default_phone, c.website_url, c.created_at, c.updated_at,
              COUNT(l.id) as lead_count
       FROM companies c
       LEFT JOIN leads l ON c.id = l.company_id
       ${whereClause}
       GROUP BY c.id
       ORDER BY c.name ASC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...values, limit, offset] as any[],
    );

    return {
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  });

  fastify.get('/:id', async (req, reply) => {
    const parseResult = companyIdSchema.safeParse(req.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid company ID' });
    }
    const { id } = parseResult.data;
    const sql = getDB();

    const company = await sql.unsafe(
      `SELECT c.*, COUNT(l.id) as lead_count
       FROM companies c
       LEFT JOIN leads l ON c.id = l.company_id
       WHERE c.id = $1
       GROUP BY c.id`,
      [id],
    );

    if (!company || company.length === 0) {
      return reply.status(404).send({ error: 'Company not found' });
    }

    return { company: company[0] };
  });

  fastify.post('/', { preValidation: [authorize(['admin', 'sales_rep'])] }, async (req, reply) => {
    const parseResult = companySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parseResult.error.issues });
    }
    const { name, domain, about, industry, size_estimate, default_email, default_phone, website_url } = parseResult.data;

    const sql = getDB();
    const result = await sql.unsafe(
      `INSERT INTO companies (name, domain, about, industry, size_estimate, default_email, default_phone, website_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, domain, about, industry, size_estimate, default_email, default_phone, website_url, created_at, updated_at`,
      [name, domain || null, about || null, industry || null, size_estimate || null, default_email || null, default_phone || null, website_url || null],
    );

    return reply.status(201).send({ company: result[0] });
  });

  fastify.patch('/:id', { preValidation: [authorize(['admin', 'sales_rep'])] }, async (req, reply) => {
    const paramsResult = companyIdSchema.safeParse(req.params);
    if (!paramsResult.success) {
      return reply.status(400).send({ error: 'Invalid company ID' });
    }
    const { id } = paramsResult.data;

    const bodyResult = companySchema.partial().safeParse(req.body);
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
      `UPDATE companies SET ${updateFields.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values as any[],
    );

    if (!result || result.length === 0) {
      return reply.status(404).send({ error: 'Company not found' });
    }

    return { company: result[0] };
  });

  fastify.delete('/:id', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parseResult = companyIdSchema.safeParse(req.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid company ID' });
    }
    const { id } = parseResult.data;
    const sql = getDB();

    const result = await sql.unsafe(
      `DELETE FROM companies WHERE id = $1 RETURNING id`,
      [id],
    );

    if (!result || result.length === 0) {
      return reply.status(404).send({ error: 'Company not found' });
    }

    return { message: 'Company deleted' };
  });
};
