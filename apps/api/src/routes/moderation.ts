import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { posts } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody, parseId } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
  requireModerator,
} from '../middleware/authentication.js'
import { getModerationPosts, getPostForUser } from '../services/post-service.js'

const moderationDecisionSchema = z
  .strictObject({
    status: z.enum(['approved', 'rejected']),
    reason: z.string().trim().max(500).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.status === 'rejected' &&
      (!value.reason || value.reason.length < 3)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'El motivo de rechazo debe tener al menos 3 caracteres.',
      })
    }
  })

const moderationStatusFilterSchema = z
  .enum(['pending', 'approved', 'rejected'])
  .optional()

export const moderationRouter = Router()

moderationRouter.use(requireAuthentication, requireModerator)

moderationRouter.get('/posts', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const parsedStatus = moderationStatusFilterSchema.safeParse(
    request.query.status,
  )
  if (!parsedStatus.success) {
    throw new ApiError(
      400,
      'INVALID_MODERATION_STATUS',
      'El estado de moderaci\u00f3n no es v\u00e1lido.',
    )
  }
  response.json({
    posts: await getModerationPosts(currentUser, parsedStatus.data),
  })
})

moderationRouter.patch('/posts/:postId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const input = parseBody(moderationDecisionSchema, request.body)
  const existingPost = await getPostForUser(postId, currentUser)

  if (!existingPost) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'La publicación no existe.')
  }

  await db
    .update(posts)
    .set({
      moderationStatus: input.status,
      moderationReason: input.status === 'rejected' ? input.reason : null,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId))

  response.json({ post: await getPostForUser(postId, currentUser) })
})
