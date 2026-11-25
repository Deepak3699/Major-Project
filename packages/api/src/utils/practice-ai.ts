import type { Profile, QuestionSpec, GeneratedQuestion, AnswerGrade, LearningModule, LearningResource, FollowUpQuestion } from '../types/practice';
import type { AvatarPersona, JobContext } from './interview-avatars';

/**
 * AI practice engine: interview question generation, answer grading and
 * adaptive learning tracks.
 *
 * House rules (same as application-prep.ts):
 *  - Gemini is optional. Every function has a complete template fallback so the
 *    feature works with no API key and no network.
 *  - Provider output is validated strictly; anything malformed falls back.
 *  - Learning resources only ever point to stable public roots (roadmap.sh,
 *    MDN, official docs). We never fabricate deep links.
 *  - Only the candidate's own profile facts and their typed answers are sent to
 *    the provider, mirroring the drafting privacy stance.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';

export type Difficulty = 'calm' | 'standard' | 'brutal';

type RoleFamily =
  | 'software_engineer'
  | 'frontend'
  | 'backend'
  | 'fullstack'
  | 'qa'
  | 'data_analyst'
  | 'data_science'
  | 'devops'
  | 'product_manager'
  | 'ux_designer'
  | 'marketing'
  | 'general';

const FAMILY_SIGNALS: Array<[RoleFamily, RegExp]> = [
  ['frontend', /front[- ]?end|react|angular|vue|next\.?js|css|html|web design/i],
  ['backend', /back[- ]?end|node|django|flask|spring|dotnet|microservice|api engineer/i],
  ['fullstack', /full[- ]?stack|mern|mean stack/i],
  ['qa', /\bqa\b|quality analyst|test engineer|automation tester|sdet/i],
  ['devops', /devops|sre\b|site reliability|cloud engineer|kubernetes|docker/i],
  ['data_science', /data scien|ml engineer|machine learning|ai engineer/i],
  ['data_analyst', /data analyst|business analyst|bi analyst|power bi|tableau/i],
  ['product_manager', /product manage|product owner|product analyst/i],
  ['ux_designer', /ux|ui designer|product design|interaction design/i],
  ['marketing', /marketing|seo|sem|growth|content strateg/i],
  ['software_engineer', /software|developer|engineer|programmer|coding/i],
];

const FAMILY_SKILLS: Record<RoleFamily, string[]> = {
  software_engineer: ['data structures & algorithms', 'object-oriented design', 'git & code review', 'databases', 'testing', 'system design basics'],
  frontend: ['javascript fundamentals', 'react component design', 'state management', 'css layout systems', 'browser performance', 'accessibility'],
  backend: ['rest & api design', 'sql modeling', 'caching & queues', 'authentication & security', 'error handling & logging', 'scalability basics'],
  fullstack: ['javascript fundamentals', 'api design', 'sql modeling', 'component architecture', 'deployment basics', 'testing pyramid'],
  qa: ['test case design', 'regression strategy', 'selenium / playwright basics', 'api testing', 'bug reporting quality', 'ci pipelines'],
  data_analyst: ['sql joins & aggregations', 'excel / sheets modeling', 'statistics foundations', 'data cleaning', 'storytelling with dashboards', 'power bi or tableau'],
  data_science: ['python for data', 'statistics & probability', 'feature engineering', 'model evaluation', 'ml frameworks (sklearn)', 'experiment design'],
  devops: ['linux & networking basics', 'docker', 'kubernetes', 'ci/cd pipelines', 'infrastructure as code', 'monitoring & alerting'],
  product_manager: ['user research', 'prioritization frameworks', 'roadmaps & metrics', 'stakeholder communication', 'wireframing basics', 'sql-lite & analytics tools'],
  ux_designer: ['user research & interviews', 'information architecture', 'wireframing & prototyping', 'design systems', 'usability testing', 'visual hierarchy'],
  marketing: ['positioning & messaging', 'seo fundamentals', 'paid channels (ads)', 'email & lifecycle', 'analytics (ga4)', 'content strategy'],
  general: ['communication clarity', 'role fundamentals', 'structured problem solving', 'workplace collaboration', 'time management', 'continuous learning habits'],
};

const FAMILY_TEMPLATES: Record<RoleFamily, Array<{ category: string; topic: string; question: string; points: string[] }>> = {
  software_engineer: [
    { category: 'intro', topic: 'Background', question: 'Walk me through the project you are most proud of: what problem did it solve, and what did you personally build?', points: ['names a real project', 'states the problem clearly', 'describes their own contribution'] },
    { category: 'technical', topic: 'Data structures & algorithms', question: 'You have a list of a million records and need the top 100 by score with the least memory. How do you approach it?', points: ['heap / partial sort idea', 'complexity reasoning', 'edge cases'] },
    { category: 'technical', topic: 'Debugging', question: 'Describe a bug that survived code review. How did you find it and what prevented the next one?', points: ['systematic elimination', 'tooling used', 'prevention step'] },
    { category: 'project', topic: 'Design trade-offs', question: 'In {skills0} work specifically, what trade-off did you consciously make, and what would you change now?', points: ['names the trade-off', 'justifies the choice', 'reflection'] },
    { category: 'behavioral', topic: 'Collaboration', question: 'Tell me about a disagreement with a teammate on how something should be built. How was it resolved?', points: ['specific situation', 'their own role', 'outcome'] },
    { category: 'case', topic: 'System design basics', question: 'Design the backend for a link-shortening service. Talk through storage, redirection and scale.', points: ['storage model', 'redirection flow', 'scaling levers'] },
  ],
  frontend: [
    { category: 'intro', topic: 'Background', question: 'Tell me about a public-facing interface you built. What made it feel polished, concretely?', points: ['real example', 'specific polish details', 'impact'] },
    { category: 'technical', topic: 'State management', question: 'When does component state stop being enough — and what do you reach for next?', points: ['recognizes lifting/prop limits', 'names a real approach', 'trade-off awareness'] },
    { category: 'technical', topic: 'Rendering performance', question: 'A dashboard renders 500 rows and lags on scroll. Walk me through how you would profile and fix it.', points: ['profiling first', 'virtualization/memoization', 'measured outcome'] },
    { category: 'project', topic: 'CSS systems', question: 'How do you keep a growing component library visually consistent?', points: ['design tokens/utility approach', 'component API discipline', 'review process'] },
    { category: 'behavioral', topic: 'Feedback', question: 'A designer hands you a spec that is not feasible on your timeline. What do you do?', points: ['honest scoping conversation', 'offers alternatives', 'prioritizes user need'] },
    { category: 'case', topic: 'Accessibility', question: 'A modal dialog must be keyboard-navigable and screen-reader friendly. What are the requirements?', points: ['focus management', 'aria semantics', 'escape/close behavior'] },
  ],
  backend: [
    { category: 'intro', topic: 'Background', question: 'Which API or service did you build that carried the most real usage? What were its constraints?', points: ['real service', 'traffic or scale context', 'their specific role'] },
    { category: 'technical', topic: 'Database modeling', question: 'A table grows to 50 million rows and queries slow down. Diagnose and fix with me.', points: ['indexes/query plans', 'partitioning/archival', 'measured before/after'] },
    { category: 'technical', topic: 'Concurrency', question: 'Two requests update the same record at once. Walk through how you keep that safe.', points: ['transactions/locking concept', 'idempotency', 'failure handling'] },
    { category: 'project', topic: 'API design', question: 'What changed in how you design endpoints after your first painful production incident?', points: ['real incident', 'specific change', 'guardrail added'] },
    { category: 'behavioral', topic: 'Ownership', question: 'Tell me about a production issue you owned end-to-end. What was your checklist?', points: ['ownership signal', 'mitigation before diagnosis', 'postmortem'] },
    { category: 'case', topic: 'Caching', question: 'You add a cache and stale reads start showing users the wrong data. How do you bound staleness?', points: ['TTL/invalidation reasoning', 'write-path awareness', 'monitors the fix'] },
  ],
  fullstack: [
    { category: 'intro', topic: 'Background', question: 'Take one feature you shipped start-to-finish and describe the whole path: data model, API, UI.', points: ['end-to-end story', 'owns multiple layers', 'shipped outcome'] },
    { category: 'technical', topic: 'Data contracts', question: 'The API shape and the UI need diverge before launch. How do you reconcile them?', points: ['news the contract problem', 'negotiates scope', 'types/validation guardrails'] },
    { category: 'technical', topic: 'Auth flows', question: 'Explain how you would implement login with token refresh without annoying the user.', points: ['silent refresh concept', 'security trade-offs', 'failure handling'] },
    { category: 'project', topic: 'Trade-offs', question: 'Where did you cut corners in your last side project, and which cut fired back?', points: ['honest trade-off', 'consequence', 'lesson'] },
    { category: 'behavioral', topic: 'Cross-team', question: 'PM says ship Friday, QA says one open bug. You decide. What factors?', points: ['severity reasoning', 'rollback plan', 'stakeholder communication'] },
    { category: 'case', topic: 'Full-stack debugging', question: 'Users report intermittent empty dashboards. The logs are clean. Where do you look?', points: ['client/network/data layering', 'repro strategy', 'async race hypothesis'] },
  ],
  qa: [
    { category: 'intro', topic: 'Background', question: 'How do you decide test coverage for a feature about to ship in two days?', points: ['risk-based prioritization', 'happy path vs edge cases', 'regression safety net'] },
    { category: 'technical', topic: 'Test design', question: 'Give me three cases that would break a login form that looks fine to developers.', points: ['boundary/spec char cases', 'state cases (lockout, restore)', 'concurrency/network cases'] },
    { category: 'technical', topic: 'Automation', question: 'When is automating a test not worth it? What made you learn that the hard way?', points: ['maintenance cost awareness', 'flaky test reality', 'stabler alternative'] },
    { category: 'project', topic: 'Process', question: 'Walk me through one defect you caught that production would have hated.', points: ['repro depth', 'clarity of report', 'root cause follow-up'] },
    { category: 'behavioral', topic: 'Pushback', question: 'A release is today and you found a blocker someone disagrees is a blocker. What now?', points: ['evidence over opinion', 'severity framing', 'escalation path'] },
    { category: 'case', topic: 'API testing', question: 'Design an API regression suite for a payments endpoint without touching real money.', points: ['sandbox/mocking', 'idempotency checks', 'contract assertions'] },
  ],
  data_analyst: [
    { category: 'intro', topic: 'Background', question: 'Which analysis of yours actually changed a decision? Walk me from question to dashboard.', points: ['business question framing', 'method', 'measurable outcome'] },
    { category: 'technical', topic: 'SQL', question: 'Find the top product per user by revenue in one SQL query. Narrate your thinking.', points: ['window functions or lateral join', 'tie handling', 'performance hint'] },
    { category: 'technical', topic: 'Data quality', question: 'Two dashboards disagree on revenue. What do you check first, second, third?', points: ['definitions first', 'pipeline/join checks', 'single source of truth proposal'] },
    { category: 'project', topic: 'Storytelling', question: 'How do you present a finding that stakeholders will dislike but is solid?', points: ['framing', 'clarity over hedging', 'recommendation'] },
    { category: 'behavioral', topic: 'Priorities', question: 'Three teams ask for reports the same week. Triage for me.', points: ['decision-impact based triage', 'self-serve alternative', 'deadline honesty'] },
    { category: 'case', topic: 'Metric design', question: 'Define a metric for user engagement that cannot be gamed easily.', points: ['anti-gaming reasoning', 'segmentation', 'guardrail metrics'] },
  ],
  data_science: [
    { category: 'intro', topic: 'Background', question: 'Pick one ML project you shipped beyond a notebook. What made it survive production?', points: ['deployment reality', 'monitoring', 'business framing'] },
    { category: 'technical', topic: 'Model evaluation', question: 'Accuracy 95% but the project failed. What went wrong, plausibly?', points: ['imbalance/metric choice', 'data leakage candidates', 'business metric misalignment'] },
    { category: 'technical', topic: 'Feature work', question: 'How do you find features that will generalize rather than memorize?', points: ['train/val discipline', 'leakage checks', 'domain intuition'] },
    { category: 'project', topic: 'Experiment', question: 'How do you design an A/B test when traffic is low but leadership wants an answer?', points: ['power/MDE honesty', 'alternative methods', 'decision framing'] },
    { category: 'behavioral', topic: 'Expectations', question: 'Leadership wants an AI solution; you believe rules beat ML here. How do you respond?', points: ['evidence-basis', 'cost framing', 'delivers something honest'] },
    { category: 'case', topic: 'MLOps basics', question: 'Your model drifts three months after launch. Diagnose and save it.', points: ['drift measurement', 'retraining cadence', 'input/output monitoring'] },
  ],
  devops: [
    { category: 'intro', topic: 'Background', question: 'Which environment did you hand over that another engineer could own in one week? What made it ownable?', points: ['real env', 'automation/documentation', 'onboarding evidence'] },
    { category: 'technical', topic: 'Containers', question: 'A container eats 4 GB in prod, 300 MB locally. Difference and fix?', points: ['env-specific workload/bloat', 'resource limits', 'diagnosis method'] },
    { category: 'technical', topic: 'Pipelines', question: 'Your CI takes 40 minutes and fails randomly. Systematic fix.', points: ['parallelism/caching', 'flaky test policy', 'fail-fast gates'] },
    { category: 'project', topic: 'Incident', question: 'Tell me about a 2 a.m. outage. What did you change so you slept the next time?', points: ['real incident', 'detection setup', 'runbook/change'] },
    { category: 'behavioral', topic: 'Trade-offs', question: 'The team wants ship-now; you found a config drift. How do you handle the pressure?', points: ['risk articulation', 'fast mitigation offer', 'documentation'] },
    { category: 'case', topic: 'Monitoring', question: 'Design alerting for a service that must page only when a human should act this hour.', points: ['SLO-based alerts', 'noise budget', 'escalation tiers'] },
  ],
  product_manager: [
    { category: 'intro', topic: 'Background', question: 'Which product decision of yours you would defend today, and what evidence backed it?', points: ['specific decision', 'evidence type', 'measurable outcome'] },
    { category: 'technical', topic: 'Discovery', question: 'Your only research channel is five user calls. How do you avoid building on an anecdote?', points: ['triangulation', 'instrumented data', 'framing confidence honestly'] },
    { category: 'technical', topic: 'Prioritization', question: 'Walk me through a real trade-off you made: what did you de-prioritize and what did it cost?', points: ['framework vs judgment', 'communication of the cost', 'follow-up'] },
    { category: 'project', topic: 'Metrics', question: 'Ship day: orders down 4% but signups up 9%. Interpret and decide.', points: ['cohort decomposition', 'metric interaction intuition', 'decision with a check'] },
    { category: 'behavioral', topic: 'Stakeholders', question: 'Sales promises a feature to a client on your roadmap deadline. Actually, describe the conversation.', points: ['situational outline', 'course correction', 'future-proofing agreements'] },
    { category: 'case', topic: 'Zero-to-one', question: 'Design a v1 for a product that helps students manage exam prep. What would you cut and why?', points: ['sharp scope', 'single core loop', 'success metric'] },
  ],
  ux_designer: [
    { category: 'intro', topic: 'Background', question: 'Show me through one redesign you led: what evidence started it and what changed after?', points: ['research basis', 'design decision logic', 'before/after outcome'] },
    { category: 'technical', topic: 'Heuristics', question: 'A screen got 40% support-ticket drop after redesign. What did you change most likely, and why does that work?', points: ['cognitive load reasoning', 'concrete heuristics', 'measured rollback risk'] },
    { category: 'technical', topic: 'Systems', question: 'How would you design a component library contract with engineering?', points: ['tokens/variants thinking', 'governance', 'docs'] },
    { category: 'project', topic: 'Trade-offs', question: 'Tell me about a case where you argued against a beautiful design for the user\'s sake.', points: ['user-first decision', 'persuasion method', 'result'] },
    { category: 'behavioral', topic: 'Critique', question: 'How do you take a stakeholder saying "just make it pop" and turn it into a real goal?', points: ['reframing', 'clarifying questions', 'prototype options'] },
    { category: 'case', topic: 'Research', question: 'Users are abandoning on a critical form. How would you diagnose before redrawing it?', points: ['funnel/error data', 'user testing plan', 'informed fixes'] },
  ],
  marketing: [
    { category: 'intro', topic: 'Background', question: 'Which campaign of yours actually moved a number? From brief to result, in specifics.', points: ['concrete target', 'channel reasoning', 'numbers'] },
    { category: 'technical', topic: 'Funnel', question: 'Traffic doubled but conversions fell. What do you check before touching creatives?', points: ['source quality', 'journey step', 'attribution sanity'] },
    { category: 'technical', topic: 'Positioning', question: 'How would you reposition a product from "feature-rich" to a benefit customers feel?', points: ['audience empathy', 'message shift', 'testing plan'] },
    { category: 'project', topic: 'Budget efficiency', question: 'A channel stopped being profitable. What did you cut first and measure second?', points: ['reallocation logic', 'measurement', 'guardrails'] },
    { category: 'behavioral', topic: 'Feedback', question: 'Leadership wants viral growth hacks. You have solid data against them. Respond.', points: ['data framing', 'realistic growth case', 'pushback'] },
    { category: 'case', topic: 'SEO', question: 'A competitor outranks you on a money keyword with thinner content. Diagnose why and what you fix first?', points: ['technical/intent gaps', 'authority factors', 'realistic timeline'] },
  ],
  general: [
    { category: 'intro', topic: 'Background', question: 'Tell me about work you are genuinely proud of and why it mattered.', points: ['specific work', 'personal contribution', 'why it mattered'] },
    { category: 'technical', topic: 'Problem solving', question: 'Walk me through how you break down a task you have never done before.', points: ['structured approach', 'learning strategy', 'when to ask for help'] },
    { category: 'project', topic: 'Craft', question: 'What is a habit in {skills0} you built deliberately, and what changed because of it?', points: ['deliberate practice', 'measurable change', 'self-awareness'] },
    { category: 'behavioral', topic: 'Pressure', question: 'Describe a week when everything was urgent. How did you keep promises?', points: ['prioritization', 'communication', 'outcome'] },
    { category: 'behavioral', topic: 'Growth', question: 'What is a piece of feedback that stung but changed how you work?', points: ['accepts feedback', 'visible behavioral change', 'no grudge'] },
    { category: 'case', topic: 'Ownership', question: 'You inherit a messy project with no docs. First two weeks plan?', points: ['first inventory', 'risk triage', 'documentation habit'] },
  ],
};

function classifyRole(role: string): RoleFamily {
  const text = String(role || '').trim();
  if (!text) return 'general';
  for (const [family, pattern] of FAMILY_SIGNALS) {
    if (pattern.test(text)) return family;
  }
  return 'general';
}

export function roleFamily(role: string): RoleFamily {
  return classifyRole(role);
}

function firstSkill(profile: Profile): string {
  const skills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean) : [];
  return String(skills[0] || 'your core skill');
}

function fillTemplate(template: string, profile: Profile, job?: JobContext | null): string {
  const jobSkill = (job?.skills || []).map(String).find((skill) => skill.trim().length > 0);
  return template.replace(/\{skills0\}/g, jobSkill || firstSkill(profile));
}

function recentTopicSet(recentTopics: string[] | undefined): Set<string> {
  return new Set((recentTopics || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean));
}

/** Select template questions avoiding topics the candidate already practiced. */
export function templateQuestions(
  profile: Profile,
  role: string,
  difficulty: Difficulty,
  count: number,
  recentTopics?: string[],
  job?: JobContext | null,
): GeneratedQuestion[] {
  const family = classifyRole(role);
  const bank = FAMILY_TEMPLATES[family];
  const seen = recentTopicSet(recentTopics);
  const ordered = difficulty === 'brutal'
    ? [...bank].sort((a, b) => (a.category === 'case' ? -1 : 0) - (b.category === 'case' ? -1 : 0))
    : bank;
  const chosen: typeof bank = [];
  for (const q of ordered) {
    if (chosen.length >= count) break;
    if (seen.has(q.topic.toLowerCase())) continue;
    chosen.push(q);
  }
  // If the bank cannot fill the count (heavily filtered), top up ignoring recency.
  for (const q of ordered) {
    if (chosen.length >= count) break;
    if (!chosen.includes(q)) chosen.push(q);
  }
  return chosen.map((q, i) => {
    const base = {
      idx: i,
      category: q.category,
      topic: q.topic,
      question: fillTemplate(q.question, profile, job),
      ideal_points: q.points,
      source: 'template' as const,
    };
    // Make the opening question visibly about the actual job, so a key-less
    // (template) session still feels tailored rather than generic.
    if (i === 0 && q.category === 'intro' && job?.title) {
      const company = job.company ? ` at ${job.company}` : '';
      return {
        ...base,
        question: `You are interviewing for the ${job.title} role${company}. Walk me through the experience that makes you a strong fit, and one thing you would need to learn quickly.`,
        ideal_points: ['relevant experience', 'specific evidence', 'honest gap plus learning plan'],
      };
    }
    return base;
  });
}

