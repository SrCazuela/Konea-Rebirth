import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import {
  connections,
  notifications,
  posts,
  reports,
  uploadedFiles,
  users,
} from '../db/schema.js'
import { UPLOAD_DIRECTORY } from './uploads.js'

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
  let projectUploadName = ''
  let achievementUploadName = ''

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
    if (projectUploadName) {
      await rm(join(UPLOAD_DIRECTORY, projectUploadName), { force: true })
    }
    if (achievementUploadName) {
      await rm(join(UPLOAD_DIRECTORY, achievementUploadName), { force: true })
    }
    await closeDatabaseConnection()
  })

  it('requires authentication for the feed', async () => {
    const response = await request(app).get('/api/v1/posts')
    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('updates and returns the current student profile', async () => {
    const catalog = await firstAgent.get('/api/v1/profile/catalog')
    expect(catalog.status).toBe(200)
    expect(catalog.body.catalog.institutions).toContain('Duoc UC')
    expect(catalog.body.catalog.campuses).toContain('Sede San Joaquín')
    expect(catalog.body.catalog.careers).toContain('Ingeniería en Informática')

    const invalidCatalogValue = await firstAgent
      .patch('/api/v1/profile')
      .send({ institution: 'Institución inventada' })
    expect(invalidCatalogValue.status).toBe(400)
    expect(invalidCatalogValue.body.error.code).toBe('INVALID_INSTITUTION')

    const unsafeWebsite = await firstAgent
      .patch('/api/v1/profile')
      .send({ website: 'javascript:alert(1)' })
    expect(unsafeWebsite.status).toBe(400)
    expect(unsafeWebsite.body.error.code).toBe('VALIDATION_ERROR')

    const unsafeAchievementImage = await firstAgent
      .patch('/api/v1/profile')
      .send({
        achievements: [
          {
            id: randomUUID(),
            title: 'Certificación insegura',
            issuer: 'Emisor de prueba',
            issuedAt: '2026-10',
            description: 'No debe aceptar protocolos ejecutables.',
            credentialUrl: null,
            imageUrl: 'javascript:alert(1)',
          },
        ],
      })
    expect(unsafeAchievementImage.status).toBe(400)
    expect(unsafeAchievementImage.body.error.code).toBe('VALIDATION_ERROR')

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
      institution: 'Duoc UC',
      campus: 'Sede San Joaquín',
      career: 'Ingeniería en Informática',
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
      institution: 'Duoc UC',
      campus: 'Sede San Joaquín',
      career: 'Ingeniería en Informática',
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
    const unsafeImage = await firstAgent.post('/api/v1/posts').send({
      content: 'No se debe aceptar un protocolo ejecutable.',
      imageUrl: 'data:text/html,malicioso',
    })
    expect(unsafeImage.status).toBe(400)
    expect(unsafeImage.body.error.code).toBe('VALIDATION_ERROR')

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

    const postReport = await secondAgent.post('/api/v1/reports').send({
      resourceType: 'post',
      resourceId: sharedPostId,
      reason: 'Prueba de limpieza al eliminar',
    })
    expect(postReport.status).toBe(201)
    const commentReport = await firstAgent.post('/api/v1/reports').send({
      resourceType: 'comment',
      resourceId: comment.body.comment.id,
      reason: 'Prueba de limpieza del comentario',
    })
    expect(commentReport.status).toBe(201)

    const ownerDelete = await firstAgent.delete(`/api/v1/posts/${sharedPostId}`)
    expect(ownerDelete.status).toBe(204)
    expect(
      await db
        .select({ id: reports.id })
        .from(reports)
        .where(
          inArray(reports.resourceId, [sharedPostId, comment.body.comment.id]),
        ),
    ).toHaveLength(0)
    expect(
      await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.resourceId, sharedPostId)),
    ).toHaveLength(0)
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

  it('validates portfolio image ownership, serves project and achievement images to visitors, and enforces the total quota', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('portfolio-test-image'),
    ])
    const upload = await firstAgent
      .post('/api/v1/uploads/files')
      .attach('file', png, {
        filename: 'portfolio.png',
        contentType: 'image/png',
      })
    expect(upload.status).toBe(201)
    projectUploadName = upload.body.file.name

    const achievementUpload = await firstAgent
      .post('/api/v1/uploads/files')
      .attach('file', png, {
        filename: 'certificate.png',
        contentType: 'image/png',
      })
    expect(achievementUpload.status).toBe(201)
    achievementUploadName = achievementUpload.body.file.name

    const projectId = randomUUID()
    const achievementId = randomUUID()
    const profileUpdate = await firstAgent.patch('/api/v1/profile').send({
      projects: [
        {
          id: projectId,
          title: 'Proyecto Konea',
          description: 'Imagen visible dentro del portafolio.',
          url: null,
          repositoryUrl: null,
          imageUrl: upload.body.file.url,
          technologies: ['TypeScript'],
        },
      ],
      achievements: [
        {
          id: achievementId,
          title: 'Certificación profesional',
          issuer: 'Entidad certificadora',
          issuedAt: '2026-10',
          description: 'Certificado visible dentro del portafolio.',
          credentialUrl: null,
          imageUrl: achievementUpload.body.file.url,
        },
      ],
    })
    expect(profileUpdate.status).toBe(200)
    expect(profileUpdate.body.user).toMatchObject({
      projects: [
        {
          id: projectId,
          imageUrl: upload.body.file.url,
        },
      ],
      achievements: [
        {
          id: achievementId,
          imageUrl: achievementUpload.body.file.url,
        },
      ],
    })

    const publicProfile = await secondAgent.get(`/api/v1/users/${firstUserId}`)
    expect(publicProfile.status).toBe(200)
    expect(publicProfile.body.user).toMatchObject({
      projects: [{ id: projectId, imageUrl: upload.body.file.url }],
      achievements: [
        {
          id: achievementId,
          imageUrl: achievementUpload.body.file.url,
        },
      ],
    })

    await secondAgent.get(upload.body.file.url).expect(200)
    await secondAgent.get(achievementUpload.body.file.url).expect(200)

    const foreignAchievementImage = await secondAgent
      .patch('/api/v1/profile')
      .send({
        achievements: [
          {
            id: randomUUID(),
            title: 'Certificación ajena',
            issuer: 'Entidad certificadora',
            issuedAt: null,
            description: 'No debe poder reutilizar un archivo ajeno.',
            credentialUrl: null,
            imageUrl: achievementUpload.body.file.url,
          },
        ],
      })
    expect(foreignAchievementImage.status).toBe(403)
    expect(foreignAchievementImage.body.error.code).toBe(
      'UPLOAD_OWNERSHIP_REQUIRED',
    )

    await db.insert(uploadedFiles).values({
      ownerId: firstUserId,
      storedName: '33333333-3333-4333-8333-333333333333.pdf',
      originalName: 'quota-reservation.pdf',
      mimeType: 'application/pdf',
      size: 100 * 1024 * 1024,
    })
    const quotaExceeded = await firstAgent
      .post('/api/v1/uploads/files')
      .attach('file', png, {
        filename: 'over-quota.png',
        contentType: 'image/png',
      })
    expect(quotaExceeded.status).toBe(413)
    expect(quotaExceeded.body.error.code).toBe('UPLOAD_QUOTA_EXCEEDED')
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

    const moderatorView = await firstAgent.get(
      `/api/v1/posts/${pendingPost?.id}`,
    )
    expect(moderatorView.body.post.canDelete).toBe(false)
    const moderatorDelete = await firstAgent.delete(
      `/api/v1/posts/${pendingPost?.id}`,
    )
    expect(moderatorDelete.status).toBe(403)
    expect(moderatorDelete.body.error.code).toBe('INSUFFICIENT_PERMISSIONS')
  })
})
