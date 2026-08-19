import { and, count, desc, eq, isNull, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { notifications, profiles } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'

const uuidSchema = z.string().uuid()
const actorProfiles = alias(profiles, 'notification_actor_profiles')

const notificationSelection = {
  id: notifications.id,
  type: notifications.type,
  title: notifications.title,
  body: notifications.body,
  href: notifications.href,
  resourceId: notifications.resourceId,
  readAt: notifications.readAt,
  createdAt: notifications.createdAt,
  actor: {
    id: notifications.actorId,
    username: actorProfiles.username,
    displayName: actorProfiles.displayName,
    avatarUrl: actorProfiles.avatarUrl,
  },
}

function parseNotificationId(value: string | undefined) {
  const result = uuidSchema.safeParse(value)

  if (!result.success) {
    throw new ApiError(
      400,
      'INVALID_IDENTIFIER',
      'Se requiere una notificación válida.',
    )
  }

  return result.data
}

async function loadNotifications(userId: string, condition?: SQL) {
  const rows = await db
    .select(notificationSelection)
    .from(notifications)
    .leftJoin(actorProfiles, eq(notifications.actorId, actorProfiles.userId))
    .where(and(eq(notifications.userId, userId), condition))
    .orderBy(desc(notifications.createdAt))
    .limit(50)

  return rows.map((notification) => ({
    ...notification,
    actor: notification.actor.id ? notification.actor : null,
  }))
}

async function getUnreadCount(userId: string) {
  const [result] = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))

  return Number(result?.total ?? 0)
}

export const notificationsRouter = Router()

notificationsRouter.use(requireAuthentication)

notificationsRouter.get('/', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const [userNotifications, unreadCount] = await Promise.all([
    loadNotifications(currentUser.id),
    getUnreadCount(currentUser.id),
  ])

  response.json({ notifications: userNotifications, unreadCount })
})

notificationsRouter.get('/unread-count', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  response.json({ unreadCount: await getUnreadCount(currentUser.id) })
})

notificationsRouter.post('/read-all', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, currentUser.id),
        isNull(notifications.readAt),
      ),
    )

  response.json({ updated: true })
})

notificationsRouter.patch(
  '/:notificationId/read',
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const notificationId = parseNotificationId(request.params.notificationId)
    const [updated] = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.userId, currentUser.id),
        ),
      )
      .returning({ id: notifications.id })

    if (!updated) {
      throw new ApiError(
        404,
        'NOTIFICATION_NOT_FOUND',
        'La notificación no existe.',
      )
    }

    const [notification] = await loadNotifications(
      currentUser.id,
      eq(notifications.id, updated.id),
    )

    response.json({ notification })
  },
)
