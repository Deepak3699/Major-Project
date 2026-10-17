/**
 * Idempotent admin bootstrap.
 *
 * The app seeds no first user, so on a fresh install every account is a
 * `sales_rep` that RBAC filters to "assigned leads only" → the Leads page shows
 * nothing. This creates a single `admin` (sees all leads, manages API keys) from
 * ADMIN_EMAIL / ADMIN_PASSWORD, and no-ops if an admin already exists or the env
 * vars aren't set. Safe to run on every `up`.
 */
import { getDB, closeDB } from '../utils/db';
import { hashPassword } from '../utils/crypto';

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = (process.env.ADMIN_PASSWORD || '').trim();
  if (!email || !password) {
    console.info('ℹ️  ADMIN_EMAIL/ADMIN_PASSWORD not set — skipping admin bootstrap.');
    return;
  }
  if (password.length < 8) {
    console.error('❌ ADMIN_PASSWORD must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }
  const sql = getDB();
  const existing = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
  if (existing.length > 0) {
    console.info('ℹ️  An admin already exists — skipping bootstrap.');
    return;
  }
  const hash = await hashPassword(password);
  await sql`
    INSERT INTO users (email, password_hash, role, api_keys)
    VALUES (${email}, ${hash}, 'admin', '{}')
    ON CONFLICT (email) DO UPDATE SET role = 'admin'`;
  console.info(`✅ Bootstrap admin ready: ${email}`);
}

main()
  .catch((e) => { console.error('❌ admin bootstrap failed:', e); process.exitCode = 1; })
  .finally(() => { void closeDB(); });
