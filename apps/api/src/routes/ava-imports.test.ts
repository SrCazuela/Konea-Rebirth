import { randomUUID } from 'node:crypto'
import { and, count, eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import {
  academicCourses,
  academicTasks,
  avaDomImports,
  users,
} from '../db/schema.js'

function testAccount() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  return {
    email: `ava-import-${suffix}@konea.test`,
    password: 'CampusSeguro2026!',
    username: `ava_import_${suffix}`,
    displayName: `Importador AVA ${suffix}`,
  }
}

function capture(suffix = 'one') {
  return {
    version: 1,
    source: {
      pageUrl: `https://campusvirtual.duoc.cl/ultra/activity?capture=${suffix}`,
      pageTitle: 'Actividad · Campus Virtual',
      capturedAt: '2030-03-01T12:00:00.000Z',
    },
    courses: [
      {
        clientId: `course_${suffix}_12345678`,
        name: `Arquitectura de Software ${suffix}`,
        code: 'ASY4131',
        section: '001D',
        term: 'Primer semestre 2030',
      },
    ],
    activities: [
      {
        clientId: `activity_${suffix}_12345678`,
        title: `Entrega de arquitectura ${suffix}`,
        description: 'Preparar la presentación del proyecto.',
        courseName: `Arquitectura de Software ${suffix}`,
        dueAt: '2030-03-20T23:59:00.000Z',
        sourceUrl: `https://campusvirtual.duoc.cl/ultra/courses/${suffix}?content=private`,
      },
    ],
  }
}

