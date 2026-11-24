/**
 * Job-specific preparation generator.
 *
 * Grounding rules:
 *  - only confirmed candidate profile facts and the selected job/company
 *    record supplied by the caller are sent to the provider;
 *  - no invented company facts, achievements or citations;
 *  - every function has a complete deterministic fallback, so the feature
 *    works without an API key or network;
 *  - generated text is always labelled as preparation, never as employer
 *    endorsement or a guarantee of success.
 */

export type PreparationModule =
  | 'interview_prep'
  | 'group_discussion'
  | 'presentation'
  | 'company_research';

export const PREPARATION_MODULES: PreparationModule[] = [
  'interview_prep',
  'group_discussion',
  'presentation',
  'company_research',
];

export interface PreparationSource {
  title: string;
  url: string;
  retrieved_at: string;
  status: 'ingested' | 'unverified';
}

export interface PreparationContext {
  role: string;
  company: string;
  company_domain: string;
  company_industry: string;
  company_website: string;
  location: string;
  experience_level: string;
  requirements: string[];
  job_description: string;
  candidate_skills: string[];
  candidate_summary: string;
  candidate_projects: string[];
  candidate_experience: string[];
  sources: PreparationSource[];
  evidence_notes: string[];
}

const GEMINI_MODEL = 'gemini-2.5-flash';

function clean(value: unknown, max = 500): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, max)
    : '';
}

function list(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.map((item) => clean(typeof item === 'string' ? item : (item as any)?.name, 160)).filter(Boolean).slice(0, max)
    : [];
}

function parseStoredList(value: unknown): string[] {
  let parsed = value;
  for (let attempt = 0; attempt < 2 && typeof parsed === 'string'; attempt += 1) {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  return list(parsed);
}

function validUrl(value: unknown): string {
  const raw = clean(value, 500);
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString().slice(0, 500) : '';
  } catch {
    return '';
  }
}

export function buildPreparationContext(profile: any, job: any): PreparationContext {
  const retrievedAt = clean(job?.first_seen_at || job?.posted_at, 40) || new Date().toISOString();
  const sources: PreparationSource[] = [];
  const postingUrl = validUrl(job?.apply_url || job?.job_url);
  if (postingUrl) {
    sources.push({
      title: `Job posting${clean(job?.source_site, 40) ? ` (${clean(job.source_site, 40)})` : ''}`,
      url: postingUrl,
      retrieved_at: retrievedAt,
      status: 'ingested',
    });
  }
  const website = validUrl(job?.company_website);
  if (website) {
    sources.push({
      title: 'Company website (from the internal company index)',
      url: website,
      retrieved_at: new Date().toISOString(),
      status: 'unverified',
    });
  }

  const evidenceNotes: string[] = [];
  if (!postingUrl) evidenceNotes.push('No job posting URL was available for citation.');
  if (!website) evidenceNotes.push('No company website URL was available for citation.');
  evidenceNotes.push('No verified recent-development source is available; do not claim any recent company news.');
  if (!clean(job?.company_name)) evidenceNotes.push('The company name is not confirmed in the job record.');

  return {
    role: clean(job?.title, 160) || 'the selected role',
    company: clean(job?.company_name, 160) || 'the hiring company',
    company_domain: clean(job?.company_domain, 160),
    company_industry: clean(job?.company_industry, 160),
    company_website: website,
    location: clean(job?.location, 160),
    experience_level: clean(job?.experience_level, 160),
    requirements: parseStoredList(job?.skills),
    job_description: clean(job?.description || job?.about_job, 4000),
    candidate_skills: parseStoredList(profile?.skills),
    candidate_summary: clean(profile?.summary || profile?.headline, 1200),
    candidate_projects: Array.isArray(profile?.projects)
      ? profile.projects.map((item: any) => clean(item?.name, 160)).filter(Boolean).slice(0, 8)
      : [],
    candidate_experience: Array.isArray(profile?.experience)
      ? profile.experience.map((item: any) => clean(item?.title, 160)).filter(Boolean).slice(0, 8)
      : [],
    sources,
    evidence_notes: evidenceNotes,
  };
}

