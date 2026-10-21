/**
 * Unified, resilient database initializer for Take It.
 *
 * Automatically:
 * 1. Validates connection to PostgreSQL (with beginner-friendly error messages if down).
 * 2. Applies the base declarative schema (tables, constraints, functions, triggers, indexes).
 * 3. Applies forward migrations via node-pg-migrate using the active DATABASE_URL.
 * 4. Seeds the initial admin account (admin@example.com / change-me-please-32).
 */
import fs from 'fs';
import path from 'node:path';
import { getDB, closeDB } from '../utils/db';
import { env } from '../utils/env';
import { hashPassword } from '../utils/crypto';
import { printDatabaseError } from '../utils/friendlyErrors';
import { resolveApiRoot } from '../utils/databasePaths';
// @ts-ignore - node-pg-migrate default export
import runner from 'node-pg-migrate';

async function main() {
  console.info('\n' + '═'.repeat(68));
  console.info('🛠️  \x1b[1m\x1b[36mTake It — Database Initialization\x1b[0m');
  console.info('═'.repeat(68));

  // Step 1: Test Connection
  console.info('🔍 Step 1/4: Checking database connection...');
  const sql = getDB();
  try {
    const res = await sql`SELECT current_database() as db, version() as ver`;
    console.info(`   ✅ Connected to database: \x1b[32m${res[0].db}\x1b[0m`);
  } catch (err: any) {
    printDatabaseError(err, env.DATABASE_URL);
    process.exit(1);
  }

  // Step 2: Apply Declarative Base Schema
  console.info('\n📋 Step 2/4: Applying base database schema...');
  const apiRoot = resolveApiRoot();
  const baseDir = path.join(apiRoot, 'database', 'schema');
  const dirs = ['tables', 'constraints', 'functions', 'triggers', 'indexes'];

  for (const dir of dirs) {
    const dirPath = path.join(baseDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const query = fs.readFileSync(filePath, 'utf8');
      try {
        await sql.unsafe(query);
      } catch (err: any) {
        console.error(`   ❌ Error in ${dir}/${file}:`, err.message);
        throw err;
      }
    }
    console.info(`   ✓ schema/${dir} (${files.length} definitions applied)`);
  }
  console.info('   ✅ Base schema is ready and up to date.');

  // Step 3: Run Migrations
  console.info('\n🔄 Step 3/4: Running database migrations...');
  try {
    // node-pg-migrate resolves TypeScript migrations relative to the process
    // working directory, so normalize it even when this script runs from dist.
    process.chdir(apiRoot);
    const migrationsDir = path.join(apiRoot, 'database', 'migrations');
    await runner({
      databaseUrl: env.DATABASE_URL,
      dir: migrationsDir,
      direction: 'up',
      migrationsTable: 'pgmigrations',
      ignorePattern: 'README.md',
      count: Infinity,
      log: (msg: string) => {
        if (!msg.includes('No migrations') && !msg.includes('Nothing to do')) {
          console.info(`   ${msg}`);
        }
      },
    });
    console.info('   ✅ Migrations completed successfully.');
  } catch (err: any) {
    console.error('   ❌ Database migrations failed:', err.message || err);
    throw err;
  }

  // Step 4: Bootstrap Admin Account
  console.info('\n👤 Step 4/4: Setting up admin account...');
  const email = (env.ADMIN_EMAIL || 'admin@example.com').trim();
  const password = (env.ADMIN_PASSWORD || 'change-me-please-32').trim();

  try {
    const existing = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
    if (existing.length > 0) {
      console.info(`   ℹ️  Admin user already exists in database.`);
    } else {
      const hash = await hashPassword(password);
      await sql`
        INSERT INTO users (email, password_hash, role, api_keys)
        VALUES (${email}, ${hash}, 'admin', '{}')
        ON CONFLICT (email) DO UPDATE SET role = 'admin'`;
      console.info(`   ✅ Created admin account: \x1b[32m${email}\x1b[0m`);
    }
  } catch (err: any) {
    console.error('   ❌ Could not seed admin account:', err.message);
    throw err;
  }

  // Final Success Banner
  console.info('\n' + '═'.repeat(68));
  console.info('🎉 \x1b[1m\x1b[32mDATABASE READY TO USE!\x1b[0m');
  console.info('═'.repeat(68));
  console.info('  • \x1b[1mAdmin Login:\x1b[0m  ' + email);
  console.info('  • \x1b[1mPassword:\x1b[0m     configured in the local .env file');
  console.info('\n  \x1b[1m\x1b[36m👉 Next Step:\x1b[0m Run the backend API:');
  console.info('     \x1b[33mnpm run dev\x1b[0m (in packages/api)');
  console.info('═'.repeat(68) + '\n');
}

main()
  .catch((e) => {
    printDatabaseError(e, env.DATABASE_URL);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDB();
  });