const QUESTION_SYSTEM_PROMPT = [
  'You are an experienced, humane interviewer for Indian tech and business roles.',
  'Generate mock interview questions tailored to the candidate profile and target role.',
  'Rules: questions must be answerable in 2-4 minutes from the candidate\'s own real experience or reasoning.',
  'Cycle categories: background, technical (role-specific), project deep-dive, behavior, and one case/scenario question.',
  'Never ask about facts absent from the profile. Do not number the questions in the question text.',
  'Return JSON: {"questions":[{"question":string,"category":"intro"|"technical"|"project"|"behavioral"|"case","topic":string,"ideal_points":string[]}]}.',
  'ideal_points are 3 short phrases describing what a strong answer covers; they are used for grading.',
].join('\n');

/** Generate questions via Gemini; falls back to the template bank. */
export async function generateInterviewQuestions(profile: Profile, options: {
  role: string;
  difficulty: Difficulty;
  count: number;
  recentTopics?: string[];
  job?: JobContext | null;
  avatar?: AvatarPersona | null;
}): Promise<{ questions: GeneratedQuestion[]; model: string }> {
  const { role, difficulty, count, recentTopics, job, avatar } = options;
  const fallback = () => ({
    questions: templateQuestions(profile, role, difficulty, count, recentTopics, job),
    model: 'template',
  });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback();

  const personal = {
    role_target: role,
    skills: profile.skills,
    preferred_roles: profile.preferred_roles,
    experience_years: profile.experience_years,
    headline: profile.headline,
    recent_projects: (Array.isArray(profile.projects) ? profile.projects : []).slice(0, 5),
    recent_companies: (Array.isArray(profile.experience) ? profile.experience : []).slice(0, 5).map((e: any) => ({ title: e?.title, company: e?.company })),
    education_level: profile.education_level,
  };
  const alreadyPracticed = (recentTopics || []).slice(0, 25);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: [
          QUESTION_SYSTEM_PROMPT,
          avatar ? [
            `You are ${avatar.name}, ${avatar.title}.`,
            `Personality: ${avatar.personality}`,
            `Interviewing ability: ${avatar.ability}`,
            'Speak like a real Indian interviewer: natural Indian English, warm but professional, never robotic.',
            'Phrase the questions in your own voice and let your specialty shape what you probe.',
          ].join('\n') : '',
          job ? [
            `The candidate is interviewing for this specific job: ${job.title}${job.company ? ` at ${job.company}` : ''}.`,
            (job.skills || []).length ? `Job skills: ${JSON.stringify((job.skills || []).slice(0, 20))}` : '',
            (job.description || job.about_job) ? `Job description excerpt: ${String(job.description || job.about_job).slice(0, 2500)}` : '',
            'Ask the questions this employer would actually ask for this job, not generic role questions.',
          ].filter(Boolean).join('\n') : '',
          `Target role: ${role}`,
          `Difficulty: ${difficulty} (calm = encouraging standard questions; standard = typical interview; brutal = follow-the-thread pressure questions)`,
          `Generate ${count} question objects.`,
          alreadyPracticed.length ? `Avoid these recently practiced topics: ${JSON.stringify(alreadyPracticed)}` : '',
          JSON.stringify(personal),
        ].filter(Boolean).join('\n\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 4096 },
      }),
    });
    if (!response.ok) return fallback();
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(generatedText);
    const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const valid = list.filter((q: any) =>
      typeof q?.question === 'string' && q.question.trim().length >= 12 && q.question.length <= 600,
    ).slice(0, count);
    if (valid.length < Math.min(3, count)) return fallback();
    const family = classifyRole(role);
    const seen = recentTopicSet(recentTopics);
    let questions = valid.map((q: any, i: number) => ({
      idx: i,
      category: typeof q.category === 'string' && ['intro', 'technical', 'project', 'behavioral', 'case'].includes(q.category) ? q.category : 'general',
      topic: typeof q.topic === 'string' ? q.topic.slice(0, 120) : 'General',
      question: q.question.trim(),
      ideal_points: Array.isArray(q.ideal_points) ? q.ideal_points.filter((p: any) => typeof p === 'string').slice(0, 8) : [],
      source: 'gemini' as const,
    }));
    // Drop repeats of recently practiced topics when we still have enough questions.
    if (questions.length >= count) {
      const filtered = questions.filter((q: any) => !seen.has(String(q.topic).toLowerCase()));
      if (filtered.length >= count) questions = filtered;
    }
    // Top up from the template bank so the session always has full count.
    if (questions.length < count) {
      const existingTopics = new Set(questions.map((q: any) => String(q.question).toLowerCase()));
      for (const extra of templateQuestions(profile, role, difficulty, count, [...(recentTopics || []), ...questions.map((q: any) => q.topic)], job)) {
        if (questions.length >= count) break;
        if (existingTopics.has(extra.question.toLowerCase())) continue;
        existingTopics.add(extra.question.toLowerCase());
        questions.push({ ...extra, source: 'template' });
      }
    }
    questions = questions.slice(0, count);
    if (questions.length === 0) return fallback();
    return { questions, model: 'gemini-2.5-flash' };
  } catch {
    return fallback();
  }
}

