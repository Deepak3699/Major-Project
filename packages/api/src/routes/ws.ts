import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth';
import { getRedis } from '../utils/redis';

function setSSEHeaders(reply: any) {
  // Raw headers on the hijacked response: Fastify must NOT manage this reply
  // (reply.raw.write without hijack produces a 200 with no content-type, which
  // browsers reject as "not text/event-stream"). Call reply.hijack() first.
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
}

export const wsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/sse',
    { preHandler: [authenticate] },
    async (req, reply) => {
      reply.hijack();
      setSSEHeaders(reply);

      const userId = (req.user as { id: string }).id;
      const redis = getRedis();

      if (!redis) {
        reply.raw.write(`data: ${JSON.stringify({ type: 'error', message: 'Redis not available' })}\n\n`);
        reply.raw.end();
        return reply;
      }

      const channel = `user:${userId}:sse`;
      const subscriber = redis.duplicate();
      // Personal channel (direct actions) PLUS the broadcast channel (army /
      // scheduler completions, published under sentinel requesters no browser
      // subscribes to). Without broadcast, background wave completions never
      // reach any UI.
      await subscriber.subscribe(channel, 'broadcast:sse');

      const send = (data: unknown) => {
        if (req.raw.destroyed) return;
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      subscriber.on('message', (_channel: string, message: string) => {
        try {
          send(JSON.parse(message));
        } catch {
          send({ raw: message });
        }
      });

      send({ type: 'connected', user_id: userId });

      const heartbeat = setInterval(() => {
        send({ type: 'heartbeat', timestamp: Date.now() });
      }, 30000);

      req.raw.on('close', async () => {
        clearInterval(heartbeat);
        await subscriber.quit();
        reply.raw.end();
      });

      return reply;
    },
  );

  fastify.get(
    '/sse/token',
    async (req, reply) => {
      const token = (req.query as Record<string, string>).token;
      if (!token) {
        return reply.status(401).send({ error: 'Missing token' });
      }

      try {
        const decoded = await reply.server.jwt.verify<{ id: string }>(token);
        const userId = decoded.id;
        const redis = getRedis();

        if (!redis) {
          return reply.status(503).send({ error: 'Redis not available' });
        }

        reply.hijack();
        setSSEHeaders(reply);

        const channel = `user:${userId}:sse`;
        const subscriber = redis.duplicate();
        await subscriber.subscribe(channel, 'broadcast:sse');

        const send = (data: unknown) => {
          if (req.raw.destroyed) return;
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        subscriber.on('message', (_channel: string, message: string) => {
          try {
            send(JSON.parse(message));
          } catch {
            send({ raw: message });
          }
        });

        send({ type: 'connected', user_id: userId });

        const heartbeat = setInterval(() => {
          send({ type: 'heartbeat', timestamp: Date.now() });
        }, 30000);

        req.raw.on('close', async () => {
          clearInterval(heartbeat);
          await subscriber.quit();
          reply.raw.end();
        });

        return reply;
      } catch {
        return reply.status(401).send({ error: 'Invalid token' });
      }
    },
  );

  fastify.get(
    '/live/stats',
    { preHandler: [authenticate] },
    async (req, reply) => {
      reply.hijack();
      setSSEHeaders(reply);

      const redis = getRedis();

      const send = (data: unknown) => {
        if (req.raw.destroyed) return;
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      if (redis) {
        const stats = await redis.hgetall('stats:live');
        send({ type: 'stats', data: stats });
      } else {
        send({ type: 'stats', data: {} });
      }

      const interval = setInterval(async () => {
        if (redis) {
          const updated = await redis.hgetall('stats:live');
          send({ type: 'stats_update', data: updated });
        }
      }, 5000);

      req.raw.on('close', () => {
        clearInterval(interval);
        reply.raw.end();
      });

      return reply;
    },
  );
};
