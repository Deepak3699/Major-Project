import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { getRedis } from '../utils/redis';
import { authenticate } from '../middleware/auth';
import { logAuditEvent } from '../utils/audit';
import {
  generateInterviewQuestions,
  gradeAnswer,
  summarizeSession,
  generateLearningTrack,
  generateFollowUp,
  type Difficulty,
} from '../utils/practice-ai';
import type { SubscriptionState, SessionRecord } from '../types/practice';

/**
 * AI practice — subscription-gated mock interviews and adaptive learning.
 *
 * Subscription model (v1, provider-neutral):
 *  - Free plan: a monthly interview quota (PRACTICE_FREE_MONTHLY_LIMIT, default 3).
 *    Learning tracks are unlimited on every plan.
 *  - Pro plan: unlimited interviews. Granted by an operator for now
 *    (POST /candidate/practice/upgrade-request → admin approval in routes/admin.ts).
 *    The grant path is one seam; a payment-provider webhook can write the same
 *    practice_subscriptions row later without touching this route.
 * Quota is enforced by counting calendar-month sessions, not counters, so no
 * usage drift can occur.
 */

const idSchema = z.string().uuid();

const FREE_MONTHLY_LIMIT = Number(process.env.PRACTICE_FREE_MONTHLY_LIMIT || 3) || 3;
const DIFFICULTIES = ['calm', 'standard', 'brutal'] as const;

const startSchema = z.object({
  role_focus: z.string().trim().min(2).max(120).optional(),
  difficulty: z.enum(DIFFICULTIES).default('standard'),
  question_count: z.coerce.number().int().min(4).max(8).default(6),
});

const answerSchema = z.object({
  question_id: idSchema,
  answer: z.string().trim().min(10).max(6000),
});

const learningSchema = z.object({ role_focus: z.string().trim().min(2).max(120).optional() });
const toggleSchema = z.object({ module_index: z.coerce.number().int().min(0).max(30) });

function currentUser(request: FastifyRequest) {
  return request.user as { id: string; role: string; email?: string };
}

function isCandidate(request: FastifyRequest, reply: FastifyReply): boolean {
  if (currentUser(request).role === 'candidate') return true;
  reply.status(403).send({ error: 'Candidate account required' });
  return false;
}

export function monthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

async function loadSubscription(sql: ReturnType<typeof getDB>, userId: string) {
  const rows = await sql.unsafe(
    `SELECT plan, status, source, expires_at FROM practice_subscriptions WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const sub = rows[0] as any;
  if (!sub) return { plan: 'free', status: 'active', source: 'system', expires_at: null } as const;
  // A pro grant with an expiry silently lapses back to free once passed.
  if (sub.plan === 'pro' && sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) {
    return { plan: 'free', status: 'active', source: sub.source, expires_at: sub.expires_at } as const;
  }
  return { plan: sub.plan || 'free', status: sub.status || 'active', source: sub.source || 'system', expires_at: sub.expires_at ?? null } as const;
}

async function subscriptionState(sql: ReturnType<typeof getDB>, userId: string): Promise<SubscriptionState> {
  const sub = await loadSubscription(sql, userId);
  const usageRows = await sql.unsafe(
    `SELECT COUNT(*)::int AS used FROM interview_sessions
      WHERE user_id = $1 AND status IN ('in_progress','completed') AND started_at >= $2`,
    [userId, monthStart().toISOString()],
  );
  const used = Number((usageRows[0] as any)?.used || 0);
  const pendingRows = await sql.unsafe(
    `SELECT 1 FROM practice_upgrade_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
    [userId],
  );
  return {
    plan: sub.plan as SubscriptionState['plan'],
    status: sub.status,
    source: sub.source,
    used_this_month: used,
    monthly_limit: sub.plan === 'pro' ? null : FREE_MONTHLY_LIMIT,
    unlimited: sub.plan === 'pro',
    requested_upgrade: pendingRows.length > 0,
  };
}

async function quotaReached(sql: ReturnType<typeof getDB>, userId: string) {
  const state = await subscriptionState(sql, userId);
  if (state.unlimited) return { reached: false, state };
  return { reached: state.used_this_month >= FREE_MONTHLY_LIMIT, state };
}

