import IORedis from 'ioredis';
import { env } from './env';
import { printRedisError } from './friendlyErrors';

let client: IORedis | null = null;
let hasReportedRedisError = false;

export function getRedis(): IORedis {
  if (!client) {
    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) return null; // stop hammering after 3 tries
        return Math.min(times * 100, 1000);
      },
    });

    client.on('error', (err: Error) => {
      if (!hasReportedRedisError) {
        hasReportedRedisError = true;
        printRedisError(err, env.REDIS_URL);
      }
    });

    client.on('connect', () => {
      hasReportedRedisError = false;
      console.info('✅ [API Backend] Connected to Redis');
    });
  }
  return client;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedis();
  try {
    await redis.connect();
    await redis.ping();
    console.info('✅ [API Backend] Connected to Redis');
  } catch (err) {
    if (!hasReportedRedisError) {
      hasReportedRedisError = true;
      printRedisError(err, env.REDIS_URL);
    }
    throw err;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
