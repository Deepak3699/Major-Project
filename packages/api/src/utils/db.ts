import postgres from 'postgres';
import { env } from './env';

let pool: postgres.Sql | null = null;

export function getDB(): postgres.Sql {
  if (!pool) {
    pool = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }
  return pool;
}

export async function connectDB(): Promise<void> {
  const sql = getDB();
  try {
    await sql`SELECT 1`;
    console.info('✅ Connected to PostgreSQL');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', err);
    throw err;
  }
}

export async function closeDB(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
