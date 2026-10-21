type JsonList = string[] | null | undefined;

export interface CandidateForMatching {
  location?: string | null;
  skills?: JsonList;
  preferred_roles?: JsonList;
  preferred_locations?: JsonList;
  remote_preference?: string | null;
  experience_years?: number | string | null;
  education_level?: string | null;
  salary_min?: number | string | null;
  projects?: unknown[] | null;
}

export interface JobForMatching {
  title?: string | null;
  description?: string | null;
  about_job?: string | null;
  experience_level?: string | null;
  location?: string | null;
  location_type?: string | null;
  employment_type?: string | null;
  salary_min?: number | string | null;
  salary_currency?: string | null;
  skills?: JsonList;
}

export interface MatchResult {
  score: number;
  breakdown: Record<string, { score: number; weight: number; contribution: number }>;
  reasons: string[];
  missing_skills: string[];
  matched_skills: string[];
}

const KNOWN_SKILLS = [
  'javascript', 'typescript', 'react', 'node.js', 'python', 'java', 'c++', 'c#', '.net',
  'sql', 'postgresql', 'mysql', 'mongodb', 'redis', 'aws', 'azure', 'gcp', 'docker',
  'kubernetes', 'git', 'html', 'css', 'tailwind', 'next.js', 'fastapi', 'django', 'flask',
  'spring boot', 'machine learning', 'deep learning', 'data analysis', 'excel', 'power bi',
  'tableau', 'figma', 'ui/ux', 'communication', 'salesforce', 'linux', 'rest api', 'graphql',
  'data science', 'data engineering', 'statistics', 'natural language processing', 'computer vision',
  'pytorch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy', 'spark', 'airflow', 'etl', 'data modeling',
  'cybersecurity', 'network security', 'penetration testing', 'incident response', 'information security',
  'project management', 'agile', 'scrum', 'product management', 'business analysis', 'requirements gathering',
  'customer service', 'customer support', 'account management', 'lead generation', 'sales', 'sales operations',
  'marketing', 'digital marketing', 'content marketing', 'social media', 'seo', 'sem', 'email marketing', 'copywriting',
  'human resources', 'recruiting', 'talent acquisition', 'onboarding', 'employee relations', 'benefits administration',
  'accounting', 'gaap', 'ifrs', 'financial analysis', 'financial modeling', 'budgeting', 'payroll', 'accounts payable',
  'accounts receivable', 'auditing', 'audit', 'sox', 'tax preparation', 'compliance', 'investment', 'portfolio management',
  'banking', 'credit analysis', 'quickbooks', 'healthcare administration', 'patient care', 'nursing', 'clinical research',
  'medical records', 'electronic health records', 'ehr', 'emr', 'triage', 'infection control', 'care coordination',
  'vital signs', 'hipaa', 'pharmacy', 'cpr', 'first aid', 'diagnosis', 'surgery', 'icu', 'emergency room',
  'teaching', 'curriculum development', 'lesson planning', 'classroom management', 'student assessment',
  'instructional design', 'learning management systems', 'legal research', 'contract drafting', 'litigation', 'paralegal',
  'case management', 'supply chain', 'operations', 'manufacturing', 'quality control', 'safety', 'logistics',
  'inventory management', 'cad', 'autocad', 'electrical engineering', 'mechanical engineering', 'blueprint reading',
  'user research', 'prototyping', 'design systems', 'adobe photoshop', 'adobe illustrator', 'graphic design',
  'figma', 'wireframing', 'usability testing', 'powerpoint', 'microsoft office', 'writing', 'research', 'documentation',
];