const GRADE_SYSTEM_PROMPT = [
  'Grade a mock interview answer like a fair, specific interviewer.',
  'The candidate answered a question in text. Grade ONLY what they wrote.',
  'Be encouraging but honest. Do not invent facts the candidate did not state.',
  'Return JSON: {"score":0-100,"strengths":string[2-3],"improvements":string[2-3]}.',
  'Score meaning: 90+ outstanding, 75 strong, 60 acceptable with gaps, 40 weak, 20 stumped.',
].join('\n');

export function heuristicGrade(spec: QuestionSpec, answer: string, difficulty: Difficulty): AnswerGrade {
  const text = String(answer || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();

  if (words.length === 0) {
    return { score: 0, strengths: [], improvements: ['Answer the question in 3-5 concrete sentences next time.'] };
  }

  const strengths: string[] = [];
  const improvements: string[] = [];
  let score = 40;

  // Substance: a real answer has a few sentences.
  if (words.length >= 35) score += 10;
  if (words.length >= 80) score += 8;
  if (words.length < 15) improvements.push('Give more substance — aim for 4-6 specific sentences.');

  // Specificity: tools, numbers, names, concrete years.
  if (/\d/.test(text) && /%|percent|hour|month|year|day|week|second|minute|\buser\b|\brecord\b|\bms\b|\bkg\b|₹|\brs\b|\$|\bteam\b|\bcustomer\b|\brequest\b|\bapi\b|latency|load time|\brevenue\b|\bcost\b|\bticket\b/i.test(text)) {
    score += 10;
    strengths.push('You anchored the answer with concrete numbers and context.');
  } else if (words.length >= 30) {
    improvements.push('Add one concrete number or scope detail (team size, duration, result) so the answer lands.');
  }

  // Coverage of the expected points.
  const points = spec.ideal_points || [];
  const covered = points.filter((p) => {
    const key = String(p).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0];
    return key && key.length > 3 && lower.includes(key);
  });
  if (points.length > 0 && covered.length >= Math.ceil(points.length / 2)) {
    score += 12;
    strengths.push('Your answer covered what this question is designed to reveal.');
  } else if (points.length > 0) {
    improvements.push(points.length >= 3
      ? `Try touching at least two of the angles interviewers listen for here (e.g. ${points[0]} and ${points[1]}).`
      : 'Cover the core angle this question is testing more directly.');
  }

  // Structure: past situation → action → outcome language.
  const structureHits = [
    /situation|context|problem/i,
    /we (built|decided|had|were|used|agreed|shipped|chose|cut|reduced)/i,
    /i (built|led|wrote|designed|fixed|chose|owned|measured|decided|reduced|cut|shipped|launched|migrated|implemented|moved|tested)/i,
    /result|outcome|impact|so that|reduced|cut|improved|increased|saved|grew|dropped|faster|slower/i,
  ].filter((re) => re.test(lower)).length;
  if (structureHits >= 2) {
    score += 8;
    strengths.push('Good structure: situation, your action, and the outcome are visible.');
  } else {
    improvements.push('Follow the STAR shape — situation, what YOU did, and the result — in that order.');
  }

  // Hedging and filler.
  if (/maybe|i guess|not sure|idk|kind of sort of/i.test(lower)) {
    score -= 6;
    improvements.push('Trim hedging. Say what you did and what you would do differently with confidence.');
  }
  if (spec.category === 'project' && !/\bi\b|my\b/i.test(lower)) {
    improvements.push('Make your own role explicit — use "I" for at least the actions you personally led.');
  }

  // Difficulty calibration: standard band, brutal reads tighter.
  if (difficulty === 'brutal') score = Math.max(0, score - 5);
  if (difficulty === 'calm' && words.length >= 50) score += 4;

  score = Math.max(0, Math.min(100, Math.round(score)));
  if (strengths.length === 0) strengths.push('You engaged directly with the question — keep that.');
  if (improvements.length === 0) improvements.push('Push one level deeper: what would you do differently next time?');
  return { score, strengths, improvements };
}

