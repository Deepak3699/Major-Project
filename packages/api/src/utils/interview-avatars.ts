/**
 * Interview avatar roster.
 *
 * Every avatar is a distinct interviewer: a personality, an interviewing
 * ability, a set of role specialties, and a voice profile the browser uses to
 * pick and tune an Indian-English speech-synthesis voice. The roster is the
 * single source of truth for both the API and the web client (the client only
 * adds the portrait illustration keyed by the same id).
 *
 * Recommendation is deliberately explainable: keyword weights over the job
 * title, skills, description and the target role. No opaque model is involved,
 * so the UI can always tell the candidate why an avatar was suggested.
 */

export type AvatarGender = 'female' | 'male';

export interface AvatarVoice {
  gender: AvatarGender;
  /** BCP-47 language tag. Indian English is the default for every avatar. */
  lang: string;
  /** Speech-synthesis rate multiplier (0.7 - 1.3 sensible). */
  rate: number;
  /** Speech-synthesis pitch multiplier (0.5 - 2 sensible). */
  pitch: number;
  /** Preferred voice-name fragments, best first (case-insensitive). */
  hints: string[];
}

export interface AvatarPalette {
  /** Accent used for the portrait frame and nameplate. */
  accent: string;
  /** Deep surface behind the portrait. */
  surface: string;
}

export interface AvatarPersona {
  id: string;
  name: string;
  title: string;
  tagline: string;
  personality: string;
  ability: string;
  specialties: string[];
  accent: string;
  voice: AvatarVoice;
  palette: AvatarPalette;
}

export interface JobContext {
  id?: string;
  title: string;
  company?: string;
  description?: string;
  about_job?: string;
  skills?: string[];
}

