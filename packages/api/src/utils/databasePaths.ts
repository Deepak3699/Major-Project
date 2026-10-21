import fs from 'node:fs';
import path from 'node:path';

/** Resolve the API package root from either tsx source or compiled dist output. */
export function resolveApiRoot(): string {
  const candidates = [
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..'),
    process.cwd(),
  ];
  const root = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'database', 'schema'))
      && fs.existsSync(path.join(candidate, 'database', 'migrations')),
  );
  if (!root) throw new Error('Could not locate the API database schema and migrations directory');
  return root;
}