export async function gradeAnswer(spec: QuestionSpec, answer: string, difficulty: Difficulty, profileHint?: Record<string, unknown>): Promise<AnswerGrade> {
  const fallback = () => heuristicGrade(spec, answer, difficulty);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !String(answer || '').trim()) return fallback();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: [
          GRADE_SYSTEM_PROMPT,
          `Question (${spec.category}, topic: ${spec.topic || 'general'}): ${spec.question}`,
          `What a good answer covers: ${JSON.stringify(spec.ideal_points || [])}`,
          `Difficulty context: ${difficulty}`,
          profileHint ? `Candidate context (for specificity only): ${JSON.stringify(profileHint)}` : '',
          `Candidate answer: ${String(answer).slice(0, 6000)}`,
        ].filter(Boolean).join('\n\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 800 },
      }),
    });
    if (!response.ok) return fallback();
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(generatedText);
    const score = typeof parsed?.score === 'number' ? Math.max(0, Math.min(100, Math.round(parsed.score))) : null;
    if (score === null) return fallback();
    const strengths = Array.isArray(parsed?.strengths) ? parsed.strengths.filter((s: any) => typeof s === 'string').slice(0, 3) : [];
    const improvements = Array.isArray(parsed?.improvements) ? parsed.improvements.filter((s: any) => typeof s === 'string').slice(0, 3) : [];
    return {
      score,
      strengths: strengths.length ? strengths : ['You engaged directly with the question.'],
      improvements: improvements.length ? improvements : ['Tighten structure: situation, action, result.'],
      model: GEMINI_MODEL,
    };
  } catch {
    return fallback();
  }
}

