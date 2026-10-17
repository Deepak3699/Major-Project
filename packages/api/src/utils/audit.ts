import { getDB } from './db';

interface AuditEvent {
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  details?: Record<string, unknown> | null;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const sql = getDB();
  await sql.unsafe(
    `INSERT INTO audit_log (user_id, action, resource_type, resource_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      event.user_id,
      event.action,
      event.resource_type,
      event.resource_id || null,
      event.details ? JSON.stringify(event.details) : null,
    ],
  );
}
