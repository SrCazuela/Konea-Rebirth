import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import cookieParser from 'cookie-parser'
import express, { type ErrorRequestHandler } from 'express'
import { eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { closeDatabaseConnection, db } from '../db/client.js'
import {
  chats,
  chatParticipants,
  notifications,
  posts,
  profiles,
  tasks,
  users,
} from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { authRouter } from './auth.js'
import { auxiliaryRouter } from './auxiliary.js'
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

function createAuxiliaryTestApp() {
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1', auxiliaryRouter)

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    if (error instanceof ApiError) {
      response.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      })
      return
    }

    response.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    })
  }

  app.use(errorHandler)
  return app
}

describe.sequential('auxiliary backend routes', () => {
  const app = createAuxiliaryTestApp()
  const studentAgent = request.agent(app)
  const moderatorAgent = request.agent(app)
  const studentAccount = testAccount('auxstudent')
  const moderatorAccount = testAccount('auxmoderator')
  const createdEmails = [studentAccount.email, moderatorAccount.email]
  const uploadedFiles: string[] = []
  let studentId = ''
  let moderatorId = ''
  let notificationId = ''
  let reportablePostId = ''

  beforeAll(async () => {
    const studentRegistration = await studentAgent
      .post('/api/v1/auth/register')
      .send(studentAccount)
    const moderatorRegistration = await moderatorAgent
      .post('/api/v1/auth/register')
      .send(moderatorAccount)

    expect(studentRegistration.status).toBe(201)
    expect(moderatorRegistration.status).toBe(201)
    studentId = studentRegistration.body.user.id
    moderatorId = moderatorRegistration.body.user.id

    await db
      .update(users)
      .set({ role: 'moderator', updatedAt: new Date() })
      .where(eq(users.id, moderatorId))

    const [chat] = await db
      .insert(chats)
      .values({
        type: 'group',
        name: 'Planificación Capstone',
        createdById: studentId,
      })
      .returning({ id: chats.id })

    if (!chat) throw new Error('Test chat was not created')

    await db.insert(chatParticipants).values({
      chatId: chat.id,
      userId: studentId,
      role: 'owner',
    })

    await db.insert(tasks).values({
      chatId: chat.id,
      createdById: studentId,
      assignedToId: studentId,
      title: 'Preparar entrega Capstone',
      description: 'Revisar documentación y demostración.',
      dueDate: '2026-09-01',
      priority: 'high',
    })

    const [post] = await db
      .insert(posts)
      .values({
        authorId: moderatorId,
        content: 'Publicación disponible para probar el sistema de reportes.',
        moderationStatus: 'approved',
      })
      .returning({ id: posts.id })

    if (!post) throw new Error('Test post was not created')
    reportablePostId = post.id

    const [notification] = await db
      .insert(notifications)
      .values({
        userId: studentId,
        actorId: moderatorId,
        type: 'task',
        title: 'Nueva tarea',
        body: 'Tienes una tarea de Capstone pendiente.',
        resourceId: chat.id,
      })
      .returning({ id: notifications.id })

    if (!notification) throw new Error('Test notification was not created')
    notificationId = notification.id
  })

  afterAll(async () => {
    await db.delete(users).where(inArray(users.email, createdEmails))

    await Promise.all(
      uploadedFiles.map((fileName) =>
        rm(join(UPLOAD_DIRECTORY, fileName), { force: true }),
      ),
    )
    await closeDatabaseConnection()
  })

  it('requires a session before using auxiliary resources', async () => {
    const notificationsResponse = await request(app).get(
      '/api/v1/notifications',
    )
    const ducoResponse = await request(app).get('/api/v1/duco/messages')
    const uploadResponse = await request(app)
      .post('/api/v1/uploads/files')
      .attach('file', Buffer.from('not an image'), {
        filename: 'test.png',
        contentType: 'image/png',
      })

    expect(notificationsResponse.status).toBe(401)
    expect(ducoResponse.status).toBe(401)
    expect(uploadResponse.status).toBe(401)
  })

  it('stores and serves only size-limited files with valid MIME signatures', async () => {
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('local-test-image'),
    ])
    const upload = await studentAgent
      .post('/api/v1/uploads/files')
      .attach('file', png, {
        filename: '../avatar.png',
        contentType: 'image/png',
      })

    expect(upload.status).toBe(201)
    expect(upload.body.file).toMatchObject({
      originalName: 'avatar.png',
      mimeType: 'image/png',
      size: png.length,
    })
    expect(upload.body.file.url).toMatch(
      /^\/api\/v1\/uploads\/files\/[0-9a-f-]+\.png$/,
    )
    uploadedFiles.push(upload.body.file.name)

    const download = await studentAgent.get(upload.body.file.url)
    expect(download.status).toBe(200)
    expect(download.headers['content-type']).toContain('image/png')
    expect(download.headers['x-content-type-options']).toBe('nosniff')

    const privateDownload = await moderatorAgent.get(upload.body.file.url)
    expect(privateDownload.status).toBe(404)
    expect(privateDownload.body.error.code).toBe('UPLOAD_NOT_FOUND')

    await db
      .update(profiles)
      .set({ avatarUrl: upload.body.file.url })
      .where(eq(profiles.userId, studentId))
    await moderatorAgent.get(upload.body.file.url).expect(200)

    const unsupported = await studentAgent
      .post('/api/v1/uploads/files')
      .attach('file', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
    expect(unsupported.status).toBe(415)
    expect(unsupported.body.error.code).toBe('UNSUPPORTED_FILE_TYPE')

    const spoofed = await studentAgent
      .post('/api/v1/uploads/files')
      .attach('file', Buffer.from('not really a png'), {
        filename: 'spoofed.png',
        contentType: 'image/png',
      })
    expect(spoofed.status).toBe(415)
    expect(spoofed.body.error.code).toBe('FILE_SIGNATURE_MISMATCH')

    const oversized = await studentAgent
      .post('/api/v1/uploads/files')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'large.pdf',
        contentType: 'application/pdf',
      })
    expect(oversized.status).toBe(413)
    expect(oversized.body.error.code).toBe('UPLOAD_TOO_LARGE')
  })

  it('lists notifications with actor data and marks one or all as read', async () => {
    const list = await studentAgent.get('/api/v1/notifications')
    expect(list.status).toBe(200)
    expect(list.body.unreadCount).toBe(1)
    expect(list.body.notifications[0]).toMatchObject({
      id: notificationId,
      actor: {
        id: moderatorId,
        username: moderatorAccount.username,
        displayName: moderatorAccount.displayName,
      },
    })

    const count = await studentAgent.get('/api/v1/notifications/unread-count')
    expect(count.body).toEqual({ unreadCount: 1 })

    const forbidden = await moderatorAgent.patch(
      `/api/v1/notifications/${notificationId}/read`,
    )
    expect(forbidden.status).toBe(404)

    const marked = await studentAgent.patch(
      `/api/v1/notifications/${notificationId}/read`,
    )
    expect(marked.status).toBe(200)
    expect(marked.body.notification.id).toBe(notificationId)
    expect(marked.body.notification.readAt).toBeTruthy()

    await db.insert(notifications).values({
      userId: studentId,
      type: 'task',
      title: 'Recordatorio',
      body: 'Revisa tu próxima entrega.',
    })

    const markedAll = await studentAgent.post('/api/v1/notifications/read-all')
    expect(markedAll.body).toEqual({ updated: true })

    const emptyCount = await studentAgent.get(
      '/api/v1/notifications/unread-count',
    )
    expect(emptyCount.body).toEqual({ unreadCount: 0 })
  })

  it('synchronizes a private AVA calendar without persisting its URL', async () => {
    const calendarUrl =
      'https://campusvirtual.duoc.cl/webapps/calendar/calendarFeed/test_token/learn.ics'
    const calendar = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:capstone-deadline@blackboard\r
DTSTART:20300901T160000Z\r
SUMMARY:Entrega final Capstone\r
CATEGORIES:Proyecto de Título\r
END:VEVENT\r
END:VCALENDAR\r
`
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(calendar, {
        status: 200,
        headers: { 'Content-Type': 'text/calendar' },
      }),
    )

    try {
      const sync = await studentAgent.post('/api/v1/ava-calendar/sync').send({
        calendarUrl,
      })
      expect(sync.status).toBe(200)
      expect(sync.body).toMatchObject({
        importedCount: 1,
        upcomingCount: 1,
        events: [
          {
            title: 'Entrega final Capstone',
            courseName: 'Proyecto de Título',
          },
        ],
      })
      expect(JSON.stringify(sync.body)).not.toContain('calendarFeed')

      const stored = await studentAgent.get('/api/v1/ava-calendar')
      expect(stored.status).toBe(200)
      expect(stored.body.sync).toMatchObject({ lastEventCount: 1 })
      expect(stored.body.events).toHaveLength(1)

      const invalid = await studentAgent
        .post('/api/v1/ava-calendar/sync')
        .send({ calendarUrl: 'https://example.com/private.ics' })
      expect(invalid.status).toBe(400)
      expect(invalid.body.error.code).toBe('INVALID_AVA_CALENDAR_URL')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('manages personal subjects and academic tasks', async () => {
    const initial = await studentAgent.get('/api/v1/academic')
    expect(initial.status).toBe(200)
    expect(initial.body.courses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Proyecto de Título',
          source: 'ava',
        }),
      ]),
    )

    const courseCreation = await studentAgent
      .post('/api/v1/academic/courses')
      .send({
        name: 'Arquitectura de Software',
        code: 'ASY4131',
        section: '001D',
        term: 'Segundo semestre 2030',
      })
    expect(courseCreation.status).toBe(201)
    expect(courseCreation.body.course).toMatchObject({
      name: 'Arquitectura de Software',
      section: '001D',
      source: 'manual',
    })
    const courseId = courseCreation.body.course.id

    const duplicate = await studentAgent.post('/api/v1/academic/courses').send({
      name: '  ARQUITECTURA   DE SOFTWARE ',
    })
    expect(duplicate.status).toBe(409)

    const taskCreation = await studentAgent
      .post('/api/v1/academic/tasks')
      .send({
        courseId,
        title: 'Preparar diagrama de arquitectura',
        description: 'Completar los componentes antes de la revisión.',
        dueAt: '2030-09-03T18:00:00.000Z',
        priority: 'high',
      })
    expect(taskCreation.status).toBe(201)
    expect(taskCreation.body.task).toMatchObject({
      courseId,
      priority: 'high',
      status: 'pending',
    })
    const taskId = taskCreation.body.task.id

    const completed = await studentAgent
      .patch(`/api/v1/academic/tasks/${taskId}`)
      .send({ status: 'completed' })
    expect(completed.status).toBe(200)
    expect(completed.body.task.status).toBe('completed')

    const dashboard = await studentAgent.get('/api/v1/academic')
    expect(dashboard.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: taskId,
          title: 'Preparar diagrama de arquitectura',
          status: 'completed',
        }),
      ]),
    )
  })

  it('persists DUCO history and builds a local answer from assigned tasks', async () => {
    const reply = await studentAgent.post('/api/v1/duco/messages').send({
      content: 'Organiza mis tareas pendientes',
    })

    expect(reply.status).toBe(201)
    expect(reply.body.openTaskCount).toBe(2)
    expect(reply.body.userMessage).toMatchObject({
      role: 'user',
      content: 'Organiza mis tareas pendientes',
    })
    expect(reply.body.assistantMessage.role).toBe('assistant')
    expect(reply.body.assistantMessage.content).toContain(
      'Preparar entrega Capstone',
    )

    const history = await studentAgent.get('/api/v1/duco/messages')
    expect(history.status).toBe(200)
    expect(
      history.body.messages.map((message: { role: string }) => message.role),
    ).toEqual(['user', 'assistant'])

    const cleared = await studentAgent.delete('/api/v1/duco/messages')
    expect(cleared.body).toEqual({ deletedCount: 2 })
    const emptyHistory = await studentAgent.get('/api/v1/duco/messages')
    expect(emptyHistory.body.messages).toEqual([])
  })

  it('lets DUCO suggest and create an editable academic pending item once', async () => {
    const reply = await studentAgent.post('/api/v1/duco/messages').send({
      content:
        'Tengo que realizar una guía de algoritmos matemáticos para la asignatura Fundamentos de Matemáticas.',
    })

    expect(reply.status).toBe(201)
    expect(reply.body.assistantMessage).toMatchObject({
      role: 'assistant',
      action: {
        type: 'create_task',
        label: 'Crear pendiente',
        draft: {
          priority: 'medium',
          courseName: 'Fundamentos de Matemáticas',
        },
        task: null,
      },
    })
    expect(reply.body.assistantMessage.content).toContain(
      'no realizar una entrega completa',
    )

    const sourceMessageId = reply.body.assistantMessage.id
    const creation = await studentAgent.post('/api/v1/duco/tasks').send({
      sourceMessageId,
      title: 'Guía de algoritmos matemáticos',
      description: 'Resolver y revisar la guía antes de la próxima clase.',
      courseName: 'Fundamentos de Matemáticas',
      dueAt: '2030-09-05T20:00:00.000Z',
      priority: 'high',
    })

    expect(creation.status).toBe(201)
    expect(creation.body.task).toMatchObject({
      title: 'Guía de algoritmos matemáticos',
      priority: 'high',
      status: 'pending',
    })
    expect(creation.body.action.task).toEqual({ id: creation.body.task.id })

    const duplicate = await studentAgent.post('/api/v1/duco/tasks').send({
      sourceMessageId,
      title: 'No debe duplicarse',
      description: '',
      courseName: null,
      dueAt: null,
      priority: 'low',
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error.code).toBe('DUCO_TASK_ALREADY_CREATED')

    const dashboard = await studentAgent.get('/api/v1/academic')
    expect(dashboard.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: creation.body.task.id,
          title: 'Guía de algoritmos matemáticos',
        }),
      ]),
    )

    await studentAgent.delete('/api/v1/duco/messages').expect(200)
  })

  it('treats an explicit request to schedule a new task as creation', async () => {
    const reply = await studentAgent.post('/api/v1/duco/messages').send({
      content: 'Lo sé, pero me gustaría agendar una nueva tarea.',
    })

    expect(reply.status).toBe(201)
    expect(reply.body.assistantMessage).toMatchObject({
      role: 'assistant',
      action: {
        type: 'create_task',
        label: 'Crear pendiente',
        draft: {
          title: 'Nueva tarea académica',
          priority: 'medium',
        },
        task: null,
      },
    })
    expect(reply.body.assistantMessage.content).toContain('Próximas tareas')

    await studentAgent.delete('/api/v1/duco/messages').expect(200)
  })

  it('does not confuse academic help with listing existing tasks', async () => {
    const reply = await studentAgent.post('/api/v1/duco/messages').send({
      content: 'Perfecto, muchas gracias. ¿Me ayudas con mi tarea?',
    })

    expect(reply.status).toBe(201)
    expect(reply.body.assistantMessage.action).toBeNull()
    expect(reply.body.assistantMessage.content).toContain(
      'ayudarte a entender los contenidos',
    )
    expect(reply.body.assistantMessage.content).not.toContain(
      'No tienes tareas pendientes',
    )

    await studentAgent.delete('/api/v1/duco/messages').expect(200)
  })

  it('lets DUCO prepare an editable request and only sends it after confirmation', async () => {
    const incompleteReply = await studentAgent
      .post('/api/v1/duco/messages')
      .send({
        content:
          'Necesito solicitar un cambio de sección porque mi horario se superpone.',
      })

    expect(incompleteReply.status).toBe(201)
    expect(incompleteReply.body.assistantMessage.action).toBeNull()
    expect(incompleteReply.body.assistantMessage.content).toContain(
      'Antes de mostrar el botón',
    )
    expect(incompleteReply.body.assistantMessage.content).toContain(
      'la asignatura',
    )

    const reply = await studentAgent.post('/api/v1/duco/messages').send({
      content:
        'La asignatura es Capstone, mi sección actual es 001D y el motivo es que se superpone con otra clase.',
    })

    expect(reply.status).toBe(201)
    expect(reply.body.assistantMessage).toMatchObject({
      role: 'assistant',
      action: {
        type: 'manage_request',
        label: 'Gestionar solicitud',
        draft: { category: 'section_change', urgency: 'medium' },
      },
      request: null,
    })
    expect(reply.body.aiProvider).toBe('local')

    const sourceMessageId = reply.body.assistantMessage.id
    const creation = await studentAgent.post('/api/v1/duco/requests').send({
      sourceMessageId,
      category: 'section_change',
      subject: 'Cambio de sección para Capstone',
      description:
        'Solicito cambiarme de sección porque el horario actual se superpone con otra asignatura.',
      desiredOutcome:
        'Quedar inscrito en una sección sin conflicto de horario.',
      urgency: 'medium',
    })

    expect(creation.status).toBe(201)
    expect(creation.body.request).toMatchObject({
      requesterId: studentId,
      sourceMessageId,
      category: 'section_change',
      subject: 'Cambio de sección para Capstone',
      status: 'pending',
    })
    const supportRequestId = creation.body.request.id

    const duplicate = await studentAgent.post('/api/v1/duco/requests').send({
      sourceMessageId,
      category: 'section_change',
      subject: 'Intento duplicado',
      description: 'Esta solicitud no debería volver a ser creada.',
      desiredOutcome: '',
      urgency: 'low',
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error.code).toBe('DUCO_REQUEST_ALREADY_SENT')

    const history = await studentAgent.get('/api/v1/duco/messages')
    const linkedMessage = history.body.messages.find(
      (message: { id: string }) => message.id === sourceMessageId,
    )
    expect(linkedMessage.request).toEqual({
      id: supportRequestId,
      status: 'pending',
    })

    const moderatorList = await moderatorAgent.get('/api/v1/duco/requests/all')
    expect(moderatorList.status).toBe(200)
    expect(
      moderatorList.body.requests.map((item: { id: string }) => item.id),
    ).toContain(supportRequestId)

    const updated = await moderatorAgent
      .patch(`/api/v1/duco/requests/${supportRequestId}`)
      .send({ status: 'reviewing' })
    expect(updated.status).toBe(200)
    expect(updated.body.request).toMatchObject({
      id: supportRequestId,
      status: 'reviewing',
      assignedToId: moderatorId,
    })

    const moderatorNotifications = await moderatorAgent.get(
      '/api/v1/notifications',
    )
    expect(
      moderatorNotifications.body.notifications.some(
        (notification: { resourceId: string; type: string }) =>
          notification.resourceId === supportRequestId &&
          notification.type === 'support_request',
      ),
    ).toBe(true)

    await studentAgent.delete('/api/v1/duco/messages').expect(200)
    const ownRequests = await studentAgent.get('/api/v1/duco/requests')
    expect(ownRequests.status).toBe(200)
    expect(
      ownRequests.body.requests.find(
        (item: { id: string }) => item.id === supportRequestId,
      ),
    ).toMatchObject({ status: 'reviewing', sourceMessageId: null })
  })

  it('asks about immediate safety before offering a wellbeing request', async () => {
    const initial = await studentAgent.post('/api/v1/duco/messages').send({
      content:
        'En mi clase me están hostigando y tengo pensamientos suicidas y de atentar contra la institución.',
    })

    expect(initial.status).toBe(201)
    expect(initial.body.assistantMessage.action).toBeNull()
    expect(initial.body.assistantMessage.content).toContain('peligro inmediato')
    expect(initial.body.assistantMessage.content).toContain(
      'no ha contactado automáticamente a nadie',
    )

    const followUp = await studentAgent.post('/api/v1/duco/messages').send({
      content:
        'No estoy en peligro inmediato y no tengo un plan. Los insultos ocurrieron hoy dentro de mi clase.',
    })

    expect(followUp.status).toBe(201)
    expect(followUp.body.assistantMessage).toMatchObject({
      action: {
        type: 'manage_request',
        draft: { category: 'wellbeing', urgency: 'high' },
      },
    })
    expect(
      followUp.body.assistantMessage.action.draft.description,
    ).not.toContain('Antes de preparar una solicitud')

    await studentAgent.delete('/api/v1/duco/messages').expect(200)

    const selfHarmOnly = await studentAgent.post('/api/v1/duco/messages').send({
      content: 'Últimamente he tenido pensamientos suicidas.',
    })
    expect(selfHarmOnly.body.assistantMessage.action).toBeNull()
    expect(selfHarmOnly.body.assistantMessage.content).toContain(
      'peligro inmediato',
    )
    await studentAgent.delete('/api/v1/duco/messages').expect(200)
  })

  it('accepts user reports and restricts review state to moderators', async () => {
    const ownContent = await moderatorAgent.post('/api/v1/reports').send({
      resourceType: 'post',
      resourceId: reportablePostId,
      reason: 'Autorreporte inválido',
    })
    expect(ownContent.status).toBe(400)
    expect(ownContent.body.error.code).toBe('CANNOT_REPORT_OWN_CONTENT')

    const creation = await studentAgent.post('/api/v1/reports').send({
      resourceType: 'post',
      resourceId: reportablePostId,
      reason: 'Información engañosa',
      details: 'Solicito que el equipo de moderación revise el contenido.',
    })

    expect(creation.status).toBe(201)
    expect(creation.body.report).toMatchObject({
      resourceType: 'post',
      resourceId: reportablePostId,
      status: 'pending',
      reporter: { id: studentId },
      resource: {
        id: reportablePostId,
        content: 'Publicación disponible para probar el sistema de reportes.',
        author: { id: moderatorId },
      },
    })
    const reportId = creation.body.report.id

    const duplicate = await studentAgent.post('/api/v1/reports').send({
      resourceType: 'post',
      resourceId: reportablePostId,
      reason: 'Reporte repetido',
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.error.code).toBe('REPORT_ALREADY_OPEN')

    const studentList = await studentAgent.get('/api/v1/reports')
    expect(studentList.status).toBe(403)

    const moderatorList = await moderatorAgent.get(
      '/api/v1/reports?status=pending',
    )
    expect(moderatorList.status).toBe(200)
    expect(
      moderatorList.body.reports.map((report: { id: string }) => report.id),
    ).toContain(reportId)

    const studentDecision = await studentAgent
      .patch(`/api/v1/reports/${reportId}`)
      .send({ status: 'resolved' })
    expect(studentDecision.status).toBe(403)

    const decision = await moderatorAgent
      .patch(`/api/v1/reports/${reportId}`)
      .send({ status: 'resolved' })
    expect(decision.status).toBe(200)
    expect(decision.body.report).toMatchObject({
      id: reportId,
      status: 'resolved',
      assignedTo: { id: moderatorId },
    })
  })
})
