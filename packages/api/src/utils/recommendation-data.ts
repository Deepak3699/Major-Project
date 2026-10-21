import fs from 'node:fs';
import path from 'node:path';
import { scoreJobMatch, extractKnownSkills } from './job-intelligence';
import { recommendationFeatures, RecommendationSample } from './recommendation-model';

const DATASET_URL = 'https://huggingface.co/datasets/0xnbk/resume-domain-classifier-v1-en/resolve/main/validation.csv?download=true';
const DEFAULT_DATASET_PATHS = [
  path.resolve(process.cwd(), 'data/raw/resume-domain-validation.csv'),
  path.resolve(process.cwd(), 'packages/api/data/raw/resume-domain-validation.csv'),
];

type DatasetMetadata = {
  raw_rows: number;
  cleaned_rows: number;
  removed_rows: number;
  duplicate_rows: number;
  class_counts: { negative: number; positive: number };
  license: string;
  dataset_url: string;
};

type DatasetReadResult = {
  samples: RecommendationSample[];
  cleanedCsv: string;
  summary: DatasetMetadata;
};

function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function cleanText(value: unknown): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\uFFFD]/g, ' ')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, ' ')
    .replace(/\b(?:\+?\d[\d ().-]{7,}\d)\b/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function experienceYears(value: string): number {
  const match = value.match(/(\d{1,2})(?:\s*(?:-|–|to)\s*(\d{1,2}))?\s*\+?\s*(?:years?|yrs?)/i);
  if (!match) return 0;
  const lower = Number(match[1]);
  return Math.max(0, Math.min(60, match[2] ? (lower + Number(match[2])) / 2 : lower));
}

function inferRole(resume: string): string {
  const firstLine = resume.split(/\n/).map((line) => line.trim()).find(Boolean) || '';
  const role = firstLine.split(/\b(?:specializing in|specializing|with expertise|with experience|with|expertise in|technologies)\b/i)[0]
    .replace(/[^a-zA-Z0-9+#./& -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return role || firstLine.slice(0, 100);
}

function inferJobTitle(description: string): string {
  const explicit = description.match(/(?:job title|position title|role title)\s*[:\-]\s*([^\n.;]{2,100})/i);
  const lookingFor = description.match(/(?:we(?:'|’)re|we are) looking for\s+(?:an?\s+)?([^\n.!?]{2,100})/i);
  const hiring = description.match(/(?:hiring|seeking)\s+(?:an?\s+)?([^\n.!?]{2,100})/i);
  const selected = explicit?.[1] || lookingFor?.[1] || hiring?.[1]
    || description.split(/\n/).map((line) => line.trim()).find(Boolean)
    || '';
  return selected.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function pairFeatures(text: string): number[] {
  const divider = text.match(/\s*\[SEP\]\s*/i);
  if (!divider || divider.index === undefined) throw new Error('Resume/job separator is missing');
  const resume = text.slice(0, divider.index).trim();
  const jobDescription = text.slice(divider.index + divider[0].length).trim();
  if (resume.length < 20 || jobDescription.length < 20) throw new Error('Resume or job text is too short');

  const candidateSkills = extractKnownSkills(resume);
  const jobSkills = extractKnownSkills(jobDescription);
  const role = inferRole(resume);
  const projectSection = resume.match(/projects?\s*[:\n]([\s\S]{0,2500})/i)?.[1] || '';
  const candidate = {
    headline: role,
    preferred_roles: role ? [role] : [],
    skills: candidateSkills,
    experience_years: experienceYears(resume),
    education_level: (resume.match(/\b(ph\.?d\.?|doctorate|master(?:'s)?|bachelor(?:'s)?|associate(?:'s)?|diploma|high school)\b/i)?.[0] || ''),
    experience: [{ title: role, description: resume }],
    projects: projectSection ? [{ name: 'Projects', description: projectSection, technologies: extractKnownSkills(projectSection) }] : [],
    preferred_locations: [],
    remote_preference: 'any',
  };
  const job = {
    title: inferJobTitle(jobDescription),
    description: jobDescription,
    experience_level: jobDescription,
    skills: jobSkills,
    location: '',
    location_type: '',
    employment_type: /\bintern(ship)?\b/i.test(jobDescription) ? 'internship' : '',
  };
  const fit = scoreJobMatch(candidate, job);
  return recommendationFeatures(fit.breakdown, 75);
}

function csvEscape(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function ensureRecommendationDatasetFile() {
  const present = DEFAULT_DATASET_PATHS.find((candidate) => fs.existsSync(candidate));
  if (present) return present;
  const target = DEFAULT_DATASET_PATHS[0];
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const response = await fetch(DATASET_URL, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Could not download the matching dataset (HTTP ${response.status})`);
  if (!response.body) throw new Error('The matching dataset download returned an empty response');
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

export function readRecommendationDataset(filePath: string): DatasetReadResult {
  const allRows = csvRows(fs.readFileSync(filePath, 'utf8'));
  if (allRows.length < 2) throw new Error('The resume/job matching dataset is empty');
  const headers = allRows[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim());
  const textIndex = headers.indexOf('text');
  const labelIndex = headers.indexOf('label');
  if (textIndex < 0 || labelIndex < 0) throw new Error('Dataset must contain text and label columns');

  const rawRows = allRows.length - 1;
  const samples: RecommendationSample[] = [];
  const seen = new Set<string>();
  let duplicateRows = 0;
  let removedRows = 0;
  let positive = 0;
  let negative = 0;
  const processedLines = ['skills,experience,education,location,role,projects,salary,preferences,job_quality,label'];
  for (const columns of allRows.slice(1)) {
    const labelValue = columns[labelIndex]?.trim();
    const label = labelValue === '1' ? 1 : labelValue === '0' ? 0 : null;
    const text = cleanText(columns[textIndex]);
    if (label === null || !text || text.length > 30_000) {
      removedRows += 1;
      continue;
    }
    const key = `${label}:${text.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(key);
    try {
      const features = pairFeatures(text);
      samples.push({ features, label });
      if (label === 1) positive += 1;
      else negative += 1;
      processedLines.push([...features, label].map(csvEscape).join(','));
    } catch {
      removedRows += 1;
    }
  }
  if (samples.length < 100) throw new Error(`Only ${samples.length} valid examples could be cleaned from the dataset`);
  return {
    samples,
    cleanedCsv: `${processedLines.join('\n')}\n`,
    summary: {
      raw_rows: rawRows,
      cleaned_rows: samples.length,
      removed_rows: removedRows,
      duplicate_rows: duplicateRows,
      class_counts: { negative, positive },
      license: 'Apache-2.0',
      dataset_url: 'https://huggingface.co/datasets/0xnbk/resume-domain-classifier-v1-en',
    },
  };
}
