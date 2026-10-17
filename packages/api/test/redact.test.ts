import { redactEmail, redactPhone } from '../src/utils/redact';

describe('PII redaction for logs/audit', () => {
  test('redactEmail hides local part + domain, keeps only non-identifying hints', () => {
    const r = redactEmail('john.doe@corp.example');
    expect(r).not.toContain('john.doe');
    expect(r).not.toContain('corp');
    expect(r).toBe('j***@***.example');
  });

  test('redactEmail handles empty/None without leaking', () => {
    expect(redactEmail('')).toBe('<none>');
    expect(redactEmail(null)).toBe('<none>');
    expect(redactEmail(undefined)).toBe('<none>');
  });

  test('redactPhone keeps only last 2 digits', () => {
    const r = redactPhone('+919876543210');
    expect(r).not.toContain('987654');
    expect(r.endsWith('10')).toBe(true);
  });

  test('redactPhone handles short/empty safely', () => {
    expect(redactPhone('123')).toBe('***');
    expect(redactPhone('')).toBe('<none>');
    expect(redactPhone(null)).toBe('<none>');
  });
});
