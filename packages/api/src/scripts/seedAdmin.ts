/**
 * Idempotent admin bootstrap.
 *
 * Creates the first administrator from BOOTSTRAP_ADMIN_EMAIL /
 * BOOTSTRAP_ADMIN_PASSWORD (ADMIN_* remain a documented legacy alias). There is
 * no hardcoded fallback credential, no existing account is promoted, and
 * re-running is safe: an existing admin is left untouched.
 *
 * Usage: npm run bootstrap:admin
 */
import { getDB, closeDB } from '../utils/db';
import { hashPassword } from '../utils/crypto';
import { env } from '../utils/env';

async function main() {
  const email = String(env.BOOTSTRAP_ADMIN_EMAIL || env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(env.BOOTSTRAP_ADMIN_PASSWORD || env.ADMIN_PASSWORD || '').trim();

  if (!email || !password) {
    console.info('ℹ️  BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set — skipping admin bootstrap.');
    return;
  }
  if (password.length < 8) {
    console.error('❌ BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const sql = getDB();
  const existing = await sql`SELECT id, role FROM users WHERE email = ${email} LIMIT 1`;
  if (existing.length > 0) {
    const role = String((existing[0] as any).role);
    if (role === 'admin') {
      console.info('ℹ️  Bootstrap admin already exists — leaving credentials unchanged.');
    } else {
      console.error(
        `❌ ${email} already exists with role "${role}". Refusing to promote silently. ` +
        'Use the protected operator command: npm run make:admin <email>',
      );
      process.exitCode = 1;
    }
    return;
  }

  const hash = await hashPassword(password);
  await sql`
    INSERT INTO users (email, password_hash, role, api_keys)
    VALUES (${email}, ${hash}, 'admin', '{}')
    ON CONFLICT (email) DO NOTHING`;
  console.info(`✅ Bootstrap admin ready: ${email}`);
}

main()
  .catch((e) => { console.error('❌ admin bootstrap failed:', e); process.exitCode = 1; })
  .finally(() => { void closeDB(); });
