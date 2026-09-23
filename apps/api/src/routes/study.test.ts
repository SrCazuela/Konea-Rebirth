import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import {
  academicCourses,
  academicTasks,
  studySessionEvents,
  studySessions,
  users,
} from '../db/schema.js'

function testAccount(label: string) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  return {
    email: `${label}-${suffix}@konea.test`,
    password: 'CampusSeguro2026!',
    username: `${label}_${suffix}`,
    displayName: `${label} ${suffix}`,
  }
}

describe.sequential('study sessions API', () => {
  const app = createApp()
  const studentAgent = request.agent(app)
  const otherAgent = request.agent(app)
  const studentAccount = testAccount('study')
  const otherAccount = testAccount('studyother')
  let studentId = ''
  let courseId = ''
  let otherCourseId = ''
  let secondCourseId = ''
  let taskId = ''
  let sessionId = ''
  const firstRequestId = randomUUID()

  beforeAll(async () => {
    const studentRegistration = await studentAgent
      .post('/api/v1/auth/register')
      .send(studentAccount)
    const otherRegistration = await otherAgent
      .post('/api/v1/auth/register')
      .send(otherAccount)
    expect(studentRegistration.status).toBe(201)
    expect(otherRegistration.status).toBe(201)
    studentId = studentRegistration.body.user.id

    const [course, secondCourse, otherCourse] = await Promise.all([
      db
        .insert(academicCourses)
        .values({
          userId: studentId,
          name: 'Arquitectura de Software',
          normalizedName: `arquitectura-${randomUUID()}`,
        })
        .returning({ id: academicCourses.id }),
      db
        .insert(academicCourses)
        .values({
          userId: studentId,
          name: 'Ingl\u00e9s',
          normalizedName: `ingles-${randomUUID()}`,
        })
        .returning({ id: academicCourses.id }),
      db
        .insert(academicCourses)
        .values({
          userId: otherRegistration.body.user.id,
          name: 'Asignatura ajena',
          normalizedName: `ajena-${randomUUID()}`,
        })
        .returning({ id: academicCourses.id }),
    ])
    courseId = course[0]!.id
    secondCourseId = secondCourse[0]!.id
    otherCourseId = otherCourse[0]!.id

    const [task] = await db
      .insert(academicTasks)
      .values({
        userId: studentId,
        courseId,
        title: 'Estudiar patrones de arquitectura',
      })
      .returning({ id: academicTasks.id })
    taskId = task!.id
  })

  afterAll(async () => {
    await db
      .delete(users)
      .where(inArray(users.email, [studentAccount.email, otherAccount.email]))
    await closeDatabaseConnection()
  })

  it('requires authentication and validates strict timer settings', async () => {
    await request(app).get('/api/v1/study/overview').expect(401)

    const unknownField = await studentAgent
      .post('/api/v1/study/sessions')
      .send({
        clientRequestId: randomUUID(),
        method: 'pomodoro',
        plannedDurationSeconds: 1_500,
        unexpected: true,
      })
    expect(unknownField.status).toBe(400)
    expect(unknownField.body.error.code).toBe('VALIDATION_ERROR')

    const invalidFlowtime = await studentAgent
      .post('/api/v1/study/sessions')
      .send({
        clientRequestId: randomUUID(),
        method: 'flowtime',
        plannedDurationSeconds: 1_500,
      })
    expect(invalidFlowtime.status).toBe(400)
    expect(invalidFlowtime.body.error.details.fields).toHaveProperty(
      'plannedDurationSeconds',
    )
  })

  it('enforces ownership and task-course consistency', async () => {
    const foreignCourse = await studentAgent
      .post('/api/v1/study/sessions')
      .send({
        clientRequestId: randomUUID(),
        method: 'pomodoro',
        courseId: otherCourseId,
        plannedDurationSeconds: 1_500,
      })
    expect(foreignCourse.status).toBe(404)
    expect(foreignCourse.body.error.code).toBe('ACADEMIC_COURSE_NOT_FOUND')

    const mismatched = await studentAgent.post('/api/v1/study/sessions').send({
      clientRequestId: randomUUID(),
      method: 'deep_work',
      courseId: secondCourseId,
      taskId,
      plannedDurationSeconds: 3_000,
    })
    expect(mismatched.status).toBe(409)
    expect(mismatched.body.error.code).toBe('STUDY_LINK_MISMATCH')
  })

  it('creates one current session and makes client retries idempotent', async () => {
    const body = {
      clientRequestId: firstRequestId,
      method: 'pomodoro',
      taskId,
      plannedDurationSeconds: 1_500,
      breakDurationSeconds: 300,
    }
    const creation = await studentAgent
      .post('/api/v1/study/sessions')
      .send(body)
    expect(creation.status).toBe(201)
    expect(creation.body.idempotent).toBe(false)
    expect(creation.body.session).toMatchObject({
      method: 'pomodoro',
      status: 'active',
      courseId,
      taskId,
      plannedDurationSeconds: 1_500,
      breakDurationSeconds: 300,
      focusedSeconds: 0,
      accumulatedFocusedSeconds: 0,
      effectiveFocusedSeconds: 0,
      course: { id: courseId, name: 'Arquitectura de Software' },
      task: { id: taskId, title: 'Estudiar patrones de arquitectura' },
    })
    expect(creation.body.session.activeStartedAt).toEqual(expect.any(String))
    sessionId = creation.body.session.id

    const replay = await studentAgent.post('/api/v1/study/sessions').send(body)
    expect(replay.status).toBe(200)
    expect(replay.body.idempotent).toBe(true)
    expect(replay.body.session.id).toBe(sessionId)

    const conflictingReplay = await studentAgent
      .post('/api/v1/study/sessions')
      .send({ ...body, plannedDurationSeconds: 1_800 })
    expect(conflictingReplay.status).toBe(409)
    expect(conflictingReplay.body.error.code).toBe(
      'STUDY_IDEMPOTENCY_KEY_REUSED',
    )

    const competing = await studentAgent.post('/api/v1/study/sessions').send({
      clientRequestId: randomUUID(),
      method: 'custom',
      plannedDurationSeconds: 600,
    })
    expect(competing.status).toBe(409)
    expect(competing.body.error.code).toBe('STUDY_SESSION_ALREADY_CURRENT')
  })

  it('accounts focused time on the server and records immutable transitions', async () => {
    await db
      .update(studySessions)
      .set({ activeStartedAt: new Date(Date.now() - 65_000) })
      .where(
        and(
          eq(studySessions.id, sessionId),
          eq(studySessions.userId, studentId),
        ),
      )

    const paused = await studentAgent
      .patch(`/api/v1/study/sessions/${sessionId}`)
      .send({ action: 'pause' })
    expect(paused.status).toBe(200)
    expect(paused.body.session.status).toBe('paused')
    expect(paused.body.session.activeStartedAt).toBeNull()
    expect(paused.body.session.focusedSeconds).toBeGreaterThanOrEqual(64)
    expect(paused.body.session.focusedSeconds).toBeLessThanOrEqual(67)

    const pauseReplay = await studentAgent
      .patch(`/api/v1/study/sessions/${sessionId}`)
      .send({ action: 'pause' })
    expect(pauseReplay.status).toBe(200)

    const resumed = await studentAgent
      .patch(`/api/v1/study/sessions/${sessionId}`)
      .send({ action: 'resume' })
    expect(resumed.status).toBe(200)
    expect(resumed.body.session.status).toBe('active')
    expect(resumed.body.session.lastResumedAt).toEqual(expect.any(String))

    const completed = await studentAgent
      .patch(`/api/v1/study/sessions/${sessionId}`)
      .send({ action: 'complete' })
    expect(completed.status).toBe(200)
    expect(completed.body.session.status).toBe('completed')
    expect(completed.body.session.endedAt).toEqual(expect.any(String))
    expect(completed.body.session.focusedSeconds).toBeGreaterThanOrEqual(64)

    const events = await studentAgent.get(
      `/api/v1/study/sessions/${sessionId}/events`,
    )
    expect(events.status).toBe(200)
    expect(
      events.body.events.map((event: { type: string }) => event.type),
    ).toEqual(['start', 'pause', 'resume', 'complete'])

    const persistedEvents = await db
      .select()
      .from(studySessionEvents)
      .where(eq(studySessionEvents.sessionId, sessionId))
    expect(persistedEvents).toHaveLength(4)

    const invalidTerminalTransition = await studentAgent
      .patch(`/api/v1/study/sessions/${sessionId}`)
      .send({ action: 'resume' })
    expect(invalidTerminalTransition.status).toBe(409)
    expect(invalidTerminalTransition.body.error.code).toBe(
      'INVALID_STUDY_SESSION_TRANSITION',
    )
  })

  it('supports unplanned flowtime and isolates every user history', async () => {
    const creation = await studentAgent.post('/api/v1/study/sessions').send({
      clientRequestId: randomUUID(),
      method: 'flowtime',
      courseId: secondCourseId,
      plannedDurationSeconds: 0,
      breakDurationSeconds: 0,
    })
    expect(creation.status).toBe(201)
    const flowtimeId = creation.body.session.id

    const cancellation = await studentAgent
      .patch(`/api/v1/study/sessions/${flowtimeId}`)
      .send({ action: 'cancel' })
    expect(cancellation.status).toBe(200)
    expect(cancellation.body.session.status).toBe('cancelled')

    const foreignEvents = await otherAgent.get(
      `/api/v1/study/sessions/${sessionId}/events`,
    )
    expect(foreignEvents.status).toBe(404)
    const foreignList = await otherAgent.get('/api/v1/study/sessions')
    expect(foreignList.status).toBe(200)
    expect(foreignList.body.sessions).toEqual([])
  })

  it('returns bounded history and a timezone-aware overview', async () => {
    const overview = await studentAgent.get(
      '/api/v1/study/overview?timeZone=America%2FSantiago',
    )
    expect(overview.status).toBe(200)
    expect(overview.body.activeSession).toBeNull()
    expect(overview.body.stats).toMatchObject({
      totalSessions: 1,
      completedSessions: 1,
    })
    expect(overview.body.stats.totalFocusedSeconds).toBeGreaterThanOrEqual(64)
    expect(overview.body.stats.todayFocusedSeconds).toBeGreaterThanOrEqual(64)
    expect(overview.body.stats.currentStreakDays).toBe(1)
    expect(overview.body.byDay).toHaveLength(7)
    expect(overview.body.byCourse).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseId,
          courseName: 'Arquitectura de Software',
          sessions: 1,
        }),
      ]),
    )
    expect(overview.body.recentSessions).toHaveLength(2)

    const firstPage = await studentAgent.get('/api/v1/study/sessions?limit=1')
    expect(firstPage.status).toBe(200)
    expect(firstPage.body.sessions).toHaveLength(1)
    expect(firstPage.body.nextCursor).toEqual(expect.any(String))

    const secondPage = await studentAgent
      .get('/api/v1/study/sessions')
      .query({ limit: 1, cursor: firstPage.body.nextCursor })
    expect(secondPage.status).toBe(200)
    expect(secondPage.body.sessions).toHaveLength(1)
    expect(secondPage.body.sessions[0].id).not.toBe(
      firstPage.body.sessions[0].id,
    )

    const invalidTimeZone = await studentAgent.get(
      '/api/v1/study/overview?timeZone=Not%2FAZone',
    )
    expect(invalidTimeZone.status).toBe(400)
    expect(invalidTimeZone.body.error.code).toBe('INVALID_TIME_ZONE')
  })

  it('persists heartbeats and pauses an abandoned session without inflating time', async () => {
    const creation = await studentAgent.post('/api/v1/study/sessions').send({
      clientRequestId: randomUUID(),
      method: 'deep_work',
      courseId,
      plannedDurationSeconds: 5_400,
      breakDurationSeconds: 1_200,
    })
    expect(creation.status).toBe(201)
    const abandonedId = creation.body.session.id as string

    const thirtySecondsAgo = new Date(Date.now() - 30_000)
    await db
      .update(studySessions)
      .set({
        activeStartedAt: thirtySecondsAgo,
        lastHeartbeatAt: thirtySecondsAgo,
      })
      .where(eq(studySessions.id, abandonedId))

    const heartbeat = await studentAgent
      .patch(`/api/v1/study/sessions/${abandonedId}`)
      .send({ action: 'heartbeat' })
    expect(heartbeat.status).toBe(200)
    expect(heartbeat.body.session.status).toBe('active')
    expect(heartbeat.body.session.focusedSeconds).toBeGreaterThanOrEqual(29)
    expect(heartbeat.body.session.focusedSeconds).toBeLessThanOrEqual(32)
    expect(heartbeat.body.session.lastHeartbeatAt).toEqual(expect.any(String))

    const fiveMinutesAgo = new Date(Date.now() - 300_000)
    await db
      .update(studySessions)
      .set({
        activeStartedAt: fiveMinutesAgo,
        lastHeartbeatAt: fiveMinutesAgo,
      })
      .where(eq(studySessions.id, abandonedId))
    const recovered = await studentAgent.get(
      '/api/v1/study/overview?timeZone=America%2FSantiago',
    )
    expect(recovered.status).toBe(200)
    expect(recovered.body.activeSession).toMatchObject({
      id: abandonedId,
      status: 'paused',
    })
    const cappedSeconds = recovered.body.activeSession.focusedSeconds as number
    expect(cappedSeconds).toBeGreaterThanOrEqual(119)
    expect(cappedSeconds).toBeLessThanOrEqual(122)

    const repeatedOverview = await studentAgent.get(
      '/api/v1/study/overview?timeZone=America%2FSantiago',
    )
    expect(repeatedOverview.status).toBe(200)
    expect(repeatedOverview.body.activeSession.focusedSeconds).toBe(
      cappedSeconds,
    )

    const resumed = await studentAgent
      .patch(`/api/v1/study/sessions/${abandonedId}`)
      .send({ action: 'resume' })
    expect(resumed.status).toBe(200)
    expect(resumed.body.session.status).toBe('active')

    const cancelled = await studentAgent
      .patch(`/api/v1/study/sessions/${abandonedId}`)
      .send({ action: 'cancel' })
    expect(cancelled.status).toBe(200)

    const events = await studentAgent.get(
      `/api/v1/study/sessions/${abandonedId}/events`,
    )
    const eventTypes = events.body.events.map(
      (event: { type: string }) => event.type,
    )
    expect(eventTypes).toHaveLength(4)
    expect(eventTypes).toEqual(
      expect.arrayContaining(['start', 'pause', 'resume', 'cancel']),
    )
  })
})
