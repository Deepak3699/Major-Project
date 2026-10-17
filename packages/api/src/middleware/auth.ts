import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedis } from '../utils/redis';
import { getDB } from '../utils/db';

interface JWTPayload {
  id: string;
  email: string;
  role: string;
}

// A JWT stays valid for its full 7d TTL even after the account is deleted or the
// database is re-seeded. Signature verification alone therefore lets requests
// through with an id that has no row in `users`, and each route then hand-rolls
// its own missing-user response (404 here, 500 there). Rejecting up front keeps
// one contract -- 401 -- which is what the web client's response interceptor
// listens for to refresh, and to log out when the refresh token is dead too.
async function resolveSubject(request: FastifyRequest): Promise<JWTPayload | null> {
  const token = (request.headers.authorization || '').replace('Bearer ', '');
  const redis = getRedis();
  if (redis) {
    const blacklisted = await redis.get(`bl_:${token}`);
    if (blacklisted) {
      return null;
    }
  }

  await request.jwtVerify();
  const user = request.user as unknown as JWTPayload;
  if (!user?.id) return null;

  const existing = await getDB().unsafe(`SELECT 1 FROM users WHERE id = $1`, [user.id]);
  return existing.length > 0 ? user : null;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    if (!(await resolveSubject(request))) {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  } catch {
    reply.status(401).send({ error: 'Unauthorized' });
  }
}

export function authorize(allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      const user = await resolveSubject(request);
      if (!user) {
        reply.status(401).send({ error: 'Unauthorized' });
        return;
      }
      if (!allowedRoles.includes(user.role)) {
        reply.status(403).send({ error: 'Forbidden: insufficient permissions' });
      }
    } catch {
      reply.status(401).send({ error: 'Unauthorized' });
    }
  };
}
