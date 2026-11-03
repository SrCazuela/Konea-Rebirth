import { eq, or } from 'drizzle-orm'
import { Router, type Request } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { db, isUniqueViolation } from '../db/client.js'
import { profiles, users, userSessions } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { hashPassword, verifyPassword } from '../security/password.js'
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  findUserBySession,
  readSessionToken,
  setSessionCookie,
} from '../security/session.js'

const emailSchema = z.string().trim().toLowerCase().email().max(320)
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9._]+$/, {
    message: 'Username may only contain letters, numbers, dots and underscores',
  })

const registrationSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(10).max(128),
  username: usernameSchema,
  displayName: z.string().trim().min(2).max(100),
})

const loginSchema = z.strictObject({
  identifier: z.union([emailSchema, usernameSchema]),
  password: z.string().min(1).max(128),
})

const accountSchema = z.strictObject({
  email: emailSchema,
  username: usernameSchema,
  displayName: z.string().trim().min(2).max(100),
  currentPassword: z.string().min(1).max(128),
})

const passwordChangeSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
})

const accountWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (_request, response) => getAuthenticatedUser(response).id,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Demasiados intentos. Intenta nuevamente más tarde.',
    },
  },
})

type AuthTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function verifyAccountChange(
  transaction: AuthTransaction,
  userId: string,
  request: Request,
  password: string,
) {
  // Account changes and login serialize on the same user row. Recheck the
  // session after obtaining the lock: another change may just have revoked it.
  const [credentials] = await transaction
    .select({ passwordHash: users.passwordHash, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .for('update')
  const token = readSessionToken(request)
  const sessionUser = token && (await findUserBySession(token, transaction))
  if (
    !credentials ||
    credentials.status !== 'active' ||
    !sessionUser ||
    sessionUser.id !== userId
  ) {
    throw new ApiError(
      401,
      'INVALID_SESSION',
      'La sesión ya no es válida. Inicia sesión nuevamente.',
    )
  }
  if (!(await verifyPassword(password, credentials.passwordHash))) {
    throw new ApiError(
      400,
      'CURRENT_PASSWORD_INCORRECT',
      'La contraseña actual no es correcta.',
    )
  }
}

async function rotateAccountSessions(
  transaction: AuthTransaction,
  userId: string,
) {
  await transaction.delete(userSessions).where(eq(userSessions.userId, userId))
  return createSession(userId, transaction)
}

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
        education: [],
        projects: [],
        achievements: [],
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

  const { user, session } = await db.transaction(async (transaction) => {
    const [credentials] = await transaction
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        status: users.status,
      })
      .from(users)
      .innerJoin(profiles, eq(users.id, profiles.userId))
      .where(
        or(
          eq(users.email, input.identifier),
          eq(profiles.username, input.identifier),
        ),
      )
      .limit(1)
      .for('update', { of: users })

    if (!credentials) {
      await hashPassword(input.password)
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'Correo, usuario o contraseña incorrectos.',
      )
    }
    if (
      credentials.status !== 'active' ||
      !(await verifyPassword(input.password, credentials.passwordHash))
    ) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'Correo, usuario o contraseña incorrectos.',
      )
    }

    const session = await createSession(credentials.id, transaction)
    const user = await findUserBySession(session.token, transaction)
    // A username/email can change while this request waits for the row lock.
    // Validate against the fresh profile before committing its session.
    if (
      !user ||
      (input.identifier !== user.email && input.identifier !== user.username)
    ) {
      throw new ApiError(
        401,
        'INVALID_CREDENTIALS',
        'Correo, usuario o contraseña incorrectos.',
      )
    }
    return { user, session }
  })
  setSessionCookie(response, session)

  response.json({ user })
})

authRouter.patch(
  '/account',
  requireAuthentication,
  accountWriteLimiter,
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const input = parseBody(accountSchema, request.body)
    let result
    try {
      result = await db.transaction(async (transaction) => {
        await verifyAccountChange(
          transaction,
          currentUser.id,
          request,
          input.currentPassword,
        )
        const now = new Date()
        await transaction
          .update(users)
          .set({ email: input.email, updatedAt: now })
          .where(eq(users.id, currentUser.id))
        await transaction
          .update(profiles)
          .set({
            username: input.username,
            displayName: input.displayName,
            updatedAt: now,
          })
          .where(eq(profiles.userId, currentUser.id))
        const session = await rotateAccountSessions(transaction, currentUser.id)
        const user = await findUserBySession(session.token, transaction)
        if (!user) throw new Error('Updated account not found')
        return { user, session }
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
    setSessionCookie(response, result.session)
    response.json({ user: result.user })
  },
)

authRouter.post(
  '/password',
  requireAuthentication,
  accountWriteLimiter,
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const input = parseBody(passwordChangeSchema, request.body)
    const passwordHash = await hashPassword(input.newPassword)
    const session = await db.transaction(async (transaction) => {
      await verifyAccountChange(
        transaction,
        currentUser.id,
        request,
        input.currentPassword,
      )
      if (input.currentPassword === input.newPassword) {
        throw new ApiError(
          400,
          'PASSWORD_UNCHANGED',
          'La nueva contraseña debe ser distinta de la actual.',
        )
      }
      await transaction
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, currentUser.id))
      return rotateAccountSessions(transaction, currentUser.id)
    })
    setSessionCookie(response, session)
    response.json({
      message: 'Contraseña actualizada. Se cerraron las demás sesiones.',
    })
  },
)

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
