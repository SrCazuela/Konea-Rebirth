import { type RequestHandler, type Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { profiles } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import {
  clearSessionCookie,
  findUserBySession,
  readSessionToken,
} from '../security/session.js'

export type AuthenticatedUser = NonNullable<
  Awaited<ReturnType<typeof findUserBySession>>
>

export const requireAuthentication: RequestHandler = async (
  request,
  response,
  next,
) => {
  const token = readSessionToken(request)

  if (!token) {
    next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.'))
    return
  }

  const user = await findUserBySession(token)

  if (!user) {
    clearSessionCookie(response)
    next(
      new ApiError(401, 'INVALID_SESSION', 'La sesión no es válida o expiró.'),
    )
    return
  }

  response.locals.currentUser = user

  if (Date.now() - user.lastSeenAt.getTime() > 60_000) {
    const now = new Date()
    await db
      .update(profiles)
      .set({ lastSeenAt: now })
      .where(eq(profiles.userId, user.id))
    response.locals.currentUser = { ...user, lastSeenAt: now }
  }
  next()
}

export const requireModerator: RequestHandler = (_request, response, next) => {
  const user = getAuthenticatedUser(response)

  if (user.role !== 'moderator' && user.role !== 'admin') {
    next(
      new ApiError(
        403,
        'INSUFFICIENT_PERMISSIONS',
        'Se requiere el rol de moderación.',
      ),
    )
    return
  }

  next()
}

export function getAuthenticatedUser(response: Response) {
  const user = response.locals.currentUser as AuthenticatedUser | undefined

  if (!user) {
    throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Debes iniciar sesión.')
  }

  return user
}
