import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createApp } from '../app.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import { academicCalendarEvents, academicCourses, users } from '../db/schema.js'
import { normalizeCourseName } from '../domain/academic.js'
import { calendarDateFloorInTimeZone } from '../services/ics-calendar-service.js'

function testAccount() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10)
  return {
    email: `academic-${suffix}@konea.test`,
    password: 'CampusSeguro2026!',
    username: `academic_${suffix}`,
    displayName: `Académico ${suffix}`,
  }
}

describe.sequential('academic API', () => {
  const app = createApp()
  const studentAgent = request.agent(app)
  const account = testAccount()
  let userId = ''
  let manualCourseId = ''

  beforeAll(async () => {
    const registration = await studentAgent
      .post('/api/v1/auth/register')
      .send(account)
    expect(registration.status).toBe(201)
    userId = registration.body.user.id
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, account.email))
    await closeDatabaseConnection()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('requires authentication', async () => {
    await request(app).get('/api/v1/academic').expect(401)
  })

  it('edits, deactivates and reactivates a manual course', async () => {
    const creation = await studentAgent.post('/api/v1/academic/courses').send({
      name: 'Fundamentos de Matemáticas',
      code: 'MAT100',
      section: '001D',
      term: 'Segundo semestre 2026',
    })
    expect(creation.status).toBe(201)
    expect(creation.body.reactivated).toBe(false)
    manualCourseId = creation.body.course.id

    const update = await studentAgent
      .patch(`/api/v1/academic/courses/${manualCourseId}`)
      .send({ code: 'MAT101', section: '002D' })
    expect(update.status).toBe(200)
    expect(update.body.course).toMatchObject({
      id: manualCourseId,
      code: 'MAT101',
      section: '002D',
    })

    await studentAgent
      .delete(`/api/v1/academic/courses/${manualCourseId}`)
      .expect(204)

    const hidden = await studentAgent.get('/api/v1/academic')
    expect(
      hidden.body.courses.some(
        (course: { id: string }) => course.id === manualCourseId,
      ),
    ).toBe(false)

    const reactivation = await studentAgent
      .post('/api/v1/academic/courses')
      .send({
        name: '  Fundamentos   de Matemáticas ',
        code: 'MAT102',
        section: '003D',
        term: 'Primer semestre 2027',
      })
    expect(reactivation.status).toBe(200)
    expect(reactivation.body.reactivated).toBe(true)
    expect(reactivation.body.course).toMatchObject({
      id: manualCourseId,
      active: true,
      code: 'MAT102',
      section: '003D',
    })
  })

  it('returns a friendly conflict when renaming to an existing course', async () => {
    const second = await studentAgent.post('/api/v1/academic/courses').send({
      name: 'Arquitectura de Software',
    })
    expect(second.status).toBe(201)

    const conflict = await studentAgent
      .patch(`/api/v1/academic/courses/${second.body.course.id}`)
      .send({ name: 'Fundamentos de Matemáticas' })
    expect(conflict.status).toBe(409)
    expect(conflict.body.error).toMatchObject({
      code: 'ACADEMIC_COURSE_EXISTS',
      message: 'Ya existe otra materia con ese nombre.',
    })

    const unicodeCourse = await studentAgent
      .post('/api/v1/academic/courses')
      .send({ name: '  Programación   Distribuida  ' })
    expect(unicodeCourse.status).toBe(201)
    expect(unicodeCourse.body.course.name).toBe('Programación Distribuida')

    const decomposedDuplicate = await studentAgent
      .post('/api/v1/academic/courses')
      .send({ name: 'Programacio\u0301n Distribuida' })
    expect(decomposedDuplicate.status).toBe(409)
    expect(decomposedDuplicate.body.error.code).toBe('ACADEMIC_COURSE_EXISTS')

    const compatibilityExpanded = await studentAgent
      .post('/api/v1/academic/courses')
      .send({ name: `Curso ${'\uFB03'.repeat(200)}` })
    expect(compatibilityExpanded.status).toBe(201)
    expect(
      Array.from(compatibilityExpanded.body.course.name as string),
    ).toHaveLength(300)
  })

  it('keeps AVA courses read-only through the manual API', async () => {
    const [avaCourse] = await db
      .insert(academicCourses)
      .values({
        userId,
        name: 'Capstone AVA',
        normalizedName: `capstone-ava-${randomUUID()}`,
        source: 'ava',
      })
      .returning({ id: academicCourses.id })

    const update = await studentAgent
      .patch(`/api/v1/academic/courses/${avaCourse!.id}`)
      .send({ name: 'Nombre manipulado' })
    expect(update.status).toBe(409)
    expect(update.body.error.code).toBe('ACADEMIC_COURSE_READ_ONLY')

    const deletion = await studentAgent.delete(
      `/api/v1/academic/courses/${avaCourse!.id}`,
    )
    expect(deletion.status).toBe(409)
    expect(deletion.body.error.code).toBe('ACADEMIC_COURSE_READ_ONLY')
  })

  it('does not reactivate a manually archived course during AVA sync', async () => {
    const courseName = `Optativo manual ${randomUUID().slice(0, 8)}`
    const [manualCourse] = await db
      .insert(academicCourses)
      .values({
        userId,
        name: courseName,
        normalizedName: normalizeCourseName(courseName),
        source: 'manual',
        active: false,
      })
      .returning({ id: academicCourses.id })
    const calendar = `BEGIN:VCALENDAR\r
BEGIN:VEVENT\r
UID:manual-collision\r
DTSTART:20310115T150000Z\r
SUMMARY:Actividad del optativo\r
CATEGORIES:${courseName}\r
END:VEVENT\r
END:VCALENDAR\r
`
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(calendar, {
        headers: { 'Content-Type': 'text/calendar' },
      }),
    )
    try {
      const sync = await studentAgent.post('/api/v1/ava-calendar/sync').send({
        calendarUrl:
          'https://campusvirtual.duoc.cl/webapps/calendar/calendarFeed/test_manual_collision/learn.ics',
      })
      expect(sync.status).toBe(200)
    } finally {
      fetchMock.mockRestore()
    }

    const [preserved] = await db
      .select({
        source: academicCourses.source,
        active: academicCourses.active,
      })
      .from(academicCourses)
      .where(eq(academicCourses.id, manualCourse!.id))
      .limit(1)
    expect(preserved).toEqual({ source: 'manual', active: false })
  })

  it('serializes simultaneous AVA replacements without merging both feeds', async () => {
    await db
      .delete(academicCalendarEvents)
      .where(eq(academicCalendarEvents.userId, userId))
    const secondAgent = request.agent(app)
    const login = await secondAgent.post('/api/v1/auth/login').send({
      identifier: account.email,
      password: account.password,
    })
    expect(login.status).toBe(200)

    const calendarFor = (uid: string, title: string) => `BEGIN:VCALENDAR\r
BEGIN:VEVENT\r
UID:${uid}\r
DTSTART:20310115T150000Z\r
SUMMARY:${title}\r
END:VEVENT\r
END:VCALENDAR\r
`
    const calendars = [
      calendarFor('simultaneous-a', 'Calendario simultáneo A'),
      calendarFor('simultaneous-b', 'Calendario simultáneo B'),
    ]
    let fetchCalls = 0
    let releaseBothFetches: (() => void) | undefined
    const bothFetchesStarted = new Promise<void>((resolve) => {
      releaseBothFetches = resolve
    })
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => {
        const callIndex = fetchCalls
        fetchCalls += 1
        if (fetchCalls === calendars.length) releaseBothFetches?.()
        await bothFetchesStarted
        return new Response(calendars[callIndex], {
          headers: { 'Content-Type': 'text/calendar' },
        })
      })

    try {
      const calendarUrl =
        'https://campusvirtual.duoc.cl/webapps/calendar/calendarFeed/test_simultaneous/learn.ics'
      const results = await Promise.all([
        studentAgent.post('/api/v1/ava-calendar/sync').send({ calendarUrl }),
        secondAgent.post('/api/v1/ava-calendar/sync').send({ calendarUrl }),
      ])
      expect(results.map((result) => result.status)).toEqual([200, 200])

      const finalCalendar = await studentAgent.get('/api/v1/ava-calendar')
      expect(finalCalendar.status).toBe(200)
      expect(finalCalendar.body.events).toHaveLength(1)
      expect(['Calendario simultáneo A', 'Calendario simultáneo B']).toContain(
        finalCalendar.body.events[0].title,
      )
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('returns only future or currently active AVA events', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-09T01:30:00.000Z'))
    await db
      .delete(academicCalendarEvents)
      .where(eq(academicCalendarEvents.userId, userId))
    const now = Date.now()
    const todayAtUtcMidnight = calendarDateFloorInTimeZone(new Date(now))
    const ids = {
      past: `past-${randomUUID()}`,
      endedAllDay: `ended-all-day-${randomUUID()}`,
      spanningAllDay: `spanning-all-day-${randomUUID()}`,
      ongoing: `ongoing-${randomUUID()}`,
      today: `today-${randomUUID()}`,
      future: `future-${randomUUID()}`,
    }
    await db.insert(academicCalendarEvents).values([
      {
        userId,
        externalId: ids.today,
        title: 'Hito de todo el día',
        startsAt: todayAtUtcMidnight,
        allDay: true,
      },
      {
        userId,
        externalId: ids.past,
        title: 'Evaluación pasada',
        startsAt: new Date(now - 86_400_000),
        endsAt: new Date(now - 82_800_000),
      },
      {
        userId,
        externalId: ids.endedAllDay,
        title: 'Hito de días anteriores',
        startsAt: new Date(todayAtUtcMidnight.getTime() - 2 * 86_400_000),
        endsAt: todayAtUtcMidnight,
        allDay: true,
      },
      {
        userId,
        externalId: ids.spanningAllDay,
        title: 'Hito de varios días',
        startsAt: new Date(todayAtUtcMidnight.getTime() - 86_400_000),
        endsAt: new Date(todayAtUtcMidnight.getTime() + 86_400_000),
        allDay: true,
      },
      {
        userId,
        externalId: ids.ongoing,
        title: 'Clase en curso',
        startsAt: new Date(now - 3_600_000),
        endsAt: new Date(now + 3_600_000),
      },
      {
        userId,
        externalId: ids.future,
        title: 'Entrega futura',
        startsAt: new Date(now + 86_400_000),
        allDay: true,
      },
    ])

    const dashboard = await studentAgent.get('/api/v1/academic')
    expect(dashboard.status).toBe(200)
    const returnedEvents = dashboard.body.events as Array<{
      title: string
      allDay: boolean
    }>
    expect(returnedEvents.map((event) => event.title)).toEqual(
      expect.arrayContaining([
        'Clase en curso',
        'Hito de todo el día',
        'Hito de varios días',
        'Entrega futura',
      ]),
    )
    expect(returnedEvents).toHaveLength(4)
    expect(
      returnedEvents.some((event) => event.title === 'Hito de días anteriores'),
    ).toBe(false)
    expect(
      returnedEvents.find((event) => event.title === 'Hito de todo el día'),
    ).toMatchObject({ allDay: true })

    const calendarSummary = await studentAgent.get('/api/v1/ava-calendar')
    expect(calendarSummary.status).toBe(200)
    expect(calendarSummary.body.upcomingCount).toBe(4)
    expect(
      calendarSummary.body.events.map(
        (event: { title: string }) => event.title,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Clase en curso',
        'Hito de todo el día',
        'Hito de varios días',
        'Entrega futura',
      ]),
    )

    const ducoSummary = await studentAgent.post('/api/v1/duco/messages').send({
      content: '¿Cuáles son mis tareas y actividades pendientes?',
    })
    expect(ducoSummary.status).toBe(201)
    expect(ducoSummary.body.assistantMessage.content).toContain(
      'Hito de varios días',
    )
    const todayLine = (ducoSummary.body.assistantMessage.content as string)
      .split('\n')
      .find((line) => line.includes('Hito de todo el día'))
    expect(todayLine).toContain('08-09-26')
    await studentAgent.delete('/api/v1/duco/messages').expect(200)
  })

  it('does not reactivate an archived AVA course through a DUCO task', async () => {
    const courseName = `AVA Histórica ${randomUUID().slice(0, 8)}`
    const [course] = await db
      .insert(academicCourses)
      .values({
        userId,
        name: courseName,
        normalizedName: normalizeCourseName(courseName),
        source: 'ava',
        active: false,
      })
      .returning({ id: academicCourses.id })

    const reply = await studentAgent.post('/api/v1/duco/messages').send({
      content: `Tengo que estudiar para una evaluación de ${courseName} y quiero guardarla como tarea.`,
    })
    expect(reply.status).toBe(201)
    expect(reply.body.assistantMessage.action?.type).toBe('create_task')

    const confirmation = await studentAgent.post('/api/v1/duco/tasks').send({
      draftId: reply.body.assistantMessage.action.draftId,
      title: 'Preparar evaluación histórica',
      description: 'Repasar el contenido antes de la evaluación.',
      courseName,
      dueAt: null,
      priority: 'medium',
    })
    expect(confirmation.status).toBe(409)
    expect(confirmation.body.error.code).toBe('ACADEMIC_COURSE_READ_ONLY')

    const [stillArchived] = await db
      .select({ active: academicCourses.active })
      .from(academicCourses)
      .where(eq(academicCourses.id, course!.id))
      .limit(1)
    expect(stillArchived?.active).toBe(false)
  })

  it('supports a complete task edit while preserving its identity', async () => {
    const creation = await studentAgent.post('/api/v1/academic/tasks').send({
      courseId: manualCourseId,
      title: 'Preparar avance',
      description: 'Primera versión',
      dueAt: null,
      priority: 'low',
    })
    expect(creation.status).toBe(201)

    const dueAt = new Date(Date.now() + 172_800_000).toISOString()
    const update = await studentAgent
      .patch(`/api/v1/academic/tasks/${creation.body.task.id}`)
      .send({
        courseId: null,
        title: 'Preparar presentación final',
        description: 'Revisar guion, demo y conclusiones.',
        dueAt,
        priority: 'high',
        status: 'in_progress',
      })
    expect(update.status).toBe(200)
    expect(update.body.task).toMatchObject({
      id: creation.body.task.id,
      courseId: null,
      title: 'Preparar presentación final',
      description: 'Revisar guion, demo y conclusiones.',
      priority: 'high',
      status: 'in_progress',
    })
    expect(new Date(update.body.task.dueAt).toISOString()).toBe(dueAt)

    const statusOnlyUpdate = await studentAgent
      .patch(`/api/v1/academic/tasks/${creation.body.task.id}`)
      .send({ status: 'completed' })
    expect(statusOnlyUpdate.status).toBe(200)
    expect(statusOnlyUpdate.body.task).toMatchObject({
      status: 'completed',
      description: 'Revisar guion, demo y conclusiones.',
    })
  })

  it('preserves task history when its manual course is deactivated', async () => {
    const courseCreation = await studentAgent
      .post('/api/v1/academic/courses')
      .send({ name: 'Materia histórica' })
    const courseId = courseCreation.body.course.id
    const taskCreation = await studentAgent
      .post('/api/v1/academic/tasks')
      .send({
        courseId,
        title: 'Tarea histórica',
        description: 'Debe conservar su materia original.',
        dueAt: null,
        priority: 'medium',
      })

    await studentAgent
      .delete(`/api/v1/academic/courses/${courseId}`)
      .expect(204)

    const update = await studentAgent
      .patch(`/api/v1/academic/tasks/${taskCreation.body.task.id}`)
      .send({
        courseId,
        title: 'Tarea histórica corregida',
      })
    expect(update.status).toBe(200)
    expect(update.body.task).toMatchObject({
      courseId,
      title: 'Tarea histórica corregida',
      description: 'Debe conservar su materia original.',
    })

    const dashboard = await studentAgent.get('/api/v1/academic')
    expect(dashboard.body.courses).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: courseId })]),
    )
    expect(dashboard.body.archivedCourses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: courseId, active: false }),
      ]),
    )
  })
})
