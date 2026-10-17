import type postgres from 'postgres';

interface LeadScoreInput {
  hr_name?: string | null;
  hr_personal_email?: string | null;
  hr_personal_mobile?: string | null;
  hr_linkedin_url?: string | null;
  company_default_email?: string | null;
  company_default_phone?: string | null;
  salary_range?: string | null;
  job_description?: string | null;
  job_url?: string | null;
  email_status?: string | null;
  whatsapp_status?: string | null;
}

interface ScoreResult {
  score: number;
  breakdown: Record<string, { points: number; reason: string }>;
  band: 'hot' | 'warm' | 'cold';
}

export const DEFAULT_WEIGHTS = {
  hr_name: 20,
  hr_contact: 25,
  hr_linkedin: 15,
  company_contact: 10,
  job_quality: 10,
  email_verified: 10,
  whatsapp_verified: 10,
} as const;

type ScoringWeights = Partial<Record<keyof typeof DEFAULT_WEIGHTS, number>>;

function resolveWeights(partial?: ScoringWeights & Record<string, unknown>): Record<keyof typeof DEFAULT_WEIGHTS, number> {
  const out = { ...DEFAULT_WEIGHTS } as Record<keyof typeof DEFAULT_WEIGHTS, number>;
  if (partial && typeof partial === 'object') {
    // Accept the Settings UI key names as aliases (the form posts
    // hr_name_found etc.; the engine uses hr_name etc.).
    const ALIASES: Record<string, keyof typeof DEFAULT_WEIGHTS> = {
      hr_name_found: 'hr_name',
      hr_personal_contact: 'hr_contact',
      hr_linkedin_found: 'hr_linkedin',
      company_official_contact: 'company_contact',
      job_description_quality: 'job_quality',
    };
    for (const [k, v] of Object.entries(partial)) {
      const canonical: keyof typeof DEFAULT_WEIGHTS | undefined =
        (k as keyof typeof DEFAULT_WEIGHTS) in out
          ? (k as keyof typeof DEFAULT_WEIGHTS)
          : ALIASES[k];
      if (canonical && typeof v === 'number' && Number.isFinite(v)) {
        out[canonical] = Math.max(0, Math.min(100, Math.round(v)));
      }
    }
  }
  return out;
}

/** Operator-tuned weights from the settings table (admin UI). Falls back to
 * DEFAULT_WEIGHTS when unset/invalid — scoring never breaks on bad config. */
export async function loadScoringWeights(sql: postgres.Sql): Promise<Record<keyof typeof DEFAULT_WEIGHTS, number>> {
  try {
    const rows = await sql.unsafe(`SELECT value FROM settings WHERE key = 'scoring_weights'`);
    const val = (rows as unknown as Array<{ value: unknown }>)[0]?.value;
    const obj = typeof val === 'string' ? JSON.parse(val) : val;
    if (obj && typeof obj === 'object') return resolveWeights(obj as ScoringWeights);
  } catch { /* fall through to defaults */ }
  return { ...DEFAULT_WEIGHTS };
}

export function calculateLeadScore(input: LeadScoreInput, weights?: ScoringWeights): ScoreResult {
  const w = resolveWeights(weights);
  const breakdown: Record<string, { points: number; reason: string }> = {};
  let score = 0;

  if (input.hr_name) {
    score += w.hr_name;
    breakdown.hr_name = { points: w.hr_name, reason: 'HR name found' };
  }

  if (input.hr_personal_email || input.hr_personal_mobile) {
    score += w.hr_contact;
    breakdown.hr_contact = {
      points: w.hr_contact,
      reason: input.hr_personal_email
        ? 'HR personal email found'
        : 'HR personal mobile found',
    };
  }

  if (input.hr_linkedin_url) {
    score += w.hr_linkedin;
    breakdown.hr_linkedin = { points: w.hr_linkedin, reason: 'HR LinkedIn URL found' };
  }

  if (input.company_default_email || input.company_default_phone) {
    score += w.company_contact;
    breakdown.company_contact = {
      points: w.company_contact,
      reason: input.company_default_email
        ? 'Company official email found'
        : 'Company official mobile found',
    };
  }

  const qUnit = w.job_quality / 10;
  const qualityScore = Math.min(
    w.job_quality,
    Math.round((input.salary_range ? 3 : 0) * qUnit) +
      Math.round(input.job_description && input.job_description.length > 100 ? 4 * qUnit : 0) +
      Math.round((input.job_url ? 3 : 0) * qUnit),
  );
  if (qualityScore > 0) {
    score += qualityScore;
    breakdown.job_quality = { points: qualityScore, reason: 'Job description quality indicators' };
  }

  if (input.email_status === 'valid') {
    score += w.email_verified;
    breakdown.email_verified = { points: w.email_verified, reason: 'Email verified deliverable' };
  }

  if (input.whatsapp_status === 'registered') {
    score += w.whatsapp_verified;
    breakdown.whatsapp_verified = { points: w.whatsapp_verified, reason: 'WhatsApp number verified active' };
  }

  const band: 'hot' | 'warm' | 'cold' = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';

  return { score, breakdown, band };
}