describe.sequential('AVA DOM import API', () => {
  const app = createApp()
  const studentAgent = request.agent(app)
  const account = testAccount()
  let userId = ''

  beforeAll(async () => {
    const registration = await studentAgent
      .post('/api/v1/auth/register')
      .send(account)
    expect(registration.status).toBe(201)
    userId = registration.body.user.id
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId))
    await closeDatabaseConnection()
  })

  it('requires an authenticated Konea session', async () => {
    await request(app)
      .post('/api/v1/ava-imports/previews')
      .send(capture('anonymous'))
      .expect(401)
  })

  it('rejects captures and links outside campusvirtual.duoc.cl', async () => {
    const invalidPage = capture('invalid-page')
    invalidPage.source.pageUrl = 'https://campusvirtual.duoc.cl.evil.test/'
    await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(invalidPage)
      .expect(400)

    const invalidActivity = capture('invalid-activity')
    invalidActivity.activities[0]!.sourceUrl = 'javascript:alert(1)'
    await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(invalidActivity)
      .expect(400)
  })

  it('previews, confirms and repeats one capture without duplicating data', async () => {
    const payload = capture()
    const preview = await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(payload)
    expect(preview.status).toBe(201)
    expect(preview.body.import.status).toBe('draft')
    expect(preview.body.courses).toMatchObject([
      { clientId: payload.courses[0]!.clientId, existing: false },
    ])
    expect(preview.body.activities).toMatchObject([
      { clientId: payload.activities[0]!.clientId, existing: false },
    ])

    const invalidSelection = await studentAgent
      .post(`/api/v1/ava-imports/previews/${preview.body.import.id}/confirm`)
      .send({
        courseClientIds: ['course_not_from_capture'],
        activityClientIds: [],
      })
    expect(invalidSelection.status).toBe(400)
    expect(invalidSelection.body.error.code).toBe(
      'INVALID_AVA_IMPORT_SELECTION',
    )

    const confirmation = await studentAgent
      .post(`/api/v1/ava-imports/previews/${preview.body.import.id}/confirm`)
      .send({
        courseClientIds: [payload.courses[0]!.clientId],
        activityClientIds: [payload.activities[0]!.clientId],
      })
    expect(confirmation.status).toBe(200)
    expect(confirmation.body.result).toEqual({
      importedCourses: 1,
      reactivatedCourses: 0,
      importedTasks: 1,
      existingCourses: 0,
      existingTasks: 0,
    })

    const dashboard = await studentAgent.get('/api/v1/academic').expect(200)
    expect(dashboard.body.courses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: payload.courses[0]!.name,
          source: 'ava_extension',
          active: true,
        }),
      ]),
    )
    expect(dashboard.body.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: payload.activities[0]!.title,
          status: 'pending',
          externalSource: 'ava_extension',
        }),
      ]),
    )

    const repeatedPreview = await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(payload)
      .expect(200)
    expect(repeatedPreview.body.import).toMatchObject({
      id: preview.body.import.id,
      status: 'confirmed',
    })
    expect(repeatedPreview.body.courses[0].existing).toBe(true)
    expect(repeatedPreview.body.activities[0].existing).toBe(true)

    const repeatedConfirmation = await studentAgent
      .post(`/api/v1/ava-imports/previews/${preview.body.import.id}/confirm`)
      .send({ courseClientIds: [], activityClientIds: [] })
      .expect(200)
    expect(repeatedConfirmation.body.result).toEqual(confirmation.body.result)

    const [taskTotal] = await db
      .select({ value: count() })
      .from(academicTasks)
      .where(
        and(
          eq(academicTasks.userId, userId),
          eq(academicTasks.externalSource, 'ava_extension'),
        ),
      )
    expect(taskTotal!.value).toBe(1)
  })

  it('reactivates an archived AVA extension course when importing the same capture again', async () => {
    const payload = capture('reactivate')
    const firstPreview = await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(payload)
      .expect(201)
    await studentAgent
      .post(
        `/api/v1/ava-imports/previews/${firstPreview.body.import.id}/confirm`,
      )
      .send({
        courseClientIds: [payload.courses[0]!.clientId],
        activityClientIds: [],
      })
      .expect(200)

    const [storedCourse] = await db
      .select({ id: academicCourses.id })
      .from(academicCourses)
      .where(
        and(
          eq(academicCourses.userId, userId),
          eq(
            academicCourses.normalizedName,
            payload.courses[0]!.name.toLowerCase(),
          ),
        ),
      )
      .limit(1)
    expect(storedCourse).toBeDefined()
    await db
      .update(academicCourses)
      .set({ active: false, code: null })
      .where(eq(academicCourses.id, storedCourse!.id))

    const repeatedPreview = await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(payload)
      .expect(200)
    expect(repeatedPreview.body.import).toMatchObject({
      id: firstPreview.body.import.id,
      status: 'draft',
      result: null,
    })
    expect(repeatedPreview.body.courses).toMatchObject([
      {
        clientId: payload.courses[0]!.clientId,
        existing: false,
        reactivatable: true,
        state: 'reactivatable',
      },
    ])

    const confirmation = await studentAgent
      .post(
        `/api/v1/ava-imports/previews/${repeatedPreview.body.import.id}/confirm`,
      )
      .send({
        courseClientIds: [payload.courses[0]!.clientId],
        activityClientIds: [],
      })
      .expect(200)
    expect(confirmation.body.result).toEqual({
      importedCourses: 0,
      reactivatedCourses: 1,
      importedTasks: 0,
      existingCourses: 0,
      existingTasks: 0,
    })

    const matchingCourses = await db
      .select({
        id: academicCourses.id,
        active: academicCourses.active,
        code: academicCourses.code,
      })
      .from(academicCourses)
      .where(
        and(
          eq(academicCourses.userId, userId),
          eq(
            academicCourses.normalizedName,
            payload.courses[0]!.name.toLowerCase(),
          ),
        ),
      )
    expect(matchingCourses).toEqual([
      {
        id: storedCourse!.id,
        active: true,
        code: payload.courses[0]!.code,
      },
    ])
  })

  it('does not reactivate or overwrite an archived manual course with the same name', async () => {
    const payload = capture('manual-conflict')
    const [manualCourse] = await db
      .insert(academicCourses)
      .values({
        userId,
        name: payload.courses[0]!.name,
        normalizedName: payload.courses[0]!.name.toLowerCase(),
        code: 'MANUAL-CODE',
        section: 'MANUAL-SECTION',
        term: 'Manual term',
        source: 'manual',
        active: false,
      })
      .returning({ id: academicCourses.id })

    const preview = await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(payload)
      .expect(201)
    expect(preview.body.courses).toMatchObject([
      {
        clientId: payload.courses[0]!.clientId,
        existing: true,
        reactivatable: false,
        state: 'existing',
      },
    ])

    const confirmation = await studentAgent
      .post(`/api/v1/ava-imports/previews/${preview.body.import.id}/confirm`)
      .send({
        courseClientIds: [payload.courses[0]!.clientId],
        activityClientIds: [],
      })
      .expect(200)
    expect(confirmation.body.result).toEqual({
      importedCourses: 0,
      reactivatedCourses: 0,
      importedTasks: 0,
      existingCourses: 1,
      existingTasks: 0,
    })

    const [unchangedCourse] = await db
      .select({
        id: academicCourses.id,
        source: academicCourses.source,
        active: academicCourses.active,
        code: academicCourses.code,
        section: academicCourses.section,
        term: academicCourses.term,
      })
      .from(academicCourses)
      .where(eq(academicCourses.id, manualCourse!.id))
    expect(unchangedCourse).toEqual({
      id: manualCourse!.id,
      source: 'manual',
      active: false,
      code: 'MANUAL-CODE',
      section: 'MANUAL-SECTION',
      term: 'Manual term',
    })
  })

  it('never deactivates courses missing from a later capture', async () => {
    const secondPayload = capture('two')
    const preview = await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(secondPayload)
      .expect(201)
    await studentAgent
      .post(`/api/v1/ava-imports/previews/${preview.body.import.id}/confirm`)
      .send({
        courseClientIds: [secondPayload.courses[0]!.clientId],
        activityClientIds: [],
      })
      .expect(200)

    const importedCourses = await db
      .select({ name: academicCourses.name, active: academicCourses.active })
      .from(academicCourses)
      .where(
        and(
          eq(academicCourses.userId, userId),
          eq(academicCourses.source, 'ava_extension'),
        ),
      )
    expect(importedCourses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: capture().courses[0]!.name,
          active: true,
        }),
        expect.objectContaining({
          name: secondPayload.courses[0]!.name,
          active: true,
        }),
      ]),
    )
  })

  it('discards a draft and removes its captured academic contents', async () => {
    const preview = await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(capture('discard'))
      .expect(201)
    await studentAgent
      .delete(`/api/v1/ava-imports/previews/${preview.body.import.id}`)
      .expect(204)
    const [stored] = await db
      .select({ status: avaDomImports.status, payload: avaDomImports.payload })
      .from(avaDomImports)
      .where(eq(avaDomImports.id, preview.body.import.id))
    expect(stored!.status).toBe('discarded')
    expect(stored!.payload.courses).toEqual([])
    expect(stored!.payload.activities).toEqual([])
  })

  it('opportunistically minimizes expired drafts before a new preview', async () => {
    const expiredPreview = await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(capture('expired'))
      .expect(201)
    await db
      .update(avaDomImports)
      .set({ expiresAt: new Date('2000-01-01T00:00:00.000Z') })
      .where(eq(avaDomImports.id, expiredPreview.body.import.id))

    await studentAgent
      .post('/api/v1/ava-imports/previews')
      .send(capture('cleanup-trigger'))
      .expect(201)

    const [stored] = await db
      .select({ status: avaDomImports.status, payload: avaDomImports.payload })
      .from(avaDomImports)
      .where(eq(avaDomImports.id, expiredPreview.body.import.id))
    expect(stored!.status).toBe('discarded')
    expect(stored!.payload.courses).toEqual([])
    expect(stored!.payload.activities).toEqual([])
  })
})
