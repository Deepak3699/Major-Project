import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { getRedis } from '../utils/redis';
import { authenticate } from '../middleware/auth';
import { logAuditEvent } from '../utils/audit';
import {
  gradeAnswer,
  summarizeSession,
  generateLearningTrack,
  generateOpeningLine,
  generateInterviewerReply,
  type Difficulty,
} from '../utils/practice-ai';
import {
  detectAnswerLanguage,
  generateHinglishReply,
  generateNextQuestion,
  generatePresentationFeedback,
  generateSessionReport,
  type ReportItem,
} from '../utils/practice-coach';
import {
  AVATARS,
  getAvatar,
  recommendAvatar,
  type JobContext,
} from '../utils/interview-avatars';
import type { SubscriptionState, SessionRecord, PresentationMetrics } from '../types/practice';

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
  avatar_id: z.string().trim().max(40).optional(),
  job_id: idSchema.optional(),
});

const avatarQuerySchema = z.object({
  job_id: idSchema.optional(),
  role_focus: z.string().trim().max(120).optional(),
});

const answerSchema = z.object({
  question_id: idSchema,
  answer: z.string().trim().min(10).max(6000),
});

const presentationSchema = z.object({
  camera_on: z.boolean(),
  duration_seconds: z.coerce.number().min(0).max(4 * 60 * 60),
  samples: z.coerce.number().int().min(0).max(2000),
  face_visible_ratio: z.coerce.number().min(0).max(1),
  avg_brightness: z.coerce.number().min(0).max(255),
  motion_score: z.coerce.number().min(0).max(1),
  steady_ratio: z.coerce.number().min(0).max(1),
  framed_ratio: z.coerce.number().min(0).max(1),
  // Downscaled JPEG snapshots. Processed for feedback and never persisted.
  snapshots: z.array(z.string().max(700_000)).max(3).optional(),
});

const finishSchema = z.object({ presentation: presentationSchema.optional() });

const learningSchema = z.object({ role_focus: z.string().trim().min(2).max(120).optional() });
const toggleSchema = z.object({ module_index: z.coerce.number().int().min(0).max(30) });

function currentUser(request: FastifyRequest) {
  return request.user as { id: string; role: string; email?: string };
}