const SUMMARY_SYSTEM_PROMPT = [
  'Summarize a completed mock interview session for the candidate.',
  'Return JSON: {"verdict":string (max 60 chars),"summary":string (60-140 words, plain text, no headings)}.',
  'Mention what the candidate did well, the main gap to fix before a real interview, and one concrete drill.',
  'Never invent questions or answers that are not present.',
].join('\n');

export function templateSummary(session: { difficulty: string; role_focus: string }, graded: Array<{ score: number }>, byCategory: Record<string, number>): { verdict: string; summary: string } {
  const scores = graded.map((q) => q.score);
  const avg = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
  const verdict = avg >= 85 ? 'Outstanding mock' : avg >= 72 ? 'Strong showing' : avg >= 55 ? 'Solid, with gaps' : avg >= 35 ? 'Needs sharpening' : 'Early days';
  const weakest = Object.entries(byCategory).sort((a, b) => a[1] - b[1])[0];
  const strongest = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
  const summary = [
    `You practiced a ${session.difficulty}-intensity ${session.role_focus} interview and averaged ${avg}/100.`,
    weakest && weakest[0] !== strongest?.[0] ? `Your ${strongest?.[0] || 'core'} answers held up best; ${weakest[0]} questions scored lowest.` : '',
    weakest ? 'Drill for the next attempt: write the weakest answer again using situation, action, result, out loud, twice.' : 'Try a full session again after a day of rest.',
  ].filter(Boolean).join(' ');
  return { verdict, summary };
}

export async function summarizeSession(session: { difficulty: string; role_focus: string }, items: Array<{ category: string; score: number; question: string; answer: string; feedback: any }>): Promise<{ verdict: string; summary: string }> {
  const byCategory: Record<string, number> = {};
  for (const item of items) byCategory[item.category] = item.score;
  const fallback = () => templateSummary(session, items, byCategory);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || items.length === 0) return fallback();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: [
          SUMMARY_SYSTEM_PROMPT,
          `Role: ${session.role_focus}; difficulty: ${session.difficulty}.`,
          JSON.stringify(items.map((i) => ({
            category: i.category,
            question: String(i.question).slice(0, 400),
            answer: String(i.answer).slice(0, 1200),
            score: i.score,
            strengths: i.feedback?.strengths || [],
            improvements: i.feedback?.improvements || [],
          }))),
        ].join('\n\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 900 },
      }),
    });
    if (!response.ok) return fallback();
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(generatedText);
    const verdict = typeof parsed?.verdict === 'string' ? parsed.verdict.slice(0, 60) : '';
    const summary = typeof parsed?.summary === 'string' ? parsed.summary.slice(0, 1500) : '';
    if (!verdict || !summary) return fallback();
    return { verdict, summary };
  } catch {
    return fallback();
  }
}

/* ------------------------------------------------------------------ */
/* Adaptive follow-ups (the interviewer digs into what was just said)  */
/* ------------------------------------------------------------------ */

const FOLLOWUP_SYSTEM_PROMPT = [
  'You are a live interviewer mid-conversation. The candidate just gave an answer to your previous question.',
  'Ask exactly ONE natural spoken follow-up that goes deeper into something concrete THE CANDIDATE THEMSELVES just mentioned (a project, tool, number, team, or claim).',
  'If the answer was vague or shallow, ask the follow-up that would force the most useful concrete detail.',
  'Rules: one sentence, max 40 words, spoken conversational style, no numbering, no quotes.',
  'Never invent facts the candidate did not state — anchor on their own words only.',
  'Return JSON: {"question":string,"topic":string (2-4 words),"ideal_points":string[3] (short phrases a good follow-up answer covers)}.',
].join('\n');

const FOLLOWUP_PROBES: Array<{ test: RegExp; question: (anchor: string) => string; topic: string; points: string[] }> = [
  {
    test: /\breact|node|python|sql|typescript|java|docker|kubernetes|aws|gcp|azure|next\.?js|angular|vue|django|flask|spring|figma|power bi|tableau|excel|tensorflow|pytorch|pandas\b/i,
    question: (anchor) => `You mentioned ${anchor} — what was the hardest decision you made while working with it, and what did you learn going the other way?`,
    topic: 'Tool deep-dive',
    points: ['names a specific decision', 'explains the trade-off', 'links it to an outcome'],
  },
  {
    test: /(?:^|[^\w])\d|\bpercent\b|%|\busers\b|\bgrowth\b|\brevenue\b|\bhours?\b|\bdays?\b|\bmonths?\b|\bteam of \d+/i,
    question: () => 'That number carries the whole claim — how did you measure it, and what would make you doubt the result?',
    topic: 'Metrics probe',
    points: ['measurement method', 'caveats or confounders', 'what they changed because of it'],
  },
  {
    test: /\bteam\b|\bwe\b|\bcollaborat|stakeholder|manager|reviewed|pair(ed)?\b/i,
    question: () => 'Speaking of the team: what did you personally own in that effort, and where did you disagree with the group?',
    topic: 'Your exact role',
    points: ['clear personal contribution', 'a real disagreement', 'how it resolved'],
  },
  {
    test: /\bfailed|failed|mistake|went wrong|broke|down|bug|delayed|behind\b/i,
    question: () => 'What would you do differently if you replayed that situation today?',
    topic: 'Hindsight check',
    points: ['honest reflection', 'specific alternate action', 'evidence of change'],
  },
  {
    test: /\bproject|built|designed|shipped|launched|migrated|created\b/i,
    question: () => 'Zoom into that project: what did it look like before you touched it, and what changed first after you shipped?',
    topic: 'Before and after',
    points: ['concrete before state', 'their own contribution', 'visible after state'],
  },
];

