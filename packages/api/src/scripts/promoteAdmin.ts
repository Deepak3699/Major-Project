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
  const targetEmail = (process.argv[2] || env.ADMIN_EMAIL || 'admin@example.com').trim();
  const password = (process.argv[3] || env.ADMIN_PASSWORD || 'change-me-please-32').trim();

  if (!targetEmail) {
    console.error('❌ Please provide an email: npm run make:admin your-email@example.com');
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
    console.info('👉 Ab aap browser (http://localhost:5173) par is email se login karein.');
    console.info('   Aapko saare leads, admin controls aur settings dikhenge.\n');
  } else {
    const hash = await hashPassword(password);
    await sql`
      INSERT INTO users (email, password_hash, role, api_keys)
      VALUES (${targetEmail}, ${hash}, 'admin', '{}')
      ON CONFLICT (email) DO UPDATE SET role = 'admin'`;
    console.info('\n' + '═'.repeat(60));
    console.info(`🎉 \x1b[1m\x1b[32mSUCCESS: New ADMIN user created!\x1b[0m`);
    console.info('═'.repeat(60));
    console.info(`  • Email:    \x1b[36m${targetEmail}\x1b[0m`);
    console.info(`  • Password: \x1b[36m${password}\x1b[0m`);
    console.info('  • Role:     \x1b[32madmin\x1b[0m');
    console.info('👉 Ab aap browser (http://localhost:5173) par login karein.\n');
  }
}

main()
  .catch((e) => {
    console.error('❌ Error setting admin role:', e.message || e);
  })
  .finally(() => {
    void closeDB();
  });
