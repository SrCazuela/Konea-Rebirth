import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { z } from 'zod'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

config({ path: resolve(currentDirectory, '../../../../.env'), quiet: true })

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
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
