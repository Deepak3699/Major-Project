import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDB } from '../utils/db';
import { authenticate, authorize } from '../middleware/auth';
import { prepareApplicationDocuments } from '../utils/application-prep';
import { scoreJobMatch, scoreJobTrust } from '../utils/job-intelligence';
import { loadRecommendationModel, recommendationFeatures, recommendationModelStatus, scoreRecommendation, setRecommendationModelEnabled, trainRecommendationModel } from '../utils/recommendation-model';
import { logAuditEvent } from '../utils/audit';
import { comparePassword } from '../utils/crypto';

const APPLICATION_STATUSES = ['SAVED','RECOMMENDED','READY_TO_APPLY','APPLIED','SCREENING','INTERVIEW','OFFER','REJECTED','WITHDRAWN','JOINED'] as const;
const idSchema = z.string().uuid();
const profileSchema = z.object({
  full_name: z.string().trim().min(1).max(160),
  headline: z.string().trim().max(200).default(''),
  contact_email: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
  phone: z.string().trim().max(40).nullable().optional(),
  location: z.string().trim().max(160).default(''),
  summary: z.string().trim().max(4000).default(''),
  skills: z.array(z.string().trim().min(1).max(80)).max(80).default([]),
  preferred_roles: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  preferred_locations: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  remote_preference: z.enum(['any','remote','hybrid','onsite']).default('any'),
  experience_years: z.coerce.number().min(0).max(60).default(0),
  education_level: z.string().trim().max(160).default(''),
  salary_min: z.coerce.number().min(0).nullable().optional(),
  salary_currency: z.enum(['INR','USD','EUR','GBP']).default('INR'),
  experience: z.array(z.object({ title: z.string().max(200).default(''), company: z.string().max(200).default(''), period: z.string().max(100).default(''), description: z.string().max(2000).default('') })).max(20).default([]),
  projects: z.array(z.object({ name: z.string().max(200).default(''), description: z.string().max(2000).default(''), technologies: z.array(z.string().max(80)).max(40).default([]) })).max(30).default([]),
  certifications: z.array(z.string().trim().min(1).max(160)).max(50).default([]),
  resume_filename: z.string().trim().max(255).nullable().optional(),
});

const statuses = z.enum(APPLICATION_STATUSES);

function currentUser(request: FastifyRequest) {
  return request.user as { id: string; role: string; email?: string };
}

function isCandidate(request: FastifyRequest, reply: FastifyReply): boolean {
  if (currentUser(request).role === 'candidate') return true;
  reply.status(403).send({ error: 'Candidate account required' });
  return false;
}

function isAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (currentUser(request).role === 'admin') return true;
  reply.status(403).send({ error: 'Admin access required' });
  return false;
}

function profileCompletion(profile: any): number {
  if (!profile) return 0;
  const checks = [
    Boolean(profile.full_name), Boolean(profile.headline), Boolean(profile.location),
    Array.isArray(profile.skills) && profile.skills.length > 0,
    Array.isArray(profile.preferred_roles) && profile.preferred_roles.length > 0,
    Number(profile.experience_years) >= 0, Boolean(profile.education_level),
    Array.isArray(profile.projects) && profile.projects.length > 0,
  ];
  return Math.round(checks.filter(Boolean).length / checks.length * 100);
}

async function fetchJob(sql: ReturnType<typeof getDB>, id: string, includeUnpublished = false) {
  const gate = includeUnpublished ? '' : `AND jp.review_status = 'published' AND jp.is_active = true AND jp.trust_score >= 70
    AND jp.india_confirmed = true AND length(btrim(COALESCE(NULLIF(jp.description,''),jp.about_job,''))) >= 80`;
  const candidateColumns = `
    jp.id, jp.title, jp.description, jp.about_job, jp.experience_level, jp.salary_range,
    jp.location, jp.location_type, jp.employment_type, jp.apply_url, jp.job_url,
    jp.source_site, jp.skills, jp.posted_at, jp.first_seen_at, jp.trust_score,
    jp.trust_band, jp.review_status,
    COALESCE((SELECT COUNT(DISTINCT js.source_site) FROM job_sources js WHERE js.job_posting_id=jp.id),1)::int AS source_count`;
  const columns = includeUnpublished ? 'jp.*' : candidateColumns;
  const rows = await sql.unsafe(`
    SELECT ${columns},
           c.name AS company_name, c.domain AS company_domain, c.website_url AS company_website,
           c.default_email AS company_email, c.default_phone AS company_phone, c.industry AS company_industry,
           h.full_name AS public_hr_name, h.linkedin_url AS public_hr_linkedin, h.contact_url AS public_hr_source
      FROM job_postings jp
      JOIN companies c ON c.id = jp.company_id
      LEFT JOIN hr_contacts h ON h.id=jp.hr_contact_id AND h.contact_source='direct_extracted'
        AND h.confidence_score>=85 AND h.contact_url ~* '^https://'
     WHERE jp.id = $1 ${gate}
     LIMIT 1
  `, [id]);
  return rows[0] as any;
}