// Read-only score explanation: same inputs as recomputeLeadScore but performs
// NO write. Returns the deterministic breakdown so the UI can show WHY a lead
// scored what it did ("verified HR email +25, missing salary -3", …) instead of
// an unexplained black-box number.
export async function scoreExplain(
  sql: postgres.Sql,
  leadId: string,
): Promise<ScoreResult | null> {
  const rows = await sql.unsafe(
    `SELECT
       hc.full_name as hr_name,
       hc.personal_email as hr_personal_email,
       hc.personal_mobile as hr_personal_mobile,
       hc.linkedin_url as hr_linkedin_url,
       c.default_email as company_default_email,
       c.default_phone as company_default_phone,
       jp.salary_range, jp.description as job_description, jp.job_url,
       l.email_status, l.whatsapp_status
     FROM leads l
     JOIN companies c ON l.company_id = c.id
     LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
     JOIN job_postings jp ON l.job_posting_id = jp.id
     WHERE l.id = $1`,
    [leadId],
  );
  if (!rows || rows.length === 0) return null;
  const row = rows[0]!;
  const weights = await loadScoringWeights(sql);
  return calculateLeadScore({
    hr_name: row.hr_name as string | null | undefined,
    hr_personal_email: row.hr_personal_email as string | null | undefined,
    hr_personal_mobile: row.hr_personal_mobile as string | null | undefined,
    hr_linkedin_url: row.hr_linkedin_url as string | null | undefined,
    company_default_email: row.company_default_email as string | null | undefined,
    company_default_phone: row.company_default_phone as string | null | undefined,
    salary_range: row.salary_range as string | null | undefined,
    job_description: row.job_description as string | null | undefined,
    job_url: row.job_url as string | null | undefined,
    email_status: row.email_status as string | null | undefined,
    whatsapp_status: row.whatsapp_status as string | null | undefined,
  }, weights);
}

import { assertStageTransition } from './lifecycle';

export async function recomputeLeadScore(
  sql: postgres.Sql,
  leadId: string,
  options?: { pipelineStage?: string },
): Promise<number> {
  const rows = await sql.unsafe(
    `SELECT
       hc.full_name as hr_name,
       hc.personal_email as hr_personal_email,
       hc.personal_mobile as hr_personal_mobile,
       hc.linkedin_url as hr_linkedin_url,
       c.default_email as company_default_email,
       c.default_phone as company_default_phone,
       jp.salary_range, jp.description as job_description, jp.job_url,
       l.email_status, l.whatsapp_status
     FROM leads l
     JOIN companies c ON l.company_id = c.id
     LEFT JOIN hr_contacts hc ON l.hr_contact_id = hc.id
     JOIN job_postings jp ON l.job_posting_id = jp.id
     WHERE l.id = $1`,
    [leadId],
  );

  if (!rows || rows.length === 0) {
    return 0;
  }

  const row = rows[0]!;
  const weights = await loadScoringWeights(sql);
  const result = calculateLeadScore({
    hr_name: row.hr_name as string | null | undefined,
    hr_personal_email: row.hr_personal_email as string | null | undefined,
    hr_personal_mobile: row.hr_personal_mobile as string | null | undefined,
    hr_linkedin_url: row.hr_linkedin_url as string | null | undefined,
    company_default_email: row.company_default_email as string | null | undefined,
    company_default_phone: row.company_default_phone as string | null | undefined,
    salary_range: row.salary_range as string | null | undefined,
    job_description: row.job_description as string | null | undefined,
    job_url: row.job_url as string | null | undefined,
    email_status: row.email_status as string | null | undefined,
    whatsapp_status: row.whatsapp_status as string | null | undefined,
  }, weights);

  const setClauses: string[] = ['lead_score = $1', 'updated_at = NOW()'];
  const values: any[] = [result.score];

  if (options?.pipelineStage) {
    const current = await sql.unsafe(`SELECT pipeline_stage FROM leads WHERE id = $1`, [leadId] as any);
    const from = (current as unknown as Array<{ pipeline_stage: string }>)[0]?.pipeline_stage || 'discovered';
    assertStageTransition(from, options.pipelineStage);
    values.push(options.pipelineStage);
    setClauses.push(`pipeline_stage = $${values.length}`);
  }

  await sql.unsafe(
    `UPDATE leads SET ${setClauses.join(', ')} WHERE id = $${values.length + 1}`,
    [...values, leadId] as any,
  );

  return result.score;
}
