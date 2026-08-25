import { and, asc, eq, sql } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { db } from '../db/client.js'
import { comments, postLikes, posts, profiles } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import {
  getFeedPosts,
  getLikeCount,
  getPostForUser,
} from '../services/post-service.js'
import { ensureLocallyAppropriate } from '../services/content-moderation.js'
import { createNotification } from '../services/notification-service.js'
import { requireOwnedLocalUpload } from '../services/upload-service.js'

const createPostSchema = z.strictObject({
  content: z.string().trim().min(1).max(2_000),
  contentType: z.enum(['announcement', 'community']).default('community'),
  visibility: z.enum(['campus', 'connections', 'public']).default('campus'),
  imageUrl: z
    .union([
      z.string().trim().url().max(2_048),
      z
        .string()
        .trim()
        .regex(/^\/api\/v1\/uploads\/files\/[a-zA-Z0-9._-]+$/),
    ])
    .optional(),
})

const createCommentSchema = z.strictObject({
  content: z.string().trim().min(1).max(1_000),
  parentCommentId: z.string().uuid().optional(),
})

const updateCommentSchema = z.strictObject({
  content: z.string().trim().min(1).max(1_000),
})

const uuidSchema = z.string().uuid()

function parseId(value: string | undefined) {
  const result = uuidSchema.safeParse(value)

  if (!result.success) {
    throw new ApiError(
      400,
      'INVALID_IDENTIFIER',
      'Se requiere un identificador válido.',
    )
  }

  return result.data
}

export const postsRouter = Router()

postsRouter.use(requireAuthentication)

postsRouter.get('/', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const feedPosts = await getFeedPosts(currentUser)
  response.json({ posts: feedPosts })
})

postsRouter.post('/', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(createPostSchema, request.body)
  ensureLocallyAppropriate(input.content)
  await requireOwnedLocalUpload(currentUser.id, input.imageUrl, 'image')

  if (
    input.contentType === 'announcement' &&
    currentUser.role !== 'professor' &&
    currentUser.role !== 'moderator' &&
    currentUser.role !== 'admin'
  ) {
    throw new ApiError(
      403,
      'ANNOUNCEMENT_ROLE_REQUIRED',
      'Solo profesores, moderadores y administradores pueden publicar anuncios.',
    )
  }

  const requiresApproval =
    env.POSTS_REQUIRE_APPROVAL && currentUser.role === 'student'

  const [createdPost] = await db
    .insert(posts)
    .values({
      authorId: currentUser.id,
      content: input.content,
      contentType: input.contentType,
      visibility: input.visibility,
      imageUrl: input.imageUrl,
      moderationStatus: requiresApproval ? 'pending' : 'approved',
    })
    .returning({ id: posts.id })

  if (!createdPost) {
    throw new Error('Database did not return the created post')
  }

  const post = await getPostForUser(createdPost.id, currentUser)
  response.status(201).json({ post })
})

postsRouter.get('/:postId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const post = await getPostForUser(postId, currentUser)

  if (!post) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'La publicación no existe.')
  }

  response.json({ post })
})

postsRouter.delete('/:postId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const post = await getPostForUser(postId, currentUser)

  if (!post) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'La publicación no existe.')
  }

  if (!post.canDelete) {
    throw new ApiError(
      403,
      'INSUFFICIENT_PERMISSIONS',
      'No puedes eliminar esta publicación.',
    )
  }

  await db.delete(posts).where(eq(posts.id, postId))
  response.status(204).send()
})

postsRouter.post('/:postId/likes', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const post = await getPostForUser(postId, currentUser)

  if (!post) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'La publicación no existe.')
  }

  const inserted = await db
    .insert(postLikes)
    .values({ postId, userId: currentUser.id })
    .onConflictDoNothing()
    .returning({ postId: postLikes.postId })

  if (inserted.length) {
    await createNotification({
      userId: post.author.id,
      actorId: currentUser.id,
      type: 'like',
      title: 'Nueva reacción',
      body: `${currentUser.displayName} indicó que le gusta tu publicación.`,
      href: `post:${postId}`,
      resourceId: postId,
    })
  }

  response.json({ liked: true, likeCount: await getLikeCount(postId) })
})

postsRouter.delete('/:postId/likes', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const post = await getPostForUser(postId, currentUser)

  if (!post) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'La publicación no existe.')
  }

  await db
    .delete(postLikes)
    .where(
      and(eq(postLikes.postId, postId), eq(postLikes.userId, currentUser.id)),
    )

  response.json({ liked: false, likeCount: await getLikeCount(postId) })
})

