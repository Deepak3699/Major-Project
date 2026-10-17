import { FastifyPluginAsync } from 'fastify';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { getRedis } from '../utils/redis';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/auth';
import { encryptApiKeys, decryptApiKeys, maskApiKeys } from '../utils/crypto';
import { logAuditEvent } from '../utils/audit';

const triggerRunSchema = z.object({
  sources: z.array(z.string()).optional(),
});

const settingsSchema = z.object({
  api_keys: z.object({
    snovio: z.string().optional(),
    contactout: z.string().optional(),
    resend: z.string().optional(),
    brevo: z.string().optional(),
    gemini: z.string().optional(),
    whatsapp: z.string().optional(),
  }).optional(),
  scraper_config: z.object({
    max_concurrency: z.number().min(1).optional(),
    timeout_seconds: z.number().min(1).optional(),
  }).optional(),
  scoring_weights: z.record(z.number().min(0).max(100)).optional(),
  cron_schedule: z.string().min(1).optional(),
  sources_enabled: z.record(z.boolean()).optional(),
});

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  fastify.post(
    '/runs/trigger',
    { preValidation: [authorize(['admin'])] },
    async (req, reply) => {
      const parseResult = triggerRunSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const { sources } = parseResult.data;

      const redis = getRedis();
      const runId = randomUUID();
      await redis.lpush(
        'scrape_queue:requests',
        JSON.stringify({
          run_id: runId,
          run_type: 'manual',
          sources: sources || null,
          triggered_by: (req.user as { id: string }).id,
          triggered_at: new Date().toISOString(),
        }),
      );

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'trigger_run',
        resource_type: 'scrape_run',
        resource_id: runId,
        details: { sources },
      });

      return reply.status(202).send({
        message: 'Scrape run triggered',
        job_id: runId,
        sources: sources || 'all',
      });
    },
  );

  fastify.post(
    '/runs/army',
    { preValidation: [authorize(['admin'])] },
    async (req, reply) => {
      // One-click army run: scrape every source AND immediately re-enrich any
      // lead still missing a contact. The Python workers own the queue + sweep;
      // this endpoint just authenticates and forwards, so the browser never
      // talks to the internal worker service directly.
      const parseResult = triggerRunSchema.safeParse(req.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body' });
      }
      const workersUrl = process.env.WORKERS_URL || 'http://workers:8000';
      const triggeredBy = (req.user as { id: string }).id;
      try {
        const res = await fetch(`${workersUrl}/army/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sources: parseResult.data.sources || null, triggered_by: triggeredBy }),
        });
        const data = await res.json();
        await logAuditEvent({
          user_id: triggeredBy,
          action: 'trigger_army',
          resource_type: 'scrape_run',
          resource_id: (data as any)?.run_id || 'army',
          details: { sweep_reenqueued: (data as any)?.sweep_reenqueued },
        });
        return reply.status(res.ok ? 202 : 502).send(data);
      } catch (err) {
        return reply.status(502).send({ error: 'Worker army trigger unreachable', detail: (err as Error).message });
      }
    },
  );

  fastify.get(
    '/army/status',
    { preValidation: [authorize(['admin', 'sales_rep'])] },
    async (_req, reply) => {
      const workersUrl = process.env.WORKERS_URL || 'http://workers:8000';
      try {
        const res = await fetch(`${workersUrl}/army/status`, { method: 'GET' });
        return reply.send(await res.json());
      } catch (err) {
        return reply.status(502).send({ error: 'Worker status unreachable', detail: (err as Error).message });
      }
    },
  );

  fastify.get('/runs/:id', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const parseResult = paramsSchema.safeParse(req.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid run ID' });
    }
    const { id } = parseResult.data;
    const sql = getDB();

    const run = await sql.unsafe(
      `SELECT * FROM scrape_runs WHERE id = $1`,
      [id],
    );

    if (!run || run.length === 0) {
      return reply.status(404).send({ error: 'Run not found' });
    }

    return { run: run[0] };
  });

  const runsListSchema = z.object({
    limit: z.coerce.number().min(1).max(100).default(10),
  });

  fastify.get('/runs', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parseResult = runsListSchema.safeParse(req.query);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid query parameters', details: parseResult.error.issues });
    }
    const { limit } = parseResult.data;
    const sql = getDB();

    const runs = await sql.unsafe(
      `SELECT id, started_at, finished_at, sources_attempted, sources_succeeded,
              sources_circuit_broken, leads_found, leads_deduped, errors
       FROM scrape_runs
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit],
    );

    return { runs };
  });

  fastify.put(
    '/settings/api-keys',
    { preValidation: [authorize(['admin'])] },
    async (req, reply) => {
      const parseResult = settingsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'Invalid body', details: parseResult.error.issues });
      }
      const { api_keys } = parseResult.data;

      const sql = getDB();
      const encryptedKeys = api_keys
        ? encryptApiKeys({
            snovio: api_keys.snovio,
            contactout: api_keys.contactout,
            resend: api_keys.resend,
            brevo: api_keys.brevo,
            gemini: api_keys.gemini,
            whatsapp: api_keys.whatsapp,
          })
        : {};

      await sql.unsafe(
        `UPDATE users SET api_keys = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(encryptedKeys), (req.user as { id: string }).id],
      );

      await logAuditEvent({
        user_id: (req.user as { id: string }).id,
        action: 'update_api_keys',
        resource_type: 'user',
        resource_id: (req.user as { id: string }).id,
      });

      return { message: 'API keys updated' };
    },
  );

  // ---- Provider status (rep-safe): which paid/sending/AI providers are
  // configured, as booleans ONLY. No secrets, no masked tails — safe for
  // sales_rep so the UI can badge choices and warn before spending/queueing.
  fastify.get('/providers/status', { preValidation: [authorize(['admin', 'sales_rep'])] }, async (req, _reply) => {
    const sql = getDB();
    let userKeys: Record<string, unknown> = {};
    try {
      const rows = await sql.unsafe(`SELECT api_keys FROM users WHERE id = $1`, [
        (req.user as { id: string }).id,
      ]);
      const raw = (rows as unknown as Array<{ api_keys: unknown }>)[0]?.api_keys;
      userKeys = (typeof raw === 'string' ? JSON.parse(raw) : raw || {}) as Record<string, unknown>;
    } catch { /* no keys readable -> all false unless env provides */ }
    const hasKey = (userKey: string, ...envs: string[]) =>
      Boolean(userKeys[userKey]) || envs.some((e) => Boolean(process.env[e]));
    return {
      enrichment: {
        contactout: hasKey('contactout', 'CONTACT_OUT_API_KEY'),
        snovio: hasKey('snovio', 'SNOVIO_API_KEY'),
        hunter: hasKey('hunter', 'HUNTER_API_KEY'),
        apollo: hasKey('apollo', 'apollo_io', 'APOLLO_API_KEY'),
        lusha: hasKey('lusha', 'LUSHA_API_KEY'),
        rocketreach: hasKey('rocketreach', 'ROCKETREACH_API_KEY'),
        prospeo: hasKey('prospeo', 'PROSPEO_API_KEY'),
        findymail: hasKey('findymail', 'FINDYMAIL_API_KEY'),
      },
      sending: {
        email: hasKey('resend', 'RESEND_API_KEY') || hasKey('brevo', 'BREVO_API_KEY'),
        whatsapp: hasKey('whatsapp', 'WHATSAPP_WEB_URL'),
      },
      ai: { gemini: hasKey('gemini', 'GEMINI_API_KEY') },
    };
  });

  fastify.get('/sources/health', { preValidation: [authorize(['admin'])] }, async (_req, _reply) => {
    const sql = getDB();
    const health = await sql.unsafe(`
      SELECT source_name, consecutive_failures, circuit_open_until, last_success_at, last_failure_reason
      FROM source_health
      ORDER BY source_name
    `);

    return { sources: health };
  });

  fastify.get('/users', { preValidation: [authorize(['admin'])] }, async (_req, _reply) => {
    const sql = getDB();
    const users = await sql.unsafe(`
      SELECT id, email, role, created_at
      FROM users
      ORDER BY email ASC
    `);

    return { users };
  });

  fastify.get('/settings/api-keys', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const sql = getDB();
    const result = await sql.unsafe(
      `SELECT api_keys FROM users WHERE id = $1`,
      [(req.user as { id: string }).id],
    );

    if (!result || result.length === 0) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // SECURITY: never return decrypted provider secrets to the client. Report
    // only a masked view (last-4) so the UI can show state without exfiltrating
    // credentials. decryptApiKeys stays used elsewhere for server-side calls.
    void decryptApiKeys;
    let masked: Record<string, string> = {};
    if (result[0]?.api_keys) {
      const parsedKeys =
        typeof result[0].api_keys === 'string'
          ? JSON.parse(result[0].api_keys)
          : result[0].api_keys;
      masked = maskApiKeys(parsedKeys);
    }

    return { api_keys: masked };
  });

  fastify.get('/settings/:key', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const sql = getDB();
    const key = (req.params as { key: string }).key;
    const result = await sql.unsafe(
      `SELECT value FROM settings WHERE key = $1`,
      [key],
    );

    if (!result || result.length === 0) {
      return { key, value: null };
    }

    return { key, value: result?.[0]?.value ?? null };
  });

  fastify.put('/settings', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parseResult = settingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid body', details: parseResult.error.issues });
    }
    const settings = parseResult.data;
    const sql = getDB();

    await logAuditEvent({
      user_id: (req.user as { id: string }).id,
      action: 'update_settings',
      resource_type: 'settings',
      resource_id: '',
    });

    const results: Record<string, any> = {};
    for (const [key, value] of Object.entries(settings)) {
      await sql.unsafe(
        `INSERT INTO settings (key, value, updated_by, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [key, JSON.stringify(value), (req.user as { id: string }).id],
      );
      results[key] = value;
    }

    return { message: 'Settings updated', updated: results };
  });

  // ---- Suppression / do-not-contact list (server-side, non-negotiable) -----
  // Admins manage the global blocklist here; the send worker + webhook opt-outs
  // both write to it, and outreach is blocked whenever a contact matches.
  const suppressionSchema = z.object({
    contact: z.string().min(1),
    channel: z.enum(['email', 'whatsapp', 'any']).default('any'),
    reason: z.enum(['opted_out', 'bounced', 'blocked', 'provider_rejected', 'compliance_hold', 'manual']).default('manual'),
  });

  fastify.get('/suppressions', { preValidation: [authorize(['admin'])] }, async (_req, reply) => {
    const sql = getDB();
    const rows = await sql.unsafe(
      `SELECT id, normalized_contact, channel, reason, source, created_at
       FROM suppressions ORDER BY created_at DESC LIMIT 1000`,
    );
    return reply.send({ suppressions: rows });
  });

  fastify.post('/suppressions', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parsed = suppressionSchema.safeParse(req.body || {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid body', details: parsed.error.issues });
    const { contact, channel, reason } = parsed.data;
    const normalized = String(contact).trim().toLowerCase();
    const sql = getDB();
    await sql.unsafe(
      `INSERT INTO suppressions (normalized_contact, channel, reason, source)
       VALUES ($1, $2, $3, 'manual')
       ON CONFLICT (normalized_contact, channel) DO UPDATE SET reason = EXCLUDED.reason`,
      [normalized, channel, reason],
    );
    // Also flag matching leads do_not_contact so in-flight leads stop immediately.
    // ponytail: two targeted UPDATEs (email + phone) instead of one generic join.
    if (channel === 'email' || channel === 'any') {
      await sql.unsafe(
        `UPDATE leads SET do_not_contact = true, updated_at = NOW()
         WHERE id IN (SELECT l.id FROM leads l JOIN hr_contacts hc ON l.hr_contact_id = hc.id
                      WHERE lower(hc.personal_email) = $1)`,
        [normalized],
      );
    }
    if (channel === 'whatsapp' || channel === 'any') {
      await sql.unsafe(
        `UPDATE leads SET do_not_contact = true, updated_at = NOW()
         WHERE id IN (SELECT l.id FROM leads l JOIN hr_contacts hc ON l.hr_contact_id = hc.id
                      WHERE regexp_replace(lower(hc.personal_mobile), '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g'))`,
        [normalized],
      );
    }
    await logAuditEvent({
      user_id: (req.user as { id: string }).id,
      action: 'add_suppression',
      resource_type: 'suppression',
      resource_id: '',
      details: { channel, reason }, // NOTE: do not log the contact PII itself
    });
    return reply.status(201).send({ message: 'Contact suppressed' });
  });

  fastify.delete('/suppressions/:id', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const idResult = z.string().uuid().safeParse((req.params as { id: string }).id);
    if (!idResult.success) return reply.status(400).send({ error: 'Invalid id' });
    const sql = getDB();
    const n = await sql.unsafe(`DELETE FROM suppressions WHERE id = $1 RETURNING id`, [idResult.data]);
    if (!n || n.length === 0) return reply.status(404).send({ error: 'Not found' });
    await logAuditEvent({
      user_id: (req.user as { id: string }).id,
      action: 'remove_suppression',
      resource_type: 'suppression',
      resource_id: idResult.data,
    });
    return { message: 'Suppression removed' };
  });

  // ---- Integrity dashboard: stuck leads + queue depths (Track 3) ----
  // Log-FK cascades make true orphans impossible, so this reports what can
  // actually go wrong: leads parked in transient stages (crashed workers,
  // pre-reclaim era) and jobs piling up in DLQ/:processing lists.
  const PIPELINE_QUEUES = [
    'scrape_queue:requests', 'raw_leads_queue:requests',
    'enrichment_queue:requests', 'verification_queue:requests',
    'draft_queue:requests', 'send_queue:requests', 'verify_send_queue:requests',
  ];

  fastify.get('/integrity', { preValidation: [authorize(['admin'])] }, async (_req, _reply) => {
    const sql = getDB();
    const redis = getRedis();
    const stuck = await sql.unsafe(
      `SELECT id, pipeline_stage, updated_at FROM leads
        WHERE pipeline_stage IN ('enriching','verifying','send_pending','retry_pending')
          AND updated_at < NOW() - INTERVAL '6 hours'
        ORDER BY updated_at ASC LIMIT 100`,
    );
    const queues: Record<string, { depth: number; processing: number; dlq: number }> = {};
    for (const q of PIPELINE_QUEUES) {
      try {
        const [depth, processing, dlq] = await Promise.all([
          redis.llen(q), redis.llen(`${q}:processing`), redis.llen(`${q}:dlq`),
        ]);
        queues[q] = { depth: Number(depth), processing: Number(processing), dlq: Number(dlq) };
      } catch {
        queues[q] = { depth: -1, processing: -1, dlq: -1 };
      }
    }
    // ATS flywheel: boards spotted in recently ingested job URLs. This is the
    // raw sighting list (may include already-probed boards); the curated
    // new-slug diff lives in scrapers/utils/ats_corpus.py suggest_new_slugs.
    // Either way these are suggestions only — promotion follows the standing
    // rule (verify live, then add to SOURCE_EXTRAS).
    const ATS_PATTERNS: Array<[string, RegExp]> = [
      ['greenhouse', /boards\.greenhouse\.io\/([a-z0-9][a-z0-9\-_]*)/i],
      ['lever', /jobs\.lever\.co\/([a-z0-9][a-z0-9\-_]*)/i],
      ['bamboohr', /([a-z0-9][a-z0-9\-_]*)\.bamboohr\.com\/careers/i],
      ['personio', /([a-z0-9][a-z0-9\-_]*)\.jobs\.personio\.com/i],
      ['ashby', /jobs\.ashbyhq\.com\/([a-z0-9][a-z0-9\-_]*)/i],
    ];
    const suggested_slugs: Record<string, string[]> = {};
    try {
      const urls = await sql.unsafe(
        `SELECT DISTINCT job_url FROM job_postings
          WHERE created_at > NOW() - INTERVAL '30 days' AND job_url IS NOT NULL LIMIT 2000`,
      );
      const seen = new Set<string>();
      for (const row of urls as unknown as Array<{ job_url: string }>) {
        const url = row.job_url || '';
        for (const [ats, rx] of ATS_PATTERNS) {
          const m = rx.exec(url);
          if (m && m[1]) {
            const key = `${ats}:${m[1].toLowerCase()}`;
            if (!seen.has(key)) {
              seen.add(key);
              (suggested_slugs[ats] = suggested_slugs[ats] || []).push(m[1].toLowerCase());
            }
          }
        }
      }
    } catch { /* job_postings unreadable: omit suggestions, don't fail */ }
    return { stuck_leads: stuck, queues, suggested_slugs };
  });

  // ---- DLQ operations: inspect, redrive, purge (all audited) ----
  const dlqQueueSchema = z.object({
    queue: z.enum([
      'scrape_queue:requests', 'raw_leads_queue:requests',
      'enrichment_queue:requests', 'verification_queue:requests',
      'draft_queue:requests', 'send_queue:requests', 'verify_send_queue:requests',
    ]),
  });

  fastify.get('/dlq/:queue', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parsed = dlqQueueSchema.safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Unknown queue' });
    const redis = getRedis();
    const items = await redis.lrange(`${parsed.data.queue}:dlq`, 0, 49);
    return { queue: parsed.data.queue, dlq_depth: await redis.llen(`${parsed.data.queue}:dlq`), items };
  });

  fastify.post('/dlq/:queue/redrive', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parsed = dlqQueueSchema.safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Unknown queue' });
    const { queue } = parsed.data;
    const redis = getRedis();
    let moved = 0;
    for (;;) {
      // Consumers do LPUSH/BRPOP (take the TAIL), and rpoplpush lands the item
      // at the HEAD — the starving end. Move it to the tail with a single
      // atomic RPOPLPUSH back into the queue, then reset the attempt counter
      // in place at index 0 where it now sits.
      const item = await redis.rpoplpush(`${queue}:dlq`, queue);
      if (item == null) break;
      try {
        const payload = JSON.parse(typeof item === 'string' ? item : String(item));
        delete payload._attempts;
        await redis.lrem(queue, 1, item); // remove from head
        await redis.rpush(queue, JSON.stringify(payload)); // re-queue at the consumer end
      } catch {
        break; // unparseable as JSON after move — leave it, don't loop forever
      }
      moved += 1;
      if (moved >= 1000) break;
    }
    await logAuditEvent({
      user_id: (req.user as { id: string }).id,
      action: 'dlq_redrive',
      resource_type: 'queue',
      resource_id: queue,
      details: { moved },
    });
    return { queue, redriven: moved };
  });

  fastify.delete('/dlq/:queue', { preValidation: [authorize(['admin'])] }, async (req, reply) => {
    const parsed = dlqQueueSchema.safeParse(req.params);
    if (!parsed.success) return reply.status(400).send({ error: 'Unknown queue' });
    const { queue } = parsed.data;
    const redis = getRedis();
    const depth = await redis.llen(`${queue}:dlq`);
    await redis.del(`${queue}:dlq`);
    await logAuditEvent({
      user_id: (req.user as { id: string }).id,
      action: 'dlq_purge',
      resource_type: 'queue',
      resource_id: queue,
      details: { purged: Number(depth) },
    });
    return { queue, purged: Number(depth) };
  });

  // ---- Prometheus metrics (Track 5, dependency-free exposition format) ----
  // Aggregates only — no PII. Admin-gated; point Prometheus at this target
  // with a bearer token (see docs/BACKUP_RESTORE.md companion note in README).
  fastify.get('/metrics', { preValidation: [authorize(['admin'])] }, async (_req, reply) => {
    const sql = getDB();
    const redis = getRedis();
    const lines: string[] = [];
    const gauge = (name: string, labels: Record<string, string>, value: number) => {
      const lbl = Object.entries(labels).map(([k, v]) => `${k}="${String(v).replace(/"/g, '')}"`).join(',');
      lines.push(`${name}{${lbl}} ${value}`);
    };

    const stages = await sql.unsafe(
      `SELECT pipeline_stage, COUNT(*) AS n FROM leads GROUP BY pipeline_stage`,
    );
    for (const r of stages as unknown as Array<{ pipeline_stage: string; n: string }>) {
      gauge('hiregen_leads_total', { stage: r.pipeline_stage }, Number(r.n));
    }
    const bands = await sql.unsafe(
      `SELECT score_band, COUNT(*) AS n FROM leads GROUP BY score_band`,
    );
    for (const r of bands as unknown as Array<{ score_band: string; n: string }>) {
      gauge('hiregen_leads_score_band', { band: r.score_band }, Number(r.n));
    }
    for (const q of PIPELINE_QUEUES) {
      try {
        const [depth, processing, dlq] = await Promise.all([
          redis.llen(q), redis.llen(`${q}:processing`), redis.llen(`${q}:dlq`),
        ]);
        gauge('hiregen_queue_depth', { queue: q, state: 'pending' }, Number(depth));
        gauge('hiregen_queue_depth', { queue: q, state: 'processing' }, Number(processing));
        gauge('hiregen_queue_depth', { queue: q, state: 'dlq' }, Number(dlq));
      } catch { /* redis down: omit, don't fail the scrape */ }
    }
    const stuck = await sql.unsafe(
      `SELECT COUNT(*) AS n FROM leads
        WHERE pipeline_stage IN ('enriching','verifying','send_pending','retry_pending')
          AND updated_at < NOW() - INTERVAL '6 hours'`,
    );
    gauge('hiregen_stuck_leads', {}, Number((stuck as unknown as Array<{ n: string }>)[0]?.n ?? 0));
    const health = await sql.unsafe(
      `SELECT source_name, consecutive_failures, circuit_open_until FROM source_health`,
    );
    const now = Date.now();
    for (const r of health as unknown as Array<{ source_name: string; consecutive_failures: string | number; circuit_open_until: string | null }>) {
      gauge('hiregen_source_failures', { source: r.source_name }, Number(r.consecutive_failures ?? 0));
      gauge('hiregen_source_circuit_open', { source: r.source_name },
        r.circuit_open_until && new Date(r.circuit_open_until).getTime() > now ? 1 : 0);
    }
    const verif = await sql.unsafe(
      `SELECT channel, result, COUNT(*) AS n FROM verification_log
        WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY channel, result`,
    );
    for (const r of verif as unknown as Array<{ channel: string; result: string; n: string }>) {
      gauge('hiregen_verifications_24h', { channel: r.channel, result: r.result }, Number(r.n));
    }
    const outreach = await sql.unsafe(
      `SELECT channel, delivery_status, COUNT(*) AS n FROM outreach_log
        WHERE sent_at > NOW() - INTERVAL '24 hours' GROUP BY channel, delivery_status`,
    );
    for (const r of outreach as unknown as Array<{ channel: string; delivery_status: string; n: string }>) {
      gauge('hiregen_outreach_24h', { channel: r.channel, status: r.delivery_status }, Number(r.n));
    }
    const supp = await sql.unsafe(`SELECT COUNT(*) AS n FROM suppressions`);
    gauge('hiregen_suppressions_total', {}, Number((supp as unknown as Array<{ n: string }>)[0]?.n ?? 0));

    return reply.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });
};
