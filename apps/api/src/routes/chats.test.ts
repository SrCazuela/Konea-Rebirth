import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { notifications, users } from '../db/schema.js'

function testAccount(label: string) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  return {
    email: `${label}-${suffix}@konea.test`,
    password: 'CampusSeguro2026!',
    username: `${label}_${suffix}`,
    displayName: `${label} ${suffix}`,
  }
}

describe.sequential('chat, collaboration and QR API', () => {
  const app = createApp()
  const firstAgent = request.agent(app)
  const secondAgent = request.agent(app)
  const thirdAgent = request.agent(app)
  const firstAccount = testAccount('chatone')
  const secondAccount = testAccount('chattwo')
  const thirdAccount = testAccount('chatthree')
  const createdEmails = [
    firstAccount.email,
    secondAccount.email,
    thirdAccount.email,
  ]
  let firstUserId = ''
  let secondUserId = ''
  let thirdUserId = ''
  let directChatId = ''
  let groupChatId = ''

  beforeAll(async () => {
    const [first, second, third] = await Promise.all([
      firstAgent.post('/api/v1/auth/register').send(firstAccount),
      secondAgent.post('/api/v1/auth/register').send(secondAccount),
      thirdAgent.post('/api/v1/auth/register').send(thirdAccount),
    ])
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(third.status).toBe(201)
    firstUserId = first.body.user.id
    secondUserId = second.body.user.id
    thirdUserId = third.body.user.id
  })

  afterAll(async () => {
    await db.delete(users).where(inArray(users.email, createdEmails))
    await closeDatabaseConnection()
  })

  it('protects chat routes and creates one idempotent direct chat', async () => {
    await request(app).get('/api/v1/chats').expect(401)
    await firstAgent
      .post('/api/v1/chats/direct')
      .send({ userId: firstUserId })
      .expect(400)

    const created = await firstAgent
      .post('/api/v1/chats/direct')
      .send({ userId: secondUserId })
    expect(created.status).toBe(201)
    expect(created.body.created).toBe(true)
    directChatId = created.body.chat.id
    expect(created.body.chat.participants).toHaveLength(2)

    const repeated = await secondAgent
      .post('/api/v1/chats/direct')
      .send({ userId: firstUserId })
    expect(repeated.status).toBe(200)
    expect(repeated.body.created).toBe(false)
    expect(repeated.body.chat.id).toBe(directChatId)

    const denied = await thirdAgent.get(`/api/v1/chats/${directChatId}`)
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe('CHAT_ACCESS_DENIED')
  })

  it('creates and manages a group with server-side role checks', async () => {
    const created = await firstAgent.post('/api/v1/chats/groups').send({
      name: 'Proyecto Capstone',
      participantIds: [secondUserId, secondUserId],
    })
    expect(created.status).toBe(201)
    groupChatId = created.body.chat.id
    expect(created.body.chat.type).toBe('group')
    expect(created.body.chat.participants).toHaveLength(2)

    const forbidden = await secondAgent
      .post(`/api/v1/chats/${groupChatId}/participants`)
      .send({ userId: thirdUserId })
    expect(forbidden.status).toBe(403)

    const added = await firstAgent
      .post(`/api/v1/chats/${groupChatId}/participants`)
      .send({ userId: thirdUserId, role: 'member' })
    expect(added.status).toBe(201)
    expect(added.body.participants).toHaveLength(3)

    const ownerDemotion = await firstAgent
      .post(`/api/v1/chats/${groupChatId}/participants`)
      .send({ userId: firstUserId, role: 'member' })
    expect(ownerDemotion.status).toBe(409)
    expect(ownerDemotion.body.error.code).toBe('OWNER_ROLE_IMMUTABLE')

    const duplicateParticipant = await firstAgent
      .post(`/api/v1/chats/${groupChatId}/participants`)
      .send({ userId: secondUserId, role: 'admin' })
    expect(duplicateParticipant.status).toBe(409)
    expect(duplicateParticipant.body.error.code).toBe(
      'PARTICIPANT_ALREADY_ACTIVE',
    )

    const edited = await firstAgent
      .patch(`/api/v1/chats/${groupChatId}`)
      .send({ name: 'Capstone Konea' })
    expect(edited.status).toBe(200)
    expect(edited.body.chat.name).toBe('Capstone Konea')
  })

  it('sends searchable tagged/file messages and tracks unread state', async () => {
    const sent = await firstAgent
      .post(`/api/v1/chats/${directChatId}/messages`)
      .send({
        content: 'Revisemos la arquitectura del proyecto',
        tags: ['important', 'question', 'important'],
      })
    expect(sent.status).toBe(201)
    expect(sent.body.message.tags).toEqual(['important', 'question'])

    const unread = await secondAgent.get('/api/v1/chats/unread-count')
    expect(unread.status).toBe(200)
    expect(unread.body.unreadCount).toBeGreaterThanOrEqual(1)

    const search = await secondAgent.get(
      `/api/v1/chats/${directChatId}/messages?q=arquitectura&tag=important`,
    )
    expect(search.status).toBe(200)
    expect(search.body.messages).toHaveLength(1)
    expect(search.body.messages[0].sender.id).toBe(firstUserId)

    const file = await secondAgent
      .post(`/api/v1/chats/${directChatId}/messages`)
      .send({
        type: 'file',
        content: 'Documento del proyecto',
        fileUrl: 'https://files.konea.test/capstone.pdf',
        fileName: 'capstone.pdf',
        fileSize: 42_000,
        tags: ['resources'],
      })
    expect(file.status).toBe(201)
    expect(file.body.message.type).toBe('file')

    const longMessage = await firstAgent
      .post(`/api/v1/chats/${directChatId}/messages`)
      .send({ content: 'x'.repeat(4_000) })
    expect(longMessage.status).toBe(201)
    const [longMessageNotification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.resourceId, longMessage.body.message.id))
      .limit(1)
    expect(longMessageNotification?.body.length).toBeLessThanOrEqual(500)

    const read = await secondAgent.post(`/api/v1/chats/${directChatId}/read`)
    expect(read.status).toBe(200)
    expect(read.body.unreadCount).toBe(0)
    const chat = await secondAgent.get(`/api/v1/chats/${directChatId}`)
    expect(chat.body.chat.unreadCount).toBe(0)

    const notificationRows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, secondUserId),
          eq(notifications.resourceId, sent.body.message.id),
        ),
      )
    expect(notificationRows).toHaveLength(1)
  })

  it('paginates messages without exposing them to outsiders', async () => {
    for (const number of [1, 2, 3]) {
      await firstAgent
        .post(`/api/v1/chats/${directChatId}/messages`)
        .send({ content: `Mensaje paginado ${number}` })
        .expect(201)
    }
    const firstPage = await secondAgent.get(
      `/api/v1/chats/${directChatId}/messages?limit=2`,
    )
    expect(firstPage.status).toBe(200)
    expect(firstPage.body.messages).toHaveLength(2)
    expect(firstPage.body.pageInfo.hasMore).toBe(true)
    expect(firstPage.body.pageInfo.nextBefore).toBeTruthy()
    expect(firstPage.body.pageInfo.nextBeforeId).toBeTruthy()

    const secondPage = await secondAgent.get(
      `/api/v1/chats/${directChatId}/messages?limit=2&before=${encodeURIComponent(firstPage.body.pageInfo.nextBefore)}&beforeId=${firstPage.body.pageInfo.nextBeforeId}`,
    )
    expect(secondPage.status).toBe(200)
    expect(secondPage.body.messages.length).toBeGreaterThan(0)
    const firstPageIds = new Set(
      firstPage.body.messages.map((message: { id: string }) => message.id),
    )
    expect(
      secondPage.body.messages.every(
        (message: { id: string }) => !firstPageIds.has(message.id),
      ),
    ).toBe(true)

    await thirdAgent.get(`/api/v1/chats/${directChatId}/messages`).expect(403)
  })

  it('creates, assigns and protects chat tasks', async () => {
    const created = await firstAgent
      .post(`/api/v1/chats/${groupChatId}/tasks`)
      .send({
        assignedToId: secondUserId,
        title: 'Preparar demostración',
        priority: 'high',
        dueDate: '2026-09-01',
      })
    expect(created.status).toBe(201)
    const taskId = created.body.task.id

    const forbiddenEdit = await secondAgent
      .patch(`/api/v1/chats/${groupChatId}/tasks/${taskId}`)
      .send({ title: 'Cambio no autorizado' })
    expect(forbiddenEdit.status).toBe(403)

    const completed = await secondAgent
      .patch(`/api/v1/chats/${groupChatId}/tasks/${taskId}`)
      .send({ status: 'completed' })
    expect(completed.status).toBe(200)
    expect(completed.body.task.status).toBe('completed')

    await thirdAgent
      .delete(`/api/v1/chats/${groupChatId}/tasks/${taskId}`)
      .expect(403)
    await firstAgent
      .delete(`/api/v1/chats/${groupChatId}/tasks/${taskId}`)
      .expect(204)

    const taskNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, secondUserId),
          eq(notifications.resourceId, taskId),
        ),
      )
    expect(taskNotifications).toHaveLength(1)
  })

  it('creates polls and replaces a single-choice vote transactionally', async () => {
    const created = await firstAgent
      .post(`/api/v1/chats/${directChatId}/polls`)
      .send({
        question: '¿Qué tecnología usamos?',
        options: ['PostgreSQL', 'SQLite', 'MongoDB'],
        allowMultiple: false,
      })
    expect(created.status).toBe(201)
    const poll = created.body.poll
    expect(poll.options).toHaveLength(3)

    const firstVote = await secondAgent
      .post(`/api/v1/polls/${poll.id}/votes`)
      .send({ optionIds: [poll.options[0].id] })
    expect(firstVote.status).toBe(200)
    expect(firstVote.body.poll.voteCount).toBe(1)
    expect(firstVote.body.poll.options[0].votedByMe).toBe(true)

    const replacement = await secondAgent
      .post(`/api/v1/polls/${poll.id}/votes`)
      .send({ optionIds: [poll.options[1].id] })
    expect(replacement.status).toBe(200)
    expect(replacement.body.poll.voteCount).toBe(1)
    expect(replacement.body.poll.options[0].votedByMe).toBe(false)
    expect(replacement.body.poll.options[1].votedByMe).toBe(true)

    await thirdAgent.get(`/api/v1/polls/${poll.id}`).expect(403)
  })

  it('generates short-lived personal QR codes and redeems them idempotently', async () => {
    const generated = await thirdAgent.post('/api/v1/qr-codes/personal')
    expect(generated.status).toBe(201)
    expect(generated.body.qrCode.code).toMatch(/^[A-Z0-9]{6}$/)

    await thirdAgent
      .post('/api/v1/qr-codes/redeem')
      .send({ code: generated.body.qrCode.code })
      .expect(400)

    const redeemed = await firstAgent
      .post('/api/v1/qr-codes/redeem')
      .send({ code: generated.body.qrCode.code })
    expect([200, 201]).toContain(redeemed.status)
    expect(redeemed.body.redemptionRepeated).toBe(false)

    const repeated = await firstAgent
      .post('/api/v1/qr-codes/redeem')
      .send({ code: generated.body.qrCode.code })
    expect(repeated.status).toBe(200)
    expect(repeated.body.chatId).toBe(redeemed.body.chatId)
    expect(repeated.body.redemptionRepeated).toBe(true)

    const alreadyUsed = await secondAgent
      .post('/api/v1/qr-codes/redeem')
      .send({ code: generated.body.qrCode.code })
    expect(alreadyUsed.status).toBe(409)
    const current = await thirdAgent.get('/api/v1/qr-codes/current')
    expect(current.body.qrCode).toBeNull()
  })
})