postsRouter.get('/:postId/comments', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const post = await getPostForUser(postId, currentUser)

  if (!post) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'La publicación no existe.')
  }

  const postComments = await db
    .select({
      id: comments.id,
      content: comments.content,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorId: comments.authorId,
      author: {
        id: profiles.userId,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      },
    })
    .from(comments)
    .innerJoin(profiles, eq(comments.authorId, profiles.userId))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt))

  response.json({
    comments: postComments.map(({ authorId, ...comment }) => ({
      ...comment,
      canEdit: authorId === currentUser.id,
      canDelete:
        authorId === currentUser.id ||
        currentUser.role === 'moderator' ||
        currentUser.role === 'admin',
    })),
  })
})

postsRouter.post('/:postId/comments', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const post = await getPostForUser(postId, currentUser)

  if (!post) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'La publicación no existe.')
  }

  const input = parseBody(createCommentSchema, request.body)
  ensureLocallyAppropriate(input.content)

  let parentAuthorId: string | undefined
  if (input.parentCommentId) {
    const [parent] = await db
      .select({ authorId: comments.authorId, postId: comments.postId })
      .from(comments)
      .where(eq(comments.id, input.parentCommentId))
      .limit(1)
    if (!parent || parent.postId !== postId) {
      throw new ApiError(
        400,
        'INVALID_PARENT_COMMENT',
        'La respuesta debe pertenecer a esta publicación.',
      )
    }
    parentAuthorId = parent.authorId
  }

  const [createdComment] = await db
    .insert(comments)
    .values({
      postId,
      authorId: currentUser.id,
      content: input.content,
      parentCommentId: input.parentCommentId,
    })
    .returning({
      id: comments.id,
      content: comments.content,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
    })

  if (!createdComment) {
    throw new Error('Database did not return the created comment')
  }

  const notificationUserId = parentAuthorId ?? post.author.id
  await createNotification({
    userId: notificationUserId,
    actorId: currentUser.id,
    type: input.parentCommentId ? 'reply' : 'comment',
    title: input.parentCommentId ? 'Nueva respuesta' : 'Nuevo comentario',
    body: input.parentCommentId
      ? `${currentUser.displayName} respondió a tu comentario.`
      : `${currentUser.displayName} comentó tu publicación.`,
    href: `post:${postId}`,
    resourceId: postId,
  })

  response.status(201).json({
    comment: {
      ...createdComment,
      canEdit: true,
      canDelete: true,
      author: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
      },
    },
  })
})

postsRouter.patch('/:postId/comments/:commentId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const commentId = parseId(request.params.commentId)
  const input = parseBody(updateCommentSchema, request.body)
  ensureLocallyAppropriate(input.content)

  const [comment] = await db
    .select({ authorId: comments.authorId, postId: comments.postId })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1)
  if (!comment || comment.postId !== postId) {
    throw new ApiError(404, 'COMMENT_NOT_FOUND', 'El comentario no existe.')
  }
  if (comment.authorId !== currentUser.id) {
    throw new ApiError(
      403,
      'INSUFFICIENT_PERMISSIONS',
      'No puedes editar este comentario.',
    )
  }

  const [updated] = await db
    .update(comments)
    .set({ content: input.content, updatedAt: new Date() })
    .where(eq(comments.id, commentId))
    .returning({
      id: comments.id,
      content: comments.content,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
    })
  response.json({
    comment: {
      ...updated,
      canEdit: true,
      canDelete: true,
      author: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
      },
    },
  })
})

postsRouter.delete(
  '/:postId/comments/:commentId',
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const postId = parseId(request.params.postId)
    const commentId = parseId(request.params.commentId)
    const [comment] = await db
      .select({ authorId: comments.authorId, postId: comments.postId })
      .from(comments)
      .where(eq(comments.id, commentId))
      .limit(1)
    if (!comment || comment.postId !== postId) {
      throw new ApiError(404, 'COMMENT_NOT_FOUND', 'El comentario no existe.')
    }
    const canDelete =
      comment.authorId === currentUser.id ||
      currentUser.role === 'moderator' ||
      currentUser.role === 'admin'
    if (!canDelete) {
      throw new ApiError(
        403,
        'INSUFFICIENT_PERMISSIONS',
        'No puedes eliminar este comentario.',
      )
    }
    await db.delete(comments).where(eq(comments.id, commentId))
    response.status(204).send()
  },
)

postsRouter.post('/:postId/shares', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const postId = parseId(request.params.postId)
  const post = await getPostForUser(postId, currentUser)
  if (!post) {
    throw new ApiError(404, 'POST_NOT_FOUND', 'La publicación no existe.')
  }
  const [updated] = await db
    .update(posts)
    .set({
      shareCount: sql`${posts.shareCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, postId))
    .returning({ shareCount: posts.shareCount })
  response.json({ shareCount: updated?.shareCount ?? post.shareCount })
})