const DISCLAIMER = 'Preparation aid only. Not an employer interview, not endorsed by the employer, and not a guarantee of any outcome.';

function templatePayload(module: PreparationModule, c: PreparationContext): Record<string, unknown> {
  const ownExamples = [...c.candidate_projects, ...c.candidate_experience];
  const exampleLine = ownExamples.length
    ? `Use one of your recorded items as the concrete example: ${ownExamples.slice(0, 3).join('; ')}.`
    : 'No confirmed project or role was supplied. Add a real example from your own experience; do not invent one.';
  const reqs = c.requirements.length ? c.requirements.join(', ') : 'no skill list was supplied in the posting';
  const skillOverlap = c.candidate_skills.filter((skill) => c.requirements.some((req) => req.toLowerCase().includes(skill.toLowerCase())));

  if (module === 'company_research') {
    const facts = [
      c.company_domain && `Domain: ${c.company_domain}.`,
      c.company_industry && `Industry (internal index): ${c.company_industry}.`,
      c.location && `Role location: ${c.location}.`,
    ].filter(Boolean);
    return {
      summary: `What is verified here about ${c.company}: the company name and the fields recorded in the internal job index. ${facts.join(' ') || 'No additional company fields were supplied.'}`,
      products_or_services: [],
      products_note: 'No product or service claim could be verified from an approved source in this request. Do not assert one in an interview.',
      recent_developments: [{ status: 'unverified', detail: 'No verified recent-development source is available. Check the company website and the job posting yourself before using any claim.' }],
      role_context: c.job_description
        ? `From the job posting only: ${c.job_description.slice(0, 600)}`
        : 'The job posting contained no description; no role context is available.',
      requirements: c.requirements,
      evidence_notes: c.evidence_notes,
      sources: c.sources,
      disclaimer: DISCLAIMER,
      generated_by: 'truthful-template',
    };
  }

  if (module === 'interview_prep') {
    return {
      role: c.role,
      company: c.company,
      focus_skills: c.requirements,
      answer_framework: [
        'State the situation and the constraint in one sentence.',
        'Explain your own contribution and the decision you made.',
        'Give the result with facts you can defend, then name what you would do differently.',
      ],
      questions: [
        { category: 'intro', question: `Introduce yourself for the ${c.role} role at ${c.company}, using only your confirmed profile.`, framework: 'Background, two relevant facts, why this role.' },
        { category: 'technical', question: `The posting lists ${reqs}. Pick the two you know best and explain how you have used them.`, framework: 'Definition, a real example, a limitation you understand.' },
        { category: 'project', question: `Walk through a project from your profile and connect it to ${c.role}.`, framework: 'Problem, your work, outcome, reflection.' },
        { category: 'behavioral', question: 'Describe a disagreement with a teammate and how it was resolved.', framework: 'Situation, your behaviour, result, lesson.' },
        { category: 'company', question: `What do you know about ${c.company} from the posting and the cited sources?`, framework: 'Only cite the supplied sources; say plainly what is unverified.' },
      ],
      resume_talking_points: ownExamples.slice(0, 5),
      matched_skills: skillOverlap,
      revision_plan: [
        'Re-read the job description and mark each requirement you can evidence.',
        'Prepare one short story per requirement from your confirmed experience.',
        'Practise the intro and project answers aloud; keep each under two minutes.',
        exampleLine,
      ],
      evidence_notes: c.evidence_notes,
      sources: c.sources,
      disclaimer: DISCLAIMER,
      generated_by: 'truthful-template',
    };
  }

  if (module === 'group_discussion') {
    return {
      role: c.role,
      topic: `${c.company_industry ? `${c.company_industry}: ` : ''}should organisations optimise ${c.role.toLowerCase()} work for speed or for quality?`,
      opening_points: [
        'Define the terms before taking a side.',
        `Anchor the discussion in the posting: ${reqs}.`,
        exampleLine,
      ],
      balanced_arguments: {
        in_favour: ['Faster delivery shortens feedback loops and exposes wrong assumptions early.', 'Clear defaults let a team act without waiting for consensus.'],
        against: ['Speed without review pushes defects downstream.', 'Quality work needs time for measurement and reflection.'],
      },
      structure: ['One-minute framing', 'Points for', 'Points against', 'Your grounded position', 'Closing summary'],
      participation_tips: ['Invite quieter speakers in by name.', 'Build on the previous point before adding a new one.', 'Disagree with the idea, not the person.', 'Keep examples short and truthful.'],
      practice_evaluation: [
        { criterion: 'Clarity', question: 'Was the position stated in one sentence?' },
        { criterion: 'Evidence', question: 'Were claims tied to the posting or to real experience?' },
        { criterion: 'Balance', question: 'Did the speaker represent both sides fairly?' },
        { criterion: 'Participation', question: 'Did the speaker invite others in?' },
      ],
      evidence_notes: c.evidence_notes,
      sources: c.sources,
      disclaimer: DISCLAIMER,
      generated_by: 'truthful-template',
    };
  }

  // presentation
  const slides = [
    { index: 1, title: `Opening: ${c.role}`, bullets: ['Who you are, in two lines', 'Why this topic matters'], speaking_notes: 'Keep the opening under 30 seconds and use only confirmed facts.' },
    { index: 2, title: 'The problem', bullets: [`What the posting asks for: ${reqs}`, c.location && `Context: ${c.location}`].filter(Boolean) as string[], speaking_notes: 'Describe the problem, not the solution.' },
    { index: 3, title: 'Approach', bullets: ['Three steps, in order', 'The trade-off you accepted'], speaking_notes: 'Use one of your recorded projects as the example if it is relevant.' },
    { index: 4, title: 'Evidence and result', bullets: [exampleLine], speaking_notes: 'Only state results you can defend; say "not measured" otherwise.' },
    { index: 5, title: 'Risks and next steps', bullets: ['What could go wrong', 'What you would measure next'], speaking_notes: 'Naming a risk shows judgement, not weakness.' },
    { index: 6, title: `Why ${c.company}?`, bullets: c.requirements.slice(0, 4), speaking_notes: 'Use the posting and cited sources; flag anything unverified.' },
  ];
  return {
    role: c.role,
    topic: `${c.role}: a problem, an approach, and what I would measure`,
    slides,
    likely_questions: [
      `Why does ${reqs} matter for this role?`,
      'What would you do differently with more time?',
      'Which part of your example is based on measured data?',
      `What have you verified about ${c.company}?`,
    ],
    delivery_guidance: ['One idea per slide.', 'Speak to the audience, not the slide.', 'Time the talk and leave room for questions.', 'Never claim employer endorsement.'],
    evidence_notes: c.evidence_notes,
    sources: c.sources,
    disclaimer: DISCLAIMER,
    generated_by: 'truthful-template',
  };
}

