import { and, count, eq, gt, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  chatParticipants,
  chats,
  connectionIntents,
  connections,
  posts,
  profiles,
  users,
} from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { directChatKey } from '../services/chat-service.js'
import { sendPrivateConnectionRequest } from '../services/connection-service.js'
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
  education: profiles.education,
  projects: profiles.projects,
  achievements: profiles.achievements,
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

async function connectedUserIds(userId: string) {
  const rows = await db
    .select({
      userOneId: connections.userOneId,
      userTwoId: connections.userTwoId,
    })
    .from(connections)
    .where(
      or(eq(connections.userOneId, userId), eq(connections.userTwoId, userId)),
    )
  return rows.map((row) =>
    row.userOneId === userId ? row.userTwoId : row.userOneId,
  )
}

async function enrichUsers(rows: PublicUserRow[], currentUserId: string) {
  if (rows.length === 0) return []
  const userIds = rows.map((row) => row.id)
  const myConnectionIds = await connectedUserIds(currentUserId)
  const [postCounts, outgoingIntents] = await Promise.all([
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
                myConnectionIds.length
                  ? and(
                      eq(posts.visibility, 'connections'),
                      inArray(posts.authorId, myConnectionIds),
                    )
                  : undefined,
              ),
            ),
          ),
        ),
      )
      .groupBy(posts.authorId),
    db
      .select({ recipientId: connectionIntents.recipientId })
      .from(connectionIntents)
      .where(
        and(
          eq(connectionIntents.requesterId, currentUserId),
          inArray(connectionIntents.recipientId, userIds),
          gt(connectionIntents.expiresAt, new Date()),
        ),
      ),
  ])

  const postCountByUser = new Map(
    postCounts.map((row) => [row.userId, Number(row.total)]),
  )
  const connectedIds = new Set(myConnectionIds)
  const requestedIds = new Set(outgoingIntents.map((row) => row.recipientId))

  return rows.map((row) => ({
    ...row,
    stats: {
      posts: postCountByUser.get(row.id) ?? 0,
      projects: row.projects.length,
      achievements: row.achievements.length,
    },
    connectionStatus:
      row.id === currentUserId
        ? ('self' as const)
        : connectedIds.has(row.id)
          ? ('connected' as const)
          : requestedIds.has(row.id)
            ? ('requested' as const)
            : ('none' as const),
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

export const usersRouter = Router()
usersRouter.use(requireAuthentication)

usersRouter.get('/connections', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const query = searchSchema.parse(request.query.q)
  const ids = await connectedUserIds(currentUser.id)
  if (!ids.length) {
    response.json({ users: [] })
    return
  }
  const searchCondition = query
    ? or(
        ilike(profiles.displayName, `%${query}%`),
        ilike(profiles.username, `%${query}%`),
        ilike(profiles.institution, `%${query}%`),
        ilike(profiles.career, `%${query}%`),
      )
    : undefined
  const rows = await loadUsers(and(inArray(users.id, ids), searchCondition))
  response.json({ users: await enrichUsers(rows, currentUser.id) })
})

usersRouter.get('/:userId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  const user = await getUserOrThrow(userId, currentUser.id)
  const userPosts = await getPostsByAuthor(userId, currentUser)
  response.json({ user, posts: userPosts })
})

usersRouter.get('/:userId/likes', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  if (userId !== currentUser.id) {
    throw new ApiError(
      403,
      'PRIVATE_ACTIVITY',
      'Las publicaciones favoritas son privadas.',
    )
  }
  response.json({ posts: await getLikedPostsByUser(userId, currentUser) })
})

usersRouter.post('/:userId/connection-request', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  if (userId === currentUser.id) {
    throw new ApiError(
      400,
      'CANNOT_CONNECT_SELF',
      'No puedes enviarte una solicitud de conexión.',
    )
  }
  const target = await getUserOrThrow(userId, currentUser.id)
  const result = await sendPrivateConnectionRequest(currentUser.id, userId)

  if (result.matched) {
    await Promise.all([
      createNotification({
        userId: currentUser.id,
        actorId: userId,
        type: 'connection',
        title: 'Nueva conexión',
        body: `Tú y ${target.displayName} aceptaron conectarse.`,
        href: `user:${userId}`,
        resourceId: userId,
      }),
      createNotification({
        userId,
        actorId: currentUser.id,
        type: 'connection',
        title: 'Nueva conexión',
        body: `Tú y ${currentUser.displayName} aceptaron conectarse.`,
        href: `user:${currentUser.id}`,
        resourceId: currentUser.id,
      }),
    ])
  }

  response.json({ connectionStatus: result.status, matched: result.matched })
})

usersRouter.delete('/:userId/connection-request', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  await db
    .delete(connectionIntents)
    .where(
      and(
        eq(connectionIntents.requesterId, currentUser.id),
        eq(connectionIntents.recipientId, userId),
      ),
    )
  response.json({ connectionStatus: 'none' })
})

usersRouter.delete('/:userId/connection', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const userId = parseUserId(request.params.userId)
  const [userOneId, userTwoId] = [currentUser.id, userId].sort()
  if (!userOneId || !userTwoId) throw new Error('Invalid connection pair')
  await db.transaction(async (transaction) => {
    await transaction
      .delete(connections)
      .where(
        and(
          eq(connections.userOneId, userOneId),
          eq(connections.userTwoId, userTwoId),
        ),
      )
    const [directChat] = await transaction
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.directKey, directChatKey(currentUser.id, userId)))
      .limit(1)
    if (directChat) {
      await transaction
        .update(chatParticipants)
        .set({ archivedAt: new Date() })
        .where(eq(chatParticipants.chatId, directChat.id))
    }
  })
  response.json({ connectionStatus: 'none' })
})
