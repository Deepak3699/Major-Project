import { logger } from './logging';

interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
  jitter?: boolean;
  retryableStatuses?: number[];
  retryableErrors?: string[];
}

const DEFAULTS: Required<RetryOptions> = {
  retries: 3,
  minTimeout: 100,
  maxTimeout: 5000,
  factor: 2,
  jitter: true,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: [],
};

export class RetryError extends Error {
  constructor(message: string, public attempts: number, public lastError?: Error) {
    super(message);
    this.name = 'RetryError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(base: number, jitter: boolean): number {
  if (!jitter) return base;
  return base * (0.5 + Math.random() * 0.5);
}

function calculateDelay(
  attempt: number,
  minTimeout: number,
  maxTimeout: number,
  factor: number,
  jitter: boolean,
): number {
  const expo = Math.pow(factor, attempt) * minTimeout;
  const clamped = Math.min(expo, maxTimeout);
  return Math.floor(jitteredDelay(clamped, jitter));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULTS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === opts.retries) {
        break;
      }

      if (opts.retryableErrors.length > 0) {
        const isRetryable = opts.retryableErrors.some(
          (code) => lastError?.message.includes(code),
        );
        if (!isRetryable) {
          break;
        }
      }

      const delay = calculateDelay(
        attempt,
        opts.minTimeout,
        opts.maxTimeout,
        opts.factor,
        opts.jitter,
      );

      logger().warn(
        `retry_attempt`,
        { attempt: attempt + 1, max: opts.retries, delay, error: lastError.message },
      );

      await sleep(delay);
    }
  }

  throw new RetryError(
    `Failed after ${opts.retries + 1} attempts: ${lastError?.message}`,
    opts.retries + 1,
    lastError,
  );
}

interface FetchRetryOptions extends RequestInit {
  retry?: number;
  retryMinTimeout?: number;
  retryMaxTimeout?: number;
  retryFactor?: number;
  retryJitter?: boolean;
  retryStatusCodes?: number[];
  retryErrorCodes?: string[];
}

export async function fetchWithRetry(
  url: string,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const {
    retry: retryAttempts,
    retryMinTimeout,
    retryMaxTimeout,
    retryFactor,
    retryJitter,
    retryStatusCodes,
    retryErrorCodes,
    ...fetchOptions
  } = options;

  return retry(async () => {
    const response = await fetch(url, fetchOptions);

    if (
      retryStatusCodes &&
      retryStatusCodes.length > 0 &&
      !retryStatusCodes.includes(response.status)
    ) {
      return response;
    }

    if (response.status >= 400) {
      const retryable =
        (retryStatusCodes || DEFAULTS.retryableStatuses!).includes(response.status);
      if (retryable) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
    }

    return response;
  }, {
    retries: retryAttempts ?? 3,
    minTimeout: retryMinTimeout ?? 100,
    maxTimeout: retryMaxTimeout ?? 5000,
    factor: retryFactor ?? 2,
    jitter: retryJitter ?? true,
    retryableErrors: retryErrorCodes,
  });
}
