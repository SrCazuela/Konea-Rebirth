import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, inArray, sql } from 'drizzle-orm'
import { env } from '../config/env.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { academicCourses, profiles, users, userSessions } from '../db/schema.js'
import {
  assertPublicDemoDatabase,
  assertPublicDemoPasswords,
} from '../demo/public-demo-safety.js'
import { SOCIAL_DEMO_PROFILES } from '../demo/social-demo-data.js'
import { normalizeCourseName } from '../domain/academic.js'
import { hashPassword } from '../security/password.js'

const repositoryDirectory = fileURLToPath(
  new URL('../../../../', import.meta.url),
)
const tsxCli = resolve(repositoryDirectory, 'node_modules/tsx/dist/cli.mjs')
const dedicatedUploadDirectory = resolve(
  repositoryDirectory,
  '.local/public-demo/uploads',
)

const DEMO_ACCOUNTS = [
  {
    id: 'f4d00000-0000-4000-8000-000000000001',
    email: 'demo.admin@demo.konea.local',
    username: 'demo.admin',
    displayName: 'Administración Demo',
    role: 'admin' as const,
  },
  {
    id: 'f4d00000-0000-4000-8000-000000000002',
    email: 'demo.estudiante@demo.konea.local',
    username: 'demo.estudiante',
    displayName: 'Estudiante Demo',
    role: 'student' as const,
  },
] as const

const DEMO_COURSES = [
  { name: 'Capstone', code: 'PTY4614', section: '002D' },
  { name: 'Integrated English Practice', code: 'ESP1513', section: '002D' },
  { name: 'Machine Learning', code: 'MLY0100', section: '005D' },
  { name: 'Programación de algoritmos', code: 'PGY1121', section: '003D' },
] as const

async function assertDedicatedDatabaseContainsOnlyFixtures(
  databaseName: string,
) {
  const result = await db.execute<{ database_name: string }>(
    sql`select current_database() as database_name`,
  )
  if (result.rows[0]?.database_name !== databaseName) {
    throw new Error('La conexión no corresponde a la base aislada solicitada.')
  }

  const permittedAccounts = new Map(
    [...SOCIAL_DEMO_PROFILES, ...DEMO_ACCOUNTS].map((account) => [
      account.id,
      { email: account.email, username: account.username },
    ]),
  )
  const existing = await db
    .select({
      id: users.id,
      email: users.email,
      username: profiles.username,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))

  for (const account of existing) {
    const expected = permittedAccounts.get(account.id)
    if (
      !expected ||
      account.email !== expected.email ||
      (account.username && account.username !== expected.username)
    ) {
      throw new Error(
        'La base contiene cuentas ajenas a los fixtures públicos. No se modificó ni se expondrá esa base.',
      )
    }
  }
}

async function prepareAccountsAndCourses(passwords: {
  adminPassword: string
  studentPassword: string
}) {
  const hashedPasswords = await Promise.all([
    hashPassword(passwords.adminPassword),
    hashPassword(passwords.studentPassword),
  ])
  await db.transaction(async (transaction) => {
    for (const [index, account] of DEMO_ACCOUNTS.entries()) {
      const passwordHash = hashedPasswords[index]
      if (!passwordHash)
        throw new Error('No se pudo proteger una contraseña demo.')
      const { username, displayName, ...user } = account
      await transaction
        .insert(users)
        .values({ ...user, passwordHash, status: 'active' })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: account.email,
            role: account.role,
            status: 'active',
            passwordHash,
            updatedAt: new Date(),
          },
        })

      await transaction
        .insert(profiles)
        .values({
          userId: account.id,
          username,
          displayName,
          institution: 'Duoc UC',
          campus: 'Sede San Joaquín',
          career:
            account.role === 'student' ? 'Ingeniería en Informática' : null,
          bio: 'Cuenta ficticia para demostrar Konea. No contiene información de estudiantes reales.',
        })
        .onConflictDoNothing({ target: profiles.userId })
    }

    // A new launch may rotate credentials. Sessions from the previous demo
    // should not grant continued access after that rotation.
    await transaction.delete(userSessions).where(
      inArray(
        userSessions.userId,
        DEMO_ACCOUNTS.map((account) => account.id),
      ),
    )

    for (const [index, course] of DEMO_COURSES.entries()) {
      await transaction
        .insert(academicCourses)
        .values({
          id: `f4d10000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          userId: DEMO_ACCOUNTS[1].id,
          ...course,
          normalizedName: normalizeCourseName(course.name),
          source: 'manual',
          active: true,
        })
        .onConflictDoNothing()
    }
  })
}

async function runFixtureScript(scriptName: string) {
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: env.DATABASE_URL,
    KUCO_AI_PROVIDER: 'local',
    CAPSTONE_DEMO_USERNAME: DEMO_ACCOUNTS[1].username,
    UPLOAD_DIRECTORY: dedicatedUploadDirectory,
  }
  delete childEnvironment.PUBLIC_DEMO_ADMIN_PASSWORD
  delete childEnvironment.PUBLIC_DEMO_STUDENT_PASSWORD

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [
        '--no-maglev',
        tsxCli,
        resolve(repositoryDirectory, 'apps/api/src/scripts', scriptName),
      ],
      {
        cwd: repositoryDirectory,
        env: childEnvironment,
        stdio: 'inherit',
        windowsHide: true,
        timeout: 180_000,
      },
    )
    child.once('error', () => {
      reject(new Error(`No se pudo iniciar el fixture ${scriptName}.`))
    })
    child.once('close', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`El fixture ${scriptName} terminó con un error.`))
    })
  })
}

async function preparePublicDemo() {
  if (env.NODE_ENV !== 'development') {
    throw new Error('La preparación de fixtures requiere NODE_ENV=development.')
  }
  const databaseName = assertPublicDemoDatabase(env.DATABASE_URL)
  const configuredUploads = process.env.UPLOAD_DIRECTORY
  if (
    !configuredUploads ||
    resolve(configuredUploads).toLowerCase() !==
      dedicatedUploadDirectory.toLowerCase()
  ) {
    throw new Error(
      'UPLOAD_DIRECTORY debe apuntar a .local/public-demo/uploads, separado de las imágenes personales.',
    )
  }
  const passwords = assertPublicDemoPasswords({
    adminPassword: process.env.PUBLIC_DEMO_ADMIN_PASSWORD,
    studentPassword: process.env.PUBLIC_DEMO_STUDENT_PASSWORD,
  })

  await assertDedicatedDatabaseContainsOnlyFixtures(databaseName)
  await prepareAccountsAndCourses(passwords)

  // Existing seeds are CLI entrypoints which close their own connection pool.
  // Run each in a separate process, never import their side effects here.
  for (const script of [
    'seed-social-demo.ts',
    'seed-capstone-demo-chats.ts',
    'seed-capstone-demo-requests.ts',
    'seed-capstone-demo-academic.ts',
  ]) {
    await runFixtureScript(script)
  }

  console.log(
    'Demostración aislada preparada: demo.estudiante y demo.admin. Solo se utilizaron datos ficticios y fotografías de los fixtures.',
  )
}

try {
  await preparePublicDemo()
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'No se pudo preparar la demostración aislada.',
  )
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
