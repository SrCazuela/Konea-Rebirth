import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../config/env.js'
import * as schema from './schema.js'

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.NODE_ENV === 'production' ? 10 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = drizzle({ client: pool, schema })

export async function checkDatabaseConnection() {
  const startedAt = performance.now()
  await pool.query('select 1')

  return {
    connected: true as const,
    latencyMs: Math.round(performance.now() - startedAt),
  }
}

export async function closeDatabaseConnection() {
  await pool.end()
}
