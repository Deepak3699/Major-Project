import IORedis from 'ioredis';
import { env } from './env';

let client: IORedis | null = null;

export function getRedis(): IORedis {
  if (!client) {
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    client.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
    });

    client.on('connect', () => {
      console.info('[Redis] Connected');
    });
  }
  return client;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  await redis.ping();
  console.info('✅ Connected to Redis');
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
