import { z } from 'zod';

const envSchema = z
  .object({
    API_PORT: z.coerce.number().default(4100),
    WEB_ORIGIN: z.string().default('http://localhost:3000'),
    STORAGE_ROOT: z.string().default('D:/paper-analyzer-storage'),
    ADMIN_PASSWORD: z.string().min(4, 'ADMIN_PASSWORD must be at least 4 characters'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    AI_PROVIDER: z.enum(['mock', 'openai', 'gemini']).default('mock'),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default('gemini-flash-latest'),
    // Requests per minute allowed by the key (free tier ~5). 0 = no limit (paid keys).
    GEMINI_RPM: z.coerce.number().int().min(0).default(0),
    // Comma-separated backups, tried in order when the main model is overloaded (503) or out of daily quota (429).
    GEMINI_FALLBACK_MODELS: z
      .string()
      .default('')
      .transform((v) => v.split(',').map((m) => m.trim()).filter(Boolean)),
    AI_PAGE_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(3),

    // MySQL 8+ / MariaDB
    DB_HOST: z.string().min(1, 'DB_HOST is required'),
    DB_PORT: z.coerce.number().int().default(3306),
    DB_USER: z.string().min(1, 'DB_USER is required'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().min(1).default('paper_analyzer'),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === 'openai') {
      if (!env.OPENAI_API_KEY) {
        ctx.addIssue({ code: 'custom', path: ['OPENAI_API_KEY'], message: 'required when AI_PROVIDER=openai' });
      }
      if (!env.OPENAI_MODEL) {
        ctx.addIssue({ code: 'custom', path: ['OPENAI_MODEL'], message: 'required when AI_PROVIDER=openai' });
      }
    }
    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['GEMINI_API_KEY'], message: 'required when AI_PROVIDER=gemini' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration (.env):\n${issues}`);
  }
  return result.data;
}