function normalized(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9+#. ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function list(value: JsonList): string[] {
  return Array.isArray(value) ? value.map(normalized).filter(Boolean) : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function jobSkills(job: JobForMatching): string[] {
  const provided = list(job.skills);
  if (provided.length) return unique(provided);
  return extractKnownSkills(`${job.title || ''} ${job.description || ''} ${job.about_job || ''}`);
}

export function extractKnownSkills(text: string): string[] {
  const value = normalized(text);
  return unique(KNOWN_SKILLS.filter((skill) => value.includes(normalized(skill))));
}

function containsOne(text: string, values: string[]): boolean {
  return values.some((value) => value && text.includes(value));
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreJobMatch(candidate: CandidateForMatching, job: JobForMatching): MatchResult {
  const candidateSkills = unique(list(candidate.skills));
  const requiredSkills = jobSkills(job);
  const matched = requiredSkills.filter((skill) => candidateSkills.some((mine) => mine === skill || mine.includes(skill) || skill.includes(mine)));
  const missing = requiredSkills.filter((skill) => !matched.includes(skill));
  const skillsScore = requiredSkills.length ? matched.length / requiredSkills.length * 100 : (candidateSkills.length ? 65 : 35);

  const years = Number(candidate.experience_years || 0);
  const experience = normalized(job.experience_level || job.description || '');
  const expMatch = experience.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
  const minMatch = experience.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/);
  let experienceScore = 70;
  if (expMatch) {
    const min = Number(expMatch[1]);
    const max = Number(expMatch[2]);
    experienceScore = years < min ? Math.max(15, 100 - (min - years) * 28) : years > max ? Math.max(40, 100 - (years - max) * 12) : 100;
  } else if (minMatch) {
    const min = Number(minMatch[1]);
    experienceScore = years < min ? Math.max(15, 100 - (min - years) * 25) : 95;
  } else if (/fresher|entry.level|new.grad|no.experience|intern/.test(experience)) {
    experienceScore = years <= 1.5 ? 100 : Math.max(45, 100 - (years - 1.5) * 12);
  }

  const education = normalized(candidate.education_level);
  const jobText = normalized(`${job.title || ''} ${job.description || ''} ${job.about_job || ''}`);
  let educationScore = 70;
  const educationLevels = ['phd', 'doctorate', 'masters', 'master', 'bachelors', 'bachelor', 'diploma', '12th', 'high school'];
  const requiredEducation = educationLevels.find((level) => jobText.includes(level));
  if (requiredEducation && education) educationScore = education.includes(requiredEducation) ? 100 : 45;

  const candidateLocations = unique([...list(candidate.preferred_locations), normalized(job.location || '')].filter(Boolean));
  const wantedLocations = list(candidate.preferred_locations);
  const remote = normalized(`${job.location_type || ''} ${job.location || ''}`);
  const isRemote = remote.includes('remote') || remote.includes('work from home');
  let locationScore = 65;
  if (candidate.remote_preference === 'remote') locationScore = isRemote ? 100 : 25;
  else if (candidate.remote_preference === 'onsite') locationScore = isRemote ? 50 : 90;
  else if (candidate.remote_preference === 'hybrid') locationScore = remote.includes('hybrid') ? 100 : isRemote ? 75 : 65;
  if (wantedLocations.length && containsOne(normalized(job.location), wantedLocations)) locationScore = Math.max(locationScore, 95);
  if (!wantedLocations.length && candidate.location && containsOne(normalized(job.location), [normalized(candidate.location)])) locationScore = Math.max(locationScore, 90);
  void candidateLocations;

  const title = normalized(job.title);
  const roles = list(candidate.preferred_roles);
  const roleScore = roles.length ? (containsOne(title, roles) ? 100 : Math.max(20, roles.reduce((best, role) => {
    const titleWords = new Set(title.split(' '));
    const roleWords = role.split(' ').filter(Boolean);
    const overlap = roleWords.filter((word) => titleWords.has(word)).length / Math.max(roleWords.length, 1);
    return Math.max(best, overlap * 100);
  }, 0))) : 60;

  const projects = Array.isArray(candidate.projects) ? candidate.projects : [];
  const projectText = normalized(projects.map((project: any) => `${project?.name || ''} ${project?.description || ''} ${(project?.technologies || []).join?.(' ') || ''}`).join(' '));
  const projectScore = requiredSkills.length
    ? Math.min(100, 35 + requiredSkills.filter((skill) => projectText.includes(skill)).length * (65 / requiredSkills.length))
    : projects.length ? 70 : 45;

  const salaryWanted = Number(candidate.salary_min || 0);
  const salaryOffered = Number(job.salary_min || 0);
  const salaryScore = !salaryWanted || !salaryOffered ? 65 : salaryOffered >= salaryWanted ? 100 : Math.max(20, salaryOffered / salaryWanted * 100);
  const preferenceScore = job.employment_type === 'internship' ? 85 : 75;

  const dimensions = {
    skills: { score: skillsScore, weight: 30 },
    experience: { score: experienceScore, weight: 20 },
    education: { score: educationScore, weight: 10 },
    location: { score: locationScore, weight: 10 },
    role: { score: roleScore, weight: 15 },
    projects: { score: projectScore, weight: 5 },
    salary: { score: salaryScore, weight: 5 },
    preferences: { score: preferenceScore, weight: 5 },
  };
  const breakdown: MatchResult['breakdown'] = {};
  let total = 0;
  for (const [key, dimension] of Object.entries(dimensions)) {
    const score = clampScore(dimension.score);
    const contribution = Math.round(score * dimension.weight / 100 * 10) / 10;
    breakdown[key] = { score, weight: dimension.weight, contribution };
    total += contribution;
  }

  const reasons: string[] = [];
  if (matched.length) reasons.push(`${matched.length} of ${requiredSkills.length} listed skills match your profile`);
  if (roleScore >= 75) reasons.push('The role is close to your preferred job titles');
  if (locationScore >= 85) reasons.push('The location or work setup fits your preferences');
  if (experienceScore >= 85) reasons.push('The experience level looks compatible');
  if (!reasons.length) reasons.push('This listing is ranked from your current profile and preferences');

  return { score: clampScore(total), breakdown, reasons, missing_skills: missing, matched_skills: matched };
}

export interface TrustResult {
  score: number;
  band: 'very_high' | 'high' | 'review' | 'low';
  evidence: Array<{ signal: string; points: number; detail: string }>;
}

export function scoreJobTrust(job: any): TrustResult {
  const evidence: TrustResult['evidence'] = [];
  const source = normalized(job.source_site);
  const companyDomain = normalized(job.company_domain).replace(/^www\./, '');
  let jobHost = '';
  let jobPath = '';
  try {
    const parsed = new URL(job.apply_url || job.job_url);
    jobHost = normalized(parsed.hostname).replace(/^www\./, '');
    jobPath = parsed.pathname.toLowerCase();
  } catch { /* source URL is incomplete */ }
  const official = /greenhouse|lever|workday|ashby|smartrecruiters|bamboohr|teamtailor|recruitee|breezy|company career|official/.test(source) || Boolean(companyDomain && jobHost === companyDomain);
  evidence.push({ signal: 'Official source', points: official ? 30 : 0, detail: official ? 'Company career domain or recognized ATS source' : `Collected from ${job.source_site || 'an external source'}` });

  const domainMatches = Boolean(companyDomain && jobHost && (jobHost === companyDomain || jobHost.endsWith(`.${companyDomain}`)));
  const atsSourceSlug = source.match(/(?:greenhouse\.io|lever\.co|workday\.com|ashbyhq\.com|smartrecruiters\.com|bamboohr\.com|teamtailor\.com|recruitee\.com|breezy\.hr)\/([a-z0-9][a-z0-9-]*)/)?.[1] || '';
  const atsHosts = ['greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'workday.com', 'ashbyhq.com', 'smartrecruiters.com', 'bamboohr.com', 'teamtailor.com', 'recruitee.com', 'breezy.hr'];
  const companySlug = normalized(job.company_name).replace(/[^a-z0-9]/g, '');
  const atsCompanyVerified = Boolean(
    atsSourceSlug && atsSourceSlug.replace(/[^a-z0-9]/g, '') === companySlug &&
    atsHosts.some((suffix) => jobHost === suffix || jobHost.endsWith(`.${suffix}`)) &&
    jobPath.split('/').includes(atsSourceSlug),
  );
  const companyVerified = domainMatches || atsCompanyVerified;
  evidence.push({ signal: 'Company verification', points: companyVerified ? 20 : companyDomain ? 10 : 0, detail: domainMatches ? 'Application link matches the company domain' : atsCompanyVerified ? 'Official ATS board slug matches the company' : companyDomain ? 'A company domain is available but the application host does not match' : 'Company domain is not available' });

  const applyUrl = String(job.apply_url || job.job_url || '');
  let validUrl = false;
  try { const parsed = new URL(applyUrl); validUrl = parsed.protocol === 'https:'; } catch { /* source URL is incomplete */ }
  evidence.push({ signal: 'Application URL', points: validUrl ? 15 : 0, detail: validUrl ? 'A secure HTTPS listing or application link is available' : 'A secure application link could not be confirmed' });

  const postedAt = job.posted_at ? new Date(job.posted_at).getTime() : job.first_seen_at ? new Date(job.first_seen_at).getTime() : 0;
  const ageDays = postedAt ? Math.max(0, (Date.now() - postedAt) / 86400000) : Number.POSITIVE_INFINITY;
  const freshness = ageDays <= 7 ? 10 : ageDays <= 30 ? 5 : 0;
  evidence.push({ signal: 'Freshness', points: freshness, detail: Number.isFinite(ageDays) ? `Seen ${Math.floor(ageDays)} day${Math.floor(ageDays) === 1 ? '' : 's'} ago` : 'Posting date is not available' });

  let rawPayload = job.raw_payload || {};
  if (typeof rawPayload === 'string') { try { rawPayload = JSON.parse(rawPayload); } catch { rawPayload = {}; } }
  const contactVerified = Boolean(job.contact_verified || rawPayload.contact_verified || rawPayload.email_verified);
  evidence.push({ signal: 'Contact validation', points: contactVerified ? 10 : 0, detail: contactVerified ? 'Source metadata reports a validated company contact' : 'A verified hiring contact is not available' });
  const sourceCount = Math.max(Number(job.source_count || rawPayload.source_count || 0), Array.isArray(rawPayload.sources) ? rawPayload.sources.length : 0);
  evidence.push({ signal: 'Cross-source match', points: sourceCount > 1 ? 10 : 0, detail: sourceCount > 1 ? `Matching listing appears in ${sourceCount} sources` : 'No independent cross-source confirmation is stored' });

  const description = String(job.description || job.about_job || '');
  const complete = Boolean(job.title && job.company_name && description.length >= 180 && applyUrl);
  evidence.push({ signal: 'Content consistency', points: complete ? 5 : 0, detail: complete ? 'Listing includes company, title, description and application link' : 'Some job details are missing or brief' });

  const score = Math.max(0, Math.min(100, evidence.reduce((sum, item) => sum + item.points, 0)));
  const band = score >= 94 ? 'very_high' : score >= 80 ? 'high' : score >= 60 ? 'review' : 'low';
  return { score, band, evidence };
}