function withTrust(job: any) {
  const trust = scoreJobTrust(job);
  return { ...job, trust_score: trust.score, trust_band: trust.band, trust_evidence: trust.evidence };
}

async function loadProfile(sql: ReturnType<typeof getDB>, userId: string) {
  const rows = await sql.unsafe('SELECT * FROM candidate_profiles WHERE user_id = $1', [userId]);
  const profile = rows[0] as any;
  if (!profile) return null;
  return {
    ...profile,
    experience: parseJsonArray(profile.experience),
    projects: parseJsonArray(profile.projects),
  };
}

function parseJsonArray(value: unknown): any[] {
  let parsed = value;
  // Older saves were JSON strings inside JSONB. Parse those once on read so
  // Resume Studio and matching still receive arrays instead of string values.
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  return Array.isArray(parsed) ? parsed : [];
}

function scoreCandidateJob(profile: any, job: any) {
  const match = scoreJobMatch(profile, job);
  const trustedJob = withTrust(job);
  const modelScore = scoreRecommendation(recommendationFeatures(match.breakdown, trustedJob.trust_score));
  const matchScore = Math.round(match.score * 0.75 + modelScore * 0.25);
  return {
    ...trustedJob,
    match_score: matchScore,
    model_score: modelScore,
    score_breakdown: match.breakdown,
    match_reasons: match.reasons,
    missing_skills: match.missing_skills,
    matched_skills: match.matched_skills,
  };
}

