import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { getDB } from '../utils/db';
import { authorize } from '../middleware/auth';
import { logAuditEvent } from '../utils/audit';
import { hashPassword } from '../utils/crypto';

/**
 * Admin people workspace: account directory, activity analytics, visitor
 * sessions and account lifecycle controls.
 *
 * Every mutation is audited with the acting administrator. Destructive actions
 * are guarded so an admin cannot lock themselves out or remove the final
 * active administrator.
 */

const ROLES = ['admin', 'sales_rep', 'viewer', 'candidate', 'user'] as const;

const daysSchema = z.object({
  days: z.coerce.number().int().min(7).max(90).default(30),
});

const listSchema = z.object({
  search: z.string().trim().max(200).default(''),
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  sort: z.enum(['last_active', 'active_time', 'created', 'name', 'email', 'interviews']).default('last_active'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const visitorSchema = z.object({
  search: z.string().trim().max(200).default(''),
  type: z.enum(['all', 'anonymous', 'registered']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const updateSchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  full_name: z.string().trim().max(120).optional(),
  headline: z.string().trim().max(200).optional(),
  location: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  revoke_sessions: z.boolean().optional(),
}).refine((value) => Object.values(value).some((v) => v !== undefined), {
  message: 'No changes supplied',
});

const deleteSchema = z.object({
  confirm_email: z.string().trim().email().max(200),
});

const SORTS: Record<string, string> = {
  last_active: 'last_active DESC NULLS LAST, u.email ASC',
  active_time: 'total_active_seconds DESC, last_active DESC NULLS LAST',
  created: 'u.created_at DESC',
  name: 'full_name ASC',
  email: 'u.email ASC',
  interviews: 'interviews_total DESC, last_active DESC NULLS LAST',
};

function dayKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? '').slice(0, 10);
}

function lastNDays(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() - i);
    out.push(date.toISOString().slice(0, 10));
  }
  return out;
}

function currentUser(request: FastifyRequest) {
  return request.user as { id: string; role: string; email?: string };
}

async function activeAdminCount(excludeId?: string): Promise<number> {
  const rows = await getDB().unsafe(
    `SELECT COUNT(*)::int AS count FROM users
      WHERE role = 'admin' AND status = 'active'
        AND ($1::uuid IS NULL OR id <> $1::uuid)`,
    [excludeId ?? null],
  );
  return Number((rows[0] as any)?.count || 0);
}

