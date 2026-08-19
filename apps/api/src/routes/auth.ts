import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { db } from '../db/client.js'
import { profiles, users } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import { hashPassword, verifyPassword } from '../security/password.js'
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  findUserBySession,
  readSessionToken,
  setSessionCookie,
} from '../security/session.js'

const registrationSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(10).max(128),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9._]+$/, {
      message:
        'Username may only contain letters, numbers, dots and underscores',
    }),
  displayName: z.string().trim().min(2).max(100),
})

const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(128),
})

const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Demasiados intentos de acceso. Intenta nuevamente más tarde.',
    },
  },
})

function isUniqueViolation(error: unknown) {
  let currentError = error

  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof currentError !== 'object' || currentError === null) return false
    if ('code' in currentError && currentError.code === '23505') return true
    if (!('cause' in currentError)) return false
    currentError = currentError.cause
  }

  return false
}

export const authRouter = Router()

authRouter.post('/register', authWriteLimiter, async (request, response) => {
  const input = parseBody(registrationSchema, request.body)
  const passwordHash = await hashPassword(input.password)

  let user

  try {
    user = await db.transaction(async (transaction) => {
      const [createdUser] = await transaction
        .insert(users)
        .values({
          email: input.email,
          passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        })

      if (!createdUser) {
        throw new Error('Database did not return the created user')
      }

      await transaction.insert(profiles).values({
        userId: createdUser.id,
        username: input.username,
        displayName: input.displayName,
      })

      return {
        ...createdUser,
        username: input.username,
        displayName: input.displayName,
        bio: null,
        institution: null,
        career: null,
        avatarUrl: null,
        coverUrl: null,
        campus: null,
        website: null,
      }
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'ACCOUNT_ALREADY_EXISTS',
        'El correo o nombre de usuario ya está en uso.',
      )
    }

    throw error
  }

  const session = await createSession(user.id)
  setSessionCookie(response, session)

  response.status(201).json({ user })
})

authRouter.post('/login', authWriteLimiter, async (request, response) => {
  const input = parseBody(loginSchema, request.body)
  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      role: users.role,
      status: users.status,
      username: profiles.username,
      displayName: profiles.displayName,
      bio: profiles.bio,
      institution: profiles.institution,
      career: profiles.career,
      avatarUrl: profiles.avatarUrl,
      coverUrl: profiles.coverUrl,
      campus: profiles.campus,
      website: profiles.website,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(profiles, eq(users.id, profiles.userId))
    .where(eq(users.email, input.email))
    .limit(1)

  if (!account) {
    await hashPassword(input.password)
    throw new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Correo o contraseña incorrectos.',
    )
  }

  const passwordIsValid = await verifyPassword(
    input.password,
    account.passwordHash,
  )

  if (!passwordIsValid || account.status !== 'active') {
    throw new ApiError(
      401,
      'INVALID_CREDENTIALS',
      'Correo o contraseña incorrectos.',
    )
  }

  const { passwordHash: _passwordHash, ...user } = account
  const session = await createSession(user.id)
  setSessionCookie(response, session)

  response.json({ user })
})

authRouter.get('/me', async (request, response) => {
  const token = readSessionToken(request)

  if (!token) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.')
  }

  const user = await findUserBySession(token)

  if (!user) {
    clearSessionCookie(response)
    throw new ApiError(
      401,
      'INVALID_SESSION',
      'La sesión no es válida o expiró.',
    )
  }

  response.json({ user })
})

authRouter.post('/logout', async (request, response) => {
  const token = readSessionToken(request)

  if (token) {
    await deleteSession(token)
  }

  clearSessionCookie(response)
  response.status(204).send()
})