/** Resolve the target role: explicit input first, else the first preferred role. */
async function resolveRole(sql: ReturnType<typeof getDB>, userId: string, roleInput: string): Promise<string> {
  const explicit = String(roleInput || '').trim();
  if (explicit) return explicit;
  const profileRows = await sql.unsafe(
    `SELECT preferred_roles FROM candidate_profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const preferred = (profileRows[0] as any)?.preferred_roles;
  const list = Array.isArray(preferred)
    ? preferred.filter(Boolean)
    : (() => { try { return typeof preferred === 'string' ? JSON.parse(preferred) : []; } catch { return []; } })();
  const first = list.find(Boolean);
  return String(first || 'General');
}

async function loadProfile(sql: ReturnType<typeof getDB>, userId: string) {
  const rows = await sql.unsafe(`SELECT * FROM candidate_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
  return (rows[0] as any) || {};
}

async function simpleAudit(userId: string, action: string, targetId: string | null, detail: Record<string, unknown>) {
  try {
    // logAuditEvent owns its own connection and swallows nothing — audit stays
    // best-effort for the session flow.
    await logAuditEvent({
      user_id: userId,
      action,
      resource_type: 'interview_session',
      resource_id: targetId,
      details: detail,
    });
  } catch { /* audit is best-effort; session flow continues */ }
}

export const practiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  /* ------------------------ subscription state ------------------------ */

  fastify.get('/subscription', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const sql = getDB();
    const state = await subscriptionState(sql, currentUser(request).id);
    return { subscription: state };
  });

  fastify.post('/upgrade-request', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const userId = currentUser(request).id;
    const sql = getDB();
    const sub = await loadSubscription(sql, userId);
    if (sub.plan === 'pro') return reply.status(409).send({ error: 'Pro access is already active on this account.' });
    const exists = await sql.unsafe(
      `SELECT id, status FROM practice_upgrade_requests WHERE user_id = $1 AND status = 'pending' LIMIT 1`,
      [userId],
    );
    if (exists.length > 0) {
      return reply.status(202).send({ request_id: (exists[0] as any).id, status: 'pending', message: 'Your upgrade request is already with the team.' });
    }
    const note = typeof (request.body as any)?.note === 'string' ? (request.body as any).note.slice(0, 500) : '';
    const created = await sql.unsafe(
      `INSERT INTO practice_upgrade_requests (user_id, requested_plan, note) VALUES ($1, 'pro', $2) RETURNING id, created_at`,
      [userId, note],
    );
    await simpleAudit(userId, 'practice.upgrade_requested', null, { requested_plan: 'pro' });
    return reply.status(201).send({ request_id: (created[0] as any).id, status: 'pending', message: 'Request received. An administrator reviews Pro upgrades.' });
  });

  /* ------------------------ interview sessions ------------------------ */

  fastify.get('/sessions', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const sql = getDB();
    const rows = await sql.unsafe(
      `SELECT s.id, s.role_focus, s.difficulty, s.question_count, s.status, s.model,
              s.overall_score, s.verdict, s.summary, s.started_at, s.completed_at,
              (SELECT COUNT(*)::int FROM interview_questions q WHERE q.session_id = s.id AND q.answered_at IS NOT NULL) AS answered_count
         FROM interview_sessions s
        WHERE s.user_id = $1 AND s.status <> 'abandoned'
        ORDER BY s.started_at DESC
        LIMIT 50`,
      [currentUser(request).id],
    );
    return { sessions: rows };
  });

  fastify.post('/sessions', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsed = startSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid session settings', details: parsed.error.issues });
    const userId = currentUser(request).id;
    const sql = getDB();

    const gate = await quotaReached(sql, userId);
    if (gate.reached) {
      return reply.status(402).send({
        error: `You have used all ${FREE_MONTHLY_LIMIT} practice interviews for this month on the free plan.`,
        code: 'subscription_required',
        subscription: gate.state,
      });
    }

    const role = await resolveRole(sql, userId, parsed.data.role_focus || '');
    const profile = await loadProfile(sql, userId);

    // Recent topics (all prior sessions) so question sets do not repeat.
    const recentRows = await sql.unsafe(
      `SELECT DISTINCT topic FROM interview_questions WHERE user_id = $1 ORDER BY topic LIMIT 60`,
      [userId],
    );
    const recentTopics = recentRows.map((r: any) => r.topic);

    const { questions, model } = await generateInterviewQuestions(profile, {
      role,
      difficulty: parsed.data.difficulty as Difficulty,
      count: parsed.data.question_count,
      recentTopics,
    });

    const created = await sql.unsafe(
      `INSERT INTO interview_sessions (user_id, role_focus, difficulty, question_count, model)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, role, parsed.data.difficulty, questions.length, model],
    );
    const session = created[0] as any;

    for (const q of questions) {
      await sql.unsafe(
        `INSERT INTO interview_questions (session_id, user_id, idx, category, topic, question, ideal_points)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [session.id, userId, q.idx, q.category, q.topic, q.question, JSON.stringify(q.ideal_points || [])],
      );
    }
    await simpleAudit(userId, 'practice.session_started', session.id, { model, role, difficulty: parsed.data.difficulty });

    return reply.status(201).send({ session: serializeSession(session), subscription: gate.state });
  });

  fastify.get('/sessions/:id', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsedId = idSchema.safeParse((request.params as any)?.id);
    if (!parsedId.success) return reply.status(400).send({ error: 'Invalid session id' });
    const sql = getDB();
    const rows = await sql.unsafe(
      `SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [parsedId.data, currentUser(request).id],
    );
    const session = rows[0] as any;
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    const questions = await sql.unsafe(
      `SELECT id, idx, category, topic, question, answer, feedback, score, answered_at
         FROM interview_questions WHERE session_id = $1 ORDER BY idx`,
      [session.id],
    );
    return reply.send({ session: serializeSession(session), questions: questions.map(serializeQuestion) });
  });

  fastify.post('/sessions/:id/answer', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsedId = idSchema.safeParse((request.params as any)?.id);
    if (!parsedId.success) return reply.status(400).send({ error: 'Invalid session id' });
    const parsed = answerSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.status(400).send({ error: 'Answer must be at least 10 characters', details: parsed.error.issues });
    const userId = currentUser(request).id;
    const sql = getDB();

    const sessionRows = await sql.unsafe(
      `SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [parsedId.data, userId],
    );
    const session = sessionRows[0] as any;
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    if (session.status !== 'in_progress') return reply.status(409).send({ error: 'This interview is no longer active.' });

    const qRows = await sql.unsafe(
      `SELECT * FROM interview_questions WHERE id = $1 AND session_id = $2 AND user_id = $3 LIMIT 1`,
      [parsed.data.question_id, session.id, userId],
    );
    const question = qRows[0] as any;
    if (!question) return reply.status(404).send({ error: 'Question not found in this session' });
    if (question.answered_at) return reply.status(409).send({ error: 'This question already has an answer.' });

    // Small, owned-context hint only: years of experience and headline. Answers
    // themselves are never copied into the hint, mirroring the drafting privacy stance.
    const profile = await loadProfile(sql, userId);

    const grade = await gradeAnswer(
      {
        question: question.question,
        category: question.category,
        topic: question.topic,
        ideal_points: Array.isArray(question.ideal_points) ? question.ideal_points : safeParse(question.ideal_points) || [],
      },
      parsed.data.answer,
      session.difficulty as Difficulty,
      {
        experience_years: profile.experience_years != null ? Number(profile.experience_years) : undefined,
        headline: String(profile.headline || ''),
      },
    );

    const updated = await sql.unsafe(
      `UPDATE interview_questions
          SET answer = $2, feedback = $3::jsonb, score = $4, answered_at = now()
        WHERE id = $1
        RETURNING id, idx, category, topic, question, answer, feedback, score, answered_at`,
      [question.id, parsed.data.answer, JSON.stringify(grade), grade.score],
    );

    // Adaptive follow-up: the interviewer keeps the thread alive — right after
    // the intro answer (the classic "tell me about yourself" → "you mentioned
    // X…" chain), and again after the last queued question. The follow-up is
    // generated from the candidate's actual words. Capped so a session cannot
    // balloon, and the intro follow-up is inserted as the NEXT question (later
    // items shift one slot) rather than at the tail.
    const FOLLOWUP_CAP = 3;
    let followUp: ReturnType<typeof serializeQuestion> | null = null;
    try {
      const countRows = await sql.unsafe(
        `SELECT COUNT(*)::int AS total, COALESCE(MAX(idx), -1) AS max_idx FROM interview_questions WHERE session_id = $1`,
        [session.id],
      );
      const total = Number((countRows[0] as any)?.total || 0);
      const maxIdx = Number((countRows[0] as any)?.max_idx ?? -1);
      const extras = total - Number(session.question_count || 0);
      const isIntro = String(question.category) === 'intro';
      const isLastQueued = Number(question.idx) >= maxIdx;
      if (total > 0 && extras < FOLLOWUP_CAP && (isIntro || isLastQueued)) {
        const historyRows = await sql.unsafe(
          `SELECT question, COALESCE(answer, '') AS answer FROM interview_questions
            WHERE session_id = $1 AND answer IS NOT NULL ORDER BY idx DESC LIMIT 3`,
          [session.id],
        );
        const followUpQuestion = await generateFollowUp({
          role_focus: session.role_focus,
          difficulty: String(session.difficulty || 'standard'),
          question: question.question,
          topic: question.topic,
          answer: parsed.data.answer,
          history: (historyRows as any[]).map((h) => ({ question: String(h.question || ''), answer: String(h.answer || '') })),
        });
        const insertIdx = isIntro && !isLastQueued ? Number(question.idx) + 1 : maxIdx + 1;
        if (insertIdx <= maxIdx) {
          // Make room: everything after the current question moves one slot.
          await sql.unsafe(
            `UPDATE interview_questions SET idx = idx + 1 WHERE session_id = $1 AND idx >= $2`,
            [session.id, insertIdx],
          );
        }
        const inserted = await sql.unsafe(
          `INSERT INTO interview_questions (session_id, user_id, idx, category, topic, question, ideal_points)
            VALUES ($1, $2, $3, 'follow_up', $4, $5, $6::jsonb)
            RETURNING id, idx, category, topic, question, answer, feedback, score, answered_at`,
          [session.id, userId, insertIdx, followUpQuestion.topic, followUpQuestion.question, JSON.stringify(followUpQuestion.ideal_points || [])],
        );
        // Keep the session's expected length in step so progress and finalize stay coherent.
        await sql.unsafe(
          `UPDATE interview_sessions SET question_count = $2 WHERE id = $1`,
          [session.id, total + 1],
        );
        followUp = serializeQuestion((inserted[0] as any));
      }
    } catch { /* best-effort: the interview continues with the standard queue */ }

    return reply.send({ question: serializeQuestion((updated[0] as any)), grade, follow_up: followUp });
  });

  fastify.post('/sessions/:id/finish', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsedId = idSchema.safeParse((request.params as any)?.id);
    if (!parsedId.success) return reply.status(400).send({ error: 'Invalid session id' });
    const userId = currentUser(request).id;
    const sql = getDB();

    const sessionRows = await sql.unsafe(
      `SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [parsedId.data, userId],
    );
    const session = sessionRows[0] as any;
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    if (session.status === 'completed') return reply.send({ session: serializeSession(session), already_completed: true });
    if (session.status === 'abandoned') return reply.status(409).send({ error: 'This interview was discarded.' });

    const items = await sql.unsafe(
      `SELECT category, question, answer, COALESCE(feedback, 'null'::jsonb) AS feedback, score
         FROM interview_questions WHERE session_id = $1 ORDER BY idx`,
      [session.id],
    );
    const answered = (items as any[]).filter((i) => i.score !== null && i.score !== undefined);
    const scores = answered.map((i) => Number(i.score)).filter((n) => !Number.isNaN(n));
    const overall = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    const byCategory: Record<string, number> = {};
    const catScores: Record<string, number[]> = {};
    for (const item of answered) {
      const c = String(item.category || 'general');
      (catScores[c] = catScores[c] || []).push(Number(item.score));
    }
    for (const c of Object.keys(catScores)) {
      byCategory[c] = Math.round(catScores[c].reduce((a, b) => a + b, 0) / catScores[c].length);
    }

    const { verdict, summary } = await summarizeSession(session, answered.map((i) => ({
      category: String(i.category || 'general'), score: Number(i.score), question: i.question, answer: i.answer, feedback: safeParse(i.feedback),
    })));

    const updated = await sql.unsafe(
      `UPDATE interview_sessions
          SET status = 'completed', overall_score = $2, verdict = $3, summary = $4, completed_at = now()
        WHERE id = $1
        RETURNING *`,
      [session.id, overall, verdict, summary],
    );
    await simpleAudit(userId, 'practice.session_completed', session.id, { overall, answered: answered.length });
    return reply.send({ session: serializeSession((updated[0] as any)), by_category: byCategory });
  });

  fastify.delete('/sessions/:id', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsedId = idSchema.safeParse((request.params as any)?.id);
    if (!parsedId.success) return reply.status(400).send({ error: 'Invalid session id' });
    const sql = getDB();
    const updated = await sql.unsafe(
      `UPDATE interview_sessions SET status = 'abandoned'
        WHERE id = $1 AND user_id = $2 AND status = 'in_progress'
        RETURNING id`,
      [parsedId.data, currentUser(request).id],
    );
    if (updated.length === 0) return reply.status(404).send({ error: 'No active session to discard' });
    return reply.send({ ok: true });
  });

  /* ------------------------ learning tracks ------------------------ */

  fastify.get('/learning', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsed = learningSchema.safeParse(request.query || {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid role' });
    const userId = currentUser(request).id;
    const sql = getDB();
    const role = await resolveRole(sql, userId, parsed.data.role_focus || '');

    const trackRows = await sql.unsafe(
      `SELECT t.id, t.role_focus, t.model, t.payload, t.created_at, t.updated_at,
              COALESCE(p.done_map, '{}'::jsonb) AS done_map
         FROM learning_tracks t
         LEFT JOIN (
           SELECT track_id, jsonb_object_agg(module_index, done ORDER BY module_index)::jsonb AS done_map
             FROM learning_module_progress GROUP BY track_id
         ) p ON p.track_id = t.id
        WHERE t.user_id = $1 AND lower(t.role_focus) = lower($2)
        LIMIT 1`,
      [userId, role],
    );
    const trackRow = trackRows[0] as any;
    if (!trackRow) return reply.send({ track: null, role_focus: role });

    const modules = Array.isArray(trackRow.payload) ? trackRow.payload : safeParse(trackRow.payload) || [];
    const doneMap = trackRow.done_map && !Array.isArray(trackRow.done_map) && typeof trackRow.done_map === 'object' ? trackRow.done_map : {};
    const modulesWithProgress = modules.map((m: any, i: number) => ({ ...m, index: i, done: Boolean(doneMap[String(i)] || doneMap[i]) }));
    return reply.send({
      track: {
        id: trackRow.id,
        role_focus: trackRow.role_focus,
        model: trackRow.model,
        created_at: trackRow.created_at,
        updated_at: trackRow.updated_at,
        modules: modulesWithProgress,
        progress: { done: modulesWithProgress.filter((m: any) => m.done).length, total: modulesWithProgress.length },
      },
      role_focus: role,
    });
  });

  fastify.post('/learning/refresh', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsed = learningSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid role' });
    const userId = currentUser(request).id;
    const sql = getDB();
    const role = await resolveRole(sql, userId, parsed.data.role_focus || '');

    // Keep regeneration honest: at most one refresh per role per 6 hours so the
    // button cannot be abused into a provider-cost faucet.
    const throttleKey = `practice:refresh:${userId}:${role.toLowerCase()}`;
    const redis = getRedis();
    try {
      const claimed = await redis.set(throttleKey, '1', 'EX', 6 * 3600, 'NX');
      if (!claimed) return reply.status(429).send({ error: 'Track refreshed recently. Try again later.' });
    } catch {
      // Redis unavailable: fail open rather than block the candidate's track.
    }

    const profile = await loadProfile(sql, userId);
    const { modules, model } = await generateLearningTrack(profile, role);

    const existing = await sql.unsafe(
      `SELECT id FROM learning_tracks WHERE user_id = $1 AND lower(role_focus) = lower($2) LIMIT 1`,
      [userId, role],
    );
    let trackId: string;
    if (existing.length > 0) {
      trackId = (existing[0] as any).id;
      const upd = await sql.unsafe(
        `UPDATE learning_tracks SET payload = $2::jsonb, model = $3, updated_at = now() WHERE id = $1 RETURNING id, role_focus, model, created_at, updated_at`,
        [trackId, JSON.stringify(modules), model],
      );
      // Fresh material resets per-module progress so the new plan starts clean.
      await sql.unsafe(`DELETE FROM learning_module_progress WHERE track_id = $1`, [trackId]);
      return reply.send({ track: { ...((upd[0] as any)), modules } });
    }
    const created = await sql.unsafe(
      `INSERT INTO learning_tracks (user_id, role_focus, payload, model) VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, role_focus, model, created_at, updated_at`,
      [userId, role, JSON.stringify(modules), model],
    );
    await simpleAudit(userId, 'practice.learning_track_generated', (created[0] as any).id, { role, model });
    return reply.status(201).send({ track: { ...((created[0] as any)), modules } });
  });

  fastify.post('/learning/:trackId/progress', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const trackId = idSchema.safeParse((request.params as any)?.trackId);
    if (!trackId.success) return reply.status(400).send({ error: 'Invalid track id' });
    const parsed = toggleSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid module index', details: parsed.error.issues });
    const userId = currentUser(request).id;
    const sql = getDB();

    // The track itself must belong to the caller, and the index must exist.
    const trackRows = await sql.unsafe(
      `SELECT jsonb_array_length(payload)::int AS total FROM learning_tracks WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [trackId.data, userId],
    );
    const total = Number((trackRows[0] as any)?.total || 0);
    if (total === 0) return reply.status(404).send({ error: 'Track not found' });
    if (parsed.data.module_index >= total) return reply.status(400).send({ error: 'Module index out of range' });

    // Read-then-flip with the index read scoped to the owner row, so double
    // clicks and stale tabs toggle instead of forcing a fixed state.
    const current = await sql.unsafe(
      `SELECT done FROM learning_module_progress WHERE track_id = $1 AND user_id = $2 AND module_index = $3 LIMIT 1`,
      [trackId.data, userId, parsed.data.module_index],
    );
    const nextDone = !(current.length > 0 && (current[0] as any).done);
    await sql.unsafe(
      `INSERT INTO learning_module_progress (track_id, user_id, module_index, done, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (track_id, module_index)
       DO UPDATE SET done = $4, user_id = $2, updated_at = now()`,
      [trackId.data, userId, parsed.data.module_index, nextDone],
    );
    const progressRows = await sql.unsafe(
      `SELECT COUNT(*)::int AS done FROM learning_module_progress WHERE track_id = $1 AND user_id = $2 AND done = true`,
      [trackId.data, userId],
    );
    const done = Number((progressRows[0] as any)?.done || 0);
    return reply.send({ ok: true, done, total, module_index: parsed.data.module_index, done_state: nextDone });
  });
};

function safeParse(value: unknown): any {
  if (value == null) return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function serializeQuestion(q: any) {
  return {
    id: q.id,
    idx: q.idx,
    category: q.category,
    topic: q.topic,
    question: q.question,
    answer: q.answer || '',
    feedback: q.feedback && typeof q.feedback === 'object' && !Array.isArray(q.feedback) && q.feedback !== null
      ? (typeof (q.feedback as any).score === 'number' ? q.feedback : safeParse(q.feedback))
      : null,
    score: q.score ?? null,
    answered_at: q.answered_at ?? null,
  };
}

export function serializeSession(s: any): SessionRecord {
  return {
    id: s.id,
    status: s.status,
    role_focus: s.role_focus,
    difficulty: s.difficulty,
    question_count: s.question_count,
    model: s.model,
    overall_score: s.overall_score ?? null,
    verdict: s.verdict || '',
    summary: s.summary || '',
    started_at: s.started_at,
    completed_at: s.completed_at ?? null,
  };
}
