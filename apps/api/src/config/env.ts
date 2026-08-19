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
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  POSTS_REQUIRE_APPROVAL: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

const result = environmentSchema.safeParse(process.env)

if (!result.success) {
  const details = z.prettifyError(result.error)
  throw new Error(`Invalid environment configuration:\n${details}`)
}

export const env = result.data
