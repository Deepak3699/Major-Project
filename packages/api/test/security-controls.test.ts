import { encryptApiKeys, maskApiKeys } from '../src/utils/crypto';
import { verifySignature } from '../src/routes/webhooks';
import { createHmac } from 'crypto';

describe('PII / credential exposure controls', () => {
  test('maskApiKeys never returns the plaintext secret, only a masked tail', () => {
    const secret = 're_super_secret_key_1234567890';
    const enc = encryptApiKeys({ resend: secret, brevo: undefined });
    const masked = maskApiKeys(enc);
    expect(Object.keys(masked)).toEqual(['resend']);
    // The full secret must not appear anywhere in the masked value.
    expect(masked.resend).not.toContain('super_secret');
    expect(masked.resend).not.toBe(secret);
    expect(masked.resend.startsWith('••••')).toBe(true);
    expect(masked.resend.endsWith(secret.slice(-4))).toBe(true);
  });

  test('maskApiKeys is safe against a value that is not decryptable', () => {
    const masked = maskApiKeys({ foo: 'not-valid-base64-ciphertext' });
    expect(masked.foo).toBe('••••••••');
  });
});

describe('Webhook signature verification (fail-closed)', () => {
  const body = JSON.stringify({ type: 'email.delivered', data: { id: 'x' } });

  test('rejects when a secret is configured but signature missing/wrong', () => {
    expect(verifySignature('whsec_abc', {}, body, 'svix')).toBe(false);
    expect(verifySignature('whsec_abc', { 'svix-signature': 'v1,bogus' }, body, 'svix')).toBe(false);
  });

  test('accepts a correctly-signed meta webhook', () => {
    const secret = 'shh';
    const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    expect(verifySignature(secret, { 'x-hub-signature-256': sig }, body, 'meta')).toBe(true);
  });

  test('no secret: FAILS CLOSED always, unless explicitly opted in for dev', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevFlag = process.env.ALLOW_UNSIGNED_WEBHOOKS;
    delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
    // Default: missing secret is rejected in EVERY environment (prod, test, dev).
    process.env.NODE_ENV = 'test';
    expect(verifySignature(undefined, {}, body, 'meta')).toBe(false);
    process.env.NODE_ENV = 'production';
    expect(verifySignature(undefined, {}, body, 'meta')).toBe(false);
    // Only an explicit opt-in allows unsigned (local dev convenience).
    process.env.ALLOW_UNSIGNED_WEBHOOKS = 'true';
    expect(verifySignature(undefined, {}, body, 'meta')).toBe(true);
    if (prevFlag === undefined) delete process.env.ALLOW_UNSIGNED_WEBHOOKS;
    else process.env.ALLOW_UNSIGNED_WEBHOOKS = prevFlag;
    process.env.NODE_ENV = prevEnv;
  });
});
