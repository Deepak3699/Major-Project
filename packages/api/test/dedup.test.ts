import { generateFingerprint, levenshteinDistance, similarity, calculateCandidateSimilarity } from '../src/utils/dedup';

describe('Fingerprint', () => {
  test('same company/title/url -> same fingerprint (different path)', () => {
    const fp1 = generateFingerprint('Tech Corp', 'Software Engineer', 'https://careers.tech.com/job/1');
    const fp2 = generateFingerprint('Tech Corp', 'Software Engineer', 'https://careers.tech.com/job/2');
    expect(fp1).toBe(fp2);
  });

  test('different company -> different fingerprint', () => {
    const fp1 = generateFingerprint('Tech Corp', 'Engineer', 'https://careers.tech.com');
    const fp2 = generateFingerprint('Other Inc', 'Engineer', 'https://careers.other.com');
    expect(fp1).not.toBe(fp2);
  });

  test('different title -> different fingerprint', () => {
    const fp1 = generateFingerprint('Tech Corp', 'Engineer', 'https://careers.tech.com');
    const fp2 = generateFingerprint('Tech Corp', 'Manager', 'https://careers.tech.com');
    expect(fp1).not.toBe(fp2);
  });

  test('different domain -> different fingerprint', () => {
    const fp1 = generateFingerprint('Tech Corp', 'Engineer', 'https://careers.tech.com');
    const fp2 = generateFingerprint('Tech Corp', 'Engineer', 'https://jobs.tech.org');
    expect(fp1).not.toBe(fp2);
  });

  test('empty fields still produces a hash', () => {
    const fp = generateFingerprint('', '', '');
    expect(typeof fp).toBe('string');
    expect(fp.length).toBe(64);
  });
});

describe('Levenshtein', () => {
  test('identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  test('completely different', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  test('one char diff', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  test('empty string', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });
});

describe('Similarity', () => {
  test('identical strings', () => {
    expect(similarity('company', 'company')).toBe(1.0);
  });

  test('completely different', () => {
    expect(similarity('abc', 'xyz')).toBe(0.0);
  });

  test('partial match', () => {
    const sim = similarity('company inc', 'company incorporated');
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.7);
  });

  test('empty strings', () => {
    expect(similarity('', '')).toBe(1.0);
  });
});

describe('Candidate Similarity', () => {
  test('distinct companies with identical job titles return low similarity', () => {
    const tMobileLead = {
      companyName: 'T-Mobile',
      jobTitle: 'Software Engineering Intern',
      jobUrl: 'https://careers.t-mobile.com/job/101',
    };
    const pwcLead = {
      companyName: 'PwC',
      jobTitle: 'Software Engineering Intern',
      jobUrl: 'https://jobs.pwc.com/job/202',
    };
    const sim = calculateCandidateSimilarity(tMobileLead, pwcLead);
    expect(sim).toBeLessThan(0.85);
    expect(sim).toBeLessThanOrEqual(0.5);
  });

  test('same company and domain with same title returns high similarity', () => {
    const lead1 = {
      companyName: 'T-Mobile',
      jobTitle: 'Software Engineering Intern',
      jobUrl: 'https://careers.t-mobile.com/job/101',
    };
    const lead2 = {
      companyName: 'T-Mobile',
      jobTitle: 'Software Engineering Intern',
      jobUrl: 'https://careers.t-mobile.com/job/102',
    };
    const sim = calculateCandidateSimilarity(lead1, lead2);
    expect(sim).toBe(1.0);
  });
});
