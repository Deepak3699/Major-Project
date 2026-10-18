import { EventEmitter } from 'events';
import IORedis from 'ioredis';
import { env } from './env';
import { printRedisError } from './friendlyErrors';

let client: any = null;
let isUsingMemoryFallback = false;
let hasReportedRedisError = false;

/**
 * High-performance In-Memory Mock Redis.
 * Allows local development and testing without needing Redis server installed.
 */
class MemoryRedis extends EventEmitter {
  private kv = new Map<string, { value: string; expires?: number }>();
  private lists = new Map<string, string[]>();
  public status = 'ready';

  private static globalBus = new EventEmitter();

  async ping(): Promise<string> {
    return 'PONG';
  }

  async connect(): Promise<void> {
    this.status = 'ready';
    this.emit('connect');
  }

  async get(key: string): Promise<string | null> {
    const item = this.kv.get(key);
    if (!item) return null;
    if (item.expires && item.expires < Date.now()) {
      this.kv.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ...args: any[]): Promise<string> {
    let expires: number | undefined;
    if (args[0] === 'EX' && typeof args[1] === 'number') {
      expires = Date.now() + args[1] * 1000;
    } else if (args[0] === 'PX' && typeof args[1] === 'number') {
      expires = Date.now() + args[1];
    }
    this.kv.set(key, { value: String(value), expires });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<string> {
    this.kv.set(key, { value: String(value), expires: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.kv.delete(k) || this.lists.delete(k)) count++;
    }
    return count;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) || [];
    list.unshift(...values);
    this.lists.set(key, list);
    return list.length;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const list = this.lists.get(key) || [];
    list.push(...values);
    this.lists.set(key, list);
    return list.length;
  }

  async rpop(key: string): Promise<string | null> {
    const list = this.lists.get(key) || [];
    return list.pop() || null;
  }

  async lpop(key: string): Promise<string | null> {
    const list = this.lists.get(key) || [];
    return list.shift() || null;
  }

  async llen(key: string): Promise<number> {
    const list = this.lists.get(key) || [];
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key) || [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async publish(channel: string, message: string): Promise<number> {
    MemoryRedis.globalBus.emit(channel, message);
    return 1;
  }

  async subscribe(...channels: string[]): Promise<number> {
    for (const ch of channels) {
      MemoryRedis.globalBus.on(ch, (msg: string) => {
        this.emit('message', ch, msg);
      });
    }
    return channels.length;
  }

  duplicate(): MemoryRedis {
    return new MemoryRedis();
  }

  async quit(): Promise<string> {
    this.status = 'end';
    return 'OK';
  }

  async disconnect(): Promise<void> {
    this.status = 'end';
  }
}

export function getRedis(): IORedis {
  if (!client) {
    if (env.REDIS_URL === 'memory' || isUsingMemoryFallback) {
      isUsingMemoryFallback = true;
      client = new MemoryRedis() as unknown as IORedis;
      return client;
    }

    client = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 2) return null;
        return Math.min(times * 100, 500);
      },
    });

    client.on('error', (err: Error) => {
      if (!isUsingMemoryFallback && !hasReportedRedisError) {
        hasReportedRedisError = true;
        console.warn('\n\x1b[33m⚠️  [Redis] Real Redis server connect nahi ho saka. Switching to In-Memory Demo Redis...\x1b[0m');
        switchToMemoryFallback();
      }
    });

    client.on('connect', () => {
      hasReportedRedisError = false;
      console.info('✅ [API Backend] Connected to Redis server');
    });
  }
  return client;
}

function switchToMemoryFallback(): IORedis {
  isUsingMemoryFallback = true;
  if (client && typeof client.disconnect === 'function') {
    try {
      client.disconnect();
    } catch {}
  }
  client = new MemoryRedis() as unknown as IORedis;
  console.info('💡 \x1b[32m[API Backend] In-Memory Demo Redis active! (Bina kisi external install ke sab chalega)\x1b[0m\n');
  return client;
}

export async function connectRedis(): Promise<void> {
  if (env.REDIS_URL === 'memory') {
    switchToMemoryFallback();
    return;
  }

  try {
    const redis = getRedis();
    if (isUsingMemoryFallback) return;
    await redis.connect();
    await redis.ping();
    console.info('✅ [API Backend] Connected to Redis');
  } catch (err) {
    console.warn('\n\x1b[33m⚠️  [Redis] Real Redis server se connection nahi ho saka.\x1b[0m');
    console.warn('💡 \x1b[32m[Redis] Development ke liye In-Memory Demo Redis activate kar diya gaya hai.\x1b[0m\n');
    switchToMemoryFallback();
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