/** Template follow-up: anchors only on safe paraphrases of the candidate's own answer. */
export function templateFollowUp(question: string, answer: string, previousTopic: string): FollowUpQuestion {
  const anchorMatch = answer.match(/\b(react|node\.?js|python|sql|typescript|java|docker|kubernetes|aws|gcp|azure|next\.?js|angular|vue|django|flask|spring|figma|power bi|tableau|excel|tensorflow|pytorch|pandas)\b/i);
  const anchor = anchorMatch ? String(anchorMatch[0]).toLowerCase() : 'that';
  for (const probe of FOLLOWUP_PROBES) {
    if (probe.test.test(String(answer || ''))) {
      return { question: probe.question(anchor), topic: probe.topic, ideal_points: probe.points, source: 'template' };
    }
  }
  // Generic-but-honest dig: undercut the polished version of their own answer.
  return {
    question: 'Now the uncomfortable one: which part of what you just told me would you rewrite, and what exactly would change?',
    topic: 'Pressure probe',
    ideal_points: ['names a weak spot', 'owns it without excuses', 'states the fix'],
    source: 'template',
  };
}

/** Generate one conversational follow-up from the candidate's last answer; template fallback when no key / bad output. */
export async function generateFollowUp(input: {
  role_focus: string;
  difficulty: string;
  question: string;
  topic: string;
  answer: string;
  history: Array<{ question: string; answer: string }>;
}): Promise<FollowUpQuestion> {
  const fallback = () => templateFollowUp(input.question, input.answer, input.topic);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !String(input.answer || '').trim()) return fallback();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: [
          FOLLOWUP_SYSTEM_PROMPT,
          `Target role: ${input.role_focus}; difficulty: ${input.difficulty}.`,
          `Previous question you asked: ${String(input.question).slice(0, 400)}`,
          ...input.history.slice(0, 3).map((h) => `Earlier you asked: ${String(h.question).slice(0, 250)} · they answered: ${String(h.answer).slice(0, 400)}`),
          `Their latest answer (verbatim): ${String(input.answer).slice(0, 3000)}`,
        ].filter(Boolean).join('\n\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 400 },
      }),
    });
    if (!response.ok) return fallback();
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(generatedText);
    const question = typeof parsed?.question === 'string' ? parsed.question.trim() : '';
    if (!question || question.length < 12 || question.length > 320) return fallback();
    return {
      question,
      topic: typeof parsed?.topic === 'string' ? parsed.topic.slice(0, 60) : 'Follow-up',
      ideal_points: Array.isArray(parsed?.ideal_points) ? parsed.ideal_points.filter((p: any) => typeof p === 'string').slice(0, 4) : [],
      source: GEMINI_MODEL as any,
    };
  } catch {
    return fallback();
  }
}

/* ------------------------------------------------------------------ */
/* Live persona: opening greeting + in-character reactions             */
/* ------------------------------------------------------------------ */

function firstName(value: unknown): string {
  const clean = String(value || '').replace(/[^\p{L}\s'-]/gu, ' ').trim();
  const first = clean.split(/\s+/).filter(Boolean)[0] || '';
  return first.slice(0, 40);
}

function roleLabel(role: string, job?: JobContext | null): string {
  return String(role || job?.title || 'this role').trim();
}

function companyLabel(job?: JobContext | null): string {
  return job?.company ? ` at ${job.company}` : '';
}

export function templateOpeningLine(input: {
  avatar: AvatarPersona;
  role: string;
  job?: JobContext | null;
  candidateName?: string;
}): string {
  const name = firstName(input.candidateName);
  const hello = name ? `Hi ${name}, ` : 'Hi, ';
  const role = roleLabel(input.role, input.job);
  const company = companyLabel(input.job);
  switch (input.avatar.id) {
    case 'vikram':
      return `Hello${name ? ` ${name}` : ''}, I'm Vikram Rao. I'll be running your ${role} interview${company}. I care about how you reason under constraints, so expect me to go a layer deeper. Let's begin.`;
    case 'priya':
      return `${hello}I'm Priya Nair, and I'll be your interviewer for the ${role} role${company}. I'm interested in how you make decisions and what evidence you use. Let's dive in.`;
    case 'arjun':
      return `I'm Arjun Mehta, your bar raiser for the ${role} interview${company}. I'll push on your claims — that's the point of this round. Let's start.`;
    case 'neha':
      return `Hello${name ? ` ${name}` : ''}, I'm Neha Iyer. I'll be your interviewer for the ${role} role${company}. I'll be looking for the evidence and numbers behind your answers. Let's begin.`;
    case 'rohan':
      return `Hey${name ? ` ${name}` : ''}, I'm Rohan Kapoor. I'll be running your ${role} interview${company}. I care about what you've actually shipped and how you think on your feet. Let's get into it.`;
    default:
      return `${hello}I'm Aria Sharma. I'll be your interviewer for the ${role} role${company} today. We'll keep this conversational — think aloud, give me specifics, and I'll follow up where it matters. Ready when you are.`;
  }
}

const OPENING_SYSTEM_PROMPT = [
  'You are an Indian interviewer opening a live mock interview.',
  'Write 1-2 spoken sentences (max 55 words) in your own voice.',
  'Say your name, the role, and (if given) the company. Set a human, conversational tone.',
  'Natural Indian English. No bullet points, no headings, no stage directions.',
  'Do not ask the first interview question in the opening line; the question appears separately.',
  'Return JSON: {"opening_line":string}.',
].join('\n');

/** Generate a persona-specific greeting; template fallback when no key / bad output. */
export async function generateOpeningLine(input: {
  avatar: AvatarPersona;
  role: string;
  job?: JobContext | null;
  candidateName?: string;
}): Promise<string> {
  const fallback = () => templateOpeningLine(input);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: [
          OPENING_SYSTEM_PROMPT,
          `You are ${input.avatar.name}, ${input.avatar.title}.`,
          `Personality: ${input.avatar.personality}`,
          `Interviewing ability: ${input.avatar.ability}`,
          `Candidate first name: ${firstName(input.candidateName) || '(not given)'}`,
          `Role: ${roleLabel(input.role, input.job)}${companyLabel(input.job)}`,
        ].join('\n\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.75, maxOutputTokens: 300 },
      }),
    });
    if (!response.ok) return fallback();
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(generatedText);
    const line = typeof parsed?.opening_line === 'string' ? parsed.opening_line.trim() : '';
    if (line.length < 20 || line.length > 420) return fallback();
    return line;
  } catch {
    return fallback();
  }
}

