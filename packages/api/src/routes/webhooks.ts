import { FastifyPluginAsync } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { env } from '../utils/env';
import { logAuditEvent } from '../utils/audit';
import { publishSSE } from '../utils/sse';
import { redactEmail, redactPhone } from '../utils/redact';

// Verifies a svix-style signature header (Resend webhooks) or Meta X-Hub-Signature-256
// against the raw request body. Rejects the request when a secret is configured but
// the signature does not match; allows all traffic when no secret is configured (dev).
export function verifySignature(
  secret: string | undefined,
  headers: Record<string, string | string[] | undefined>,
  rawBody: string,
  scheme: 'svix' | 'meta',
): boolean {
  if (!secret) {
    // Fail CLOSED whenever the secret is missing, regardless of NODE_ENV: an
    // unconfigured webhook secret must never become a "trust anything" hole (an
    // attacker could forge bounce/complaint events and poison the blocklist).
    // Local dev/test opts in EXPLICITLY via ALLOW_UNSIGNED_WEBHOOKS=true.
    return process.env.ALLOW_UNSIGNED_WEBHOOKS === 'true';
  }
  const headerNames: Record<typeof scheme, { sig: string; id?: string; ts?: string }> = {
    svix: { sig: 'svix-signature', id: 'svix-id', ts: 'svix-timestamp' },
    meta: { sig: 'x-hub-signature-256' },
  };
  const names = headerNames[scheme];
  const rawSig = headers[names.sig];
  if (!rawSig) return false;
  const sig = Array.isArray(rawSig) ? rawSig[0] : rawSig;

  if (scheme === 'svix') {
    const id = headers['svix-id'];
    const tsRaw = headers['svix-timestamp'];
    const ts = typeof tsRaw === 'string' ? Number(tsRaw) : NaN;
    if (!id || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const expected = createHmac('sha256', key)
      .update(`${id}.${ts}.${rawBody}`)
      .digest('base64');
    return sig.split(' ').some((part) => {
      const [version, digest] = part.split(',');
      if (version !== 'v1' || !digest) return false;
      const a = Buffer.from(digest);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
  }

  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const resendWebhookSchema = z.object({
  type: z.string(),
  data: z.record(z.unknown()),
});

const whatsappWebhookSchema = z.object({
  entry: z.array(z.record(z.unknown())).optional(),
  object: z.string().optional(),
  message: z.record(z.unknown()).optional(),
});

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Backend -> frontend: provider delivery events change lead state outside
  // any user session, so the owning rep's UI would go stale. Notify each
  // affected lead's assignee (nothing for unassigned). publishSSE never
  // throws, so this is safe inline in webhook handlers.
  async function notifyOwners(leadIds: Array<string | null | undefined>) {
    const ids = [...new Set((leadIds || []).filter(Boolean))] as string[];
    if (ids.length === 0) return;
    const sql = getDB();
    const rows = await sql.unsafe(
      `SELECT id, assigned_to FROM leads WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    for (const r of rows as unknown as Array<{ id: string; assigned_to: string | null }>) {
      if (r.assigned_to) {
        await publishSSE(r.assigned_to, { type: 'lead_updated', lead_id: r.id });
      }
    }
  }

  async function leadIdsForMessage(messageId: string): Promise<string[]> {
    const sql = getDB();
    const rows = await sql.unsafe(
      `SELECT lead_id FROM outreach_log WHERE provider_message_id = $1`,
      [messageId],
    );
    return (rows as unknown as Array<{ lead_id: string }>).map((r) => r.lead_id);
  }

  async function leadIdsForEmail(email: string): Promise<string[]> {
    const sql = getDB();
    const rows = await sql.unsafe(
      `SELECT l.id FROM leads l
        JOIN hr_contacts hc ON l.hr_contact_id = hc.id
       WHERE lower(hc.personal_email) = lower($1)`,
      [String(email || '').trim()],
    );
    return (rows as unknown as Array<{ id: string }>).map((r) => r.id);
  }
  // Keep the exact raw body around so webhook signatures can be verified.
  // Scoped to this plugin (only webhook routes), so other routes keep their parser.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    (req as unknown as { rawBody?: string }).rawBody = body as string;
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  fastify.post('/resend', async (req, reply) => {
    const rawBody =
      (req as unknown as { rawBody?: string }).rawBody || JSON.stringify(req.body);
    if (!verifySignature(env.RESEND_WEBHOOK_SECRET, req.headers, rawBody, 'svix')) {
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }
    const parseResult = resendWebhookSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid webhook payload' });
    }
    const { type, data } = parseResult.data;
    const sql = getDB();

    if (type === 'email.sent' || type === 'email.delivered') {
      const messageId = data.message_id as string;

      await sql.unsafe(
        `UPDATE outreach_log
         SET delivery_status = 'delivered'
         WHERE provider_message_id = $1`,
        [messageId],
      );

      await sql.unsafe(
        `UPDATE leads SET pipeline_stage = 'contacted'
         WHERE id = (SELECT lead_id FROM outreach_log WHERE provider_message_id = $1 LIMIT 1)`,
        [messageId],
      );
      await notifyOwners(await leadIdsForMessage(messageId));
    }

    if (type === 'email.bounced') {
      const recipient = data.recipient as string;
      const messageId = data.message_id as string;

      await sql.unsafe(
        `UPDATE outreach_log
         SET delivery_status = 'bounced'
         WHERE provider_message_id = $1`,
        [messageId],
      );

      await sql.unsafe(
        `UPDATE leads SET pipeline_stage = 'bounced', do_not_contact = true
         WHERE id = (SELECT lead_id FROM outreach_log WHERE provider_message_id = $1 LIMIT 1)`,
        [messageId],
      );

      // Suppress the actual recipient across ALL leads (contact-level opt-out),
      // not just this one lead — a bounced address must never be re-messaged.
      if (recipient) {
        await sql.unsafe(
          `INSERT INTO suppressions (normalized_contact, channel, reason, source)
           VALUES (lower($1), 'email', 'bounced', 'webhook')
           ON CONFLICT (normalized_contact, channel) DO NOTHING`,
          [String(recipient).trim().toLowerCase()],
        );
      }

      await logAuditEvent({
        user_id: null,
        action: 'email_bounced',
        resource_type: 'lead',
        resource_id: null,
        details: { recipient: redactEmail(recipient), message_id: messageId },
      });
      await notifyOwners(await leadIdsForMessage(messageId));
    }

    if (type === 'email.complained') {
      const recipient = data.recipient as string;
      // leads has no email column — complaints must resolve through the HR contact email
      await sql.unsafe(
        `UPDATE leads SET pipeline_stage = 'bounced', do_not_contact = true
         WHERE id = (
           SELECT l.id FROM leads l
           JOIN hr_contacts hc ON l.hr_contact_id = hc.id
           WHERE hc.personal_email = $1
           LIMIT 1
         )`,
        [recipient],
      );

      // A spam complaint = explicit opt-out. Suppress this contact channel-wide
      // so no future outreach reaches them (GDPR/DPDP + CAN-SPAM obligation).
      if (recipient) {
        await sql.unsafe(
          `INSERT INTO suppressions (normalized_contact, channel, reason, source)
           VALUES (lower($1), 'email', 'opted_out', 'webhook')
           ON CONFLICT (normalized_contact, channel) DO NOTHING`,
          [String(recipient).trim().toLowerCase()],
        );
        await sql.unsafe(
          `UPDATE leads SET do_not_contact = true, pipeline_stage = 'suppressed'
           WHERE id IN (
             SELECT l.id FROM leads l
             JOIN hr_contacts hc ON l.hr_contact_id = hc.id
             WHERE lower(hc.personal_email) = lower($1)
           )`,
          [recipient],
        );
      }

      await logAuditEvent({
        user_id: null,
        action: 'email_complaint',
        resource_type: 'lead',
        resource_id: null,
        details: { recipient: redactEmail(recipient) },
      });
      await notifyOwners(await leadIdsForEmail(recipient));
    }

    if (type === 'email.replied' || type === 'email.reply') {
      const recipient = data.recipient as string;
      const messageId = data.message_id as string;

      await sql.unsafe(
        `UPDATE outreach_log
         SET delivery_status = 'replied'
         WHERE provider_message_id = $1`,
        [messageId],
      );

      await sql.unsafe(
        `UPDATE leads SET pipeline_stage = 'replied'
         WHERE id = (SELECT lead_id FROM outreach_log WHERE provider_message_id = $1 LIMIT 1)`,
        [messageId],
      );

      await logAuditEvent({
        user_id: null,
        action: 'email_reply_received',
        resource_type: 'lead',
        resource_id: null,
        details: { recipient: redactEmail(recipient), message_id: messageId },
      });
      await notifyOwners(await leadIdsForMessage(messageId));
    }

    return { status: 'ok' };
  });

  fastify.post('/whatsapp', async (req, reply) => {
    const rawBody =
      (req as unknown as { rawBody?: string }).rawBody || JSON.stringify(req.body);
    if (!verifySignature(env.WHATSAPP_APP_SECRET, req.headers, rawBody, 'meta')) {
      return reply.status(401).send({ error: 'Invalid webhook signature' });
    }
    const parseResult = whatsappWebhookSchema.safeParse(req.body);
    if (!parseResult.success) {
      return { status: 'ok' };
    }
    const sql = getDB();

    const body = parseResult.data as any;

    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        const changes = (entry as any).changes;
        if (changes && Array.isArray(changes)) {
          for (const change of changes) {
            const value = change?.value;
            if (value?.messages && Array.isArray(value.messages)) {
              for (const msg of value.messages) {
                const from = msg.from as string;
                const msgBody = msg.text?.body as string;

                const leadResult = await sql.unsafe(
                  `SELECT l.id FROM leads l
                   LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
                   LEFT JOIN companies c ON l.company_id = c.id
                   WHERE hc.personal_mobile = $1 OR c.default_phone = $1
                   LIMIT 1`,
                  [from],
                );

                if (leadResult && leadResult.length > 0) {
                  // STOP / OPT-OUT keywords become a global suppression (server-side).
                  if (/^\s*(stop|unsubscribe|opt.?out|do not (contact|message|text)|dnd)\b/i.test(msgBody || '')) {
                    const normalized = String(from).trim().toLowerCase();
                    await sql.unsafe(
                      `INSERT INTO suppressions (normalized_contact, channel, reason, source)
                       VALUES ($1, 'whatsapp', 'opted_out', 'whatsapp_webhook')
                       ON CONFLICT (normalized_contact, channel) DO NOTHING`,
                      [normalized],
                    );
                    await sql.unsafe(
                      `UPDATE leads SET do_not_contact = true, pipeline_stage = 'suppressed', updated_at = NOW() WHERE id = $1`,
                      [(leadResult as any[])[0].id],
                    );
                  } else {
                    await sql.unsafe(
                      `UPDATE leads SET pipeline_stage = 'replied', updated_at = NOW()
                       WHERE id = $1`,
                      [(leadResult as any[])[0].id],
                    );
                  }
                  await notifyOwners([(leadResult as any[])[0].id]);
                }

                await logAuditEvent({
                  user_id: null,
                  action: 'whatsapp_message_received',
                  resource_type: 'lead',
                  resource_id: leadResult?.[0]?.id || null,
                  details: { from: redactPhone(from), message_length: (msgBody || '').length },
                });
              }
            }
          }
        }
      }
    }

    return { status: 'ok' };
  });
};
