import { eq } from 'drizzle-orm'
import { env } from '../config/env.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { profiles, users } from '../db/schema.js'
import { hashPassword } from '../security/password.js'

const DEMO_ADMIN = {
  email: 'admin@konea.local',
  username: 'admin',
  displayName: 'Administrador Konea',
  password: 'admin',
} as const

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function assertLocalDevelopmentDatabase() {
  if (
    process.env.NODE_ENV !== 'development' ||
    env.NODE_ENV !== 'development'
  ) {
    throw new Error(
      'La cuenta demo solo puede prepararse con NODE_ENV=development.',
    )
  }

  let databaseUrl: URL
  try {
    databaseUrl = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('DATABASE_URL no es una URL PostgreSQL valida.')
  }

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error(
      'DATABASE_URL debe usar el protocolo postgres o postgresql.',
    )
  }

  const hostname = databaseUrl.hostname.toLowerCase()

  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(
      `La cuenta demo solo puede prepararse en una base local; host recibido: ${hostname}.`,
    )
  }
}

async function ensureDevelopmentAdmin() {
  assertLocalDevelopmentDatabase()
  const passwordHash = await hashPassword(DEMO_ADMIN.password)

  await db.transaction(async (transaction) => {
    const [accountByEmail] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, DEMO_ADMIN.email))
      .limit(1)

    const [accountByUsername] = await transaction
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(eq(profiles.username, DEMO_ADMIN.username))
      .limit(1)

    if (accountByUsername && accountByUsername.userId !== accountByEmail?.id) {
      throw new Error(
        `El usuario '${DEMO_ADMIN.username}' ya pertenece a otra cuenta local.`,
      )
    }

    const [admin] = await transaction
      .insert(users)
      .values({
        email: DEMO_ADMIN.email,
        passwordHash,
        role: 'admin',
        status: 'active',
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          passwordHash,
          role: 'admin',
          status: 'active',
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id })

    if (!admin) {
      throw new Error('PostgreSQL no devolvio la cuenta demo preparada.')
    }

    await transaction
      .insert(profiles)
      .values({
        userId: admin.id,
        username: DEMO_ADMIN.username,
        displayName: DEMO_ADMIN.displayName,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          username: DEMO_ADMIN.username,
          displayName: DEMO_ADMIN.displayName,
          updatedAt: new Date(),
        },
      })
  })

  console.log('Cuenta demo local lista: admin / admin.')
}

try {
  await ensureDevelopmentAdmin()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
