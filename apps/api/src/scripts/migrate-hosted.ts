import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { env } from '../config/env.js'
import { closeDatabaseConnection, db } from '../db/client.js'

// Called by the hosted container before the API binds its port. Never run local
// demo seeders in production; a restored database keeps its real accounts/data.
try {
  if (env.NODE_ENV !== 'production') {
    throw new Error('Hosted migration entry point requires production mode')
  }
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle/', import.meta.url)),
  })
  console.log('Migraciones de Konea aplicadas.')
} catch {
  console.error(
    'No se pudieron aplicar las migraciones. Comprueba la conexión y el esquema del servidor; no se inició la API.',
  )
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
