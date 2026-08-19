import { and, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  chatParticipants,
  chats,
  comments,
  messages,
  posts,
  profiles,
  reports,
  users,
} from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
  requireModerator,
  type AuthenticatedUser,
} from '../middleware/authentication.js'
import { createNotification } from '../services/notification-service.js'
import { getPostForUser } from '../services/post-service.js'

const resourceTypeSchema = z.enum([
  'post',
  'comment',
  'chat',
  'message',
  'user',
])
const reportStatusSchema = z.enum([
  'pending',
  'reviewing',
  'resolved',
  'dismissed',
])
const uuidSchema = z.string().uuid()

const createReportSchema = z.strictObject({
  resourceType: resourceTypeSchema,
  resourceId: uuidSchema,
  reason: z.string().trim().min(3).max(160),
  details: z
    .union([z.string().trim().max(1_000), z.null()])
    .transform((value) => value || null)
    .optional(),
})

const updateReportSchema = z.strictObject({ status: reportStatusSchema })

const reporterProfiles = alias(profiles, 'reporter_profiles')
const assigneeProfiles = alias(profiles, 'report_assignee_profiles')

const reportSelection = {
  id: reports.id,
  resourceType: reports.resourceType,
  resourceId: reports.resourceId,
  reason: reports.reason,
  details: reports.details,
  status: reports.status,
  createdAt: reports.createdAt,
  updatedAt: reports.updatedAt,
  reporter: {
    id: reports.reporterId,
    username: reporterProfiles.username,
    displayName: reporterProfiles.displayName,
    avatarUrl: reporterProfiles.avatarUrl,
  },
  assignedTo: {
    id: reports.assignedToId,
    username: assigneeProfiles.username,
    displayName: assigneeProfiles.displayName,
    avatarUrl: assigneeProfiles.avatarUrl,
  },
}

function parseReportId(value: string | undefined) {
  const result = uuidSchema.safeParse(value)

  if (!result.success) {
    throw new ApiError(
      400,
      'INVALID_IDENTIFIER',
      'Se requiere un reporte válido.',
    )
  }

  return result.data
}

function parseStatusFilter(value: unknown) {
  const result = reportStatusSchema.optional().safeParse(value)

  if (!result.success) {
    throw new ApiError(
      400,
      'INVALID_REPORT_STATUS',
      'El estado del reporte no es válido.',
    )
  }

  return result.data
}

async function loadReports(condition?: SQL) {
  const rows = await db
    .select(reportSelection)
    .from(reports)
    .innerJoin(
      reporterProfiles,
      eq(reports.reporterId, reporterProfiles.userId),
    )
    .leftJoin(
      assigneeProfiles,
      eq(reports.assignedToId, assigneeProfiles.userId),
    )
    .where(condition)
    .orderBy(desc(reports.createdAt))
    .limit(100)

  const resourceIds = {
    post: rows
      .filter((report) => report.resourceType === 'post')
      .map((report) => report.resourceId),
    comment: rows
      .filter((report) => report.resourceType === 'comment')
      .map((report) => report.resourceId),
    chat: rows
      .filter((report) => report.resourceType === 'chat')
      .map((report) => report.resourceId),
    message: rows
      .filter((report) => report.resourceType === 'message')
      .map((report) => report.resourceId),
    user: rows
      .filter((report) => report.resourceType === 'user')
      .map((report) => report.resourceId),
  }

  const [
    postResources,
    commentResources,
    chatResources,
    messageResources,
    userResources,
  ] = await Promise.all([
    resourceIds.post.length
      ? db
          .select({
            id: posts.id,
            content: posts.content,
            imageUrl: posts.imageUrl,
            author: {
              id: profiles.userId,
              username: profiles.username,
              displayName: profiles.displayName,
              avatarUrl: profiles.avatarUrl,
            },
          })
          .from(posts)
          .innerJoin(profiles, eq(posts.authorId, profiles.userId))
          .where(inArray(posts.id, resourceIds.post))
      : Promise.resolve([]),
    resourceIds.comment.length
      ? db
          .select({
            id: comments.id,
            content: comments.content,
            postId: comments.postId,
            author: {
              id: profiles.userId,
              username: profiles.username,
              displayName: profiles.displayName,
              avatarUrl: profiles.avatarUrl,
            },
          })
          .from(comments)
          .innerJoin(profiles, eq(comments.authorId, profiles.userId))
          .where(inArray(comments.id, resourceIds.comment))
      : Promise.resolve([]),
    resourceIds.chat.length
      ? db
          .select({ id: chats.id, name: chats.name, type: chats.type })
          .from(chats)
          .where(inArray(chats.id, resourceIds.chat))
      : Promise.resolve([]),
    resourceIds.message.length
      ? db
          .select({
            id: messages.id,
            chatId: messages.chatId,
            content: messages.content,
            type: messages.type,
            sender: {
              id: profiles.userId,
              username: profiles.username,
              displayName: profiles.displayName,
              avatarUrl: profiles.avatarUrl,
            },
          })
          .from(messages)
          .innerJoin(profiles, eq(messages.senderId, profiles.userId))
          .where(inArray(messages.id, resourceIds.message))
      : Promise.resolve([]),
    resourceIds.user.length
      ? db
          .select({
            id: profiles.userId,
            username: profiles.username,
            displayName: profiles.displayName,
            avatarUrl: profiles.avatarUrl,
          })
          .from(profiles)
          .where(inArray(profiles.userId, resourceIds.user))
      : Promise.resolve([]),
  ])

  const resources = new Map<string, object>()
  for (const resource of postResources)
    resources.set(`post:${resource.id}`, resource)
  for (const resource of commentResources)
    resources.set(`comment:${resource.id}`, resource)
  for (const resource of chatResources)
    resources.set(`chat:${resource.id}`, resource)
  for (const resource of messageResources)
    resources.set(`message:${resource.id}`, resource)
  for (const resource of userResources)
    resources.set(`user:${resource.id}`, resource)

  return rows.map((report) => ({
    ...report,
    assignedTo: report.assignedTo.id ? report.assignedTo : null,
    resource:
      resources.get(`${report.resourceType}:${report.resourceId}`) ?? null,
  }))
}

