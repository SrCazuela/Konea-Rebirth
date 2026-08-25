import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt } from 'drizzle-orm'
import { type Request, type Response } from 'express'
import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { profiles, users, userSessions } from '../db/schema.js'

const SESSION_COOKIE_NAME = 'konea_session'
const SESSION_DURATION_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)

  await db.insert(userSessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  })

  return { token, expiresAt }
}

export function setSessionCookie(
  response: Response,
  session: Awaited<ReturnType<typeof createSession>>,
) {
  response.cookie(SESSION_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: session.expiresAt,
    path: '/',
  })
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

export function readSessionToken(request: Request) {
  const token: unknown = request.cookies?.[SESSION_COOKIE_NAME]
  return typeof token === 'string' && token.length > 0 ? token : undefined
}

export async function deleteSession(token: string) {
  await db
    .delete(userSessions)
    .where(eq(userSessions.tokenHash, hashSessionToken(token)))
}

export async function findUserBySession(token: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
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
      education: profiles.education,
      projects: profiles.projects,
      achievements: profiles.achievements,
      lastSeenAt: profiles.lastSeenAt,
      createdAt: users.createdAt,
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .innerJoin(profiles, eq(users.id, profiles.userId))
    .where(
      and(
        eq(userSessions.tokenHash, hashSessionToken(token)),
        gt(userSessions.expiresAt, new Date()),
        eq(users.status, 'active'),
      ),
    )
    .limit(1)

  return user
}