function asTextArray(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').map((item) => clean(item, 600)).filter(Boolean).slice(0, max)
    : [];
}

function validateGenerated(module: PreparationModule, parsed: any, c: PreparationContext): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const base = {
    evidence_notes: c.evidence_notes,
    sources: c.sources,
    disclaimer: DISCLAIMER,
    generated_by: GEMINI_MODEL,
  };
  if (module === 'company_research') {
    if (typeof parsed.summary !== 'string') return null;
    return {
      ...base,
      summary: clean(parsed.summary, 2000),
      products_or_services: asTextArray(parsed.products_or_services),
      recent_developments: Array.isArray(parsed.recent_developments)
        ? parsed.recent_developments.slice(0, 8).map((item: any) => ({
            status: 'unverified',
            detail: clean(item?.detail || item, 600),
          }))
        : [],
      role_context: clean(parsed.role_context, 2000),
      requirements: c.requirements,
    };
  }
  if (module === 'interview_prep') {
    if (!Array.isArray(parsed.questions)) return null;
    return {
      ...base,
      role: c.role,
      company: c.company,
      answer_framework: asTextArray(parsed.answer_framework),
      questions: parsed.questions.slice(0, 12).map((item: any) => ({
        category: clean(item?.category, 40) || 'technical',
        question: clean(item?.question, 600),
        framework: clean(item?.framework, 400),
      })).filter((item: any) => item.question),
      revision_plan: asTextArray(parsed.revision_plan),
      matched_skills: c.candidate_skills.filter((skill) => c.requirements.some((req) => req.toLowerCase().includes(skill.toLowerCase()))),
    };
  }
  if (module === 'group_discussion') {
    if (typeof parsed.topic !== 'string') return null;
    return {
      ...base,
      topic: clean(parsed.topic, 300),
      opening_points: asTextArray(parsed.opening_points),
      balanced_arguments: {
        in_favour: asTextArray(parsed.balanced_arguments?.in_favour),
        against: asTextArray(parsed.balanced_arguments?.against),
      },
      structure: asTextArray(parsed.structure),
      participation_tips: asTextArray(parsed.participation_tips),
      practice_evaluation: Array.isArray(parsed.practice_evaluation)
        ? parsed.practice_evaluation.slice(0, 8).map((item: any) => ({
            criterion: clean(item?.criterion, 120),
            question: clean(item?.question, 400),
          }))
        : [],
    };
  }
  if (!Array.isArray(parsed.slides)) return null;
  return {
    ...base,
    topic: clean(parsed.topic, 300) || `${c.role} presentation`,
    slides: parsed.slides.slice(0, 12).map((item: any, index: number) => ({
      index: index + 1,
      title: clean(item?.title, 200),
      bullets: asTextArray(item?.bullets, 8),
      speaking_notes: clean(item?.speaking_notes, 800),
    })),
    likely_questions: asTextArray(parsed.likely_questions),
    delivery_guidance: asTextArray(parsed.delivery_guidance),
  };
}