async function resourceIsVisible(
  resourceType: z.infer<typeof resourceTypeSchema>,
  resourceId: string,
  currentUser: AuthenticatedUser,
) {
  switch (resourceType) {
    case 'post': {
      const post = await getPostForUser(resourceId, currentUser)
      if (post?.author.id === currentUser.id) {
        throw new ApiError(
          400,
          'CANNOT_REPORT_OWN_CONTENT',
          'No puedes reportar tu propio contenido.',
        )
      }
      return Boolean(post)
    }

    case 'comment': {
      const [comment] = await db
        .select({ authorId: comments.authorId, postId: comments.postId })
        .from(comments)
        .where(eq(comments.id, resourceId))
        .limit(1)
      if (comment?.authorId === currentUser.id) {
        throw new ApiError(
          400,
          'CANNOT_REPORT_OWN_CONTENT',
          'No puedes reportar tu propio contenido.',
        )
      }
      return Boolean(
        comment && (await getPostForUser(comment.postId, currentUser)),
      )
    }

    case 'chat': {
      const [participant] = await db
        .select({ chatId: chatParticipants.chatId })
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.chatId, resourceId),
            eq(chatParticipants.userId, currentUser.id),
          ),
        )
        .limit(1)
      return Boolean(participant)
    }

    case 'message': {
      const [message] = await db
        .select({ id: messages.id, senderId: messages.senderId })
        .from(messages)
        .innerJoin(
          chatParticipants,
          eq(messages.chatId, chatParticipants.chatId),
        )
        .where(
          and(
            eq(messages.id, resourceId),
            eq(chatParticipants.userId, currentUser.id),
          ),
        )
        .limit(1)
      if (message?.senderId === currentUser.id) {
        throw new ApiError(
          400,
          'CANNOT_REPORT_OWN_CONTENT',
          'No puedes reportar tu propio contenido.',
        )
      }
      return Boolean(message)
    }

    case 'user': {
      if (resourceId === currentUser.id) {
        throw new ApiError(
          400,
          'CANNOT_REPORT_SELF',
          'No puedes reportar tu propia cuenta.',
        )
      }

      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, resourceId), eq(users.status, 'active')))
        .limit(1)
      return Boolean(user)
    }
  }
}

export const reportsRouter = Router()

reportsRouter.use(requireAuthentication)

reportsRouter.post('/', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(createReportSchema, request.body)

  if (
    !(await resourceIsVisible(
      input.resourceType,
      input.resourceId,
      currentUser,
    ))
  ) {
    throw new ApiError(
      404,
      'REPORT_RESOURCE_NOT_FOUND',
      'El recurso que intentas reportar no existe o no está disponible.',
    )
  }

  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.reporterId, currentUser.id),
        eq(reports.resourceType, input.resourceType),
        eq(reports.resourceId, input.resourceId),
        inArray(reports.status, ['pending', 'reviewing']),
      ),
    )
    .limit(1)

  if (existing) {
    throw new ApiError(
      409,
      'REPORT_ALREADY_OPEN',
      'Ya tienes un reporte abierto para este recurso.',
    )
  }

  const [created] = await db
    .insert(reports)
    .values({
      reporterId: currentUser.id,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      reason: input.reason,
      details: input.details,
    })
    .returning({ id: reports.id })

  if (!created) throw new Error('Database did not return the created report')

  const [report] = await loadReports(eq(reports.id, created.id))
  response.status(201).json({ report })
})

reportsRouter.use(requireModerator)

reportsRouter.get('/', async (request, response) => {
  const status = parseStatusFilter(request.query.status)
  response.json({
    reports: await loadReports(status ? eq(reports.status, status) : undefined),
  })
})

reportsRouter.patch('/:reportId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const reportId = parseReportId(request.params.reportId)
  const input = parseBody(updateReportSchema, request.body)
  const [updated] = await db
    .update(reports)
    .set({
      status: input.status,
      assignedToId: input.status === 'pending' ? null : currentUser.id,
      updatedAt: new Date(),
    })
    .where(eq(reports.id, reportId))
    .returning({
      id: reports.id,
      reporterId: reports.reporterId,
    })

  if (!updated) {
    throw new ApiError(404, 'REPORT_NOT_FOUND', 'El reporte no existe.')
  }

  await createNotification({
    userId: updated.reporterId,
    actorId: currentUser.id,
    type: 'moderation',
    title: 'Reporte actualizado',
    body: `Tu reporte ahora está ${input.status}.`,
    href: `report:${updated.id}`,
    resourceId: updated.id,
  })

  const [report] = await loadReports(eq(reports.id, updated.id))
  response.json({ report })
})
