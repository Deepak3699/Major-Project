import { retry, RetryError, fetchWithRetry } from '../src/utils/httpClient';

describe('HTTP Client Retry (SRS §9.3)', () => {
  describe('retry', () => {
    test('succeeds on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retries and succeeds on second attempt', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success');
      const result = await retry(fn, { retries: 3, minTimeout: 10, maxTimeout: 50 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('throws RetryError after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const result = retry(fn, { retries: 2, minTimeout: 10, maxTimeout: 50 });
      await expect(result).rejects.toThrow(RetryError);
      await expect(result).rejects.toThrow('Failed after 3 attempts');
    });

    test('retryErrorCodes filters which errors to retry', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('ETIMEOUT'));
      const result = retry(fn, {
        retries: 2,
        minTimeout: 10,
        maxTimeout: 50,
        retryableErrors: ['ECONNREFUSED'],
      });
      await expect(result).rejects.toThrow(RetryError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retries when error matches retryableErrors', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('recovered');
      const result = await retry(fn, {
        retries: 3,
        minTimeout: 10,
        maxTimeout: 50,
        retryableErrors: ['ECONNREFUSED'],
      });
      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('jitter is applied to delays', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce('ok');

      const start = Date.now();
      await retry(fn, { retries: 1, minTimeout: 100, maxTimeout: 100, jitter: true });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(50);
      expect(elapsed).toBeLessThan(200);
    });

    test('no jitter means exact delay', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce('ok');

      const start = Date.now();
      await retry(fn, { retries: 1, minTimeout: 100, maxTimeout: 100, jitter: false });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(80);
      expect(elapsed).toBeLessThan(150);
    });

    test('RetryError contains attempts and lastError', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      try {
        await retry(fn, { retries: 1, minTimeout: 1, maxTimeout: 1 });
      } catch (e) {
        expect(e).toBeInstanceOf(RetryError);
        expect((e as RetryError).attempts).toBe(2);
        expect((e as RetryError).lastError).toBeDefined();
        expect((e as RetryError).lastError?.message).toBe('fail');
      }
    });
  });

  describe('RetryError', () => {
    test('is an Error subclass', () => {
      const err = new RetryError('test', 3);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('test');
      expect(err.attempts).toBe(3);
      expect(err.name).toBe('RetryError');
    });
  });
});