function isCandidate(request: FastifyRequest, reply: FastifyReply): boolean {
  if (['candidate', 'user'].includes(currentUser(request).role)) return true;
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

/**
 * Load the specific job a session is being practised for. Returns null for a
 * missing / deleted / unpublished job so the session still starts with the
 * role string instead of failing the candidate's click.
 */
async function loadJobContext(sql: ReturnType<typeof getDB>, jobId?: string | null): Promise<JobContext | null> {
  if (!jobId) return null;
  const rows = await sql.unsafe(
    `SELECT jp.id, jp.title, jp.skills, jp.description, jp.about_job, c.name AS company_name
       FROM job_postings jp
       LEFT JOIN companies c ON c.id = jp.company_id
      WHERE jp.id = $1
        AND jp.is_active = true
        AND jp.review_status = 'published'
      LIMIT 1`,
    [jobId],
  );
  const job = rows[0] as any;
  if (!job) return null;
  const skills = Array.isArray(job.skills)
    ? job.skills.map((s: any) => String(s || '').trim()).filter(Boolean).slice(0, 25)
    : [];
  return {
    id: String(job.id),
    title: String(job.title || '').trim() || 'General',
    company: String(job.company_name || '').trim(),
    description: String(job.description || ''),
    about_job: String(job.about_job || ''),
    skills,
  };
}

function candidateFirstName(profile: Record<string, any>): string {
  const raw = String(profile?.full_name || profile?.name || '').trim();
  return raw.split(/\s+/).filter(Boolean)[0] || '';
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

  /* ------------------------ interviewer roster ------------------------ */

  fastify.get('/avatars', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsed = avatarQuerySchema.safeParse(request.query || {});
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid avatar query', details: parsed.error.issues });
    const sql = getDB();
    const userId = currentUser(request).id;

    const job = parsed.data.job_id ? await loadJobContext(sql, parsed.data.job_id) : null;
    const role = parsed.data.role_focus || job?.title || await resolveRole(sql, userId, '');
    const recommendation = recommendAvatar({ role, job });

    return reply.send({
      avatars: AVATARS,
      recommended: {
        avatar_id: recommendation.avatar.id,
        name: recommendation.avatar.name,
        reason: recommendation.reason,
        score: recommendation.score,
      },
      job,
      role_focus: role,
    });
  });

  /* ------------------------ interview sessions ------------------------ */

  fastify.get('/sessions', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const sql = getDB();
    const rows = await sql.unsafe(
      `SELECT s.id, s.role_focus, s.difficulty, s.question_count, s.status, s.model,
              s.avatar_id, s.job_id, s.job_title, s.job_company, s.opening_line,
              s.overall_score, s.verdict, s.summary, s.started_at, s.completed_at,
              (SELECT COUNT(*)::int FROM interview_questions q WHERE q.session_id = s.id AND q.answered_at IS NOT NULL) AS answered_count
         FROM interview_sessions s
        WHERE s.user_id = $1 AND s.status <> 'abandoned'
        ORDER BY s.started_at DESC
        LIMIT 50`,
      [currentUser(request).id],
    );
    return {
      sessions: rows.map((row: any) => ({
        ...serializeSession(row),
        answered_count: Number(row.answered_count || 0),
      })),
    };
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

    const job = await loadJobContext(sql, parsed.data.job_id);
    const role = await resolveRole(sql, userId, parsed.data.role_focus || job?.title || '');
    const avatar = parsed.data.avatar_id
      ? getAvatar(parsed.data.avatar_id)
      : recommendAvatar({ role, job }).avatar;
    const profile = await loadProfile(sql, userId);

    // Recent topics (all prior sessions) so question sets do not repeat.
    const recentRows = await sql.unsafe(
      `SELECT DISTINCT topic FROM interview_questions WHERE user_id = $1 ORDER BY topic LIMIT 60`,
      [userId],
    );
    const recentTopics = recentRows.map((r: any) => r.topic);

    // Only the opening question is created up front. Every later question is
    // generated from the candidate's own answer, so the round is a
    // conversation rather than a pre-loaded questionnaire.
    const targetCount = parsed.data.question_count;
    const firstQuestion = await generateNextQuestion({
      profile,
      role,
      difficulty: parsed.data.difficulty as Difficulty,
      job,
      avatar,
      asked: [],
      targetCount,
      language: 'english',
      recentTopics,
    });
    const model = firstQuestion.source === 'gemini' ? 'gemini-2.5-flash' : 'template';

    // The avatar greets the candidate before the first question. Kept on the
    // session row so reopening an interview resumes the same opening line.
    const openingLine = await generateOpeningLine({
      avatar,
      role,
      job,
      candidateName: candidateFirstName(profile),
    });

    const created = await sql.unsafe(
      `INSERT INTO interview_sessions
         (user_id, role_focus, difficulty, question_count, model, avatar_id, job_id, job_title, job_company, opening_line)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        userId,
        role,
        parsed.data.difficulty,
        targetCount,
        model,
        avatar.id,
        job?.id || null,
        job?.title || '',
        job?.company || '',
        openingLine,
      ],
    );
    const session = created[0] as any;

    const insertedFirst = await sql.unsafe(
      `INSERT INTO interview_questions (session_id, user_id, idx, category, topic, question, ideal_points)
       VALUES ($1, $2, 0, $3, $4, $5, $6::jsonb)
       RETURNING id, idx, category, topic, question, answer, interviewer_reply, feedback, score, answered_at, ideal_points`,
      [session.id, userId, firstQuestion.category, firstQuestion.topic, firstQuestion.question, firstQuestion.ideal_points || []],
    );
    await simpleAudit(userId, 'practice.session_started', session.id, {
      model,
      role,
      difficulty: parsed.data.difficulty,
      avatar_id: avatar.id,
      job_id: job?.id || null,
      adaptive: true,
    });

    return reply.status(201).send({
      session: serializeSession(session),
      first_question: insertedFirst.length ? serializeQuestion(insertedFirst[0]) : null,
      subscription: gate.state,
    });
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
      `SELECT id, idx, category, topic, question, answer, answer_language, interviewer_reply, feedback, score, answered_at
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
    const language = detectAnswerLanguage(parsed.data.answer);

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
          SET answer = $2, answer_language = $5, feedback = $3::jsonb, score = $4, answered_at = now()
        WHERE id = $1
        RETURNING id, idx, category, topic, question, answer, answer_language, feedback, score, answered_at`,
      [question.id, parsed.data.answer, grade, grade.score, language],
    );

    // The next question is written from the conversation itself: the intro
    // answer drives the first dig, and every later question sees the whole
    // transcript. The session length is a target, not a pre-built queue.
    let nextQuestion: ReturnType<typeof serializeQuestion> | null = null;
    try {
      const progressRows = await sql.unsafe(
        `SELECT COUNT(*) FILTER (WHERE answered_at IS NOT NULL)::int AS answered,
                COALESCE(MAX(idx), -1)::int AS max_idx
           FROM interview_questions WHERE session_id = $1`,
        [session.id],
      );
      const answeredCount = Number((progressRows[0] as any)?.answered || 0);
      const maxIdx = Number((progressRows[0] as any)?.max_idx ?? -1);
      const target = Number(session.question_count || 0);

      if (target > 0 && answeredCount < target) {
        const historyRows = await sql.unsafe(
          `SELECT category, topic, question, answer, score FROM interview_questions
            WHERE session_id = $1 AND answered_at IS NOT NULL ORDER BY idx`,
          [session.id],
        );
        const asked = (historyRows as any[]).map((row) => ({
          category: String(row.category || 'general'),
          topic: String(row.topic || ''),
          question: String(row.question || ''),
          answer: String(row.answer || ''),
          score: row.score == null ? null : Number(row.score),
        }));
        const generated = await generateNextQuestion({
          profile,
          role: String(session.role_focus || ''),
          difficulty: String(session.difficulty || 'standard') as Difficulty,
          job: session.job_id
            ? { id: session.job_id, title: session.job_title || session.role_focus, company: session.job_company || '' }
            : null,
          avatar: getAvatar(session.avatar_id || 'aria'),
          asked,
          targetCount: target,
          language,
        });
        const inserted = await sql.unsafe(
          `INSERT INTO interview_questions (session_id, user_id, idx, category, topic, question, ideal_points)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING id, idx, category, topic, question, answer, answer_language, interviewer_reply, feedback, score, answered_at, ideal_points`,
          [session.id, userId, maxIdx + 1, generated.category, generated.topic, generated.question, generated.ideal_points || []],
        );
        nextQuestion = inserted.length ? serializeQuestion(inserted[0]) : null;
      }
    } catch { /* the candidate can still finish if generation hiccups */ }

    // The avatar reacts in character before the next question opens. A
    // Hinglish/Hindi answer gets a Hinglish reaction so the mirroring is
    // audible within one turn. Best-effort: a provider hiccup never blocks
    // the candidate's progress.
    let interviewerReply = '';
    try {
      const replyInput = {
        avatar: getAvatar(session.avatar_id || 'aria'),
        role: String(session.role_focus || ''),
        job: session.job_id
          ? { id: session.job_id, title: session.job_title || session.role_focus, company: session.job_company || '' }
          : null,
        difficulty: String(session.difficulty || 'standard'),
        question: question.question,
        answer: parsed.data.answer,
        score: grade.score,
        strengths: grade.strengths,
        improvements: grade.improvements,
        turn: Number(question.idx) || 0,
      };
      interviewerReply = language === 'english'
        ? await generateInterviewerReply({ ...replyInput, followUp: nextQuestion?.question || '' })
        : await generateHinglishReply({ ...replyInput, language, hasFollowUp: Boolean(nextQuestion) });
      if (interviewerReply) {
        await sql.unsafe(
          `UPDATE interview_questions SET interviewer_reply = $2 WHERE id = $1`,
          [question.id, interviewerReply],
        );
      }
    } catch { /* spoken reaction is best-effort; grading already succeeded */ }

    const answeredQuestion = serializeQuestion({
      ...(updated[0] as any),
      answer_language: language,
      interviewer_reply: interviewerReply,
    });
    return reply.send({
      question: answeredQuestion,
      grade,
      reply: interviewerReply,
      language,
      next_question: nextQuestion,
      follow_up: nextQuestion,
      complete: !nextQuestion,
    });
  });

  fastify.post('/sessions/:id/finish', { bodyLimit: 4 * 1024 * 1024 }, async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsedId = idSchema.safeParse((request.params as any)?.id);
    if (!parsedId.success) return reply.status(400).send({ error: 'Invalid session id' });
    const parsedBody = finishSchema.safeParse(request.body || {});
    if (!parsedBody.success) return reply.status(400).send({ error: 'Invalid presentation payload', details: parsedBody.error.issues });
    const userId = currentUser(request).id;
    const sql = getDB();

    const sessionRows = await sql.unsafe(
      `SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [parsedId.data, userId],
    );
    const session = sessionRows[0] as any;
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    if (session.status === 'completed') {
      return reply.send({
        session: serializeSession(session),
        already_completed: true,
        report: serializeSession(session).report,
        presentation: serializeSession(session).presentation,
      });
    }
    if (session.status === 'abandoned') return reply.status(409).send({ error: 'This interview was discarded.' });

    const items = await sql.unsafe(
      `SELECT category, topic, question, answer, COALESCE(feedback, 'null'::jsonb) AS feedback, score,
              COALESCE(ideal_points, '[]'::jsonb) AS ideal_points
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

    const reportItems: ReportItem[] = answered.map((item) => ({
      category: String(item.category || 'general'),
      topic: String(item.topic || ''),
      question: String(item.question || ''),
      answer: String(item.answer || ''),
      score: Number(item.score),
      ideal_points: Array.isArray(item.ideal_points) ? item.ideal_points : safeParse(item.ideal_points) || [],
      feedback: safeParse(item.feedback),
    }));

    const avatar = getAvatar(session.avatar_id || 'aria');
    const [summaryResult, presentationFeedback] = await Promise.all([
      summarizeSession(session, answered.map((i) => ({
        category: String(i.category || 'general'), score: Number(i.score), question: i.question, answer: i.answer, feedback: safeParse(i.feedback),
      }))),
      parsedBody.data.presentation
        ? generatePresentationFeedback({
            metrics: parsedBody.data.presentation as PresentationMetrics,
            role: String(session.role_focus || ''),
            avatar,
          })
        : Promise.resolve(null),
    ]);

    // The report's communication dimension uses the camera review when one
    // exists, so it is generated after the presentation pass.
    const finalReport = await generateSessionReport({
      session: {
        role_focus: String(session.role_focus || ''),
        difficulty: String(session.difficulty || 'standard'),
        job_title: String(session.job_title || ''),
        job_company: String(session.job_company || ''),
      },
      avatar,
      items: reportItems,
      byCategory,
      presentation: presentationFeedback,
    });

    const { verdict, summary } = summaryResult;

    const updated = await sql.unsafe(
      `UPDATE interview_sessions
          SET status = 'completed', overall_score = $2, verdict = $3, summary = $4,
              report = $5::jsonb, presentation = $6::jsonb, completed_at = now()
        WHERE id = $1
        RETURNING *`,
      [session.id, overall, verdict, summary, finalReport, presentationFeedback],
    );
    await simpleAudit(userId, 'practice.session_completed', session.id, {
      overall,
      answered: answered.length,
      presentation: presentationFeedback?.available || false,
      report: finalReport.model,
    });
    const serialized = serializeSession({
      ...(updated[0] as any),
      report: finalReport,
      presentation: presentationFeedback,
    });
    return reply.send({
      session: serialized,
      by_category: byCategory,
      report: finalReport,
      presentation: presentationFeedback,
    });
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
        [trackId, modules as any, model],
      );
      // Fresh material resets per-module progress so the new plan starts clean.
      await sql.unsafe(`DELETE FROM learning_module_progress WHERE track_id = $1`, [trackId]);
      return reply.send({ track: { ...((upd[0] as any)), modules } });
    }
    const created = await sql.unsafe(
      `INSERT INTO learning_tracks (user_id, role_focus, payload, model) VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, role_focus, model, created_at, updated_at`,
      [userId, role, modules as any, model],
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
    answer_language: q.answer_language || 'english',
    interviewer_reply: q.interviewer_reply || '',
    feedback: objectOrNull(q.feedback),
    score: q.score ?? null,
    answered_at: q.answered_at ?? null,
  };
}

function objectOrNull(value: unknown): any {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  const parsed = safeParse(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

export function serializeSession(s: any): SessionRecord {
  const avatar = getAvatar(s.avatar_id || 'aria');
  return {
    id: s.id,
    status: s.status,
    role_focus: s.role_focus,
    difficulty: s.difficulty,
    question_count: s.question_count,
    model: s.model,
    avatar,
    job: s.job_id
      ? {
          id: s.job_id,
          title: s.job_title || s.role_focus || 'General',
          company: s.job_company || '',
        }
      : null,
    opening_line: s.opening_line || '',
    overall_score: s.overall_score ?? null,
    verdict: s.verdict || '',
    summary: s.summary || '',
    report: objectOrNull(s.report),
    presentation: objectOrNull(s.presentation),
    started_at: s.started_at,
    completed_at: s.completed_at ?? null,
  };
}
