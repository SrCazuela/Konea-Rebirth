import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { connections, posts, uploadedFiles, users } from '../db/schema.js'

function testAccount(label: string) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  return {
    email: `${label}-${suffix}@konea.test`,
    password: 'CampusSeguro2026!',
    username: `${label}_${suffix}`,
    displayName: `${label} ${suffix}`,
  }
}

describe.sequential('authenticated portal API', () => {
  const app = createApp()
  const firstAgent = request.agent(app)
  const secondAgent = request.agent(app)
  const firstAccount = testAccount('studentone')
  const secondAccount = testAccount('studenttwo')
  const createdEmails = [firstAccount.email, secondAccount.email]
  let firstUserId = ''
  let secondUserId = ''
  let sharedPostId = ''

  beforeAll(async () => {
    const firstRegistration = await firstAgent
      .post('/api/v1/auth/register')
      .send(firstAccount)
    const secondRegistration = await secondAgent
      .post('/api/v1/auth/register')
      .send(secondAccount)

    expect(firstRegistration.status).toBe(201)
    expect(secondRegistration.status).toBe(201)
    firstUserId = firstRegistration.body.user.id
    secondUserId = secondRegistration.body.user.id

    await db.insert(uploadedFiles).values([
      {
        ownerId: firstUserId,
        storedName: '11111111-1111-4111-8111-111111111111.png',
        originalName: 'avatar.png',
        mimeType: 'image/png',
        size: 100,
      },
      {
        ownerId: firstUserId,
        storedName: '22222222-2222-4222-8222-222222222222.webp',
        originalName: 'cover.webp',
        mimeType: 'image/webp',
        size: 200,
      },
    ])
  })

  afterAll(async () => {
    await db.delete(users).where(inArray(users.email, createdEmails))
    await closeDatabaseConnection()
  })

  it('requires authentication for the feed', async () => {
    const response = await request(app).get('/api/v1/posts')
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('updates and returns the current student profile', async () => {
    const emptyProfileUpdate = await secondAgent.patch('/api/v1/profile').send({
      username: secondAccount.username,
      displayName: secondAccount.displayName,
      bio: null,
      institution: null,
      career: null,
      avatarUrl: null,
    })
    expect(emptyProfileUpdate.status).toBe(200)

    const updatedUsername = `updated_${firstUserId.slice(0, 8)}`
    const response = await firstAgent.patch('/api/v1/profile').send({
      username: updatedUsername,
      displayName: 'Estudiante Uno',
      bio: 'Me interesa colaborar en proyectos tecnológicos.',
      institution: 'Universidad Konea',
      career: 'Ingeniería Informática',
      avatarUrl:
        '/api/v1/uploads/files/11111111-1111-4111-8111-111111111111.png',
      coverUrl:
        '/api/v1/uploads/files/22222222-2222-4222-8222-222222222222.webp',
    })

    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      id: firstUserId,
      username: updatedUsername,
      displayName: 'Estudiante Uno',
      institution: 'Universidad Konea',
      career: 'Ingeniería Informática',
      avatarUrl:
        '/api/v1/uploads/files/11111111-1111-4111-8111-111111111111.png',
    })

    const conflict = await secondAgent.patch('/api/v1/profile').send({
      username: updatedUsername,
    })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('USERNAME_ALREADY_EXISTS')
  })

  it('creates a post and supports likes, comments and ownership checks', async () => {
    const creation = await firstAgent.post('/api/v1/posts').send({
      content: '¿Alguien quiere preparar el próximo proyecto en equipo?',
      visibility: 'campus',
    })

    expect(creation.status).toBe(201)
    expect(creation.body.post.moderationStatus).toBe('approved')
    expect(creation.body.post.contentType).toBe('community')
    sharedPostId = creation.body.post.id

    const secondFeed = await secondAgent.get('/api/v1/posts')
    expect(secondFeed.status).toBe(200)
    expect(
      secondFeed.body.posts.map((post: { id: string }) => post.id),
    ).toContain(sharedPostId)

    const firstLike = await secondAgent.post(
      `/api/v1/posts/${sharedPostId}/likes`,
    )
    const repeatedLike = await secondAgent.post(
      `/api/v1/posts/${sharedPostId}/likes`,
    )
    expect(firstLike.body).toEqual({ liked: true, likeCount: 1 })
    expect(repeatedLike.body).toEqual({ liked: true, likeCount: 1 })

    const comment = await secondAgent
      .post(`/api/v1/posts/${sharedPostId}/comments`)
      .send({ content: '¡Me sumo! Podemos coordinarnos esta semana.' })
    expect(comment.status).toBe(201)
    expect(comment.body.comment.author.id).toBe(secondUserId)

    const reply = await firstAgent
      .post(`/api/v1/posts/${sharedPostId}/comments`)
      .send({
        content: 'Perfecto, te escribo para coordinarnos.',
        parentCommentId: comment.body.comment.id,
      })
    expect(reply.status).toBe(201)
    expect(reply.body.comment.parentCommentId).toBe(comment.body.comment.id)

    const editedReply = await firstAgent
      .patch(`/api/v1/posts/${sharedPostId}/comments/${reply.body.comment.id}`)
      .send({ content: 'Perfecto, coordinemos esta semana.' })
    expect(editedReply.status).toBe(200)
    expect(editedReply.body.comment.content).toContain('esta semana')

    const commentsResponse = await firstAgent.get(
      `/api/v1/posts/${sharedPostId}/comments`,
    )
    expect(commentsResponse.status).toBe(200)
    expect(commentsResponse.body.comments).toHaveLength(2)

    const updatedFeed = await firstAgent.get('/api/v1/posts')
    const updatedPost = updatedFeed.body.posts.find(
      (post: { id: string }) => post.id === sharedPostId,
    )
    expect(updatedPost).toMatchObject({ likeCount: 1, commentCount: 2 })

    const share = await secondAgent.post(`/api/v1/posts/${sharedPostId}/shares`)
    expect(share.body.shareCount).toBe(1)

    const forbiddenDelete = await secondAgent.delete(
      `/api/v1/posts/${sharedPostId}`,
    )
    expect(forbiddenDelete.status).toBe(403)
  })

  it('enforces announcement roles and connections visibility', async () => {
    const forbiddenAnnouncement = await secondAgent.post('/api/v1/posts').send({
      content: 'Anuncio que un estudiante no puede publicar.',
      contentType: 'announcement',
      visibility: 'campus',
    })
    expect(forbiddenAnnouncement.status).toBe(403)
    expect(forbiddenAnnouncement.body.error.code).toBe(
      'ANNOUNCEMENT_ROLE_REQUIRED',
    )

    const privatePost = await firstAgent.post('/api/v1/posts').send({
      content: 'Contenido exclusivo para mis conexiones.',
      contentType: 'community',
      visibility: 'connections',
    })
    expect(privatePost.status).toBe(201)

    const hiddenFeed = await secondAgent.get('/api/v1/posts')
    expect(
      hiddenFeed.body.posts.map((post: { id: string }) => post.id),
    ).not.toContain(privatePost.body.post.id)

    const [userOneId, userTwoId] = [secondUserId, firstUserId].sort()
    if (!userOneId || !userTwoId) throw new Error('Invalid test connection')
    await db.insert(connections).values({ userOneId, userTwoId })
    const visibleFeed = await secondAgent.get('/api/v1/posts')
    expect(
      visibleFeed.body.posts.map((post: { id: string }) => post.id),
    ).toContain(privatePost.body.post.id)
  })

  it('restricts moderation to roles and publishes an approved item', async () => {
    const studentAttempt = await secondAgent.get('/api/v1/moderation/posts')
    expect(studentAttempt.status).toBe(403)

    await db
      .update(users)
      .set({ role: 'moderator', updatedAt: new Date() })
      .where(eq(users.id, firstUserId))

    const [pendingPost] = await db
      .insert(posts)
      .values({
        authorId: secondUserId,
        content: 'Publicación que requiere revisión manual.',
        moderationStatus: 'pending',
      })
      .returning({ id: posts.id })

    expect(pendingPost).toBeDefined()

    const queue = await firstAgent.get(
      '/api/v1/moderation/posts?status=pending',
    )
    expect(queue.status).toBe(200)
    expect(queue.body.posts.map((post: { id: string }) => post.id)).toContain(
      pendingPost?.id,
    )

    const missingReason = await firstAgent
      .patch(`/api/v1/moderation/posts/${pendingPost?.id}`)
      .send({ status: 'rejected' })
    expect(missingReason.status).toBe(400)

    const approval = await firstAgent
      .patch(`/api/v1/moderation/posts/${pendingPost?.id}`)
      .send({ status: 'approved' })
    expect(approval.status).toBe(200)
    expect(approval.body.post.moderationStatus).toBe('approved')

    const history = await firstAgent.get(
      '/api/v1/moderation/posts?status=approved',
    )
    expect(history.status).toBe(200)
    expect(
      history.body.posts.find(
        (post: { id: string }) => post.id === pendingPost?.id,
      )?.moderationStatus,
    ).toBe('approved')

    const invalidFilter = await firstAgent.get(
      '/api/v1/moderation/posts?status=unknown',
    )
    expect(invalidFilter.status).toBe(400)
    expect(invalidFilter.body.error.code).toBe('INVALID_MODERATION_STATUS')

    const studentFeed = await secondAgent.get('/api/v1/posts')
    expect(
      studentFeed.body.posts.map((post: { id: string }) => post.id),
    ).toContain(pendingPost?.id)
  })
})
