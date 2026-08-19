import { randomUUID } from 'node:crypto'
import { inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { users } from '../db/schema.js'

type TestAccount = ReturnType<typeof createTestAccount>

const createdEmails: string[] = []

function createTestAccount() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  const account = {
    email: `student-${suffix}@konea.test`,
    password: 'CampusSeguro2026!',
    username: `student_${suffix}`,
    displayName: `Student ${suffix}`,
  }

  createdEmails.push(account.email)
  return account
}

describe('authentication API', () => {
  const app = createApp()

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await db.delete(users).where(inArray(users.email, createdEmails))
    }
    await closeDatabaseConnection()
  })

  it('registers a student and maintains a revocable cookie session', async () => {
    const account = createTestAccount()
    const agent = request.agent(app)

    const registration = await agent.post('/api/v1/auth/register').send(account)

    expect(registration.status).toBe(201)
    expect(registration.body.user).toMatchObject({
      email: account.email,
      username: account.username,
      displayName: account.displayName,
      role: 'student',
      status: 'active',
    })
    expect(registration.body.user).not.toHaveProperty('passwordHash')
    expect(registration.headers['set-cookie']?.[0]).toContain('HttpOnly')
    expect(registration.headers['set-cookie']?.[0]).toContain('SameSite=Lax')

    const authenticated = await agent.get('/api/v1/auth/me')
    expect(authenticated.status).toBe(200)
    expect(authenticated.body.user.email).toBe(account.email)

    const logout = await agent.post('/api/v1/auth/logout')
    expect(logout.status).toBe(204)

    const afterLogout = await agent.get('/api/v1/auth/me')
    expect(afterLogout.status).toBe(401)
    expect(afterLogout.body.error.code).toBe('AUTHENTICATION_REQUIRED')
  })

  it('logs in with valid credentials and rejects an incorrect password', async () => {
    const account = createTestAccount()
    await request(app).post('/api/v1/auth/register').send(account).expect(201)

    const incorrect = await request(app).post('/api/v1/auth/login').send({
      email: account.email,
      password: 'IncorrectPassword',
    })

    expect(incorrect.status).toBe(401)
    expect(incorrect.body.error.code).toBe('INVALID_CREDENTIALS')

    const login = await request(app).post('/api/v1/auth/login').send({
      email: account.email.toUpperCase(),
      password: account.password,
    })

    expect(login.status).toBe(200)
    expect(login.body.user.email).toBe(account.email)
    expect(login.headers['set-cookie']?.[0]).toContain('konea_session=')
  })

  it('rejects duplicate accounts and malformed registration data', async () => {
    const account = createTestAccount()
    await request(app).post('/api/v1/auth/register').send(account).expect(201)

    const duplicate: TestAccount = {
      ...account,
      username: `${account.username}_other`,
    }
    const conflict = await request(app)
      .post('/api/v1/auth/register')
      .send(duplicate)

    expect(conflict.status).toBe(409)
    expect(conflict.body.error.code).toBe('ACCOUNT_ALREADY_EXISTS')

    const invalid = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'short',
      username: 'invalid username',
      displayName: '',
    })

    expect(invalid.status).toBe(400)
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR')
    expect(invalid.body.error.details.fields).toHaveProperty('email')
  })
})