export const AVATARS: AvatarPersona[] = [
  {
    id: 'aria',
    name: 'Aria Sharma',
    title: 'Talent Partner · Behavioural',
    tagline: 'The warm screener who puts you at ease.',
    personality: 'Warm, patient, and encouraging. She notices effort and gives you room to think before she probes.',
    ability: 'Reads motivation and culture fit, and asks structured behavioural questions that reveal how you actually work with people.',
    specialties: ['HR', 'Recruiting', 'Operations', 'Customer success', 'Marketing', 'General roles', 'Freshers'],
    accent: 'Indian English · warm, clear, unhurried',
    voice: {
      gender: 'female',
      lang: 'en-IN',
      rate: 0.96,
      pitch: 1.06,
      hints: ['heera', 'neerja', 'veena', 'lekha', 'swara', 'female', 'india'],
    },
    palette: { accent: '#c96f4a', surface: '#1c1614' },
  },
  {
    id: 'vikram',
    name: 'Vikram Rao',
    title: 'Principal Engineer · Systems',
    tagline: 'The architect who goes one layer deeper.',
    personality: 'Measured, precise, and dryly funny. He listens for the assumption behind your answer and tests it.',
    ability: 'Stress-tests architecture, scale, APIs, databases and trade-offs with production-grade follow-ups.',
    specialties: ['Backend', 'Java', 'Node.js', 'System design', 'DevOps', 'Cloud', 'Databases', 'Security'],
    accent: 'Indian English · deep, measured, deliberate',
    voice: {
      gender: 'male',
      lang: 'en-IN',
      rate: 0.92,
      pitch: 0.82,
      hints: ['ravi', 'prabhat', 'madhur', 'male', 'india'],
    },
    palette: { accent: '#4f86a8', surface: '#121820' },
  },
  {
    id: 'priya',
    name: 'Priya Nair',
    title: 'Product & Design Lead',
    tagline: 'The strategist who asks what the user needs.',
    personality: 'Curious, crisp, and user-obsessed. She reframes vague answers into sharp product choices.',
    ability: 'Runs product-sense, UX and case rounds: prioritisation, metrics, user empathy and trade-offs.',
    specialties: ['Product management', 'UX / UI', 'Design', 'Business analysis', 'Consulting', 'Growth', 'Strategy'],
    accent: 'Indian English · bright, quick, expressive',
    voice: {
      gender: 'female',
      lang: 'en-IN',
      rate: 1.0,
      pitch: 1.14,
      hints: ['swara', 'kalpana', 'heera', 'female', 'india'],
    },
    palette: { accent: '#b25a7c', surface: '#1c1418' },
  },
  {
    id: 'arjun',
    name: 'Arjun Mehta',
    title: 'Bar Raiser · Senior Hiring',
    tagline: 'The pressure test that makes you sharper.',
    personality: 'Direct, skeptical, and relentless. He expects you to defend every claim you make.',
    ability: 'Pressure-tests ownership, ambiguity and edge cases until your reasoning either holds or breaks.',
    specialties: ['Senior roles', 'Leadership', 'Consulting', 'Sales', 'Program management', 'FAANG loops'],
    accent: 'Indian English · firm, assertive, fast',
    voice: {
      gender: 'male',
      lang: 'en-IN',
      rate: 1.03,
      pitch: 0.9,
      hints: ['ravi', 'madhur', 'prabhat', 'male', 'india'],
    },
    palette: { accent: '#c25a32', surface: '#1b1310' },
  },
  {
    id: 'neha',
    name: 'Neha Iyer',
    title: 'Data & AI Lead',
    tagline: 'The analyst who asks for the number.',
    personality: 'Analytical, calm, and evidence-driven. She wants the measurement method, not just the result.',
    ability: 'Drills SQL, metrics, experimentation and ML trade-offs against real-world constraints.',
    specialties: ['Data analysis', 'Data science', 'Machine learning', 'AI', 'Analytics', 'BI', 'Research'],
    accent: 'Indian English · calm, precise, analytical',
    voice: {
      gender: 'female',
      lang: 'en-IN',
      rate: 0.98,
      pitch: 1.0,
      hints: ['lekha', 'veena', 'heera', 'female', 'india'],
    },
    palette: { accent: '#4f8a6d', surface: '#111a16' },
  },
  {
    id: 'rohan',
    name: 'Rohan Kapoor',
    title: 'Founder · Full-stack Builder',
    tagline: 'The builder who cares what you shipped.',
    personality: 'Energetic, pragmatic, and outcome-focused. He is more interested in what you built than what you studied.',
    ability: 'Explores ownership, ambiguity, end-to-end shipping and pragmatic trade-offs in fast-moving teams.',
    specialties: ['Startups', 'Full-stack', 'Frontend', 'React', 'JavaScript', 'Mobile', 'Generalist', 'Internships'],
    accent: 'Indian English · energetic, casual, fast',
    voice: {
      gender: 'male',
      lang: 'en-IN',
      rate: 1.06,
      pitch: 1.0,
      hints: ['prabhat', 'ravi', 'madhur', 'male', 'india'],
    },
    palette: { accent: '#c08a45', surface: '#1a1710' },
  },
];

const BY_ID = new Map(AVATARS.map((avatar) => [avatar.id, avatar]));

export function listAvatars(): AvatarPersona[] {
  return AVATARS;
}

/** Unknown or missing ids fall back to Aria so an old session still opens. */
export function getAvatar(id?: string | null): AvatarPersona {
  return BY_ID.get(String(id || '').toLowerCase()) || AVATARS[0];
}

export function isKnownAvatar(id?: string | null): boolean {
  return BY_ID.has(String(id || '').toLowerCase());
}

export interface AvatarRecommendation {
  avatar: AvatarPersona;
  reason: string;
  score: number;
}

interface WeightedSignal {
  avatarId: string;
  keywords: string[];
}

