import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { profiles, users, userSessions } from '../db/schema.js'
import { hashPassword, verifyPassword } from '../security/password.js'
import { createSession } from '../security/session.js'

const password = 'ConfiguracionSegura2026!'
const newPassword = 'OtraContrasenaSegura2026!'
const createdUserIds: string[] = []
let initialPasswordHash: string

async function fixture() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const [user] = await db
    .insert(users)
    .values({
      email: `settings-${suffix}@konea.test`,
      passwordHash: initialPasswordHash,
    })
    .returning()
  createdUserIds.push(user!.id)
  const profile = {
    userId: user!.id,
    username: `settings_${suffix}`,
    displayName: `Settings ${suffix}`,
  }
  await db.insert(profiles).values(profile)
  const session = await createSession(user!.id)
  return { ...user!, ...profile, cookie: `konea_session=${session.token}` }
}

describe.sequential('account settings API', () => {
  const app = createApp()

  beforeAll(async () => {
    initialPasswordHash = await hashPassword(password)
  })
  afterAll(async () => {
    if (createdUserIds.length)
      await db.delete(users).where(inArray(users.id, createdUserIds))
    await closeDatabaseConnection()
  })

  it('requires authentication for both settings operations', async () => {
    await request(app).patch('/api/v1/auth/account').send({}).expect(401)
    await request(app).post('/api/v1/auth/password').send({}).expect(401)
  })

  it('rejects the wrong current password without logging out or modifying the user', async () => {
    const account = await fixture()
    const input = {
      email: account.email,
      username: account.username,
      displayName: 'Nuevo nombre',
      currentPassword: 'incorrecta',
    }
    const accountResult = await request(app)
      .patch('/api/v1/auth/account')
      .set('Cookie', account.cookie)
      .send(input)
    expect(accountResult.status).toBe(400)
    expect(accountResult.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT')
    const passwordResult = await request(app)
      .post('/api/v1/auth/password')
      .set('Cookie', account.cookie)
      .send({ currentPassword: 'incorrecta', newPassword })
    expect(passwordResult.status).toBe(400)
    expect(passwordResult.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT')
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', account.cookie)
      .expect(200)
    expect(me.body.user.displayName).toBe(account.displayName)
    const [stored] = await db
      .select()
      .from(users)
      .where(eq(users.id, account.id))
    expect(stored!.passwordHash).toBe(initialPasswordHash)
  })

  it('rejects duplicate identity values and rolls back all fields and session changes', async () => {
    const first = await fixture()
    const second = await fixture()
    for (const changes of [
      { email: second.email },
      { username: second.username },
    ]) {
      const result = await request(app)
        .patch('/api/v1/auth/account')
        .set('Cookie', first.cookie)
        .send({
          email: first.email,
          username: first.username,
          displayName: 'No se debe guardar',
          currentPassword: password,
          ...changes,
        })
      expect(result.status).toBe(409)
      expect(result.body.error.code).toBe('ACCOUNT_ALREADY_EXISTS')
    }
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', first.cookie)
      .expect(200)
    expect(me.body.user).toMatchObject({
      email: first.email,
      username: first.username,
      displayName: first.displayName,
    })
  })

  it('updates only the authenticated account and preserves its role and profile data', async () => {
    const account = await fixture()
    const untouched = await fixture()
    await db
      .update(profiles)
      .set({ bio: 'Mi biografía permanece.' })
      .where(eq(profiles.userId, account.id))
    const oldSecondSession = await createSession(account.id)
    const replacement = {
      email: `updated-${randomUUID()}@konea.test`,
      username: `new_${randomUUID().replaceAll('-', '').slice(0, 12)}`,
      displayName: 'Nombre actualizado',
    }
    const result = await request(app)
      .patch('/api/v1/auth/account')
      .set('Cookie', account.cookie)
      .send({ ...replacement, currentPassword: password })
    expect(result.status).toBe(200)
    expect(result.body.user).toMatchObject({
      ...replacement,
      role: 'student',
      status: 'active',
      bio: 'Mi biografía permanece.',
    })
    expect(result.body.user).not.toHaveProperty('passwordHash')
    const newCookie = result.headers['set-cookie']?.[0]?.split(';')[0]
    expect(newCookie).toMatch(/^konea_session=/)
    expect(newCookie).not.toBe(account.cookie)
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', newCookie!)
      .expect(200)
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', account.cookie)
      .expect(401)
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `konea_session=${oldSecondSession.token}`)
      .expect(401)
    const other = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', untouched.cookie)
      .expect(200)
    expect(other.body.user.email).toBe(untouched.email)
    await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: replacement.username, password })
      .expect(200)
    await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: account.email, password })
      .expect(401)
  })

  it('requires the current password and refuses privilege or user-id fields', async () => {
    const account = await fixture()
    const input = {
      email: account.email,
      username: account.username,
      displayName: account.displayName,
      currentPassword: password,
    }
    for (const extra of [
      { role: 'admin' },
      { userId: randomUUID() },
      { status: 'suspended' },
    ]) {
      const result = await request(app)
        .patch('/api/v1/auth/account')
        .set('Cookie', account.cookie)
        .send({ ...input, ...extra })
      expect(result.status).toBe(400)
      expect(result.body.error.code).toBe('VALIDATION_ERROR')
    }
    await request(app)
      .patch('/api/v1/auth/account')
      .set('Cookie', account.cookie)
      .send({
        email: input.email,
        username: input.username,
        displayName: input.displayName,
      })
      .expect(400)
    const [stored] = await db
      .select()
      .from(users)
      .where(eq(users.id, account.id))
    expect(stored).toMatchObject({ role: 'student', status: 'active' })
  })

  it('changes the password atomically, revokes old sessions, and permits the new credentials', async () => {
    const account = await fixture()
    const secondSession = await createSession(account.id)
    const result = await request(app)
      .post('/api/v1/auth/password')
      .set('Cookie', account.cookie)
      .send({ currentPassword: password, newPassword })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      message: 'Contraseña actualizada. Se cerraron las demás sesiones.',
    })
    expect(result.headers['set-cookie']?.[0]).toContain('HttpOnly')
    const freshCookie = result.headers['set-cookie']?.[0]?.split(';')[0]
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', freshCookie!)
      .expect(200)
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', account.cookie)
      .expect(401)
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', `konea_session=${secondSession.token}`)
      .expect(401)
    const sessions = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, account.id))
    expect(sessions).toHaveLength(1)
    const [stored] = await db
      .select()
      .from(users)
      .where(eq(users.id, account.id))
    expect(stored!.passwordHash).not.toBe(initialPasswordHash)
    expect(await verifyPassword(newPassword, stored!.passwordHash)).toBe(true)
    await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: account.email, password })
      .expect(401)
    await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: account.email, password: newPassword })
      .expect(200)
  })

  it('rejects short or unchanged passwords while preserving the current session', async () => {
    const account = await fixture()
    const short = await request(app)
      .post('/api/v1/auth/password')
      .set('Cookie', account.cookie)
      .send({ currentPassword: password, newPassword: 'corta' })
    expect(short.status).toBe(400)
    expect(short.body.error.details.fields).toHaveProperty('newPassword')
    const same = await request(app)
      .post('/api/v1/auth/password')
      .set('Cookie', account.cookie)
      .send({ currentPassword: password, newPassword: password })
    expect(same.status).toBe(400)
    expect(same.body.error.code).toBe('PASSWORD_UNCHANGED')
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', account.cookie)
      .expect(200)
  })

  it('allows only one concurrent password change from the same session', async () => {
    const account = await fixture()
    const attempts = await Promise.all([
      request(app)
        .post('/api/v1/auth/password')
        .set('Cookie', account.cookie)
        .send({ currentPassword: password, newPassword }),
      request(app)
        .post('/api/v1/auth/password')
        .set('Cookie', account.cookie)
        .send({
          currentPassword: password,
          newPassword: 'OtraContraseñaConcurrente2026!',
        }),
    ])
    expect(attempts.map((response) => response.status).sort()).toEqual([
      200, 401,
    ])
    const sessions = await db
      .select()
      .from(userSessions)
      .where(eq(userSessions.userId, account.id))
    expect(sessions).toHaveLength(1)
    const success = attempts.find((response) => response.status === 200)!
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', success.headers['set-cookie']![0]!.split(';')[0]!)
      .expect(200)
  })

  it('logout invalidates the server session, including replay of its old cookie', async () => {
    const account = await fixture()
    const result = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', account.cookie)
      .expect(204)
    expect(result.headers['set-cookie']?.[0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    )
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', account.cookie)
      .expect(401)
    expect(
      await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, account.id)),
    ).toHaveLength(0)
  })
})
