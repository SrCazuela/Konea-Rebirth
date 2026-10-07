import { and, eq, inArray, or } from 'drizzle-orm'
import { env } from '../config/env.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import {
  academicCourses,
  academicTasks,
  studySessionEvents,
  studySessions,
} from '../db/schema.js'
import { findCapstoneDemoStudent } from '../demo/capstone-demo-target.js'

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const DEMO_TASK_SOURCE = 'konea_demo'
const DEMO_TIME_ZONE = 'America/Santiago'
const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

type CourseRole = 'capstone' | 'english' | 'machineLearning' | 'programming'
type StudyMethod =
  'pomodoro' | 'pomodoro_extended' | 'deep_work' | 'flowtime' | 'custom'

type ResolvedCourse = {
  id: string
  name: string
  normalizedName: string
  active: boolean
}

type DemoTaskDefinition = {
  externalId: string
  course: CourseRole
  title: string
  description: string
  dueAt: Date
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'in_progress' | 'completed'
  createdAt: Date
  updatedAt: Date
}

type DemoSessionDefinition = {
  id: string
  clientRequestId: string
  course: CourseRole
  taskExternalId: string | null
  method: StudyMethod
  plannedDurationSeconds: number
  breakDurationSeconds: number
  focusedSeconds: number
  startedAt: Date
  endedAt: Date
}

const COURSE_MATCHERS: Record<CourseRole, RegExp[]> = {
  capstone: [/^capstone(?:_|\b)/i, /proyecto.*capstone/i],
  english: [/english/i, /ingl[eé]s/i],
  machineLearning: [/machine learning/i, /aprendizaje autom[aá]tico/i],
  programming: [/programaci[oó]n/i, /algoritm/i],
}

