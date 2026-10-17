import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';
import { logAuditEvent } from '../utils/audit';
import { redactEmail, redactPhone } from '../utils/redact';

// Compliance self-service surfaces.
//
//   * POST/GET /optout?t=<token> — PUBLIC, unauthenticated. This is the target of
//     the one-click "unsubscribe" link in every outbound message. It accepts ONLY
//     an opaque, unguessable token we minted at send time (see outreach_tokens),
//     never a raw email/phone. Consequences:
//       - an anonymous caller cannot poison the blocklist for arbitrary addresses
//         (they can only honour an opt-out we already issued them),
//       - no personal contact ever appears in a URL, request log, Referer or
//         browser history.
//     This is RFC-8058 one-click, done safely.
//
//   * POST /erasure — ADMIN-only "right to erasure": tombstone-suppress the
//     person (so re-scraping can't re-open outreach) AND anonymise stored personal
//     data. Authenticated, so raw identifiers are acceptable here.

const erasureSchema = z
  .object({
    email: z.string().email().max(320).optional(),
    phone: z.string().min(6).max(32).optional(),
  })
  .refine((v) => !!v.email || !!v.phone, { message: 'Provide email or phone' });

const tokenSchema = z.object({ t: z.string().min(8).max(128) });

async function suppress(
  sql: ReturnType<typeof getDB>,
  contact: string,
  channel: 'email' | 'whatsapp',
): Promise<void> {
  const normalized = contact.trim().toLowerCase();
  await sql.unsafe(
    `INSERT INTO suppressions (normalized_contact, channel, reason, source)
     VALUES ($1, $2, 'opted_out', 'self_service')
     ON CONFLICT (normalized_contact, channel) DO UPDATE SET reason = 'opted_out'`,
    [normalized, channel],
  );
  // Flag every lead whose contact matches so in-flight work stops immediately.
  if (channel === 'email') {
    await sql.unsafe(
      `UPDATE leads SET do_not_contact = true, updated_at = NOW()
       WHERE hr_contact_id IN (SELECT id FROM hr_contacts WHERE lower(personal_email) = $1)`,
      [normalized],
    );
  } else {
    await sql.unsafe(
      `UPDATE leads SET do_not_contact = true, updated_at = NOW()
       WHERE hr_contact_id IN (SELECT id FROM hr_contacts WHERE personal_mobile = $1)`,
      [contact.trim()],
    );
  }
}

const UNSUB_HTML =
  '<!doctype html><meta charset="utf-8"><title>Unsubscribed</title>' +
  '<body style="font-family:system-ui;padding:40px"><h2>You have been unsubscribed</h2>' +
  '<p>You will no longer receive outreach from HireGen.</p></body>';

// A single, uniform "processed" response — never reveals whether a token was
// valid/known vs already-used, so it can't be probed as an oracle.
function unsubscribed(reply: any) {
  return reply.status(200).type('text/html').send(UNSUB_HTML);
}

export const complianceRoutes: FastifyPluginAsync = async (fastify) => {
  const optoutHandler = async (req: any, reply: any) => {
    const parsed = tokenSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).type('text/plain').send('Invalid unsubscribe link');
    }
    const token = parsed.data.t;
    const sql = getDB();

    // Resolve the contact from OUR token store. Unknown token -> generic success
    // (no oracle); but we do NOT suppress anything we didn't issue a token for.
    const rows = await sql.unsafe(
      `SELECT normalized_contact, channel FROM outreach_tokens WHERE token = $1 LIMIT 1`,
      [token],
    );
    const rec = Array.isArray(rows) ? rows[0] : undefined;
    if (!rec) {
      return unsubscribed(reply); // idempotent + non-revealing
    }

    const channel = (rec.channel === 'whatsapp' ? 'whatsapp' : 'email') as 'email' | 'whatsapp';
    await suppress(sql, rec.normalized_contact, channel);
    // Invalidate the token so a forwarded link can't be replayed to flip state
    // again (it's idempotent anyway, but this keeps the roster honest).
    await sql.unsafe(`DELETE FROM outreach_tokens WHERE token = $1`, [token]);

    await logAuditEvent({
      user_id: null,
      action: 'self_service_optout',
      resource_type: 'suppression',
      resource_id: null,
      // REDACTED identity only — the audit log must not leak PII either
      details: {
        contact: channel === 'email' ? redactEmail(rec.normalized_contact) : redactPhone(rec.normalized_contact),
        channel,
      },
    });

    return unsubscribed(reply);
  };

  const rlConfig = {
    // tighten the global limiter for this unauthenticated endpoint
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } } as Record<string, unknown>,
  };
  fastify.post('/optout', rlConfig, optoutHandler);
  fastify.get('/optout', rlConfig, optoutHandler);

  // ---- Admin right-to-erasure (tombstone + anonymise) ----
  fastify.post(
    '/erasure',
    { preValidation: [authenticate, authorize(['admin'])] },
    async (req, reply) => {
      const parsed = erasureSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Provide email or phone' });
      }
      const { email, phone } = parsed.data;
      const sql = getDB();

      if (email) await suppress(sql, email, 'email');
      if (phone) await suppress(sql, phone, 'whatsapp');

      // Anonymise stored personal data (keep the row for referential integrity +
      // suppression match, but drop identifying values).
      const where: string[] = [];
      const vals: string[] = [];
      if (email) {
        vals.push(email.trim().toLowerCase());
        where.push(`lower(personal_email) = $${vals.length}`);
      }
      if (phone) {
        vals.push(phone.trim());
        where.push(`personal_mobile = $${vals.length}`);
      }
      const erased = await sql.unsafe(
        `UPDATE hr_contacts
           SET full_name = NULL, personal_email = NULL, personal_mobile = NULL,
               linkedin_url = NULL, current_company_id = NULL,
               contact_source = 'erased', contact_method = NULL, contact_url = NULL,
               extraction_provenance = jsonb_build_object('erased_at', now()::text),
               confidence_score = 0, updated_at = NOW()
         WHERE ${where.join(' OR ')}
        RETURNING id`,
        vals,
      );

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'right_to_erasure',
        resource_type: 'hr_contact',
        resource_id: null,
        details: { erased_contacts: Array.isArray(erased) ? erased.length : 0 },
      });

      return reply.send({
        status: 'ok',
        erased_contacts: Array.isArray(erased) ? erased.length : 0,
      });
    },
  );
};
