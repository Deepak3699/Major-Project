import type { PracticeAvatar } from '@/lib/types';

/**
 * Client-side mirror of the API roster, used as a resilient fallback while the
 * roster request is in flight or if it fails. The API remains the source of
 * truth for personalities, recommendation and session records.
 */
export const FALLBACK_AVATARS: PracticeAvatar[] = [
  {
    id: 'aria',
    name: 'Aria Sharma',
    title: 'Talent Partner · Behavioural',
    tagline: 'The warm screener who puts you at ease.',
    personality: 'Warm, patient, and encouraging. She notices effort and gives you room to think before she probes.',
    ability: 'Reads motivation and culture fit, and asks structured behavioural questions that reveal how you actually work with people.',
    specialties: ['HR', 'Recruiting', 'Operations', 'Customer success', 'Marketing', 'General roles', 'Freshers'],
    accent: 'Indian English · warm, clear, unhurried',
    voice: { gender: 'female', lang: 'en-IN', rate: 0.96, pitch: 1.06, hints: ['heera', 'neerja', 'veena', 'lekha', 'swara', 'female', 'india'] },
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
    voice: { gender: 'male', lang: 'en-IN', rate: 0.92, pitch: 0.82, hints: ['ravi', 'prabhat', 'madhur', 'male', 'india'] },
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
    voice: { gender: 'female', lang: 'en-IN', rate: 1.0, pitch: 1.14, hints: ['swara', 'kalpana', 'heera', 'female', 'india'] },
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
    voice: { gender: 'male', lang: 'en-IN', rate: 1.03, pitch: 0.9, hints: ['ravi', 'madhur', 'prabhat', 'male', 'india'] },
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
    voice: { gender: 'female', lang: 'en-IN', rate: 0.98, pitch: 1.0, hints: ['lekha', 'veena', 'heera', 'female', 'india'] },
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
    voice: { gender: 'male', lang: 'en-IN', rate: 1.06, pitch: 1.0, hints: ['prabhat', 'ravi', 'madhur', 'male', 'india'] },
    palette: { accent: '#c08a45', surface: '#1a1710' },
  },
];

export function fallbackAvatar(id?: string | null): PracticeAvatar {
  return FALLBACK_AVATARS.find((avatar) => avatar.id === id) || FALLBACK_AVATARS[0];
}