export const candidateRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // Restore the administrator's model switch whenever the API process starts.
  try {
    const persisted = await getDB().unsafe("SELECT value FROM settings WHERE key='recommendation_model_runtime'");
    const enabled = (persisted[0] as any)?.value?.enabled;
    if (enabled === false) setRecommendationModelEnabled(false);
  } catch { /* older installations may not have the settings table until migrations run */ }

  fastify.get('/profile', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const profile = await loadProfile(getDB(), currentUser(request).id);
    return { profile: profile || null, completion: profileCompletion(profile) };
  });

  fastify.put('/profile', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid profile', details: parsed.error.issues });
    const userId = currentUser(request).id;
    const profile = parsed.data;
    const sql = getDB();
    const rows = await sql.unsafe(`
      INSERT INTO candidate_profiles (
        user_id, full_name, headline, contact_email, phone, location, summary, skills, preferred_roles,
        preferred_locations, remote_preference, experience_years, education_level, salary_min,
        salary_currency, experience, projects, certifications, resume_filename,
        profile_confirmed_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,now(),now()
      ) ON CONFLICT (user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name, headline = EXCLUDED.headline, contact_email = EXCLUDED.contact_email, phone = EXCLUDED.phone,
        location = EXCLUDED.location, summary = EXCLUDED.summary, skills = EXCLUDED.skills,
        preferred_roles = EXCLUDED.preferred_roles, preferred_locations = EXCLUDED.preferred_locations,
        remote_preference = EXCLUDED.remote_preference, experience_years = EXCLUDED.experience_years,
        education_level = EXCLUDED.education_level, salary_min = EXCLUDED.salary_min,
        salary_currency = EXCLUDED.salary_currency, experience = EXCLUDED.experience,
        projects = EXCLUDED.projects, certifications = EXCLUDED.certifications,
        resume_filename = EXCLUDED.resume_filename, profile_confirmed_at = now(), updated_at = now()
      RETURNING *
    `, [
      userId, profile.full_name, profile.headline, profile.contact_email || null, profile.phone || null,
      profile.location, profile.summary, profile.skills, profile.preferred_roles, profile.preferred_locations,
      profile.remote_preference, profile.experience_years, profile.education_level, profile.salary_min ?? null,
      profile.salary_currency, sql.json(profile.experience), sql.json(profile.projects), profile.certifications,
      profile.resume_filename || null,
    ]);
    const savedProfile = {
      ...(rows[0] as any),
      experience: parseJsonArray((rows[0] as any)?.experience),
      projects: parseJsonArray((rows[0] as any)?.projects),
    };
    return { profile: savedProfile, completion: profileCompletion(savedProfile), confirmed_at: savedProfile?.profile_confirmed_at };
  });

  fastify.delete('/account', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsed = z.object({ password:z.string().min(1).max(256) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error:'Enter your password to confirm account deletion' });
    const user = currentUser(request);
    const rows = await getDB().unsafe('SELECT password_hash FROM users WHERE id=$1 AND role=\'candidate\'', [user.id]);
    if (!rows.length || !(await comparePassword(parsed.data.password,(rows[0] as any).password_hash))) return reply.status(401).send({ error:'Password did not match' });
    await logAuditEvent({ user_id:user.id, action:'delete_candidate_account', resource_type:'user', resource_id:user.id, details:{ reason:'candidate_self_service_request' } });
    await getDB().unsafe('DELETE FROM users WHERE id=$1 AND role=\'candidate\'', [user.id]);
    return { deleted:true };
  });

  fastify.post('/resume/parse', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return reply.status(400).send({ error: 'Resume file is empty' });
    if (body.length > 8 * 1024 * 1024) return reply.status(413).send({ error: 'Resume file must be 8 MB or smaller' });
    const filenameHeader = request.headers['x-resume-filename'];
    const filename = (Array.isArray(filenameHeader) ? filenameHeader[0] : filenameHeader || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
    if (!/\.(pdf|docx|txt)$/i.test(filename)) return reply.status(415).send({ error: 'Upload a PDF, DOCX, or TXT resume' });
    const token = process.env.WORKER_INTERNAL_TOKEN;
    if (!token) return reply.status(503).send({ error: 'Resume parsing is not configured. Set WORKER_INTERNAL_TOKEN for the API and worker.' });
    try {
      const workerUrl = (process.env.WORKERS_URL || 'http://localhost:8000').replace(/\/$/, '');
      const workerResponse = await fetch(`${workerUrl}/resume/parse`, {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'x-internal-token': token, 'x-resume-filename': filename },
        body: body as any,
        signal: AbortSignal.timeout(30_000),
      });
      const result: any = await workerResponse.json().catch(() => ({}));
      if (!workerResponse.ok) {
        request.log.warn({ workerStatus: workerResponse.status, detail: result.detail }, 'Resume parser rejected the uploaded document');
        return reply.status(workerResponse.status >= 500 ? 503 : workerResponse.status).send({ error: result.detail || 'Resume parsing failed' });
      }
      return {
        ...result,
        suggested_profile: { ...result.suggested_profile, contact_email: result.suggested_profile?.email || '' },
      };
    } catch (error) {
      request.log.error({ err: error }, 'Resume parsing worker request failed');
      return reply.status(503).send({ error: 'Resume parsing worker is unavailable. Start the worker service and try again.' });
    }
  });

  fastify.get('/jobs', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const querySchema = z.object({
      q: z.string().trim().max(160).optional(),
      location: z.string().trim().max(120).optional(),
      work_type: z.enum(['remote','hybrid','onsite']).optional(),
      days: z.coerce.number().int().min(1).max(90).default(7),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      sort: z.enum(['newest','trust']).default('newest'),
    });
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid search filters', details: parsed.error.issues });
    const q = parsed.data;
    const values: any[] = [q.days];
    const where = ["jp.is_active = true", "jp.review_status = 'published'", "jp.trust_score >= 70", "jp.india_confirmed = true", "length(btrim(COALESCE(NULLIF(jp.description,''),jp.about_job,''))) >= 80", "COALESCE(jp.posted_at, jp.first_seen_at) >= NOW() - ($1 * INTERVAL '1 day')"];
    if (q.q) {
      values.push(`%${q.q}%`);
      where.push(`(jp.title ILIKE $${values.length} OR c.name ILIKE $${values.length} OR COALESCE(jp.description,'') ILIKE $${values.length} OR array_to_string(jp.skills, ' ') ILIKE $${values.length})`);
    }
    if (q.location) {
      values.push(`%${q.location}%`);
      where.push(`COALESCE(jp.location, '') ILIKE $${values.length}`);
    }
    if (q.work_type) {
      values.push(q.work_type);
      where.push(`jp.location_type = $${values.length}`);
    }
    const base = `FROM job_postings jp JOIN companies c ON c.id = jp.company_id WHERE ${where.join(' AND ')}`;
    const countRows = await getDB().unsafe(`SELECT COUNT(*) AS total ${base}`, values);
    const total = Number((countRows[0] as any)?.total || 0);
    const offset = (q.page - 1) * q.limit;
    const order = 'COALESCE(jp.posted_at,jp.first_seen_at) DESC';
    const jobs = await getDB().unsafe(`
      SELECT jp.id, jp.title, jp.description, jp.about_job, jp.experience_level, jp.salary_range,
             jp.salary_min, jp.salary_max, jp.salary_currency, jp.location, jp.location_type,
             jp.employment_type, jp.apply_url, jp.job_url, jp.source_site, jp.skills,
             jp.posted_at, jp.first_seen_at, jp.trust_score, jp.trust_band, jp.review_status,
             COALESCE((SELECT COUNT(DISTINCT js.source_site) FROM job_sources js WHERE js.job_posting_id=jp.id),1)::int AS source_count,
             c.name AS company_name, c.domain AS company_domain, c.website_url AS company_website,
             c.industry AS company_industry
        ${base}
       ORDER BY ${order}
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `, [...values, q.limit, offset]);
    const profile = await loadProfile(getDB(), currentUser(request).id);
    const data = (jobs as any[]).map((job) => profile ? scoreCandidateJob(profile, job) : withTrust(job));
    if (q.sort === 'trust') data.sort((left, right) => right.trust_score - left.trust_score || new Date(right.posted_at || right.first_seen_at).getTime() - new Date(left.posted_at || left.first_seen_at).getTime());
    return { data, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) }, filters: q };
  });

  fastify.get('/contacts', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const rows = await getDB().unsafe(`
      SELECT DISTINCT ON (jp.id) jp.id AS job_id,jp.title AS job_title,jp.location,jp.apply_url,jp.job_url,
             jp.source_site,jp.trust_score,jp.posted_at,c.id AS company_id,c.name AS company_name,
             c.domain AS company_domain,c.website_url AS company_website,c.default_email AS company_email,
             c.default_phone AS company_phone,h.full_name AS public_hr_name,h.linkedin_url AS public_hr_linkedin,
             h.contact_url AS public_hr_source
        FROM job_postings jp JOIN companies c ON c.id=jp.company_id
        LEFT JOIN hr_contacts h ON h.id=jp.hr_contact_id AND h.contact_source='direct_extracted'
          AND h.confidence_score>=85 AND h.contact_url ~* '^https://'
       WHERE jp.is_active=true AND jp.review_status='published' AND jp.trust_score >= 70
         AND jp.india_confirmed=true AND length(btrim(COALESCE(NULLIF(jp.description,''),jp.about_job,''))) >= 80
       ORDER BY jp.id,COALESCE(jp.posted_at,jp.first_seen_at) DESC
       LIMIT 300
    `);
    return { data: rows };
  });

  fastify.get('/jobs/:id', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const params = z.object({ id: idSchema }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Invalid job ID' });
    const job = await fetchJob(getDB(), params.data.id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    const profile = await loadProfile(getDB(), currentUser(request).id);
    return { job: profile ? scoreCandidateJob(profile, job) : withTrust(job) };
  });

  fastify.get('/recommendations', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const userId = currentUser(request).id;
    const profile = await loadProfile(getDB(), userId);
    if (!profile) return { needs_profile: true, data: [] };
    const rows = await getDB().unsafe(`
      SELECT jp.id, jp.title, jp.description, jp.about_job, jp.experience_level, jp.salary_range,
             jp.salary_min, jp.salary_max, jp.salary_currency, jp.location, jp.location_type,
             jp.employment_type, jp.apply_url, jp.job_url, jp.source_site, jp.skills,
             jp.posted_at, jp.first_seen_at, jp.trust_score, jp.trust_band, jp.review_status,
             COALESCE((SELECT COUNT(DISTINCT js.source_site) FROM job_sources js WHERE js.job_posting_id=jp.id),1)::int AS source_count,
             c.name AS company_name, c.domain AS company_domain, c.website_url AS company_website,
             c.industry AS company_industry
        FROM job_postings jp JOIN companies c ON c.id = jp.company_id
       WHERE jp.is_active = true AND jp.review_status = 'published' AND jp.trust_score >= 70
         AND jp.india_confirmed = true AND length(btrim(COALESCE(NULLIF(jp.description,''),jp.about_job,''))) >= 80
       ORDER BY COALESCE(jp.posted_at, jp.first_seen_at) DESC LIMIT 250
    `);
    const data = (rows as any[]).map((job) => scoreCandidateJob(profile, job))
      .sort((a, b) => b.match_score - a.match_score || new Date(b.posted_at || b.first_seen_at).getTime() - new Date(a.posted_at || a.first_seen_at).getTime());
    const top = data.filter((job) => job.match_score >= 70).slice(0, 50);
    if (top.length) {
      const values: any[] = [userId];
      const tuples = top.map((job, index) => {
        const base = index * 5 + 2;
        const sql = getDB();
        values.push(job.id, job.match_score, sql.json(job.score_breakdown), sql.json(job.match_reasons), job.missing_skills);
        return `($1,$${base},$${base + 1},$${base + 2}::jsonb,$${base + 3}::jsonb,$${base + 4},now())`;
      });
      await getDB().unsafe(`
        INSERT INTO job_recommendations (user_id, job_posting_id, match_score, score_breakdown, reasons, missing_skills, calculated_at)
        VALUES ${tuples.join(',')}
        ON CONFLICT (user_id, job_posting_id) DO UPDATE SET
          match_score = EXCLUDED.match_score, score_breakdown = EXCLUDED.score_breakdown,
          reasons = EXCLUDED.reasons, missing_skills = EXCLUDED.missing_skills, calculated_at = now()
      `, values);
    }
    let modelName = 'hiregen-dnn-v2';
    try { modelName = loadRecommendationModel().format; } catch { modelName = 'weighted_fallback'; }
    return { needs_profile: false, model: modelName, threshold: 70, data: top };
  });

  fastify.get('/summary', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const userId = currentUser(request).id;
    const sql = getDB();
    const profile = await loadProfile(sql, userId);
    const applications = await sql.unsafe('SELECT status, COUNT(*) AS count FROM applications WHERE user_id = $1 GROUP BY status', [userId]);
    const fresh = await sql.unsafe("SELECT COUNT(*) AS count FROM job_postings WHERE is_active = true AND review_status = 'published' AND trust_score >= 70 AND india_confirmed = true AND length(btrim(COALESCE(NULLIF(description,''),about_job,''))) >= 80 AND COALESCE(posted_at,first_seen_at) >= NOW() - INTERVAL '7 days'");
    const totalApps = (applications as any[]).reduce((sum, row) => sum + Number(row.count), 0);
    const byStatus = (applications as any[]).reduce((out: Record<string, number>, row) => { out[row.status] = Number(row.count); return out; }, {});
    return { profile_completion: profileCompletion(profile), has_profile: Boolean(profile), fresh_jobs_7d: Number((fresh[0] as any)?.count || 0), application_total: totalApps, application_statuses: byStatus };
  });

  fastify.get('/applications', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const rows = await getDB().unsafe(`
      SELECT a.id, a.status, a.notes, a.applied_at, a.outcome_at, a.created_at, a.updated_at,
             jp.id AS job_id, jp.title AS job_title, jp.location, jp.location_type, jp.employment_type,
             jp.apply_url, jp.job_url, jp.source_site, jp.posted_at,jp.skills,jp.experience_level,jp.salary_range,jp.trust_score,jp.trust_band,
             c.name AS company_name, c.domain AS company_domain,c.industry AS company_industry,
             COALESCE((SELECT jsonb_agg(jsonb_build_object('from_status', e.from_status, 'to_status', e.to_status, 'note', e.note, 'created_at', e.created_at) ORDER BY e.created_at DESC)
                         FROM application_events e WHERE e.application_id = a.id), '[]'::jsonb) AS events,
             COALESCE((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'document_type', d.document_type, 'title', d.title, 'content', d.content, 'created_at', d.created_at) ORDER BY d.created_at DESC)
                         FROM application_documents d WHERE d.application_id = a.id AND d.user_id = a.user_id), '[]'::jsonb) AS documents
        FROM applications a
        JOIN job_postings jp ON jp.id = a.job_posting_id
        JOIN companies c ON c.id = jp.company_id
       WHERE a.user_id = $1
       ORDER BY a.updated_at DESC
    `, [currentUser(request).id]);
    return { data: rows };
  });

  fastify.post('/applications', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsed = z.object({ job_id: idSchema, status: statuses.default('SAVED'), notes: z.string().max(4000).default('') }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid application', details: parsed.error.issues });
    const userId = currentUser(request).id;
    const sql = getDB();
    const job = await fetchJob(sql, parsed.data.job_id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    const result = await sql.begin(async (tx: any) => {
      const existing = await tx.unsafe('SELECT id, status FROM applications WHERE user_id = $1 AND job_posting_id = $2 FOR UPDATE', [userId, parsed.data.job_id]);
      let app: any;
      if (existing.length) {
        app = existing[0];
        if (app.status !== parsed.data.status && !(parsed.data.status === 'SAVED' && app.status !== 'SAVED')) {
          await tx.unsafe(`UPDATE applications SET status=$2, notes=$3, applied_at=CASE WHEN $2='APPLIED' THEN COALESCE(applied_at,now()) ELSE applied_at END,
            outcome_at=CASE WHEN $2 IN ('OFFER','JOINED','REJECTED') THEN COALESCE(outcome_at,now()) ELSE outcome_at END, updated_at=now() WHERE id=$1`, [app.id, parsed.data.status, parsed.data.notes]);
          await tx.unsafe('INSERT INTO application_events (application_id,user_id,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5)', [app.id,userId,app.status,parsed.data.status,parsed.data.notes]);
        }
      } else {
        const inserted = await tx.unsafe(`INSERT INTO applications (user_id,job_posting_id,status,notes,applied_at,outcome_at)
          VALUES ($1,$2,$3,$4,CASE WHEN $3='APPLIED' THEN now() ELSE NULL END,CASE WHEN $3 IN ('OFFER','JOINED','REJECTED') THEN now() ELSE NULL END) RETURNING id,status`,
          [userId, parsed.data.job_id, parsed.data.status, parsed.data.notes]);
        app = inserted[0];
        await tx.unsafe('INSERT INTO application_events (application_id,user_id,from_status,to_status,note) VALUES ($1,$2,NULL,$3,$4)', [app.id,userId,parsed.data.status,parsed.data.notes]);
      }
      return app;
    });
    return reply.status(201).send({ application: result });
  });

  fastify.patch('/applications/:id', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const params = z.object({ id: idSchema }).safeParse(request.params);
    const body = z.object({ status: statuses.optional(), notes: z.string().max(4000).optional(), note: z.string().max(1000).optional() }).safeParse(request.body);
    if (!params.success || !body.success || (!body.data.status && body.data.notes === undefined && body.data.note === undefined)) return reply.status(400).send({ error: 'Invalid application update' });
    const userId = currentUser(request).id;
    const sql = getDB();
    const result = await sql.begin(async (tx: any) => {
      const existing = await tx.unsafe('SELECT id,status,notes FROM applications WHERE id=$1 AND user_id=$2 FOR UPDATE', [params.data.id,userId]);
      if (!existing.length) return null;
      const app = existing[0];
      const nextStatus = body.data.status || app.status;
      const notes = body.data.notes === undefined ? app.notes : body.data.notes;
      const updated = await tx.unsafe(`UPDATE applications SET status=$2, notes=$3,
        applied_at=CASE WHEN $2='APPLIED' THEN COALESCE(applied_at,now()) ELSE applied_at END,
        outcome_at=CASE WHEN $2 IN ('OFFER','JOINED','REJECTED') THEN COALESCE(outcome_at,now()) ELSE outcome_at END,
        updated_at=now() WHERE id=$1 RETURNING id,status,notes,applied_at,outcome_at,updated_at`, [app.id,nextStatus,notes]);
      if (nextStatus !== app.status) {
        await tx.unsafe('INSERT INTO application_events (application_id,user_id,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5)', [app.id,userId,app.status,nextStatus,body.data.note || '']);
      } else if (body.data.note) {
        await tx.unsafe('INSERT INTO application_events (application_id,user_id,from_status,to_status,note) VALUES ($1,$2,$3,$4,$5)', [app.id,userId,app.status,app.status,body.data.note]);
      }
      return updated[0];
    });
    if (!result) return reply.status(404).send({ error: 'Application not found' });
    return { application: result };
  });

  fastify.post('/jobs/:id/prepare', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const params = z.object({ id: idSchema }).safeParse(request.params);
    if (!params.success) return reply.status(400).send({ error: 'Invalid job ID' });
    const userId = currentUser(request).id;
    const sql = getDB();
    const [profile, job] = await Promise.all([loadProfile(sql, userId), fetchJob(sql, params.data.id)]);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    if (!profile || !profile.profile_confirmed_at) return reply.status(409).send({ error: 'Complete and confirm your profile before preparing application materials' });
    const documents = await prepareApplicationDocuments(profile, job);
    const application = await sql.begin(async (tx: any) => {
      const existing = await tx.unsafe('SELECT id,status FROM applications WHERE user_id=$1 AND job_posting_id=$2 FOR UPDATE', [userId,job.id]);
      let app: any;
      if (existing.length) {
        app = existing[0];
        if (['SAVED','RECOMMENDED'].includes(app.status)) {
          await tx.unsafe("UPDATE applications SET status='READY_TO_APPLY',updated_at=now() WHERE id=$1", [app.id]);
          await tx.unsafe("INSERT INTO application_events (application_id,user_id,from_status,to_status,note) VALUES ($1,$2,$3,'READY_TO_APPLY','Application materials prepared for review')", [app.id,userId,app.status]);
          app.status='READY_TO_APPLY';
        }
      } else {
        const inserted = await tx.unsafe("INSERT INTO applications (user_id,job_posting_id,status) VALUES ($1,$2,'READY_TO_APPLY') RETURNING id,status", [userId,job.id]);
        app = inserted[0];
        await tx.unsafe("INSERT INTO application_events (application_id,user_id,to_status,note) VALUES ($1,$2,'READY_TO_APPLY','Application materials prepared for review')", [app.id,userId]);
      }
      const resumeDoc = await tx.unsafe(`INSERT INTO application_documents (application_id,user_id,document_type,title,content,source_job_posting_id)
        VALUES ($1,$2,'tailored_resume',$3,$4,$5) RETURNING id,document_type,title,content,created_at`, [app.id,userId,`Resume - ${job.title}`,documents.tailored_resume,job.id]);
      const emailDoc = await tx.unsafe(`INSERT INTO application_documents (application_id,user_id,document_type,title,content,source_job_posting_id)
        VALUES ($1,$2,'email_draft',$3,$4,$5) RETURNING id,document_type,title,content,created_at`, [app.id,userId,`Email draft - ${job.company_name}`,documents.email_draft,job.id]);
      return { application: app, documents: [resumeDoc[0],emailDoc[0]] };
    });
    return { ...application, generated_by: documents.generated_by, user_review_required: true };
  });

  fastify.post('/feedback', async (request, reply) => {
    if (!isCandidate(request, reply)) return;
    const parsed = z.object({ application_id: idSchema.optional(), rating: z.number().int().min(1).max(5), feedback: z.string().trim().min(5).max(3000) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid feedback', details: parsed.error.issues });
    const userId = currentUser(request).id;
    let companyId: string | null = null;
    if (parsed.data.application_id) {
      const owned = await getDB().unsafe('SELECT jp.company_id FROM applications a JOIN job_postings jp ON jp.id=a.job_posting_id WHERE a.id=$1 AND a.user_id=$2', [parsed.data.application_id,userId]);
      if (!owned.length) return reply.status(404).send({ error: 'Application not found' });
      companyId = (owned[0] as any).company_id;
    }
    const rows = await getDB().unsafe(`INSERT INTO candidate_feedback (user_id,application_id,company_id,rating,feedback)
      VALUES ($1,$2,$3,$4,$5) RETURNING id,rating,moderation_status,created_at`, [userId,parsed.data.application_id || null,companyId,parsed.data.rating,parsed.data.feedback]);
    return reply.status(201).send({ feedback: rows[0] });
  });

  fastify.get('/admin/overview', { preValidation: [authorize(['admin'])] }, async (request, reply) => {
    if (!isAdmin(request, reply)) return;
    const sql = getDB();
    const results = await Promise.all([
      sql.unsafe("SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE review_status='published') AS published, COUNT(*) FILTER (WHERE review_status='pending') AS pending, COUNT(*) FILTER (WHERE review_status='quarantined') AS quarantined, COUNT(*) FILTER (WHERE COALESCE(posted_at,first_seen_at)>=NOW()-INTERVAL '7 days') AS fresh_7d FROM job_postings WHERE is_active=true"),
      sql.unsafe("SELECT COUNT(*) AS total FROM users WHERE role='candidate'"),
      sql.unsafe('SELECT status,COUNT(*) AS count FROM applications GROUP BY status'),
      sql.unsafe('SELECT source_name,consecutive_failures,last_success_at,last_failure_reason,circuit_open_until FROM source_health ORDER BY source_name'),
      sql.unsafe('SELECT COUNT(*) AS total FROM candidate_feedback WHERE moderation_status=\'pending\''),
    ]);
    const stages = (results[2] as any[]).reduce((acc: Record<string, number>, row) => { acc[row.status] = Number(row.count); return acc; }, {});
    let recommendationModel: any = recommendationModelStatus();
    try {
      const model = loadRecommendationModel();
      recommendationModel = { ...recommendationModel, created_at: model.created_at, training_source: model.training_source, training_task: model.training_task };
    } catch { /* keep the dashboard healthy if an artifact is missing */ }
    return { jobs: results[0][0], candidates: Number((results[1][0] as any)?.total || 0), applications: stages, sources: results[3], feedback_pending: Number((results[4][0] as any)?.total || 0), recommendation_model: recommendationModel };
  });

  fastify.get('/admin/recommendation-model', { preValidation: [authorize(['admin'])] }, async (_request, reply) => {
    const saved = await getDB().unsafe("SELECT value FROM settings WHERE key='recommendation_model_runtime'");
    const enabled = (saved[0] as any)?.value?.enabled;
    if (typeof enabled === 'boolean' && enabled !== recommendationModelStatus().enabled) {
      try { setRecommendationModelEnabled(enabled); }
      catch { /* status will report the artifact/load error */ }
    }
    return reply.send(recommendationModelStatus());
  });

  fastify.put('/admin/recommendation-model', { preValidation: [authorize(['admin'])] }, async (request, reply) => {
    if (!isAdmin(request, reply)) return;
    const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Expected enabled: true or false' });
    const { enabled } = parsed.data;
    try {
      if (enabled) loadRecommendationModel();
      const userId = currentUser(request).id;
      await getDB().unsafe(`INSERT INTO settings (key,value,updated_by,updated_at)
        VALUES ('recommendation_model_runtime',$1::jsonb,$2,NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [JSON.stringify({ enabled }), userId]);
      setRecommendationModelEnabled(enabled);
      await logAuditEvent({ user_id: userId, action: enabled ? 'recommendation_model_started' : 'recommendation_model_stopped', resource_type: 'recommendation_model', details: { enabled } });
      return reply.send(recommendationModelStatus());
    } catch (error) {
      return reply.status(409).send({ error: error instanceof Error ? error.message : 'Could not change model state' });
    }
  });

  fastify.post('/admin/recommendations/train', { preValidation: [authorize(['admin'])] }, async (request, reply) => {
    if (!isAdmin(request, reply)) return;
    const rows = await getDB().unsafe(`
      SELECT cp.*, jp.title, jp.description, jp.about_job, jp.experience_level, jp.location AS job_location,
             jp.location_type, jp.employment_type, jp.skills AS job_skills, jp.salary_min AS job_salary_min,
             jp.salary_currency AS job_salary_currency, jp.raw_payload, jp.posted_at, jp.first_seen_at,
             jp.source_site, jp.apply_url, jp.job_url, jp.trust_score, c.domain AS company_domain,
             c.name AS company_name, COALESCE((SELECT COUNT(DISTINCT js.source_site) FROM job_sources js WHERE js.job_posting_id=jp.id),1)::int AS source_count,
             a.status AS application_status
        FROM applications a
        JOIN candidate_profiles cp ON cp.user_id=a.user_id
        JOIN job_postings jp ON jp.id=a.job_posting_id
        JOIN companies c ON c.id=jp.company_id
       WHERE a.status IN ('REJECTED','INTERVIEW','OFFER','JOINED')
       ORDER BY a.updated_at DESC LIMIT 5000
    `);
    const outcomes = (rows as any[]).filter((row) => row.application_status === 'REJECTED' || ['INTERVIEW','OFFER','JOINED'].includes(row.application_status));
    const labels = new Set(outcomes.map((row) => row.application_status === 'REJECTED' ? 0 : 1));
    const positiveCount = outcomes.filter((row) => row.application_status !== 'REJECTED').length;
    const negativeCount = outcomes.length - positiveCount;
    if (outcomes.length < 30 || labels.size < 2 || positiveCount < 5 || negativeCount < 5) {
      return reply.status(409).send({ error: `The model needs at least 30 reviewed outcomes and at least 5 examples each of REJECTED and INTERVIEW/OFFER/JOINED. Current usable outcomes: ${outcomes.length} (${negativeCount} rejected, ${positiveCount} positive).` });
    }
    const outcomeSamples = outcomes.map((row) => {
      const job = { ...row, skills: row.job_skills, location: row.job_location, salary_min: row.job_salary_min, salary_currency: row.job_salary_currency };
      const fit = scoreJobMatch(row, job);
      const trust = scoreJobTrust(job);
      return { features: recommendationFeatures(fit.breakdown, trust.score), label: (row.application_status === 'REJECTED' ? 0 : 1) as 0 | 1 };
    });
    const model = trainRecommendationModel(outcomeSamples, `platform_application_outcomes_${outcomeSamples.length}`, undefined, 'REJECTED vs INTERVIEW/OFFER/JOINED application outcomes');
    return { trained: true, model: model.format, architecture: model.architecture, training_examples: model.training_examples, validation_examples: model.validation_examples, metrics: model.metrics, training_source: model.training_source, training_task: model.training_task, created_at: model.created_at };
  });

  fastify.get('/admin/jobs', { preValidation: [authorize(['admin'])] }, async (request, reply) => {
    if (!isAdmin(request, reply)) return;
    const parsed = z.object({ status: z.enum(['published','pending','quarantined','rejected']).optional(), q: z.string().trim().max(120).optional() }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid filters' });
    const values: any[] = [];
    const where: string[] = [];
    if (parsed.data.status) { values.push(parsed.data.status); where.push(`jp.review_status=$${values.length}`); }
    if (parsed.data.q) { values.push(`%${parsed.data.q}%`); where.push(`(jp.title ILIKE $${values.length} OR c.name ILIKE $${values.length})`); }
    const rows = await getDB().unsafe(`SELECT jp.*,COALESCE((SELECT COUNT(DISTINCT js.source_site) FROM job_sources js WHERE js.job_posting_id=jp.id),1)::int AS source_count,c.name AS company_name,c.domain AS company_domain,c.website_url AS company_website,c.industry AS company_industry
      FROM job_postings jp JOIN companies c ON c.id=jp.company_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY CASE jp.review_status WHEN 'pending' THEN 0 WHEN 'quarantined' THEN 1 ELSE 2 END, COALESCE(jp.posted_at,jp.first_seen_at) DESC LIMIT 200`, values);
    return { data: (rows as any[]).map(withTrust) };
  });

  fastify.patch('/admin/jobs/:id/review', { preValidation: [authorize(['admin'])] }, async (request, reply) => {
    if (!isAdmin(request, reply)) return;
    const params = z.object({ id: idSchema }).safeParse(request.params);
    const body = z.object({ review_status: z.enum(['published','pending','quarantined','rejected']) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid review update' });
    const sql = getDB();
    const job = await fetchJob(sql,params.data.id,true);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    const trust = scoreJobTrust(job);
    const result = await sql.begin(async (tx: any) => {
      const rows = await tx.unsafe('UPDATE job_postings SET review_status=$2,trust_score=$3,trust_band=$4 WHERE id=$1 RETURNING id,review_status,trust_score,trust_band', [job.id,body.data.review_status,trust.score,trust.band]);
      await tx.unsafe('INSERT INTO job_verifications (job_posting_id,verifier_id,trust_score,trust_band,evidence,review_status) VALUES ($1,$2,$3,$4,$5::jsonb,$6)', [job.id,currentUser(request).id,trust.score,trust.band,getDB().json(trust.evidence),body.data.review_status]);
      return rows[0];
    });
    await logAuditEvent({
      user_id: currentUser(request).id,
      action: 'review_job',
      resource_type: 'job_posting',
      resource_id: job.id,
      details: { review_status: body.data.review_status, trust_score: trust.score, trust_band: trust.band },
    });
    return { job: result, evidence: trust.evidence };
  });

  fastify.get('/admin/feedback', { preValidation: [authorize(['admin'])] }, async (request, reply) => {
    if (!isAdmin(request, reply)) return;
    const parsed = z.object({ status: z.enum(['pending','approved','rejected']).default('pending') }).safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid feedback filter' });
    const rows = await getDB().unsafe(`
      SELECT f.id,f.rating,f.feedback,f.moderation_status,f.created_at,u.email AS candidate_email,
             c.name AS company_name,jp.title AS job_title
        FROM candidate_feedback f
        JOIN users u ON u.id=f.user_id
        LEFT JOIN companies c ON c.id=f.company_id
        LEFT JOIN applications a ON a.id=f.application_id
        LEFT JOIN job_postings jp ON jp.id=a.job_posting_id
       WHERE f.moderation_status=$1
       ORDER BY f.created_at DESC LIMIT 200
    `, [parsed.data.status]);
    return { data: rows };
  });

  fastify.patch('/admin/feedback/:id', { preValidation: [authorize(['admin'])] }, async (request, reply) => {
    if (!isAdmin(request, reply)) return;
    const params = z.object({ id: idSchema }).safeParse(request.params);
    const body = z.object({ moderation_status: z.enum(['approved','rejected']) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.status(400).send({ error: 'Invalid feedback moderation update' });
    const rows = await getDB().unsafe('UPDATE candidate_feedback SET moderation_status=$2 WHERE id=$1 RETURNING id,moderation_status', [params.data.id,body.data.moderation_status]);
    if (!rows.length) return reply.status(404).send({ error: 'Feedback not found' });
    await logAuditEvent({ user_id:currentUser(request).id, action:'moderate_candidate_feedback', resource_type:'candidate_feedback', resource_id:params.data.id, details:{ moderation_status:body.data.moderation_status } });
    return { feedback:rows[0] };
  });
};
