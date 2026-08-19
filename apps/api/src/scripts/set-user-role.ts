import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { env } from '../config/env.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { users } from '../db/schema.js'

const argumentsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['student', 'professor', 'moderator', 'admin']),
})

function readOption(name: string) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function main() {
  if (env.NODE_ENV === 'production') {
    throw new Error('Este comando está limitado al entorno local.')
  }

  const input = argumentsSchema.parse({
    email: readOption('email'),
    role: readOption('role'),
  })

  const [updatedUser] = await db
    .update(users)
    .set({ role: input.role, updatedAt: new Date() })
    .where(eq(users.email, input.email))
    .returning({ id: users.id })

  if (!updatedUser) {
    throw new Error('No existe una cuenta local con ese correo.')
  }

  console.log(`Rol local actualizado a ${input.role}.`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
