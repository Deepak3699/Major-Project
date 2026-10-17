import { calculateLeadScore, DEFAULT_WEIGHTS, loadScoringWeights } from '../src/utils/scoring';

describe('Lead Scoring (SRS §5.1)', () => {
  test('hot lead: full info + verification', () => {
    const result = calculateLeadScore({
      hr_name: 'John Smith',
      hr_personal_email: 'john@company.com',
      hr_linkedin_url: 'https://linkedin.com/in/johnsmith',
      job_description: 'This is a full job description with details about the role and company culture that matters to freshers looking for entry level positions.',
      job_url: 'https://company.com/jobs/1',
      salary_range: '10-15 LPA',
      email_status: 'valid',
      whatsapp_status: 'registered',
    });
    expect(result.score).toBe(90);
    expect(result.band).toBe('hot');
    expect(result.breakdown.hr_name!.points).toBe(20);
    expect(result.breakdown.hr_contact!.points).toBe(25);
    expect(result.breakdown.hr_linkedin!.points).toBe(15);
    expect(result.breakdown.email_verified!.points).toBe(10);
    expect(result.breakdown.whatsapp_verified!.points).toBe(10);
  });

  test('warm lead: partial info', () => {
    const result = calculateLeadScore({
      hr_name: 'Jane Doe',
      hr_personal_email: 'jane@company.com',
    });
    expect(result.score).toBe(45);
    expect(result.band).toBe('warm');
  });

  test('cold lead: no info', () => {
    const result = calculateLeadScore({});
    expect(result.score).toBe(0);
    expect(result.band).toBe('cold');
  });

  test('company contact only (+10)', () => {
    const result = calculateLeadScore({
      company_default_email: 'careers@company.com',
      company_default_phone: '+1234567890',
    });
    expect(result.score).toBe(10);
    expect(result.band).toBe('cold');
  });

  test('job quality scoring with salary+description+url', () => {
    const result = calculateLeadScore({
      salary_range: '5-10 LPA',
      job_description: 'A'.repeat(150),
      job_url: 'https://company.com/job/1',
    });
    expect(result.breakdown.job_quality!.points).toBe(10);
  });

  test('job quality: no salary (7 points)', () => {
    const result = calculateLeadScore({
      job_description: 'A'.repeat(150),
      job_url: 'https://company.com/job/1',
    });
    expect(result.breakdown.job_quality!.points).toBe(7);
  });

  test('score breakdown sums to total', () => {
    const result = calculateLeadScore({
      hr_name: 'Test',
      hr_personal_email: 'test@test.com',
      hr_linkedin_url: 'https://linkedin.com/in/test',
      job_description: 'x'.repeat(100),
      job_url: 'https://test.com/j',
      salary_range: '1-2 LPA',
      email_status: 'valid',
      whatsapp_status: 'registered',
    });
    const total = Object.values(result.breakdown).reduce((sum, b) => sum + b.points, 0);
    expect(total).toBe(result.score);
  });

  test('hot lead band threshold (>=70)', () => {
    const result = calculateLeadScore({
      hr_name: 'A',
      hr_personal_email: 'a@b.com',
      hr_linkedin_url: 'https://linkedin.com/in/a',
      job_description: 'x'.repeat(100),
      job_url: 'https://a.com/j',
      salary_range: '1-2 LPA',
      email_status: 'valid',
      whatsapp_status: 'registered',
    });
    expect(result.band).toBe('hot');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  test('warm lead band threshold (40-69)', () => {
    const result = calculateLeadScore({
      hr_name: 'A',
      hr_personal_email: 'a@b.com',
      hr_linkedin_url: 'https://linkedin.com/in/a',
    });
    expect(result.band).toBe('warm');
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
  });

  test('cold lead band threshold (<40)', () => {
    const result = calculateLeadScore({});
    expect(result.band).toBe('cold');
    expect(result.score).toBeLessThan(40);
  });
});

describe('Scoring weights override (admin settings)', () => {
  const fullInput = {
    hr_name: 'John Smith',
    hr_personal_email: 'john@company.com',
    hr_linkedin_url: 'https://linkedin.com/in/johnsmith',
    job_description: 'x'.repeat(150),
    job_url: 'https://company.com/jobs/1',
    salary_range: '10-15 LPA',
    email_status: 'valid',
    whatsapp_status: 'registered',
  };

  test('defaults unchanged without overrides', () => {
    expect(calculateLeadScore(fullInput).score).toBe(90);
  });

  test('operator can upweight verification', () => {
    const result = calculateLeadScore(fullInput, { email_verified: 30, whatsapp_verified: 30 });
    expect(result.breakdown.email_verified!.points).toBe(30);
    expect(result.score).toBe(130);
  });

  test('zero weight removes a signal', () => {
    const result = calculateLeadScore(fullInput, { hr_name: 0 });
    expect(result.breakdown.hr_name!.points).toBe(0);
    expect(result.score).toBe(70);
  });

  test('invalid weights are clamped/ignored', () => {
    const result = calculateLeadScore(fullInput, { hr_name: -5, hr_contact: 1000, bogus: 10 } as any);
    expect(result.breakdown.hr_name!.points).toBe(0);
    expect(result.breakdown.hr_contact!.points).toBe(100);
  });

  test('Settings UI key names work as aliases', () => {
    const result = calculateLeadScore(fullInput, { hr_name_found: 30 } as any);
    expect(result.breakdown.hr_name!.points).toBe(30);
    expect(result.score).toBe(100);
  });

  test('loadScoringWeights falls back to defaults on missing/bad rows', async () => {
    const emptyDb = { unsafe: async () => [] } as any;
    expect(await loadScoringWeights(emptyDb)).toEqual({ ...DEFAULT_WEIGHTS });
    const badDb = { unsafe: async () => { throw new Error('down'); } } as any;
    expect(await loadScoringWeights(badDb)).toEqual({ ...DEFAULT_WEIGHTS });
  });

  test('loadScoringWeights reads the settings row', async () => {
    const db = { unsafe: async () => [{ value: { hr_name: 30 } }] } as any;
    const w = await loadScoringWeights(db);
    expect(w.hr_name).toBe(30);
    expect(w.hr_contact).toBe(DEFAULT_WEIGHTS.hr_contact);
  });
});