export const userAdminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authorize(['admin']));

  /* ------------------------------------------------------------------ */
  /* Overview                                                            */
  /* ------------------------------------------------------------------ */

  fastify.get('/users/overview', async (request, reply) => {
    const parsed = daysSchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid date range', details: parsed.error.issues });
    }
    const days = parsed.data.days;
    const sql = getDB();
    const since = `current_date - (${days} - 1)`;

    const [
      totalsRows,
      activeDailyRows,
      trackedDailyRows,
      visitDailyRows,
      signupDailyRows,
      interviewDailyRows,
      applicationDailyRows,
      rolesRows,
      devicesRows,
      pagesRows,
      countriesRows,
      recentUsersRows,
      topUsersRows,
      platformRows,
    ] = await Promise.all([
      sql.unsafe(
        `SELECT
           (SELECT COUNT(*)::int FROM users) AS users,
           (SELECT COUNT(*)::int FROM users WHERE role IN ('candidate', 'user')) AS candidates,
           (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS admins,
           (SELECT COUNT(*)::int FROM users WHERE status = 'suspended') AS suspended,
           (SELECT COUNT(*)::int FROM users WHERE created_at >= date_trunc('month', now())) AS new_this_month,
           (SELECT COUNT(*)::int FROM users WHERE created_at >= current_date) AS new_today,
           (SELECT COUNT(*)::int FROM users WHERE created_at >= now() - interval '7 days') AS new_7d,
           (SELECT COUNT(*)::int FROM users WHERE last_seen_at >= now() - interval '5 minutes') AS active_now,
           (SELECT COUNT(*)::int FROM (
              SELECT user_id FROM activity_sessions
               WHERE user_id IS NOT NULL AND last_seen_at >= current_date
              UNION
              SELECT id FROM users WHERE last_login_at >= current_date
            ) t) AS active_today,
           (SELECT COUNT(*)::int FROM (
              SELECT user_id FROM activity_sessions
               WHERE user_id IS NOT NULL AND last_seen_at >= now() - interval '7 days'
              UNION
              SELECT id FROM users WHERE last_login_at >= now() - interval '7 days'
            ) t) AS active_7d,
           (SELECT COUNT(*)::int FROM (
              SELECT user_id FROM activity_sessions
               WHERE user_id IS NOT NULL AND last_seen_at >= now() - interval '30 days'
              UNION
              SELECT id FROM users WHERE last_login_at >= now() - interval '30 days'
            ) t) AS active_30d,
           (SELECT COUNT(*)::int FROM activity_sessions WHERE started_at >= ${since}) AS visits,
           (SELECT COUNT(DISTINCT visitor_id)::int FROM activity_sessions WHERE started_at >= ${since}) AS unique_visitors,
           (SELECT COALESCE(SUM(views), 0)::int FROM activity_page_daily WHERE day >= ${since}) AS page_views,
           (SELECT COALESCE(SUM(active_seconds), 0)::int FROM activity_daily WHERE day >= ${since}) AS active_seconds,
           (SELECT COUNT(DISTINCT user_id)::int FROM activity_daily WHERE user_id IS NOT NULL AND day >= ${since}) AS tracked_users,
           (SELECT COALESCE(AVG(active_seconds), 0)::int FROM activity_sessions WHERE started_at >= ${since}) AS avg_session_seconds,
           (SELECT COUNT(*)::int FROM interview_sessions WHERE started_at >= ${since}) AS interviews,
           (SELECT COUNT(*)::int FROM interview_sessions WHERE started_at >= ${since} AND status = 'completed') AS completed_interviews,
           (SELECT COUNT(*)::int FROM applications WHERE created_at >= ${since}) AS applications`,
        [],
      ),
      sql.unsafe(
        `SELECT d.day::text AS day, COUNT(DISTINCT a.user_id)::int AS active_users
           FROM (SELECT generate_series(current_date - (${days} - 1), current_date, '1 day')::date AS day) d
           LEFT JOIN (
             SELECT user_id, day FROM activity_daily
              WHERE user_id IS NOT NULL AND day >= current_date - (${days} - 1)
             UNION
             SELECT user_id, started_at::date AS day FROM interview_sessions
              WHERE started_at >= current_date - (${days} - 1)
             UNION
             SELECT user_id, created_at::date AS day FROM applications
              WHERE created_at >= current_date - (${days} - 1)
             UNION
             SELECT user_id, created_at::date AS day FROM credit_ledger
              WHERE created_at >= current_date - (${days} - 1)
           ) a ON a.day = d.day
          GROUP BY d.day
          ORDER BY d.day`,
        [],
      ),
      sql.unsafe(
        `SELECT day::text AS day, COALESCE(SUM(page_views), 0)::int AS page_views,
                COALESCE(SUM(active_seconds), 0)::int AS active_seconds
           FROM activity_daily WHERE day >= ${since}
          GROUP BY day ORDER BY day`,
        [],
      ),
      sql.unsafe(
        `SELECT started_at::date::text AS day, COUNT(*)::int AS visits,
                COUNT(DISTINCT visitor_id)::int AS visitors,
                COALESCE(SUM(active_seconds), 0)::int AS active_seconds
           FROM activity_sessions WHERE started_at >= ${since}
          GROUP BY 1 ORDER BY 1`,
        [],
      ),
      sql.unsafe(
        `SELECT created_at::date::text AS day, COUNT(*)::int AS count
           FROM users WHERE created_at >= ${since}
          GROUP BY 1 ORDER BY 1`,
        [],
      ),
      sql.unsafe(
        `SELECT started_at::date::text AS day, COUNT(*)::int AS count
           FROM interview_sessions WHERE started_at >= ${since}
          GROUP BY 1 ORDER BY 1`,
        [],
      ),
      sql.unsafe(
        `SELECT created_at::date::text AS day, COUNT(*)::int AS count
           FROM applications WHERE created_at >= ${since}
          GROUP BY 1 ORDER BY 1`,
        [],
      ),
      sql.unsafe(
        `SELECT role, COUNT(*)::int AS count FROM users GROUP BY role ORDER BY count DESC, role ASC`,
        [],
      ),
      sql.unsafe(
        `SELECT device, COUNT(DISTINCT visitor_id)::int AS visitors, COUNT(*)::int AS sessions
           FROM activity_sessions WHERE started_at >= ${since}
          GROUP BY device ORDER BY visitors DESC`,
        [],
      ),
      sql.unsafe(
        `SELECT path, COALESCE(SUM(views), 0)::int AS views,
                COALESCE(SUM(active_seconds), 0)::int AS active_seconds
           FROM activity_page_daily WHERE day >= ${since}
          GROUP BY path ORDER BY views DESC LIMIT 10`,
        [],
      ),
      sql.unsafe(
        `SELECT COALESCE(NULLIF(country, ''), 'Unknown') AS country,
                COUNT(DISTINCT visitor_id)::int AS visitors
           FROM activity_sessions WHERE started_at >= ${since}
          GROUP BY 1 ORDER BY visitors DESC LIMIT 8`,
        [],
      ),
      sql.unsafe(
        `SELECT u.id, u.email, u.role, u.status, u.created_at, u.last_login_at,
                COALESCE(NULLIF(cp.full_name, ''), split_part(u.email, '@', 1)) AS full_name,
                cp.headline, cp.location
           FROM users u
           LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
          ORDER BY u.created_at DESC LIMIT 8`,
        [],
      ),
      sql.unsafe(
        `SELECT u.id, u.email,
                COALESCE(NULLIF(cp.full_name, ''), split_part(u.email, '@', 1)) AS full_name,
                SUM(a.active_seconds)::int AS active_seconds,
                COUNT(DISTINCT a.session_id)::int AS sessions
           FROM activity_sessions a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
          WHERE a.user_id IS NOT NULL AND a.last_seen_at >= ${since}
          GROUP BY u.id, u.email, cp.full_name
          ORDER BY active_seconds DESC LIMIT 6`,
        [],
      ),
      sql.unsafe(
        `SELECT
           (SELECT COUNT(*)::int FROM job_postings WHERE is_active = true AND review_status = 'published') AS active_jobs,
           (SELECT COUNT(*)::int FROM applications) AS applications_total,
           (SELECT COUNT(*)::int FROM interview_sessions) AS interviews_total,
           (SELECT COUNT(*)::int FROM candidate_feedback WHERE moderation_status = 'pending') AS feedback_pending,
           (SELECT COUNT(*)::int FROM ai_usage_events WHERE created_at >= ${since}) AS ai_calls,
           (SELECT COALESCE(SUM(-delta), 0)::int FROM credit_ledger
             WHERE kind = 'consumption' AND created_at >= ${since}) AS credits_used,
           (SELECT COUNT(*)::int FROM preparation_artifacts) AS preparation_artifacts`,
        [],
      ),
    ]);

    const byDay = <T extends { day: unknown }>(rows: T[]): Map<string, T> =>
      new Map(rows.map((row) => [dayKey(row.day), row]));

    const activeMap = byDay(activeDailyRows as any[]);
    const trackedMap = byDay(trackedDailyRows as any[]);
    const visitMap = byDay(visitDailyRows as any[]);
    const signupMap = byDay(signupDailyRows as any[]);
    const interviewMap = byDay(interviewDailyRows as any[]);
    const applicationMap = byDay(applicationDailyRows as any[]);

    const daily = lastNDays(days).map((day) => {
      const active = activeMap.get(day) as any;
      const tracked = trackedMap.get(day) as any;
      const visits = visitMap.get(day) as any;
      const signups = signupMap.get(day) as any;
      const interviews = interviewMap.get(day) as any;
      const applications = applicationMap.get(day) as any;
      return {
        day,
        active_users: Number(active?.active_users || 0),
        page_views: Number(tracked?.page_views || 0),
        active_seconds: Number(tracked?.active_seconds || 0),
        visits: Number(visits?.visits || 0),
        unique_visitors: Number(visits?.visitors || 0),
        signups: Number(signups?.count || 0),
        interviews: Number(interviews?.count || 0),
        applications: Number(applications?.count || 0),
      };
    });

    return {
      days,
      totals: totalsRows[0] || {},
      daily,
      roles: rolesRows,
      devices: devicesRows,
      top_pages: pagesRows,
      countries: countriesRows,
      recent_users: recentUsersRows,
      top_users: topUsersRows,
      platform: platformRows[0] || {},
    };
  });

  /* ------------------------------------------------------------------ */
  /* Account directory                                                   */
  /* ------------------------------------------------------------------ */

  fastify.get('/users', async (request, reply) => {
    const parsed = listSchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid user query', details: parsed.error.issues });
    }
    const { search, role, status, sort, limit, offset } = parsed.data;
    const sql = getDB();
    const conditions: string[] = [];
    const params: any[] = [];
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(
        u.email ILIKE $${n}
        OR COALESCE(cp.full_name, '') ILIKE $${n}
        OR COALESCE(cp.headline, '') ILIKE $${n}
        OR COALESCE(cp.location, '') ILIKE $${n}
        OR COALESCE(cp.phone, '') ILIKE $${n}
      )`);
    }
    if (role) {
      params.push(role);
      conditions.push(`u.role = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`u.status = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = await sql.unsafe(
      `SELECT COUNT(*)::int AS total
         FROM users u
         LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
         ${where}`,
      params,
    );
    const total = Number((countRows[0] as any)?.total || 0);

    const rowParams = [...params, limit, offset];
    const rows = await sql.unsafe(
      `WITH tracked AS (
         SELECT user_id, SUM(active_seconds)::int AS active_seconds,
                COUNT(*)::int AS sessions, MAX(last_seen_at) AS last_seen
           FROM activity_sessions
          WHERE user_id IS NOT NULL AND last_seen_at >= now() - interval '30 days'
          GROUP BY user_id
       ),
       interview_stats AS (
         SELECT user_id, COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
                ROUND(AVG(overall_score) FILTER (WHERE overall_score IS NOT NULL))::int AS avg_score
           FROM interview_sessions GROUP BY user_id
       ),
       application_stats AS (
         SELECT user_id, COUNT(*)::int AS total FROM applications GROUP BY user_id
       )
       SELECT u.id, u.email, u.role, u.status, u.created_at, u.last_login_at, u.last_seen_at,
              COALESCE(NULLIF(cp.full_name, ''), split_part(u.email, '@', 1)) AS full_name,
              cp.headline, cp.location, cp.phone,
              COALESCE(cs.plan_code, 'FREE') AS plan_code,
              pc.name AS plan_name,
              COALESCE(cw.balance, 0)::int AS credits,
              COALESCE(t.active_seconds, 0)::int AS total_active_seconds,
              COALESCE(t.sessions, 0)::int AS session_count,
              COALESCE(i.total, 0)::int AS interviews_total,
              COALESCE(i.completed, 0)::int AS interviews_completed,
              i.avg_score,
              COALESCE(ap.total, 0)::int AS applications_total,
              COALESCE(u.last_seen_at, t.last_seen, u.last_login_at, u.created_at) AS last_active
         FROM users u
         LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
         LEFT JOIN candidate_subscriptions cs ON cs.user_id = u.id
         LEFT JOIN plan_catalog pc ON pc.code = cs.plan_code
         LEFT JOIN credit_wallets cw ON cw.user_id = u.id
         LEFT JOIN tracked t ON t.user_id = u.id
         LEFT JOIN interview_stats i ON i.user_id = u.id
         LEFT JOIN application_stats ap ON ap.user_id = u.id
         ${where}
        ORDER BY ${SORTS[sort]}
        LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`,
      rowParams,
    );

    return {
      data: rows,
      pagination: { limit, offset, total },
    };
  });

  /* ------------------------------------------------------------------ */
  /* Single account + activity timeline                                  */
  /* ------------------------------------------------------------------ */

  fastify.get('/users/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Invalid user id' });
    const userId = params.data.id;
    const sql = getDB();

    const users = await sql.unsafe(
      `SELECT u.id, u.email, u.role, u.status, u.created_at, u.updated_at,
              u.last_login_at, u.last_seen_at,
              COALESCE(NULLIF(cp.full_name, ''), split_part(u.email, '@', 1)) AS full_name,
              cp.headline, cp.location, cp.phone, cp.contact_email, cp.summary, cp.skills,
              cp.preferred_roles, cp.preferred_locations, cp.remote_preference,
              cp.experience_years, cp.education_level, cp.salary_min, cp.salary_currency,
              cp.experience, cp.projects, cp.certifications, cp.resume_filename,
              cp.profile_confirmed_at,
              COALESCE(cs.plan_code, 'FREE') AS plan_code, pc.name AS plan_name,
              pc.price_paise,
              COALESCE(cw.balance, 0)::int AS credits,
              COALESCE(cw.lifetime_granted, 0)::int AS lifetime_granted,
              COALESCE(cw.lifetime_used, 0)::int AS lifetime_used
         FROM users u
         LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
         LEFT JOIN candidate_subscriptions cs ON cs.user_id = u.id
         LEFT JOIN plan_catalog pc ON pc.code = cs.plan_code
         LEFT JOIN credit_wallets cw ON cw.user_id = u.id
        WHERE u.id = $1`,
      [userId],
    );
    const user = users[0] as any;
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const [activityRows, dailyRows, pageRows, sessionRows, interviewRows, applicationRows, ledgerRows, feedbackRows] =
      await Promise.all([
        sql.unsafe(
          `SELECT COUNT(*)::int AS sessions,
                  COALESCE(SUM(active_seconds), 0)::int AS active_seconds,
                  COALESCE(SUM(page_views), 0)::int AS page_views,
                  COALESCE(AVG(active_seconds), 0)::int AS avg_session_seconds,
                  COUNT(*) FILTER (WHERE last_seen_at >= now() - interval '30 days')::int AS sessions_30d,
                  COALESCE(SUM(active_seconds) FILTER (WHERE last_seen_at >= now() - interval '30 days'), 0)::int AS active_seconds_30d,
                  MAX(last_seen_at) AS last_seen
             FROM activity_sessions WHERE user_id = $1`,
          [userId],
        ),
        sql.unsafe(
          `SELECT d.day::text AS day, COALESCE(a.active_seconds, 0)::int AS active_seconds,
                  COALESCE(a.page_views, 0)::int AS page_views
             FROM (SELECT generate_series(current_date - 29, current_date, '1 day')::date AS day) d
             LEFT JOIN activity_daily a ON a.day = d.day AND a.actor_key = ('u:' || $1::text)
            ORDER BY d.day`,
          [userId],
        ),
        sql.unsafe(
          `SELECT path, title, active_seconds, created_at
             FROM activity_events WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 60`,
          [userId],
        ),
        sql.unsafe(
          `SELECT session_id, started_at, last_seen_at, ended_at, active_seconds, page_views,
                  entry_path, last_path, referrer, device, browser, os, country
             FROM activity_sessions WHERE user_id = $1
            ORDER BY last_seen_at DESC LIMIT 20`,
          [userId],
        ),
        sql.unsafe(
          `SELECT id, role_focus, difficulty, status, overall_score, question_count,
                  job_title, job_company, started_at, completed_at
             FROM interview_sessions WHERE user_id = $1
            ORDER BY started_at DESC LIMIT 20`,
          [userId],
        ),
        sql.unsafe(
          `SELECT a.id, a.status, a.created_at, a.applied_at, a.updated_at, a.notes,
                  j.title AS job_title, c.name AS company_name
             FROM applications a
             LEFT JOIN job_postings j ON j.id = a.job_posting_id
             LEFT JOIN companies c ON c.id = j.company_id
            WHERE a.user_id = $1
            ORDER BY a.updated_at DESC LIMIT 20`,
          [userId],
        ),
        sql.unsafe(
          `SELECT id, delta, balance_after, kind, reason, created_at
             FROM credit_ledger WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 10`,
          [userId],
        ),
        sql.unsafe(
          `SELECT id, rating, feedback, moderation_status, created_at
             FROM candidate_feedback WHERE user_id = $1
            ORDER BY created_at DESC LIMIT 10`,
          [userId],
        ),
      ]);

    return {
      user,
      activity: activityRows[0] || {},
      daily: dailyRows,
      recent_pages: pageRows,
      sessions: sessionRows,
      interviews: interviewRows,
      applications: applicationRows,
      credits_ledger: ledgerRows,
      feedback: feedbackRows,
    };
  });

  /* ------------------------------------------------------------------ */
  /* Account lifecycle                                                   */
  /* ------------------------------------------------------------------ */

  fastify.patch('/users/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Invalid user id' });
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid account update', details: parsed.error.issues });
    }
    const targetId = params.data.id;
    const actor = currentUser(request);
    const changes = parsed.data;
    const sql = getDB();

    const rows = await sql.unsafe(
      `SELECT id, email, role, status FROM users WHERE id = $1`,
      [targetId],
    );
    const target = rows[0] as any;
    if (!target) return reply.status(404).send({ error: 'User not found' });

    if (target.id === actor.id) {
      if ((changes.role && changes.role !== target.role) || changes.status === 'suspended') {
        return reply.status(400).send({ error: 'You cannot demote or suspend your own account.' });
      }
    }

    const removingActiveAdmin =
      target.role === 'admin' &&
      target.status === 'active' &&
      ((changes.role && changes.role !== 'admin') || changes.status === 'suspended');
    if (removingActiveAdmin && (await activeAdminCount(target.id)) === 0) {
      return reply.status(400).send({ error: 'At least one active administrator must remain.' });
    }

    const profileFields = ['full_name', 'headline', 'location', 'phone'] as const;
    const hasProfileChanges = profileFields.some((field) => changes[field] !== undefined);
    const revoke = changes.revoke_sessions === true || changes.status === 'suspended';

    const run = async (tx: { unsafe: (query: string, params?: any[]) => Promise<any[]> }) => {
      await tx.unsafe(
        `UPDATE users
            SET role = COALESCE($2, role),
                status = COALESCE($3, status),
                auth_version = auth_version + CASE WHEN $4 THEN 1 ELSE 0 END,
                updated_at = now()
          WHERE id = $1`,
        [targetId, changes.role ?? null, changes.status ?? null, revoke],
      );

      if (hasProfileChanges && ['candidate', 'user', 'admin'].includes(String(changes.role || target.role))) {
        await tx.unsafe(
          `INSERT INTO candidate_profiles (user_id, full_name, headline, location, phone)
           VALUES ($1, COALESCE($2, ''), COALESCE($3, ''), COALESCE($4, ''), $5)
           ON CONFLICT (user_id) DO UPDATE SET
             full_name = COALESCE($2, candidate_profiles.full_name),
             headline = COALESCE($3, candidate_profiles.headline),
             location = COALESCE($4, candidate_profiles.location),
             phone = COALESCE($5, candidate_profiles.phone),
             updated_at = now()`,
          [
            targetId,
            changes.full_name ?? null,
            changes.headline ?? null,
            changes.location ?? null,
            changes.phone ?? null,
          ],
        );
      }
    };

    if (typeof (sql as any).begin === 'function') {
      await (sql as any).begin(run);
    } else {
      await run(sql as any);
    }

    await logAuditEvent({
      user_id: actor.id,
      action: 'admin.user_update',
      resource_type: 'user',
      resource_id: targetId,
      details: {
        target_email: target.email,
        changes: {
          role: changes.role ?? null,
          status: changes.status ?? null,
          profile: hasProfileChanges,
          revoked_sessions: revoke,
        },
      },
    });

    return { ok: true };
  });

  fastify.post('/users/:id/reset-password', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Invalid user id' });
    const targetId = params.data.id;
    const actor = currentUser(request);
    const sql = getDB();

    const rows = await sql.unsafe(`SELECT id, email FROM users WHERE id = $1`, [targetId]);
    const target = rows[0] as any;
    if (!target) return reply.status(404).send({ error: 'User not found' });

    const temporaryPassword = `Hg-${randomBytes(5).toString('hex')}-${randomBytes(2).toString('hex')}!`;
    const passwordHash = await hashPassword(temporaryPassword);
    await sql.unsafe(
      `UPDATE users
          SET password_hash = $2,
              auth_version = auth_version + 1,
              updated_at = now()
        WHERE id = $1`,
      [targetId, passwordHash],
    );

    await logAuditEvent({
      user_id: actor.id,
      action: 'admin.user_password_reset',
      resource_type: 'user',
      resource_id: targetId,
      details: { target_email: target.email },
    });

    return {
      ok: true,
      password: temporaryPassword,
      message: 'Share this one-time password securely. All existing sessions were signed out.',
    };
  });

  fastify.delete('/users/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Invalid user id' });
    const parsed = deleteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Type the account email to confirm deletion.', details: parsed.error.issues });
    }
    const targetId = params.data.id;
    const actor = currentUser(request);
    const sql = getDB();

    const rows = await sql.unsafe(`SELECT id, email, role, status FROM users WHERE id = $1`, [targetId]);
    const target = rows[0] as any;
    if (!target) return reply.status(404).send({ error: 'User not found' });
    if (target.id === actor.id) {
      return reply.status(400).send({ error: 'You cannot delete your own account.' });
    }
    if (target.email.toLowerCase() !== parsed.data.confirm_email.toLowerCase()) {
      return reply.status(400).send({ error: 'The confirmation email does not match this account.' });
    }
    if (target.role === 'admin' && target.status === 'active' && (await activeAdminCount(target.id)) === 0) {
      return reply.status(400).send({ error: 'At least one active administrator must remain.' });
    }

    await sql.unsafe(`DELETE FROM users WHERE id = $1`, [targetId]);
    await logAuditEvent({
      user_id: actor.id,
      action: 'admin.user_delete',
      resource_type: 'user',
      resource_id: targetId,
      details: { target_email: target.email, target_role: target.role },
    });

    return { ok: true, deleted: true };
  });

  /* ------------------------------------------------------------------ */
  /* Visitor sessions                                                    */
  /* ------------------------------------------------------------------ */

  fastify.get('/users/visitors', async (request, reply) => {
    const parsed = visitorSchema.safeParse(request.query || {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid visitor query', details: parsed.error.issues });
    }
    const { search, type, limit, offset } = parsed.data;
    const sql = getDB();
    const conditions: string[] = [`s.started_at >= now() - interval '30 days'`];
    const params: any[] = [];
    if (type === 'anonymous') conditions.push('s.user_id IS NULL');
    if (type === 'registered') conditions.push('s.user_id IS NOT NULL');
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      conditions.push(`(
        s.visitor_id ILIKE $${n}
        OR s.entry_path ILIKE $${n}
        OR s.last_path ILIKE $${n}
        OR COALESCE(s.referrer, '') ILIKE $${n}
        OR COALESCE(s.country, '') ILIKE $${n}
        OR COALESCE(u.email, '') ILIKE $${n}
        OR COALESCE(cp.full_name, '') ILIKE $${n}
      )`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows, statsRows] = await Promise.all([
      sql.unsafe(
        `SELECT COUNT(*)::int AS total
           FROM activity_sessions s
           LEFT JOIN users u ON u.id = s.user_id
           LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
           ${where}`,
        params,
      ),
      sql.unsafe(
        `SELECT COUNT(*)::int AS sessions,
                COUNT(DISTINCT s.visitor_id)::int AS visitors,
                COUNT(DISTINCT s.visitor_id) FILTER (WHERE s.user_id IS NULL)::int AS anonymous_visitors,
                COALESCE(AVG(s.active_seconds), 0)::int AS avg_seconds
           FROM activity_sessions s
           LEFT JOIN users u ON u.id = s.user_id
           LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
           ${where}`,
        params,
      ),
    ]);

    const rowParams = [...params, limit, offset];
    const rows = await sql.unsafe(
      `SELECT s.session_id, s.user_id, s.visitor_id, s.started_at, s.last_seen_at, s.ended_at,
              s.active_seconds, s.page_views, s.entry_path, s.last_path, s.referrer,
              s.device, s.browser, s.os, s.country,
              u.email, COALESCE(NULLIF(cp.full_name, ''), '') AS full_name
         FROM activity_sessions s
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN candidate_profiles cp ON cp.user_id = u.id
         ${where}
        ORDER BY s.last_seen_at DESC
        LIMIT $${rowParams.length - 1} OFFSET $${rowParams.length}`,
      rowParams,
    );

    return {
      data: rows,
      stats: statsRows[0] || {},
      pagination: { limit, offset, total: Number((countRows[0] as any)?.total || 0) },
    };
  });
};

export default userAdminRoutes;
