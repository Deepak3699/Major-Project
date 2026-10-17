import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { getRedis } from '../utils/redis';
import { hashPassword, comparePassword } from '../utils/crypto';
import { authenticate } from '../middleware/auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/login', async (req, reply) => {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid credentials' });
    }
    const { email, password } = parseResult.data;
    const sql = getDB();

    const user = await sql.unsafe(
      `SELECT id, email, password_hash, role FROM users WHERE email = $1`,
      [email],
    );

    if (!user || user.length === 0) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const userRow = user[0]!;
    if (!userRow) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const valid = await comparePassword(password, userRow.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign(
      { id: userRow.id, email: userRow.email, role: userRow.role },
      { expiresIn: '7d' },
    );
    const refreshToken = fastify.jwt.sign(
      { id: userRow.id, email: userRow.email, role: userRow.role, typ: 'refresh' },
      { expiresIn: '30d' },
    );

    return reply.send({
      access_token: token,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 7 * 24 * 60 * 60,
      user: {
        id: userRow.id,
        email: userRow.email,
        role: userRow.role,
      },
    });
  });

  fastify.post('/register', async (req, reply) => {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parseResult.error.issues });
    }
    const { email, password } = parseResult.data;
    const sql = getDB();

    const existing = await sql.unsafe(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );

    if (existing && existing.length > 0) {
      return reply.status(409).send({ error: 'User already exists' });
    }

    const hashedPassword = await hashPassword(password);

    const result = await sql.unsafe(
      `INSERT INTO users (email, password_hash, role, api_keys)
       VALUES ($1, $2, 'sales_rep', '{}')
       RETURNING id, email, role`,
      [email, hashedPassword],
    );

    return reply.status(201).send({
      message: 'User registered',
      user: result[0],
    });
  });

  fastify.post('/logout', { preHandler: [authenticate] }, async (req, reply) => {
    const redis = getRedis();
    if (redis) {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const decoded = req.user as { id: string; jti?: string };
      if (decoded) {
        await redis.setex(`bl_:${token}`, 7 * 24 * 60 * 60, '1');
      }
    }
    return { message: 'Logged out' };
  });

  fastify.post('/refresh', async (req, reply) => {
    const bodySchema = z.object({
      refresh_token: z.string().min(1),
    });
    const parseResult = bodySchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid body' });
    }

    const redis = getRedis();
    if (redis) {
      const existing = await redis.get(`bl_:${parseResult.data.refresh_token}`);
      if (existing) {
        return reply.status(401).send({ error: 'Token has been revoked' });
      }
    }

    try {
      const decoded = fastify.jwt.verify<{ id: string; typ?: string }>(parseResult.data.refresh_token) as any;
      if (decoded.typ !== 'refresh') {
        return reply.status(401).send({ error: 'Invalid refresh token' });
      }
      const sql = getDB();
      const user = await sql.unsafe(
        `SELECT id, email, role FROM users WHERE id = $1`,
        [decoded.id],
      );

      const userRow = user[0] as unknown as { id: string; email: string; role: string };
      if (!userRow) {
        return reply.status(401).send({ error: 'Invalid refresh token' });
      }

      if (redis) {
        await redis.setex(`bl_:${parseResult.data.refresh_token}`, 7 * 24 * 60 * 60, '1');
      }

      const token = fastify.jwt.sign(
        { id: userRow.id, email: userRow.email, role: userRow.role },
        { expiresIn: '7d' },
      );
      const refreshToken = fastify.jwt.sign(
        { id: userRow.id, email: userRow.email, role: userRow.role, typ: 'refresh' },
        { expiresIn: '30d' },
      );

      return reply.send({
        access_token: token,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 7 * 24 * 60 * 60,
      });
    } catch (err) {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' });
    }
  });
};
