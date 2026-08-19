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

describe.sequential('people and connections API', () => {
  const app = createApp()
  const firstAgent = request.agent(app)
  const secondAgent = request.agent(app)
  const firstAccount = account('peopleone')
  const secondAccount = account('peopletwo')
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

  it('searches profiles without exposing private account fields', async () => {
    const response = await firstAgent
      .get('/api/v1/users')
      .query({ q: secondAccount.username })
    expect(response.status).toBe(200)
    expect(response.body.users).toHaveLength(1)
    expect(response.body.users[0]).toMatchObject({
      id: secondUserId,
      username: secondAccount.username,
      followedByMe: false,
    })
    expect(response.body.users[0]).not.toHaveProperty('email')
  })

  it('follows idempotently and exposes public profile statistics', async () => {
    const firstFollow = await firstAgent.post(
      `/api/v1/users/${secondUserId}/follow`,
    )
    const repeatedFollow = await firstAgent.post(
      `/api/v1/users/${secondUserId}/follow`,
    )
    expect(firstFollow.status).toBe(200)
    expect(repeatedFollow.status).toBe(200)
    expect(repeatedFollow.body).toEqual({ followed: true, followersCount: 1 })

    const profile = await firstAgent.get(`/api/v1/users/${secondUserId}`)
    expect(profile.status).toBe(200)
    expect(profile.body.user).toMatchObject({
      followedByMe: true,
      stats: { followers: 1 },
    })
    expect(profile.body.posts).toEqual([])

    const followers = await secondAgent.get(
      `/api/v1/users/${secondUserId}/followers`,
    )
    expect(followers.body.users.map((user: { id: string }) => user.id)).toContain(
      firstUserId,
    )
  })

  it('blocks self-follow and can unfollow', async () => {
    const selfFollow = await firstAgent.post(
      `/api/v1/users/${firstUserId}/follow`,
    )
    expect(selfFollow.status).toBe(400)
    expect(selfFollow.body.error.code).toBe('CANNOT_FOLLOW_SELF')

    const unfollow = await firstAgent.delete(
      `/api/v1/users/${secondUserId}/follow`,
    )
    expect(unfollow.body).toEqual({ followed: false, followersCount: 0 })
  })
})
