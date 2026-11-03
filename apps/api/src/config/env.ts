import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { z } from 'zod'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

config({ path: resolve(currentDirectory, '../../../../.env'), quiet: true })

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65_535)
      .default(Number(process.env.PORT ?? 3000)),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    UPLOAD_DIRECTORY: z.string().trim().min(1).optional(),
    UPLOAD_STORAGE: z.enum(['filesystem', 's3']).default('filesystem'),
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().trim().min(1).default('us-east-2'),
    S3_BUCKET: z.string().trim().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
    SITES_BACKEND_TOKEN: z.string().min(32).optional(),
    CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
    WRITE_RATE_LIMIT_PER_15_MIN: z.coerce
      .number()
      .int()
      .min(50)
      .max(10_000)
      .default(600),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
    POSTS_REQUIRE_APPROVAL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DUCO_AI_PROVIDER: z.enum(['local', 'ollama', 'openai']).optional(),
    OLLAMA_BASE_URL: z.url().default('http://127.0.0.1:11434'),
    OLLAMA_MODEL: z.string().trim().min(1).default('qwen3.5:4b'),
    OLLAMA_KEEP_ALIVE: z.string().trim().min(1).default('2m'),
    DUCO_AI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(300_000)
      .default(120_000),
    OPENAI_API_KEY: z.string().trim().min(1).optional(),
    OPENAI_MODEL: z.string().trim().min(1).default('gpt-5.6-luna'),
    OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
    OPENAI_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(120_000)
      .default(45_000),
  })
  .superRefine((configuration, context) => {
    if (configuration.UPLOAD_STORAGE !== 's3') return

    for (const key of [
      'S3_ENDPOINT',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    ] as const) {
      if (!configuration[key]) {
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when UPLOAD_STORAGE=s3`,
        })
      }
    }

    if (
      configuration.S3_ENDPOINT &&
      URL.canParse(configuration.S3_ENDPOINT) &&
      new URL(configuration.S3_ENDPOINT).protocol !== 'https:'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message: 'Object storage requires an HTTPS endpoint',
      })
    }
  })

const result = environmentSchema.safeParse(process.env)

if (!result.success) {
  const details = z.prettifyError(result.error)
  throw new Error(`Invalid environment configuration:\n${details}`)
}

export const env = {
  ...result.data,
  DUCO_AI_PROVIDER:
    result.data.DUCO_AI_PROVIDER ??
    (result.data.NODE_ENV === 'development' ? ('ollama' as const) : 'local'),
}
