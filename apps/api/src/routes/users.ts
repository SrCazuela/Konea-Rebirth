import { and, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { follows, posts, profiles, users } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { createNotification } from '../services/notification-service.js'
import {
  getLikedPostsByUser,
  getPostsByAuthor,
} from '../services/post-service.js'

const uuidSchema = z.string().uuid()
const searchSchema = z.string().trim().max(80).catch('')

function parseUserId(value: string | undefined) {
  const result = uuidSchema.safeParse(value)
  if (!result.success) {
    throw new ApiError(
      400,
      'INVALID_IDENTIFIER',
      'Se requiere un usuario válido.',
    )
  }
  return result.data
}

const publicUserSelection = {
  id: users.id,
  username: profiles.username,
  displayName: profiles.displayName,
  bio: profiles.bio,
  institution: profiles.institution,
  career: profiles.career,
  campus: profiles.campus,
  website: profiles.website,
  avatarUrl: profiles.avatarUrl,
  coverUrl: profiles.coverUrl,
  lastSeenAt: profiles.lastSeenAt,
  role: users.role,
  createdAt: users.createdAt,
}

type PublicUserRow = Awaited<ReturnType<typeof loadUsers>>[number]

async function loadUsers(condition?: SQL) {
  return db
    .select(publicUserSelection)
    .from(users)
    .innerJoin(profiles, eq(users.id, profiles.userId))
    .where(and(eq(users.status, 'active'), condition))
    .orderBy(profiles.displayName)
    .limit(50)
}

async function enrichUsers(rows: PublicUserRow[], currentUserId: string) {
  if (rows.length === 0) return []
  const userIds = rows.map((row) => row.id)
  const followedAuthorIds = db
    .select({ id: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, currentUserId))
  const [postCounts, followerCounts, followingCounts, followedRows] =
    await Promise.all([
      db
        .select({ userId: posts.authorId, total: count() })
        .from(posts)
        .where(
          and(
            inArray(posts.authorId, userIds),
            or(
              eq(posts.authorId, currentUserId),
              and(
                eq(posts.moderationStatus, 'approved'),
                or(
                  eq(posts.visibility, 'campus'),
                  eq(posts.visibility, 'public'),
                  and(
                    eq(posts.visibility, 'followers'),
                    inArray(posts.authorId, followedAuthorIds),
                  ),
                ),
              ),
            ),
          ),
        )
        .groupBy(posts.authorId),
      db
        .select({ userId: follows.followingId, total: count() })
        .from(follows)
        .where(inArray(follows.followingId, userIds))
        .groupBy(follows.followingId),
      db
        .select({ userId: follows.followerId, total: count() })
        .from(follows)
        .where(inArray(follows.followerId, userIds))
        .groupBy(follows.followerId),
      db
        .select({ userId: follows.followingId })
        .from(follows)
        .where(
          and(
            eq(follows.followerId, currentUserId),
            inArray(follows.followingId, userIds),
          ),
        ),
    ])

  const postCountByUser = new Map(
    postCounts.map((row) => [row.userId, Number(row.total)]),
  )
  const followerCountByUser = new Map(
    followerCounts.map((row) => [row.userId, Number(row.total)]),
  )
  const followingCountByUser = new Map(
    followingCounts.map((row) => [row.userId, Number(row.total)]),
  )
  const followedUserIds = new Set(followedRows.map((row) => row.userId))

  return rows.map((row) => ({
    ...row,
    stats: {
      posts: postCountByUser.get(row.id) ?? 0,
      followers: followerCountByUser.get(row.id) ?? 0,
      following: followingCountByUser.get(row.id) ?? 0,
    },
    followedByMe: followedUserIds.has(row.id),
    isMe: row.id === currentUserId,
  }))
}

async function getUserOrThrow(userId: string, currentUserId: string) {
  const rows = await loadUsers(eq(users.id, userId))
  const [user] = await enrichUsers(rows, currentUserId)
  if (!user) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'El perfil no existe.')
  }
  return user
}

async function followerCount(userId: string) {
  const [result] = await db
    .select({ total: count() })
    .from(follows)
    .where(eq(follows.followingId, userId))
  return Number(result?.total ?? 0)
}

export const usersRouter = Router()
usersRouter.use(requireAuthentication)

usersRouter.get('/', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const query = searchSchema.parse(request.query.q)
  const condition = query
    ? or(
        ilike(profiles.displayName, `%${query}%`),
        ilike(profiles.username, `%${query}%`),
        ilike(profiles.campus, `%${query}%`),
        ilike(profiles.institution, `%${query}%`),
        ilike(profiles.career, `%${query}%`),
      )
    : undefined
  const rows = await loadUsers(condition)
  response.json({ users: await enrichUsers(rows, currentUser.id) })
})

usersRouter.get('/:userId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  const user = await getUserOrThrow(userId, currentUser.id)
  const userPosts = await getPostsByAuthor(userId, currentUser)
  response.json({ user, posts: userPosts })
})

usersRouter.get('/:userId/followers', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  await getUserOrThrow(userId, currentUser.id)
  const related = await db
    .select({ id: follows.followerId })
    .from(follows)
    .where(eq(follows.followingId, userId))
  const ids = related.map((row) => row.id)
  const rows = ids.length ? await loadUsers(inArray(users.id, ids)) : []
  response.json({ users: await enrichUsers(rows, currentUser.id) })
})

usersRouter.get('/:userId/following', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  await getUserOrThrow(userId, currentUser.id)
  const related = await db
    .select({ id: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, userId))
  const ids = related.map((row) => row.id)
  const rows = ids.length ? await loadUsers(inArray(users.id, ids)) : []
  response.json({ users: await enrichUsers(rows, currentUser.id) })
})

usersRouter.get('/:userId/likes', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  await getUserOrThrow(userId, currentUser.id)
  response.json({
    posts: await getLikedPostsByUser(userId, currentUser),
  })
})

usersRouter.post('/:userId/follow', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  if (userId === currentUser.id) {
    throw new ApiError(
      400,
      'CANNOT_FOLLOW_SELF',
      'No puedes seguirte a ti mismo.',
    )
  }
  const target = await getUserOrThrow(userId, currentUser.id)
  const inserted = await db
    .insert(follows)
    .values({ followerId: currentUser.id, followingId: userId })
    .onConflictDoNothing()
    .returning({ userId: follows.followingId })

  if (inserted.length) {
    await createNotification({
      userId,
      actorId: currentUser.id,
      type: 'follow',
      title: 'Nuevo seguidor',
      body: `${currentUser.displayName} comenzó a seguirte.`,
      href: `user:${currentUser.id}`,
      resourceId: currentUser.id,
    })
  }

  response.json({
    followed: true,
    followersCount: await followerCount(target.id),
  })
})

usersRouter.delete('/:userId/follow', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, currentUser.id),
        eq(follows.followingId, userId),
      ),
    )
  response.json({
    followed: false,
    followersCount: await followerCount(userId),
  })
})