const REPLY_LEADS: Record<string, { strong: string[]; okay: string[]; weak: string[] }> = {
  aria: {
    strong: [
      'Thank you — that was clear and specific, and I could follow your role in it.',
      'That landed well. You gave me the situation, your action and the outcome without me having to pull for it.',
    ],
    okay: [
      'Thanks — that gives me the picture, though I would have liked one more concrete example.',
      'I followed it, but one concrete example would make that much more convincing.',
    ],
    weak: [
      'Thank you for being direct. That answer stayed a little high level, so let me give you another angle to show more depth.',
      'I am still missing the specific example, so let us try that again from the top.',
    ],
  },
  vikram: {
    strong: [
      'Good. The reasoning holds together, and you named the trade-off instead of hiding it.',
      'That is the level of reasoning I expect - you kept the constraints visible.',
    ],
    okay: [
      'Okay. You covered the surface; I would want more depth on the trade-off and the failure mode.',
      'I can see the shape, but I would push you on the failure mode before I am satisfied.',
    ],
    weak: [
      'Let us slow down. That answer stayed at the surface, and I need the reasoning underneath it.',
      'I need the actual mechanism, not the summary. Walk me through what happened.',
    ],
  },
  priya: {
    strong: [
      'Nice — I can see the user problem and the decision behind it.',
      'You kept the user in the frame and still made a clear call. That is the balance I look for.',
    ],
    okay: [
      'That is a reasonable direction, though I am not fully convinced by the evidence yet.',
      'I can see the intent, but I would want the user evidence before I sign off.',
    ],
    weak: [
      'I am not convinced yet. Help me see the user impact and the trade-off you chose.',
      'Start from the user problem, then tell me what you changed and why.',
    ],
  },
  arjun: {
    strong: [
      'That one holds up. You backed the claim with evidence, which is what I was testing.',
      'You said what you owned and what you did not. That is exactly the honesty I test for.',
    ],
    okay: [
      'Fine. But I would push harder on what you personally owned versus what the team did.',
      'I am with you on the outcome, but I still do not know what you personally moved.',
    ],
    weak: [
      'That is not going to survive a real bar-raiser round. I need specifics, not intentions.',
      'Give me one decision you personally made, and the evidence you used.',
    ],
  },
  neha: {
    strong: [
      'Good — you anchored that with evidence, which is exactly what I listen for.',
      'You showed the measurement, not just the result. That is the difference.',
    ],
    okay: [
      'Directionally useful, but I am missing the measurement method behind that result.',
      'The result is interesting, but I need the method before I trust it.',
    ],
    weak: [
      'I am missing the evidence. Next time, walk me through how you measured it.',
      'Tell me how you measured it, and what would have made you doubt the number.',
    ],
  },
  rohan: {
    strong: [
      'Love that you shipped it and can explain what changed. That is the signal I want.',
      'You can explain the trade-off and the outcome. That is the signal.',
    ],
    okay: [
      'Solid start, but I would want to know what you would cut and why.',
      'I buy the direction, but I want the cut list and the reason behind it.',
    ],
    weak: [
      'That is a bit theoretical for me. I want to hear what you actually built and what broke.',
      'Show me the thing you shipped, the constraint you had, and what broke.',
    ],
  },
};

export function templateInterviewerReply(input: {
  avatar: AvatarPersona;
  score: number;
  hasFollowUp?: boolean;
  answer?: string;
  turn?: number;
}): string {
  const leads = REPLY_LEADS[input.avatar.id] || REPLY_LEADS.aria;
  const variants = input.score >= 82 ? leads.strong : input.score >= 60 ? leads.okay : leads.weak;
  const turn = Math.abs(Number(input.turn) || 0);
  const lead = variants[turn % variants.length];
  const bridges = input.hasFollowUp
    ? [
        ' There is something in that answer I want to unpack.',
        ' Hold that thought - I want to go one level deeper.',
        ' One part of that answer needs a closer look.',
      ]
    : input.score < 60
      ? [
          ' Let us keep going, and I will come back to depth.',
          ' We will move on, but I am noting the depth gap.',
          ' Next question, then we will circle back to the detail.',
        ]
      : [
          ' Let us keep moving.',
          ' Good - let us build on that.',
          ' Okay, next angle.',
        ];
  return `${lead}${bridges[turn % bridges.length]}`;
}

const REPLY_SYSTEM_PROMPT = [
  'You are an Indian interviewer mid-conversation. The candidate just answered your question.',
  'React in character in 1-3 spoken sentences (max 60 words).',
  'Mention one concrete thing the candidate actually said. Be honest but professional: praise a real strength, name the main gap without insulting them.',
  'If a follow-up is coming, signal that you want to unpack something — do not ask the follow-up itself and do not repeat the next question.',
  'Natural Indian English. No bullet points, no headings, no stage directions. Never invent facts they did not state.',
  'Return JSON: {"reply":string}.',
].join('\n');

/** Generate an in-character reaction to the candidate's answer; template fallback. */
export async function generateInterviewerReply(input: {
  avatar: AvatarPersona;
  role: string;
  job?: JobContext | null;
  difficulty: string;
  question: string;
  answer: string;
  score: number;
  strengths?: string[];
  improvements?: string[];
  followUp?: string;
  turn?: number;
}): Promise<string> {
  const fallback = () => templateInterviewerReply({
    avatar: input.avatar,
    score: input.score,
    hasFollowUp: Boolean(input.followUp),
    answer: input.answer,
    turn: input.turn,
  });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !String(input.answer || '').trim()) return fallback();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: [
          REPLY_SYSTEM_PROMPT,
          `You are ${input.avatar.name}, ${input.avatar.title}.`,
          `Personality: ${input.avatar.personality}`,
          `Interviewing ability: ${input.avatar.ability}`,
          `Role: ${roleLabel(input.role, input.job)}${companyLabel(input.job)}; difficulty: ${input.difficulty}.`,
          `Your question: ${String(input.question).slice(0, 400)}`,
          `Their answer (verbatim): ${String(input.answer).slice(0, 3000)}`,
          `Grade: ${input.score}/100. Strengths: ${JSON.stringify((input.strengths || []).slice(0, 3))}. Gaps: ${JSON.stringify((input.improvements || []).slice(0, 3))}.`,
          input.followUp ? `A follow-up is coming: ${String(input.followUp).slice(0, 300)}` : 'No follow-up is coming; the next planned question is next.',
        ].join('\n\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 300 },
      }),
    });
    if (!response.ok) return fallback();
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(generatedText);
    const reply = typeof parsed?.reply === 'string' ? parsed.reply.trim() : '';
    if (reply.length < 12 || reply.length > 420) return fallback();
    return reply;
  } catch {
    return fallback();
  }
}

/* ------------------------------------------------------------------ */
/* Learning tracks                                                     */
/* ------------------------------------------------------------------ */

