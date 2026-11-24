/**
 * Promote any user account to 'admin' role, or create a new admin.
 *
 * Usage:
 *   npm run make:admin
 *   npm run make:admin user@example.com
 *   npm run make:admin user@example.com my-secure-password
 */
import { getDB, closeDB } from '../utils/db';
import { hashPassword } from '../utils/crypto';
import { env } from '../utils/env';

async function main() {
  const targetEmail = String(process.argv[2] || env.BOOTSTRAP_ADMIN_EMAIL || env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.argv[3] || env.BOOTSTRAP_ADMIN_PASSWORD || env.ADMIN_PASSWORD || '').trim();

  if (!targetEmail) {
    console.error('❌ Please provide an email: npm run make:admin your-email@example.com');
    process.exitCode = 1;
    return;
  }

  const sql = getDB();
  console.info(`🔍 Checking user: ${targetEmail}...`);

  const existing = await sql`SELECT id, email, role FROM users WHERE email = ${targetEmail}`;

  if (existing.length > 0) {
    await sql`UPDATE users SET role = 'admin' WHERE email = ${targetEmail}`;
    console.info('\n' + '═'.repeat(60));
    console.info(`🎉 \x1b[1m\x1b[32mSUCCESS: "${targetEmail}" is now an ADMIN!\x1b[0m`);
    console.info('═'.repeat(60));
    console.info('👉 Sign in with the existing password for this account.\n');
  } else {
    if (!password || password.length < 8) {
      console.error('❌ A new admin needs a password of at least 8 characters (third argument or BOOTSTRAP_ADMIN_PASSWORD).');
      process.exitCode = 1;
      return;
    }
    const hash = await hashPassword(password);
    await sql`
      INSERT INTO users (email, password_hash, role, api_keys)
      VALUES (${targetEmail}, ${hash}, 'admin', '{}')
      ON CONFLICT (email) DO NOTHING`;
    console.info('\n' + '═'.repeat(60));
    console.info(`🎉 \x1b[1m\x1b[32mSUCCESS: New ADMIN user created!\x1b[0m`);
    console.info('═'.repeat(60));
    console.info(`  • Email:    \x1b[36m${targetEmail}\x1b[0m`);
    console.info('  • Role:     \x1b[32madmin\x1b[0m');
    console.info('👉 Sign in with the password you supplied.\n');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error setting admin role:', e.message || e);
  })
  .finally(() => {
    void closeDB();
  });
