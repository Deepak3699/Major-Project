/**
 * Cross-platform schema runner (Node/TS).
 *
 * Replaces or supplements `apply_schema.sh` on Windows or environments where
 * psql/bash is not available. Reads `database/schema` in dependency order:
 *   tables -> constraints -> functions -> triggers -> indexes
 * and executes each SQL file idempotently.
 */
import fs from 'fs';
import path from 'path';
import { getDB, closeDB } from '../utils/db';

async function main() {
  const sql = getDB();
  const baseDir = path.resolve(__dirname, '../../database/schema');
  const dirs = ['tables', 'constraints', 'functions', 'triggers', 'indexes'];

  console.info('🚀 Starting declarative schema application...');

  for (const dir of dirs) {
    const dirPath = path.join(baseDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.info(`\n==> schema/${dir} (${files.length} files)`);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const query = fs.readFileSync(filePath, 'utf8');
      try {
        await sql.unsafe(query);
        console.info(`  ✓ ${file}`);
      } catch (err: any) {
        console.error(`  ✗ Error in ${dir}/${file}:`, err.message);
        throw err;
      }
    }
  }

  console.info('\n✅ Schema applied successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Schema application failed:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDB();
  });
