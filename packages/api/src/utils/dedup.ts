import crypto from 'crypto';
import { URL } from 'url';

function extractDomain(jobUrl: string): string {
  if (!jobUrl) return '';
  try {
    return new URL(jobUrl).hostname || '';
  } catch {
    return '';
  }
}

export function generateFingerprint(companyName: string, jobTitle: string, jobUrl: string): string {
  const domain = extractDomain(jobUrl);
  const normalizedCompany = (companyName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedTitle = (jobTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const input = `${normalizedCompany}|${normalizedTitle}|${domain}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    if (matrix[0]) {
      matrix[0][j] = j;
    }
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      const rowI = matrix[i];
      const rowIminus1 = matrix[i - 1];
      if (rowI && rowIminus1) {
        rowI[j] = Math.min(
          (rowI[j - 1] ?? 0) + 1,
          (rowIminus1[j] ?? 0) + 1,
          (rowIminus1[j - 1] ?? 0) + cost,
        );
      }
    }
  }

  const lastRow = matrix[b.length];
  return lastRow ? (lastRow[a.length] ?? 0) : 0;
}

export function similarity(a: string, b: string): number {
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1.0;
  return 1 - distance / maxLength;
}

function getCandidatePairString(companyName: string, jobTitle: string, jobUrl: string): string {
  const domain = extractDomain(jobUrl);
  const normalizedCompany = (companyName || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  const normalizedTitle = (jobTitle || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
  return `${normalizedCompany} ${normalizedTitle} ${domain}`.trim();
}

export function calculateCandidateSimilarity(
  lead1: { companyName?: string; jobTitle?: string; jobUrl?: string },
  lead2: { companyName?: string; jobTitle?: string; jobUrl?: string }
): number {
  const d1 = extractDomain(lead1.jobUrl || '');
  const d2 = extractDomain(lead2.jobUrl || '');
  const str1 = getCandidatePairString(lead1.companyName || '', lead1.jobTitle || '', lead1.jobUrl || '');
  const str2 = getCandidatePairString(lead2.companyName || '', lead2.jobTitle || '', lead2.jobUrl || '');
  const rawSim = similarity(str1, str2);
  if (d1 && d2 && d1 !== d2) {
    return Math.min(rawSim, 0.5);
  }
  return rawSim;
}