export async function generatePreparation(
  module: PreparationModule,
  context: PreparationContext,
  apiKey?: string,
): Promise<{ payload: Record<string, unknown>; model: string }> {
  const fallback = { payload: templatePayload(module, context), model: 'template' };
  if (!apiKey) return fallback;

  const instructions = [
    `Create ${module} preparation for the role "${context.role}" at "${context.company}".`,
    'Use only the supplied structured facts. Never invent company news, products, candidate achievements, metrics or citations.',
    'If evidence is missing, say so explicitly. Do not claim employer endorsement or guaranteed success.',
    `Return JSON with these keys for ${module}:`,
    module === 'company_research'
      ? 'summary (string), products_or_services (string[]), recent_developments (array of {detail}), role_context (string).'
      : module === 'interview_prep'
        ? 'answer_framework (string[]), questions (array of {category,question,framework}), revision_plan (string[]).'
        : module === 'group_discussion'
          ? 'topic (string), opening_points (string[]), balanced_arguments ({in_favour:string[],against:string[]}), structure (string[]), participation_tips (string[]), practice_evaluation (array of {criterion,question}).'
          : 'topic (string), slides (array of {title,bullets:string[],speaking_notes}), likely_questions (string[]), delivery_guidance (string[]).',
    'Keep every string short and defensible.',
    JSON.stringify(context),
  ].join('\n\n');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: instructions }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 4096 },
        }),
      },
    );
    if (!response.ok) return fallback;
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const validated = validateGenerated(module, JSON.parse(generatedText), context);
    return validated ? { payload: validated, model: GEMINI_MODEL } : fallback;
  } catch {
    return fallback;
  }
}
