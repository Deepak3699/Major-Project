import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { getRedis } from '../utils/redis';
import { hashPassword, comparePassword } from '../utils/crypto';
import { authenticate } from '../middleware/auth';
import { env } from '../utils/env';
import { provisionCandidateAccount } from '../utils/credits';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(['admin', 'user']).optional(),
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
    const { email, password, role: requestedRole } = parseResult.data;
    const sql = getDB();

    let user = await sql.unsafe(
      `SELECT id, email, password_hash, role, status, auth_version FROM users WHERE email = $1`,
      [email],
    );

    // If the user doesn't exist yet, allow a one-time bootstrap from explicit
    // environment credentials. There is no hardcoded default, and an existing
    // account is never silently promoted to admin.
    if (!user || user.length === 0) {
      const bootstrapEmail = String(env.BOOTSTRAP_ADMIN_EMAIL || env.ADMIN_EMAIL || '').trim().toLowerCase();
      const bootstrapPass = String(env.BOOTSTRAP_ADMIN_PASSWORD || env.ADMIN_PASSWORD || '').trim();

      if (!bootstrapEmail || !bootstrapPass) {
        return reply.status(401).send({ error: 'Invalid credentials. Please check your email and password.' });
      }

      if (email.toLowerCase() === bootstrapEmail && password === bootstrapPass) {
        const hash = await hashPassword(password);
        const created = await sql.unsafe(
          `INSERT INTO users (email, password_hash, role, api_keys)
           VALUES ($1, $2, 'admin', '{}')
           ON CONFLICT (email) DO NOTHING
           RETURNING id, email, password_hash, role`,
          [email, hash],
        );
        if (!created || created.length === 0) {
          return reply.status(401).send({
            error: 'An account with this email already exists. Use the administrator bootstrap script to review access.',
          });
        }
        user = created;
      } else {
        return reply.status(401).send({ error: 'Invalid credentials. Please check your email and password.' });
      }
    }

    const userRow = user[0]!;
    const valid = await comparePassword(password, userRow.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials. Password is incorrect.' });
    }

    if (userRow.status === 'suspended') {
      return reply.status(403).send({
        error: 'This account is suspended. Contact an administrator to restore access.',
      });
    }

    if (
      (requestedRole === 'admin' && userRow.role !== 'admin') ||
      (requestedRole === 'user' && userRow.role === 'admin')
    ) {
      return reply.status(403).send({ error: 'This account does not have the selected role.' });
    }

    const finalRole = userRow.role;
    const tokenVersion = Number(userRow.auth_version || 0);

    await sql.unsafe(
      `UPDATE users SET last_login_at = now(), last_seen_at = now() WHERE id = $1`,
      [userRow.id],
    );

    const token = fastify.jwt.sign(
      { id: userRow.id, email: userRow.email, role: finalRole, v: tokenVersion },
      { expiresIn: '7d' },
    );
    const refreshToken = fastify.jwt.sign(
      { id: userRow.id, email: userRow.email, role: finalRole, v: tokenVersion, typ: 'refresh' },
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
        role: finalRole,
      },
    });
  });

  fastify.post('/register', async (req, reply) => {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parseResult.error.issues });
    }
    const email = parseResult.data.email.trim().toLowerCase();
    const { password } = parseResult.data;
    const sql = getDB();

    const existing = await sql.unsafe(
      `SELECT id FROM users WHERE email = $1`,
      [email],
    );

    if (existing && existing.length > 0) {
      return reply.status(409).send({ error: 'User already exists' });
    }

    const hashedPassword = await hashPassword(password);

    // User + FREE plan + wallet + exactly one 2-credit grant commit together.
    // The unique signup-grant index makes retries safe even under a race.
    const run = async (tx: { unsafe: (query: string, params?: any[]) => Promise<any[]> }) => {
      const inserted = await tx.unsafe(
        `INSERT INTO users (email, password_hash, role, api_keys)
         VALUES ($1, $2, 'user', '{}')
         RETURNING id, email, role`,
        [email, hashedPassword],
      );
      const created = inserted[0] as any;
      await provisionCandidateAccount(tx, created.id);
      return inserted;
    };

    try {
      const result = typeof (sql as any).begin === 'function'
        ? await (sql as any).begin(run)
        : await run(sql as any);

      return reply.status(201).send({
        message: 'User registered',
        user: result[0],
        security_role: 'USER',
        plan: 'FREE',
        initial_credits: 2,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        return reply.status(409).send({ error: 'User already exists' });
      }
      throw err;
    }
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
      const decoded = fastify.jwt.verify<{ id: string; typ?: string; v?: number }>(parseResult.data.refresh_token) as any;
      if (decoded.typ !== 'refresh') {
        return reply.status(401).send({ error: 'Invalid refresh token' });
      }
      const sql = getDB();
      const user = await sql.unsafe(
        `SELECT id, email, role, status, auth_version FROM users WHERE id = $1`,
        [decoded.id],
      );

      const userRow = user[0] as unknown as {
        id: string;
        email: string;
        role: string;
        status?: string;
        auth_version?: number;
      };
      if (!userRow || userRow.status === 'suspended') {
        return reply.status(401).send({ error: 'Invalid refresh token' });
      }
      if (Number(decoded.v ?? 0) !== Number(userRow.auth_version ?? 0)) {
        return reply.status(401).send({ error: 'Session has been revoked. Please sign in again.' });
      }

      if (redis) {
        await redis.setex(`bl_:${parseResult.data.refresh_token}`, 7 * 24 * 60 * 60, '1');
      }

      const tokenVersion = Number(userRow.auth_version || 0);
      const token = fastify.jwt.sign(
        { id: userRow.id, email: userRow.email, role: userRow.role, v: tokenVersion },
        { expiresIn: '7d' },
      );
      const refreshToken = fastify.jwt.sign(
        { id: userRow.id, email: userRow.email, role: userRow.role, v: tokenVersion, typ: 'refresh' },
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