const SIGNALS: WeightedSignal[] = [
  {
    avatarId: 'neha',
    keywords: [
      'data analyst', 'data analysis', 'analytics', 'data science', 'data scientist', 'machine learning', 'ml engineer',
      'artificial intelligence', 'ai engineer', 'business intelligence', 'bi ', 'power bi', 'tableau', 'statistics',
      'experimentation', 'a/b test', 'pandas', 'numpy', 'sql', 'research scientist', 'deep learning', 'nlp',
    ],
  },
  {
    avatarId: 'vikram',
    keywords: [
      'backend', 'back-end', 'back end', 'java', 'spring', 'node.js', 'nodejs', 'microservice', 'system design',
      'architecture', 'architect', 'devops', 'sre', 'site reliability', 'kubernetes', 'docker', 'cloud engineer',
      'database', 'distributed', 'platform engineer', 'security engineer', 'infrastructure', 'api engineer', 'scalability',
    ],
  },
  {
    avatarId: 'priya',
    keywords: [
      'product manager', 'product management', 'product owner', 'product analyst', 'ux', 'ui designer', 'product design',
      'interaction design', 'designer', 'user research', 'roadmap', 'prioritisation', 'prioritization', 'go-to-market',
      'business analyst', 'consultant', 'consulting', 'strategy', 'growth', 'marketing', 'brand', 'stakeholder',
    ],
  },
  {
    avatarId: 'arjun',
    keywords: [
      'senior', 'staff', 'principal', 'lead engineer', 'engineering manager', 'bar raiser', 'leadership', 'program manager',
      'sales', 'account executive', 'business development', 'faang', 'amazon', 'google', 'meta', 'pressure', 'senior manager',
    ],
  },
  {
    avatarId: 'rohan',
    keywords: [
      'startup', 'founder', 'full-stack', 'full stack', 'fullstack', 'mern', 'mean stack', 'frontend', 'front-end',
      'front end', 'react', 'javascript', 'typescript', 'next.js', 'nextjs', 'mobile', 'android', 'ios', 'flutter',
      'generalist', 'associate', 'intern', 'internship', 'fresher', 'web developer', 'software developer',
    ],
  },
  {
    avatarId: 'aria',
    keywords: [
      'hr', 'human resources', 'recruiter', 'talent', 'people operations', 'culture', 'customer success',
      'customer support', 'operations', 'behavioural', 'behavioral', 'communication', 'general', 'entry level',
    ],
  },
];

function countMatches(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < 6) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * Pick the interviewer that best matches a job or role.
 * Title matches weigh most, then skills, then the role string, then the body.
 */
export function recommendAvatar(input: { role?: string; job?: JobContext | null }): AvatarRecommendation {
  const job = input.job || null;
  const role = String(input.role || '').toLowerCase();
  const title = String(job?.title || '').toLowerCase();
  const skills = (job?.skills || []).join(' ').toLowerCase();
  const body = `${job?.about_job || ''} ${job?.description || ''}`.slice(0, 5000).toLowerCase();

  let best: AvatarPersona = AVATARS[0];
  let bestScore = 0;
  let bestHits: string[] = [];

  for (const signal of SIGNALS) {
    const avatar = getAvatar(signal.avatarId);
    let score = 0;
    const hits: string[] = [];
    for (const keyword of signal.keywords) {
      const titleHits = countMatches(title, keyword);
      const skillHits = countMatches(skills, keyword);
      const roleHits = countMatches(role, keyword);
      const bodyHits = countMatches(body, keyword);
      const weighted = titleHits * 6 + skillHits * 3 + roleHits * 3 + bodyHits;
      if (weighted > 0) {
        score += weighted;
        if (hits.length < 3) hits.push(keyword.trim());
      }
    }
    // Stable tie-break: roster order wins, so the result is deterministic.
    if (score > bestScore) {
      bestScore = score;
      best = avatar;
      bestHits = hits;
    }
  }

  const target = job?.title || input.role || 'this role';
  const where = job?.company ? ` at ${job.company}` : '';
  const reason = bestScore > 0
    ? `${best.name} is the closest fit for ${target}${where} — matched on ${bestHits.slice(0, 2).join(' and ')}. ${best.ability}`
    : `${best.name} is a strong all-round interviewer for ${target}${where}. ${best.ability}`;

  return { avatar: best, reason, score: Math.max(0, bestScore) };
}