const RESOURCE_SOURCES: Record<string, { type: string; url: string }> = {
  python: { type: 'docs', url: 'https://www.python.org/about/gettingstarted/' },
  javascript: { type: 'docs', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
  typescript: { type: 'docs', url: 'https://www.typescriptlang.org/docs/' },
  react: { type: 'docs', url: 'https://react.dev/learn' },
  sql: { type: 'docs', url: 'https://www.postgresql.org/docs/current/tutorial.html' },
  docker: { type: 'docs', url: 'https://docs.docker.com/get-started/' },
  kubernetes: { type: 'docs', url: 'https://kubernetes.io/docs/tutorials/' },
  git: { type: 'docs', url: 'https://git-scm.com/book/en/v2' },
  excel: { type: 'docs', url: 'https://support.microsoft.com/excel' },
  powerbi: { type: 'docs', url: 'https://learn.microsoft.com/power-bi/' },
  pandas: { type: 'docs', url: 'https://pandas.pydata.org/docs/getting_started/index.html' },
  node: { type: 'docs', url: 'https://nodejs.org/en/learn' },
  linux: { type: 'docs', url: 'https://ubuntu.com/tutorials' },
  figma: { type: 'docs', url: 'https://help.figma.com/hc/en-us/categories/360002051613' },
  analytics: { type: 'docs', url: 'https://analytics.google.com/' },
};

const ROADMAP_URLS: Record<RoleFamily, string> = {
  software_engineer: 'https://roadmap.sh/backend',
  frontend: 'https://roadmap.sh/frontend',
  backend: 'https://roadmap.sh/backend',
  fullstack: 'https://roadmap.sh/full-stack',
  qa: 'https://roadmap.sh/qa',
  data_analyst: 'https://roadmap.sh/data-analyst',
  data_science: 'https://roadmap.sh/ai-data-scientist',
  devops: 'https://roadmap.sh/devops',
  product_manager: 'https://roadmap.sh/product-manager',
  ux_designer: 'https://roadmap.sh/ux-design',
  marketing: 'https://roadmap.sh/ai-engineer',
  general: 'https://roadmap.sh/',
};

const TRACK_SYSTEM_PROMPT = [
  'Build a focused learning track for one candidate targeting one role.',
  'Use ONLY the candidate skills for "covered" reasoning; aim modules at the biggest gaps plus role fundamentals.',
  'Never invent named courses, paid products, or fake deep-link URLs. Resource URLs above /docs or homepage roots only.',
  'Return JSON: {"modules":[{"title":string,"why":string (apt gap explanation, max 200 chars),"level":"beginner"|"intermediate"|"advanced","topics":[{"title":string,"what_to_learn":string (max 220 chars),"resources":[{"type":"docs"|"roadmap"|"book"|"video","name":string,"url":string}]}],"practice_exercise":string (max 240 chars)}]}.',
  'Produce exactly 5 modules. Keep language concrete and specific to the role.',
].join('\n');

function resolveResource(name: string, skills: string[]): LearningResource {
  const key = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
  for (const [resKey, res] of Object.entries(RESOURCE_SOURCES)) {
    if (key.startsWith(resKey)) return { type: 'docs', name: `${resKey.charAt(0).toUpperCase()}${resKey.slice(1)} docs`, url: res.url };
  }
  const owned = skills.find((s) => String(name || '').toLowerCase().includes(String(s).toLowerCase().slice(0, 6)) && String(s).length > 3);
  if (owned) {
    const ownedKey = owned.toLowerCase().replace(/[^a-z]/g, '');
    for (const [resKey, res] of Object.entries(RESOURCE_SOURCES)) {
      if (ownedKey.startsWith(resKey)) return { type: 'docs', name: owned, url: res.url };
    }
  }
  const family = classifyRole('');
  return { type: 'roadmap', name: 'Role roadmap', url: ROADMAP_URLS[family] };
}

function templateTrackModules(profile: Profile, role: string): LearningModule[] {
  const family = classifyRole(role);
  const skills = (Array.isArray(profile?.skills) ? profile.skills.filter(Boolean).map(String) : []);
  const core = FAMILY_SKILLS[family];
  const years = Number(profile?.experience_years) || 0;
  const levelOf = (skill: string) => skills.some((s) => s.toLowerCase().includes(String(skill).toLowerCase().slice(0, Math.min(8, skill.length)))) ? 'intermediate' : (years >= 3 ? 'intermediate' : 'beginner');

  const modules: LearningModule[] = core.map((skill, i) => {
    const known = skills.some((s) => s.toLowerCase().includes(skill.toLowerCase().slice(0, Math.min(8, skill.length))));
    const level = years >= 3 ? (known ? 'advanced' : 'intermediate') : (known ? 'intermediate' : 'beginner');
    const topics = [
      { title: `Core: ${skill}`, what_to_learn: `Practical understanding of ${skill} at the level a ${role || family.replace(/_/g, ' ')} role expects in 2026.`, resources: [{ type: 'roadmap', name: 'Role roadmap', url: ROADMAP_URLS[family] } as LearningResource] },
      ...(/[a-z]/.test(skill) && RESOURCE_SOURCES[skill.toLowerCase().replace(/[^a-z]/g, '')] ? [{ title: `Reference: ${skill}`, what_to_learn: `Work through the official ${skill} starter path and keep notes.`, resources: [RESOURCE_SOURCES[skill.toLowerCase().replace(/[^a-z]/g, '')]] as LearningResource[] }] : []),
    ];
    return {
      title: i === 0 ? `${skill} — primary gap to close` : skill.charAt(0).toUpperCase() + skill.slice(1),
      why: known ? `You already list this; push it to interview depth for ${role || 'your target role'}.` : `Not visible in your profile yet — first-look gap for ${role || 'this role'}.`,
      level: level as LearningModule['level'],
      topics,
      practice_exercise: `Week drill: build one small artifact that forces ${skill} decisions, then explain the trade-offs out loud in five sentences.`,
    };
  });
  return modules.slice(0, 5);
}

export async function generateLearningTrack(profile: Profile, role: string): Promise<{ modules: LearningModule[]; model: string }> {
  const fallback = () => ({ modules: templateTrackModules(profile, role), model: 'template' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallback();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: [
          TRACK_SYSTEM_PROMPT,
          `Target role: ${role}`,
          JSON.stringify({
            skills: profile.skills,
            preferred_roles: profile.preferred_roles,
            experience_years: profile.experience_years,
            education_level: profile.education_level,
            projects: (Array.isArray(profile.projects) ? profile.projects : []).slice(0, 5),
          }),
        ].join('\n\n') }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 4096 },
      }),
    });
    if (!response.ok) return fallback();
    const payload: any = await response.json();
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
    const parsed = JSON.parse(generatedText);
    const list = Array.isArray(parsed?.modules) ? parsed.modules : [];
    const valid = list.filter((m: any) => typeof m?.title === 'string' && m.title.trim().length > 0 &&
      Array.isArray(m?.topics) && m.topics.length > 0).slice(0, 8);
    if (valid.length < 3) return fallback();

    const skills = (Array.isArray(profile?.skills) ? profile.skills.filter(Boolean).map(String) : []);
    const modules: LearningModule[] = valid.map((m: any) => ({
      title: String(m.title).slice(0, 160),
      why: typeof m.why === 'string' ? m.why.slice(0, 240) : '',
      level: (['beginner', 'intermediate', 'advanced'].includes(m.level) ? m.level : 'beginner') as LearningModule['level'],
      topics: (m.topics || []).slice(0, 4).map((t: any) => ({
        title: typeof t?.title === 'string' ? t.title.slice(0, 160) : '',
        what_to_learn: typeof t?.what_to_learn === 'string' ? t.what_to_learn.slice(0, 260) : '',
        // Resource links are clamped to known-safe roots; unknown or missing URLs are replaced.
        resources: (Array.isArray(t?.resources) ? t.resources : []).slice(0, 3).map((r: any) => {
          const url = typeof r?.url === 'string' ? r.url : '';
          const safeUrlSuffix = /^https:\/\/[^"<>\s]+$/.test(url) && (
            /^https:\/\/([a-z0-9-]+\.)*roadmap\.sh(\/|$)/i.test(url)
            || /^https:\/\/([a-z0-9-]+\.)*(mozilla\.org|microsoft\.com|python\.org|docker\.com|kubernetes\.io|git-scm\.com|nodejs\.org|pandas\.pydata\.org|typescriptlang\.org|react\.dev|ubuntu\.com|w3\.org)(\/|$)/i.test(url)
          );
          const safe = !url.includes('..') && !/[<>"]/.test(url) ? safeUrlSuffix : false;
          return safe ? { type: ['docs', 'roadmap', 'book', 'video'].includes(r?.type) ? r.type : 'docs', name: String(r?.name || 'Resource').slice(0, 120), url } : resolveResource(t?.title || '', skills);
        }),
      })),
      practice_exercise: typeof m.practice_exercise === 'string' ? m.practice_exercise.slice(0, 260) : '',
    }));
    if (!modules.every((m) => m.topics.length > 0)) return fallback();
    return { modules, model: 'gemini-2.5-flash' };
  } catch {
    return fallback();
  }
}
