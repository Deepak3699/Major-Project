import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Account deletion must not mutate immutable audit rows via ON DELETE SET NULL.
  // The actor UUID remains as a historical reference even after the user row is removed.
  pgm.dropConstraint('audit_log', 'audit_log_user_id_fkey', { ifExists: true });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Restore the legacy relationship for environments that explicitly roll back.
  pgm.addConstraint(
    'audit_log',
    'audit_log_user_id_fkey',
    'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL NOT VALID',
  );
}
