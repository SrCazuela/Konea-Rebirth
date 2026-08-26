import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { users } from '../db/schema.js'

function account(label: string) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  return {
    email: `${label}-${suffix}@konea.test`,
    password: 'CampusSeguro2026!',
    username: `${label}_${suffix}`,
    displayName: `${label} ${suffix}`,
  }
}

describe.sequential('private connections and portfolio API', () => {
  const app = createApp()
  const firstAgent = request.agent(app)
  const secondAgent = request.agent(app)
  const firstAccount = account('connectionone')
  const secondAccount = account('connectiontwo')
  let firstUserId = ''
  let secondUserId = ''

  beforeAll(async () => {
    const first = await firstAgent
      .post('/api/v1/auth/register')
      .send(firstAccount)
    const second = await secondAgent
      .post('/api/v1/auth/register')
      .send(secondAccount)
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    firstUserId = first.body.user.id
    secondUserId = second.body.user.id
  })

  afterAll(async () => {
    await db
      .delete(users)
      .where(inArray(users.email, [firstAccount.email, secondAccount.email]))
    await closeDatabaseConnection()
  })

  it('does not expose a global people directory', async () => {
    const response = await firstAgent.get('/api/v1/users')
    expect(response.status).toBe(404)
  })

  it('publishes a bounded academic portfolio without private account fields', async () => {
    const educationId = randomUUID()
    const projectId = randomUUID()
    const achievementId = randomUUID()
    const updated = await firstAgent.patch('/api/v1/profile').send({
      education: [
        {
          id: educationId,
          institution: 'Duoc UC',
          program: 'Ingeniería en Informática',
          startYear: 2023,
          endYear: null,
          current: true,
        },
      ],
      projects: [
        {
          id: projectId,
          title: 'Konea',
          description: 'Plataforma universitaria segura.',
          url: 'https://konea.example',
          repositoryUrl: null,
          imageUrl: null,
          technologies: ['React', 'PostgreSQL'],
        },
      ],
      achievements: [
        {
          id: achievementId,
          title: 'Capstone destacado',
          issuer: 'DUOC UC',
          issuedAt: '2026-08',
          description: 'Reconocimiento académico.',
          credentialUrl: null,
        },
      ],
    })
    expect(updated.status).toBe(200)

    const response = await secondAgent.get(`/api/v1/users/${firstUserId}`)
    expect(response.status).toBe(200)
    expect(response.body.user).toMatchObject({
      id: firstUserId,
      username: firstAccount.username,
      connectionStatus: 'none',
      stats: { projects: 1, achievements: 1 },
      education: [{ id: educationId, institution: 'Duoc UC' }],
      projects: [{ id: projectId, title: 'Konea' }],
      achievements: [{ id: achievementId, title: 'Capstone destacado' }],
    })
    expect(response.body.user).not.toHaveProperty('email')
  })

  it('keeps a one-sided request private and connects only after reciprocity', async () => {
    const firstRequest = await firstAgent.post(
      `/api/v1/users/${secondUserId}/connection-request`,
    )
    expect(firstRequest.status).toBe(200)
    expect(firstRequest.body).toEqual({
      connectionStatus: 'requested',
      matched: false,
    })

    const recipientProfile = await secondAgent.get(
      `/api/v1/users/${firstUserId}`,
    )
    expect(recipientProfile.body.user.connectionStatus).toBe('none')
    const beforeMatch = await secondAgent.get('/api/v1/notifications')
    expect(beforeMatch.body.notifications).toHaveLength(0)

    const reciprocal = await secondAgent.post(
      `/api/v1/users/${firstUserId}/connection-request`,
    )
    expect(reciprocal.body).toEqual({
      connectionStatus: 'connected',
      matched: true,
    })

    const firstConnections = await firstAgent.get('/api/v1/users/connections')
    const secondConnections = await secondAgent.get('/api/v1/users/connections')
    expect(
      firstConnections.body.users.map((user: { id: string }) => user.id),
    ).toEqual([secondUserId])
    expect(
      secondConnections.body.users.map((user: { id: string }) => user.id),
    ).toEqual([firstUserId])
    const afterMatch = await firstAgent.get('/api/v1/notifications')
    expect(afterMatch.body.notifications[0]).toMatchObject({
      type: 'connection',
      actor: { id: secondUserId },
    })
  })

  it('removes a mutual connection for both people', async () => {
    const removed = await firstAgent.delete(
      `/api/v1/users/${secondUserId}/connection`,
    )
    expect(removed.body).toEqual({ connectionStatus: 'none' })
    const connections = await secondAgent.get('/api/v1/users/connections')
    expect(connections.body.users).toEqual([])
    const deniedChat = await firstAgent
      .post('/api/v1/chats/direct')
      .send({ userId: secondUserId })
    expect(deniedChat.status).toBe(403)
    expect(deniedChat.body.error.code).toBe('CONNECTION_REQUIRED')
  })
})