const SESSION_IDS = Array.from(
  { length: 8 },
  (_, index) =>
    `d3a00000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
)
const SESSION_CLIENT_REQUEST_IDS = Array.from(
  { length: 8 },
  (_, index) =>
    `d3a10000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
)
const SESSION_EVENT_IDS = Array.from(
  { length: 16 },
  (_, index) =>
    `d3a20000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
)

function assertLocalDevelopmentDatabase() {
  if (env.NODE_ENV !== 'development') {
    throw new Error(
      'El contenido académico demo solo puede prepararse con NODE_ENV=development.',
    )
  }

  let databaseUrl: URL
  try {
    databaseUrl = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('DATABASE_URL no es una URL PostgreSQL válida.')
  }

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error(
      'DATABASE_URL debe usar el protocolo postgres o postgresql.',
    )
  }

  const hostname = databaseUrl.hostname.toLowerCase()
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(
      `El contenido académico demo solo puede prepararse en una base local; host recibido: ${hostname}.`,
    )
  }
}

function dateKeyInTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEMO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )
  return `${values.year}-${values.month}-${values.day}`
}

function parseDateKey(dateKey: string) {
  const [yearText, monthText, dayText] = dateKey.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (![year, month, day].every(Number.isInteger)) {
    throw new Error(`Fecha civil inválida para el contenido demo: ${dateKey}.`)
  }
  return { year, month, day }
}

function moveDateKey(dateKey: string, days: number) {
  const { year, month, day } = parseDateKey(dateKey)
  const moved = new Date(Date.UTC(year, month - 1, day + days, 12))
  return moved.toISOString().slice(0, 10)
}

function zonedDate(dateKey: string, hour: number, minute: number) {
  const { year, month, day } = parseDateKey(dateKey)
  const intendedUtc = Date.UTC(year, month - 1, day, hour, minute)
  let candidate = new Date(intendedUtc)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: DEMO_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(candidate)
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    )
    const partNumber = (type: string) => {
      const value = Number(values[type])
      if (!Number.isInteger(value)) {
        throw new Error(`No se pudo calcular la hora demo (${type}).`)
      }
      return value
    }
    const representedUtc = Date.UTC(
      partNumber('year'),
      partNumber('month') - 1,
      partNumber('day'),
      partNumber('hour'),
      partNumber('minute'),
      partNumber('second'),
    )
    candidate = new Date(candidate.getTime() + intendedUtc - representedUtc)
  }

  return candidate
}

function dayAt(seedDate: Date, offset: number, hour: number, minute = 0) {
  return zonedDate(
    moveDateKey(dateKeyInTimeZone(seedDate), offset),
    hour,
    minute,
  )
}

function buildTaskDefinitions(seedDate: Date): DemoTaskDefinition[] {
  const createdAt = new Date(seedDate.getTime() - 5 * DAY_MS)
  const todayDueAt = new Date(seedDate.getTime() + 6 * 60 * MINUTE_MS)

  return [
    {
      externalId: 'konea-demo-task-01',
      course: 'capstone',
      title: 'Ensayar presentación del avance Capstone',
      description:
        'Repasar el problema, la propuesta de valor y el recorrido de la demostración. Cronometrar una presentación de 8 minutos.',
      dueAt: todayDueAt,
      priority: 'high',
      status: 'in_progress',
      createdAt,
      updatedAt: seedDate,
    },
    {
      externalId: 'konea-demo-task-02',
      course: 'capstone',
      title: 'Preparar segunda evaluación parcial',
      description:
        'Revisar la pauta, ordenar las evidencias y verificar que el flujo principal esté listo para presentar.',
      dueAt: dayAt(seedDate, 1, 18),
      priority: 'high',
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    },
    {
      externalId: 'konea-demo-task-03',
      course: 'english',
      title: 'Entregar borrador de Written Project',
      description:
        'Completar introducción y conclusiones, revisar vocabulario técnico y aplicar la rúbrica antes de entregar.',
      dueAt: dayAt(seedDate, 2, 23),
      priority: 'high',
      status: 'in_progress',
      createdAt,
      updatedAt: seedDate,
    },
    {
      externalId: 'konea-demo-task-04',
      course: 'machineLearning',
      title: 'Completar notebook de Machine Learning',
      description:
        'Entrenar el modelo base, comparar métricas y documentar las decisiones tomadas en el notebook.',
      dueAt: dayAt(seedDate, 3, 20),
      priority: 'medium',
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    },
    {
      externalId: 'konea-demo-task-05',
      course: 'programming',
      title: 'Resolver guía de grafos y algoritmos',
      description:
        'Resolver los ejercicios 1 al 6 y anotar las dudas para la próxima clase.',
      dueAt: dayAt(seedDate, 5, 20),
      priority: 'medium',
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    },
    {
      externalId: 'konea-demo-task-06',
      course: 'capstone',
      title: 'Revisar rúbrica y repartir la exposición',
      description:
        'Asignar cada sección de la presentación y dejar una lista breve de preguntas posibles del profesor.',
      dueAt: dayAt(seedDate, 7, 19),
      priority: 'low',
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    },
    {
      externalId: 'konea-demo-task-07',
      course: 'english',
      title: 'Practicar exposición en inglés',
      description:
        'Ensayo completo realizado con control de tiempo y corrección de pronunciación.',
      dueAt: dayAt(seedDate, -1, 18),
      priority: 'medium',
      status: 'completed',
      createdAt: new Date(seedDate.getTime() - 7 * DAY_MS),
      updatedAt: dayAt(seedDate, -1, 17, 30),
    },
    {
      externalId: 'konea-demo-task-08',
      course: 'capstone',
      title: 'Actualizar evidencias del sistema',
      description:
        'Capturas y descripción de los flujos principales incorporadas al documento de evidencias.',
      dueAt: dayAt(seedDate, -2, 20),
      priority: 'high',
      status: 'completed',
      createdAt: new Date(seedDate.getTime() - 8 * DAY_MS),
      updatedAt: dayAt(seedDate, -2, 19, 15),
    },
    {
      externalId: 'konea-demo-task-09',
      course: 'machineLearning',
      title: 'Limpiar dataset del laboratorio',
      description:
        'Valores faltantes corregidos y variables categóricas preparadas para el entrenamiento.',
      dueAt: dayAt(seedDate, -4, 19),
      priority: 'medium',
      status: 'completed',
      createdAt: new Date(seedDate.getTime() - 10 * DAY_MS),
      updatedAt: dayAt(seedDate, -4, 18, 45),
    },
  ]
}

function buildSessionDefinitions(seedDate: Date): DemoSessionDefinition[] {
  const latestEndedAt = new Date(seedDate.getTime() - 5 * MINUTE_MS)
  const latestStartedAt = new Date(latestEndedAt.getTime() - 25 * MINUTE_MS)
  const earlierEndedAt = new Date(latestStartedAt.getTime() - 10 * MINUTE_MS)
  const earlierStartedAt = new Date(earlierEndedAt.getTime() - 50 * MINUTE_MS)
  const sessions: Array<Omit<DemoSessionDefinition, 'id' | 'clientRequestId'>> =
    [
      {
        course: 'machineLearning',
        taskExternalId: 'konea-demo-task-09',
        method: 'flowtime',
        plannedDurationSeconds: 0,
        breakDurationSeconds: 0,
        focusedSeconds: 2_520,
        startedAt: dayAt(seedDate, -6, 18),
        endedAt: dayAt(seedDate, -6, 18, 42),
      },
      {
        course: 'english',
        taskExternalId: 'konea-demo-task-07',
        method: 'pomodoro',
        plannedDurationSeconds: 1_500,
        breakDurationSeconds: 300,
        focusedSeconds: 1_500,
        startedAt: dayAt(seedDate, -5, 17, 30),
        endedAt: dayAt(seedDate, -5, 17, 55),
      },
      {
        course: 'capstone',
        taskExternalId: 'konea-demo-task-08',
        method: 'pomodoro_extended',
        plannedDurationSeconds: 3_000,
        breakDurationSeconds: 600,
        focusedSeconds: 3_000,
        startedAt: dayAt(seedDate, -4, 11),
        endedAt: dayAt(seedDate, -4, 11, 50),
      },
      {
        course: 'programming',
        taskExternalId: 'konea-demo-task-05',
        method: 'custom',
        plannedDurationSeconds: 2_400,
        breakDurationSeconds: 600,
        focusedSeconds: 2_400,
        startedAt: dayAt(seedDate, -3, 16),
        endedAt: dayAt(seedDate, -3, 16, 40),
      },
      {
        course: 'capstone',
        taskExternalId: 'konea-demo-task-02',
        method: 'pomodoro',
        plannedDurationSeconds: 1_500,
        breakDurationSeconds: 300,
        focusedSeconds: 1_500,
        startedAt: dayAt(seedDate, -2, 19),
        endedAt: dayAt(seedDate, -2, 19, 25),
      },
      {
        course: 'machineLearning',
        taskExternalId: 'konea-demo-task-04',
        method: 'deep_work',
        plannedDurationSeconds: 5_400,
        breakDurationSeconds: 1_200,
        focusedSeconds: 5_400,
        startedAt: dayAt(seedDate, -1, 18),
        endedAt: dayAt(seedDate, -1, 19, 30),
      },
      {
        course: 'capstone',
        taskExternalId: 'konea-demo-task-01',
        method: 'pomodoro_extended',
        plannedDurationSeconds: 3_000,
        breakDurationSeconds: 600,
        focusedSeconds: 3_000,
        startedAt: earlierStartedAt,
        endedAt: earlierEndedAt,
      },
      {
        course: 'english',
        taskExternalId: 'konea-demo-task-03',
        method: 'pomodoro',
        plannedDurationSeconds: 1_500,
        breakDurationSeconds: 300,
        focusedSeconds: 1_500,
        startedAt: latestStartedAt,
        endedAt: latestEndedAt,
      },
    ]

  return sessions.map((session, index) => ({
    ...session,
    id: SESSION_IDS[index]!,
    clientRequestId: SESSION_CLIENT_REQUEST_IDS[index]!,
  }))
}

function resolveCourses(courses: ResolvedCourse[]) {
  const available = [...courses].sort(
    (left, right) =>
      Number(right.active) - Number(left.active) ||
      left.normalizedName.localeCompare(right.normalizedName),
  )
  const usedIds = new Set<string>()
  const resolved = new Map<CourseRole, ResolvedCourse | null>()
  const roles = Object.keys(COURSE_MATCHERS) as CourseRole[]

  for (const role of roles) {
    const matched = available.find(
      (course) =>
        !usedIds.has(course.id) &&
        COURSE_MATCHERS[role].some((matcher) =>
          matcher.test(course.normalizedName),
        ),
    )
    if (matched) usedIds.add(matched.id)
    resolved.set(role, matched ?? null)
  }

  return resolved
}

async function assertReservedSessionIdsAreSafe(userId: string) {
  const reservedSessions = await db
    .select({
      id: studySessions.id,
      userId: studySessions.userId,
      clientRequestId: studySessions.clientRequestId,
    })
    .from(studySessions)
    .where(
      or(
        inArray(studySessions.id, SESSION_IDS),
        inArray(studySessions.clientRequestId, SESSION_CLIENT_REQUEST_IDS),
      ),
    )

  for (const session of reservedSessions) {
    const index = SESSION_IDS.indexOf(session.id)
    if (
      session.userId !== userId ||
      index < 0 ||
      session.clientRequestId !== SESSION_CLIENT_REQUEST_IDS[index]
    ) {
      throw new Error(
        `Colisión con el identificador reservado de sesión ${session.id}. No se modificó la base de datos.`,
      )
    }
  }

  const reservedEvents = await db
    .select({
      id: studySessionEvents.id,
      sessionId: studySessionEvents.sessionId,
      userId: studySessionEvents.userId,
    })
    .from(studySessionEvents)
    .where(inArray(studySessionEvents.id, SESSION_EVENT_IDS))

  for (const event of reservedEvents) {
    if (event.userId !== userId || !SESSION_IDS.includes(event.sessionId)) {
      throw new Error(
        `Colisión con el identificador reservado de evento ${event.id}. No se modificó la base de datos.`,
      )
    }
  }
}

export async function seedCapstoneDemoAcademic() {
  assertLocalDevelopmentDatabase()
  const seededAt = new Date()
  const target = await findCapstoneDemoStudent()
  if (!target) {
    console.log(
      'Datos académicos demo omitidos: registra una cuenta estudiantil y se prepararán en el próximo inicio.',
    )
    return
  }
  const courses = await db
    .select({
      id: academicCourses.id,
      name: academicCourses.name,
      normalizedName: academicCourses.normalizedName,
      active: academicCourses.active,
    })
    .from(academicCourses)
    .where(eq(academicCourses.userId, target.id))
  const courseByRole = resolveCourses(courses)

  await assertReservedSessionIdsAreSafe(target.id)

  const taskDefinitions = buildTaskDefinitions(seededAt)
  const sessionDefinitions = buildSessionDefinitions(seededAt)

  const availableTaskCount = await db.transaction(async (transaction) => {
    const existingSessions = await transaction
      .select({ id: studySessions.id })
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, target.id),
          inArray(studySessions.id, SESSION_IDS),
        ),
      )
    const existingSessionIds = new Set(
      existingSessions.map((session) => session.id),
    )
    const scenarioAlreadyExists = existingSessionIds.size > 0

    const existingTasks = await transaction
      .select({ id: academicTasks.id, externalId: academicTasks.externalId })
      .from(academicTasks)
      .where(
        and(
          eq(academicTasks.userId, target.id),
          eq(academicTasks.externalSource, DEMO_TASK_SOURCE),
          inArray(
            academicTasks.externalId,
            taskDefinitions.map((task) => task.externalId),
          ),
        ),
      )
    const existingTaskByExternalId = new Map(
      existingTasks.map((task) => [task.externalId, task.id]),
    )
    const taskIdByExternalId = new Map<string, string>()

    for (const task of taskDefinitions) {
      const existingId = existingTaskByExternalId.get(task.externalId)
      if (existingId) {
        // El usuario puede editar o completar los registros demo durante la
        // presentación. Reiniciar el proyecto no debe deshacer esa interacción.
        taskIdByExternalId.set(task.externalId, existingId)
        continue
      }
      if (scenarioAlreadyExists) {
        // A missing task after the scenario was initialized is a deliberate
        // user deletion. Keep it deleted instead of recreating it at startup.
        continue
      }

      const values = {
        userId: target.id,
        courseId: courseByRole.get(task.course)?.id ?? null,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt,
        priority: task.priority,
        status: task.status,
        externalSource: DEMO_TASK_SOURCE,
        externalId: task.externalId,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      }
      const [stored] = await transaction
        .insert(academicTasks)
        .values(values)
        .returning({ id: academicTasks.id })
      if (!stored) throw new Error(`No se pudo preparar ${task.externalId}.`)
      taskIdByExternalId.set(task.externalId, stored.id)
    }

    for (const session of sessionDefinitions) {
      const values = {
        userId: target.id,
        courseId: courseByRole.get(session.course)?.id ?? null,
        taskId: session.taskExternalId
          ? (taskIdByExternalId.get(session.taskExternalId) ?? null)
          : null,
        clientRequestId: session.clientRequestId,
        method: session.method,
        status: 'completed' as const,
        plannedDurationSeconds: session.plannedDurationSeconds,
        breakDurationSeconds: session.breakDurationSeconds,
        focusedSeconds: session.focusedSeconds,
        startedAt: session.startedAt,
        activeStartedAt: null,
        lastHeartbeatAt: session.endedAt,
        pausedAt: null,
        endedAt: session.endedAt,
        createdAt: session.startedAt,
        updatedAt: session.endedAt,
      }
      if (existingSessionIds.has(session.id)) {
        await transaction
          .update(studySessions)
          .set(values)
          .where(
            and(
              eq(studySessions.id, session.id),
              eq(studySessions.userId, target.id),
              eq(studySessions.clientRequestId, session.clientRequestId),
            ),
          )
      } else {
        await transaction.insert(studySessions).values({
          id: session.id,
          ...values,
        })
      }
    }

    await transaction
      .delete(studySessionEvents)
      .where(
        and(
          eq(studySessionEvents.userId, target.id),
          inArray(studySessionEvents.sessionId, SESSION_IDS),
        ),
      )

    await transaction.insert(studySessionEvents).values(
      sessionDefinitions.flatMap((session, index) => [
        {
          id: SESSION_EVENT_IDS[index * 2]!,
          sessionId: session.id,
          userId: target.id,
          type: 'start' as const,
          focusedSeconds: 0,
          occurredAt: session.startedAt,
        },
        {
          id: SESSION_EVENT_IDS[index * 2 + 1]!,
          sessionId: session.id,
          userId: target.id,
          type: 'complete' as const,
          focusedSeconds: session.focusedSeconds,
          occurredAt: session.endedAt,
        },
      ]),
    )
    return taskIdByExternalId.size
  })

  const courseSummary = [...courseByRole.entries()]
    .map(([role, course]) => `${role}: ${course?.name ?? 'sin materia'}`)
    .join(' · ')
  console.log(
    [
      `Demo académica lista para ${target.displayName} (@${target.username}).`,
      `${availableTaskCount} tareas disponibles`,
      `${sessionDefinitions.length} sesiones FocusBuddy`,
      'racha de 7 días',
      courseSummary,
    ].join(' · '),
  )
}

try {
  await seedCapstoneDemoAcademic()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
