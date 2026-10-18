import postgres from 'postgres';
import { env } from './env';
import { printDatabaseError } from './friendlyErrors';

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
    console.info('✅ [API Backend] Connected to PostgreSQL (leads_db)');
  } catch (err) {
    printDatabaseError(err, env.DATABASE_URL);
    throw err;
  }
}

export async function closeDB(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
