import { z } from 'zod';
import { config } from 'dotenv';
import path from 'path';

config();
config({ path: path.resolve(__dirname, '../../../../.env') });
config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().optional(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().optional(),
  ENCRYPTION_SECRET: z.string().min(32),
  GEMINI_API_KEY: z.string().optional(),
  SNOVIO_API_KEY: z.string().optional(),
  SNOVIO_API_SECRET: z.string().optional(),
  CONTACT_OUT_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  BREVO_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_WEB_URL: z.string().optional(),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
  SCRAPER_MAX_CONCURRENCY: z.string().transform(Number).default('5'),
  SCRAPER_TIMEOUT_SECONDS: z.string().transform(Number).default('30'),
  SCRAPER_RETRY_ATTEMPTS: z.string().transform(Number).default('3'),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.string().transform(Number).default('5'),
  CIRCUIT_BREAKER_COOLDOWN_MINUTES: z.string().transform(Number).default('120'),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let _env: Env | undefined;

function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
    }
    _env = result.data;
  }
  return _env;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return getEnv()[prop as keyof Env];
  },
});
