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

/**
 * Comprueba si un error de PostgreSQL (o su causa anidada) corresponde
 * a una violación de restricción única (código PG 23505).
 * Útil para convertir errores de BD en ApiError 409.
 */
export function isUniqueViolation(error: unknown) {
  let current = error
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== 'object' || current === null) return false
    if ('code' in current && current.code === '23505') return true
    if (!('cause' in current)) return false
    current = current.cause
  }
  return false
}
