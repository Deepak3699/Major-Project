import { getRedis } from './redis';
import { retry } from './httpClient';

type SSEEvent = {
  type: string;
  lead_id?: string;
  [key: string]: unknown;
};

export async function publishSSE(userId: string, event: SSEEvent): Promise<void> {
  const redis = getRedis();
  try {
      await retry(async () => {
        await redis.publish(`user:${userId}:sse`, JSON.stringify(event));
      }, { retries: 3, minTimeout: 200, maxTimeout: 2000, retryableErrors: ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SSE] Failed to publish event for user ${userId} after retries:`, msg);
  }
}
