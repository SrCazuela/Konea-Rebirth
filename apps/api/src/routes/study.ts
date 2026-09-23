import { and, asc, desc, eq, lt, ne, sql } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db, isUniqueViolation } from '../db/client.js'
import {
  academicCourses,
  academicTasks,
  studySessionEvents,
  studySessions,
} from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody, parseId } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'

const studyMethods = [
  'pomodoro',
  'pomodoro_extended',
  'deep_work',
  'flowtime',
  'custom',
] as const
const studyStatuses = ['active', 'paused', 'completed', 'cancelled'] as const
const HEARTBEAT_GRACE_SECONDS = 90

const createSessionSchema = z
  .strictObject({
    clientRequestId: z.string().uuid(),
    method: z.enum(studyMethods),
    courseId: z.string().uuid().nullable().optional(),
    taskId: z.string().uuid().nullable().optional(),
    plannedDurationSeconds: z.number().int().min(0).max(43_200),
    breakDurationSeconds: z.number().int().min(0).max(7_200).default(0),
  })
  .superRefine((input, context) => {
    if (input.method === 'flowtime' && input.plannedDurationSeconds !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['plannedDurationSeconds'],
        message:
          'Flowtime debe usar una duraci\u00f3n planificada de 0 segundos.',
      })
    }
    if (input.method !== 'flowtime' && input.plannedDurationSeconds < 60) {
      context.addIssue({
        code: 'custom',
        path: ['plannedDurationSeconds'],
        message:
          'La duraci\u00f3n planificada debe ser de al menos 60 segundos.',
      })
    }
  })

const transitionSchema = z.strictObject({
  action: z.enum(['heartbeat', 'pause', 'resume', 'complete', 'cancel']),
})

const listQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().datetime({ offset: true }).optional(),
  status: z.enum(studyStatuses).optional(),
})

const overviewQuerySchema = z.strictObject({
  timeZone: z.string().trim().min(1).max(100).default('America/Santiago'),
})

type SessionRecord = {
  session: typeof studySessions.$inferSelect
  courseName: string | null
  taskTitle: string | null
}

type CreateSessionInput = z.infer<typeof createSessionSchema>

function parseQuery<TSchema extends z.ZodType>(
  schema: TSchema,
  query: unknown,
): z.infer<TSchema> {
  const result = schema.safeParse(query)
  if (!result.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'La consulta no es v\u00e1lida.',
      {
        fields: z.flattenError(result.error).fieldErrors,
      },
    )
  }
  return result.data
}

function ensureValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
  } catch {
    throw new ApiError(
      400,
      'INVALID_TIME_ZONE',
      'La zona horaria no es v\u00e1lida.',
    )
  }
}

function localDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  )
  return `${values.year}-${values.month}-${values.day}`
}

function moveDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function startOfWeek(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  const daysSinceMonday = (date.getUTCDay() + 6) % 7
  return moveDateKey(dateKey, -daysSinceMonday)
}

function calculateStreaks(dateKeys: string[], today: string) {
  const sorted = [...new Set(dateKeys)].sort()
  let bestStreakDays = 0
  let running = 0
  let previous: string | null = null

  for (const dateKey of sorted) {
    running = previous && moveDateKey(previous, 1) === dateKey ? running + 1 : 1
    bestStreakDays = Math.max(bestStreakDays, running)
    previous = dateKey
  }

  const available = new Set(sorted)
  let cursor = available.has(today) ? today : moveDateKey(today, -1)
  let currentStreakDays = 0
  while (available.has(cursor)) {
    currentStreakDays += 1
    cursor = moveDateKey(cursor, -1)
  }

  return { currentStreakDays, bestStreakDays }
}

function effectiveFocusedSeconds(
  session: typeof studySessions.$inferSelect,
  now = new Date(),
) {
  if (session.status !== 'active' || !session.activeStartedAt) {
    return session.focusedSeconds
  }
  const lastPermittedActivity = Math.min(
    now.getTime(),
    session.lastHeartbeatAt.getTime() + HEARTBEAT_GRACE_SECONDS * 1_000,
  )
  const activeSeconds = Math.max(
    0,
    Math.floor(
      (lastPermittedActivity - session.activeStartedAt.getTime()) / 1_000,
    ),
  )
  return session.focusedSeconds + activeSeconds
}

function isHeartbeatStale(
  session: typeof studySessions.$inferSelect,
  now: Date,
) {
  return (
    session.status === 'active' &&
    now.getTime() - session.lastHeartbeatAt.getTime() >
      HEARTBEAT_GRACE_SECONDS * 1_000
  )
}

function stalePauseAt(session: typeof studySessions.$inferSelect, now: Date) {
  const timeoutAt =
    session.lastHeartbeatAt.getTime() + HEARTBEAT_GRACE_SECONDS * 1_000
  return new Date(Math.min(now.getTime(), timeoutAt))
}

async function pauseStaleCurrentSession(userId: string, now: Date) {
  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from ${studySessions} where ${studySessions.userId} = ${userId} and ${studySessions.status} = 'active' for update`,
    )
    const [session] = await transaction
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, userId),
          eq(studySessions.status, 'active'),
        ),
      )
      .limit(1)
    if (!session || !isHeartbeatStale(session, now)) return

    const pausedAt = stalePauseAt(session, now)
    const focusedSeconds = effectiveFocusedSeconds(session, now)
    await transaction
      .update(studySessions)
      .set({
        status: 'paused',
        focusedSeconds,
        activeStartedAt: null,
        pausedAt,
        updatedAt: now,
      })
      .where(eq(studySessions.id, session.id))
    await transaction.insert(studySessionEvents).values({
      sessionId: session.id,
      userId,
      type: 'pause',
      focusedSeconds,
      occurredAt: pausedAt,
    })
  })
}

function serializeSession(record: SessionRecord, now = new Date()) {
  const { session, courseName, taskTitle } = record
  const effective = effectiveFocusedSeconds(session, now)
  return {
    ...session,
    lastResumedAt: session.activeStartedAt,
    accumulatedFocusedSeconds: session.focusedSeconds,
    effectiveFocusedSeconds: effective,
    course: session.courseId
      ? { id: session.courseId, name: courseName ?? 'Asignatura eliminada' }
      : null,
    task: session.taskId
      ? { id: session.taskId, title: taskTitle ?? 'Tarea eliminada' }
      : null,
  }
}

function sessionSelection() {
  return {
    session: studySessions,
    courseName: academicCourses.name,
    taskTitle: academicTasks.title,
  }
}

async function findSession(userId: string, sessionId: string) {
  const [record] = await db
    .select(sessionSelection())
    .from(studySessions)
    .leftJoin(academicCourses, eq(academicCourses.id, studySessions.courseId))
    .leftJoin(academicTasks, eq(academicTasks.id, studySessions.taskId))
    .where(
      and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)),
    )
    .limit(1)
  return record ?? null
}

async function findSessionByClientRequest(userId: string, requestId: string) {
  const [record] = await db
    .select(sessionSelection())
    .from(studySessions)
    .leftJoin(academicCourses, eq(academicCourses.id, studySessions.courseId))
    .leftJoin(academicTasks, eq(academicTasks.id, studySessions.taskId))
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.clientRequestId, requestId),
      ),
    )
    .limit(1)
  return record ?? null
}

function ensureIdempotentSessionRequest(
  record: SessionRecord,
  input: CreateSessionInput,
) {
  const { session } = record
  const courseMatches =
    input.courseId !== undefined && input.courseId !== null
      ? session.courseId === input.courseId
      : input.taskId
        ? true
        : session.courseId === null
  if (
    session.method !== input.method ||
    session.taskId !== (input.taskId ?? null) ||
    !courseMatches ||
    session.plannedDurationSeconds !== input.plannedDurationSeconds ||
    session.breakDurationSeconds !== input.breakDurationSeconds
  ) {
    throw new ApiError(
      409,
      'STUDY_IDEMPOTENCY_KEY_REUSED',
      'Ese identificador de solicitud ya fue usado con otros parámetros.',
    )
  }
}

async function resolveOwnedLinks(
  userId: string,
  courseId: string | null,
  taskId: string | null,
) {
  let resolvedCourseId = courseId
  if (taskId) {
    const [task] = await db
      .select({ id: academicTasks.id, courseId: academicTasks.courseId })
      .from(academicTasks)
      .where(
        and(eq(academicTasks.id, taskId), eq(academicTasks.userId, userId)),
      )
      .limit(1)
    if (!task) {
      throw new ApiError(
        404,
        'ACADEMIC_TASK_NOT_FOUND',
        'La tarea seleccionada no existe.',
      )
    }
    if (
      resolvedCourseId &&
      task.courseId &&
      task.courseId !== resolvedCourseId
    ) {
      throw new ApiError(
        409,
        'STUDY_LINK_MISMATCH',
        'La tarea no pertenece a la asignatura seleccionada.',
      )
    }
    resolvedCourseId ??= task.courseId
  }

  if (resolvedCourseId) {
    const [course] = await db
      .select({ id: academicCourses.id })
      .from(academicCourses)
      .where(
        and(
          eq(academicCourses.id, resolvedCourseId),
          eq(academicCourses.userId, userId),
          eq(academicCourses.active, true),
        ),
      )
      .limit(1)
    if (!course) {
      throw new ApiError(
        404,
        'ACADEMIC_COURSE_NOT_FOUND',
        'La asignatura seleccionada no existe o est\u00e1 inactiva.',
      )
    }
  }

  return { courseId: resolvedCourseId, taskId }
}

const effectiveSecondsSql = sql<number>`case
  when ${studySessions.status} = 'active' and ${studySessions.activeStartedAt} is not null
    then ${studySessions.focusedSeconds} + greatest(0, floor(extract(epoch from (least(current_timestamp, ${studySessions.lastHeartbeatAt} + interval '90 seconds') - ${studySessions.activeStartedAt}))))::int
  else ${studySessions.focusedSeconds}
end`

export const studyRouter = Router()
studyRouter.use(requireAuthentication)

studyRouter.get('/overview', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const { timeZone } = parseQuery(overviewQuerySchema, request.query)
  ensureValidTimeZone(timeZone)

  const now = new Date()
  await pauseStaleCurrentSession(currentUser.id, now)
  const today = localDateKey(now, timeZone)
  const weekStart = startOfWeek(today)
  const chartStart = moveDateKey(today, -6)
  const localDateSql = sql<string>`to_char(timezone(${timeZone}, ${studySessions.startedAt}), 'YYYY-MM-DD')`

  const [activeRecords, totals, dayRows, courseRows, streakRows, recent] =
    await Promise.all([
      db
        .select(sessionSelection())
        .from(studySessions)
        .leftJoin(
          academicCourses,
          eq(academicCourses.id, studySessions.courseId),
        )
        .leftJoin(academicTasks, eq(academicTasks.id, studySessions.taskId))
        .where(
          and(
            eq(studySessions.userId, currentUser.id),
            sql`${studySessions.status} in ('active', 'paused')`,
          ),
        )
        .limit(1),
      db
        .select({
          totalFocusedSeconds: sql<number>`coalesce(sum(case when ${studySessions.status} = 'completed' then ${studySessions.focusedSeconds} else 0 end), 0)::int`,
          todayFocusedSeconds: sql<number>`coalesce(sum(case when ${studySessions.status} = 'completed' and ${localDateSql} = ${today} then ${studySessions.focusedSeconds} else 0 end), 0)::int`,
          weekFocusedSeconds: sql<number>`coalesce(sum(case when ${studySessions.status} = 'completed' and ${localDateSql} >= ${weekStart} then ${studySessions.focusedSeconds} else 0 end), 0)::int`,
          totalSessions: sql<number>`count(*)::int`,
          completedSessions: sql<number>`count(*) filter (where ${studySessions.status} = 'completed')::int`,
        })
        .from(studySessions)
        .where(
          and(
            eq(studySessions.userId, currentUser.id),
            ne(studySessions.status, 'cancelled'),
          ),
        ),
      db
        .select({
          date: localDateSql,
          focusedSeconds: sql<number>`coalesce(sum(${effectiveSecondsSql}), 0)::int`,
          sessions: sql<number>`count(*)::int`,
        })
        .from(studySessions)
        .where(
          and(
            eq(studySessions.userId, currentUser.id),
            eq(studySessions.status, 'completed'),
            sql`${localDateSql} >= ${chartStart}`,
          ),
        )
        .groupBy(sql`1`),
      db
        .select({
          courseId: studySessions.courseId,
          courseName: sql<string>`coalesce(${academicCourses.name}, 'Sin asignatura')`,
          focusedSeconds: sql<number>`coalesce(sum(${effectiveSecondsSql}), 0)::int`,
          sessions: sql<number>`count(*)::int`,
        })
        .from(studySessions)
        .leftJoin(
          academicCourses,
          eq(academicCourses.id, studySessions.courseId),
        )
        .where(
          and(
            eq(studySessions.userId, currentUser.id),
            eq(studySessions.status, 'completed'),
          ),
        )
        .groupBy(studySessions.courseId, academicCourses.name)
        .orderBy(sql`sum(${effectiveSecondsSql}) desc`)
        .limit(12),
      db
        .select({ date: localDateSql })
        .from(studySessions)
        .where(
          and(
            eq(studySessions.userId, currentUser.id),
            eq(studySessions.status, 'completed'),
            sql`${effectiveSecondsSql} > 0`,
          ),
        )
        .groupBy(sql`1`),
      db
        .select(sessionSelection())
        .from(studySessions)
        .leftJoin(
          academicCourses,
          eq(academicCourses.id, studySessions.courseId),
        )
        .leftJoin(academicTasks, eq(academicTasks.id, studySessions.taskId))
        .where(eq(studySessions.userId, currentUser.id))
        .orderBy(desc(studySessions.startedAt))
        .limit(8),
    ])

  const byDayLookup = new Map(dayRows.map((row) => [row.date, row]))
  const byDay = Array.from({ length: 7 }, (_, index) => {
    const date = moveDateKey(chartStart, index)
    return byDayLookup.get(date) ?? { date, focusedSeconds: 0, sessions: 0 }
  })
  const streaks = calculateStreaks(
    streakRows.map((row) => row.date),
    today,
  )
  const total = totals[0] ?? {
    totalFocusedSeconds: 0,
    todayFocusedSeconds: 0,
    weekFocusedSeconds: 0,
    totalSessions: 0,
    completedSessions: 0,
  }

  response.json({
    activeSession: activeRecords[0]
      ? serializeSession(activeRecords[0], now)
      : null,
    stats: { ...total, ...streaks },
    byDay,
    byCourse: courseRows,
    recentSessions: recent.map((record) => serializeSession(record, now)),
  })
})

studyRouter.get('/sessions', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseQuery(listQuerySchema, request.query)
  const filters = [eq(studySessions.userId, currentUser.id)]
  if (input.cursor)
    filters.push(lt(studySessions.startedAt, new Date(input.cursor)))
  if (input.status) filters.push(eq(studySessions.status, input.status))

  const records = await db
    .select(sessionSelection())
    .from(studySessions)
    .leftJoin(academicCourses, eq(academicCourses.id, studySessions.courseId))
    .leftJoin(academicTasks, eq(academicTasks.id, studySessions.taskId))
    .where(and(...filters))
    .orderBy(desc(studySessions.startedAt))
    .limit(input.limit + 1)

  const hasMore = records.length > input.limit
  const page = records.slice(0, input.limit)
  response.json({
    sessions: page.map((record) => serializeSession(record)),
    nextCursor: hasMore ? page.at(-1)?.session.startedAt.toISOString() : null,
  })
})

studyRouter.get('/sessions/:sessionId/events', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const sessionId = parseId(
    request.params.sessionId,
    'El identificador de la sesi\u00f3n no es v\u00e1lido.',
  )
  const session = await findSession(currentUser.id, sessionId)
  if (!session) {
    throw new ApiError(
      404,
      'STUDY_SESSION_NOT_FOUND',
      'La sesi\u00f3n de estudio no existe.',
    )
  }
  const events = await db
    .select()
    .from(studySessionEvents)
    .where(
      and(
        eq(studySessionEvents.sessionId, sessionId),
        eq(studySessionEvents.userId, currentUser.id),
      ),
    )
    .orderBy(asc(studySessionEvents.occurredAt))
  response.json({ events })
})

studyRouter.post('/sessions', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(createSessionSchema, request.body)
  const replay = await findSessionByClientRequest(
    currentUser.id,
    input.clientRequestId,
  )
  if (replay) {
    ensureIdempotentSessionRequest(replay, input)
    response.json({ session: serializeSession(replay), idempotent: true })
    return
  }

  const links = await resolveOwnedLinks(
    currentUser.id,
    input.courseId ?? null,
    input.taskId ?? null,
  )
  const now = new Date()
  let createdId: string
  try {
    createdId = await db.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(studySessions)
        .values({
          userId: currentUser.id,
          clientRequestId: input.clientRequestId,
          method: input.method,
          courseId: links.courseId,
          taskId: links.taskId,
          plannedDurationSeconds: input.plannedDurationSeconds,
          breakDurationSeconds: input.breakDurationSeconds,
          startedAt: now,
          activeStartedAt: now,
          lastHeartbeatAt: now,
        })
        .returning({ id: studySessions.id })
      if (!created) throw new Error('Study session was not created')
      await transaction.insert(studySessionEvents).values({
        sessionId: created.id,
        userId: currentUser.id,
        type: 'start',
        focusedSeconds: 0,
        occurredAt: now,
      })
      return created.id
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const concurrentReplay = await findSessionByClientRequest(
      currentUser.id,
      input.clientRequestId,
    )
    if (concurrentReplay) {
      ensureIdempotentSessionRequest(concurrentReplay, input)
      response.json({
        session: serializeSession(concurrentReplay),
        idempotent: true,
      })
      return
    }
    throw new ApiError(
      409,
      'STUDY_SESSION_ALREADY_CURRENT',
      'Ya tienes una sesi\u00f3n activa o pausada. Final\u00edzala antes de iniciar otra.',
    )
  }

  const created = await findSession(currentUser.id, createdId)
  if (!created) throw new Error('Created study session could not be loaded')
  response
    .status(201)
    .json({ session: serializeSession(created, now), idempotent: false })
})

studyRouter.patch('/sessions/:sessionId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const sessionId = parseId(
    request.params.sessionId,
    'El identificador de la sesi\u00f3n no es v\u00e1lido.',
  )
  const { action } = parseBody(transitionSchema, request.body)
  const now = new Date()

  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select id from ${studySessions} where ${studySessions.id} = ${sessionId} and ${studySessions.userId} = ${currentUser.id} for update`,
    )
    let [session] = await transaction
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.id, sessionId),
          eq(studySessions.userId, currentUser.id),
        ),
      )
      .limit(1)
    if (!session) {
      throw new ApiError(
        404,
        'STUDY_SESSION_NOT_FOUND',
        'La sesi\u00f3n de estudio no existe.',
      )
    }

    if (isHeartbeatStale(session, now)) {
      const pausedAt = stalePauseAt(session, now)
      const focusedSeconds = effectiveFocusedSeconds(session, now)
      await transaction
        .update(studySessions)
        .set({
          status: 'paused',
          focusedSeconds,
          activeStartedAt: null,
          pausedAt,
          updatedAt: now,
        })
        .where(eq(studySessions.id, sessionId))
      await transaction.insert(studySessionEvents).values({
        sessionId,
        userId: currentUser.id,
        type: 'pause',
        focusedSeconds,
        occurredAt: pausedAt,
      })
      session = {
        ...session,
        status: 'paused',
        focusedSeconds,
        activeStartedAt: null,
        pausedAt,
        updatedAt: now,
      }
    }

    if (
      (action === 'heartbeat' && session.status === 'paused') ||
      (action === 'pause' && session.status === 'paused') ||
      (action === 'resume' && session.status === 'active') ||
      (action === 'complete' && session.status === 'completed') ||
      (action === 'cancel' && session.status === 'cancelled')
    ) {
      return
    }

    const permitted =
      (action === 'heartbeat' && session.status === 'active') ||
      (action === 'pause' && session.status === 'active') ||
      (action === 'resume' && session.status === 'paused') ||
      (action === 'complete' &&
        (session.status === 'active' || session.status === 'paused')) ||
      (action === 'cancel' &&
        (session.status === 'active' || session.status === 'paused'))
    if (!permitted) {
      throw new ApiError(
        409,
        'INVALID_STUDY_SESSION_TRANSITION',
        `No puedes ejecutar ${action} desde el estado ${session.status}.`,
      )
    }

    const activeDelta =
      session.status === 'active' && session.activeStartedAt
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - session.activeStartedAt.getTime()) / 1_000,
            ),
          )
        : 0
    const focusedSeconds = session.focusedSeconds + activeDelta

    if (action === 'heartbeat') {
      await transaction
        .update(studySessions)
        .set({
          focusedSeconds,
          activeStartedAt: now,
          lastHeartbeatAt: now,
          updatedAt: now,
        })
        .where(eq(studySessions.id, sessionId))
      return
    } else if (action === 'pause') {
      await transaction
        .update(studySessions)
        .set({
          status: 'paused',
          focusedSeconds,
          activeStartedAt: null,
          pausedAt: now,
          updatedAt: now,
        })
        .where(eq(studySessions.id, sessionId))
    } else if (action === 'resume') {
      await transaction
        .update(studySessions)
        .set({
          status: 'active',
          activeStartedAt: now,
          lastHeartbeatAt: now,
          pausedAt: null,
          updatedAt: now,
        })
        .where(eq(studySessions.id, sessionId))
    } else {
      await transaction
        .update(studySessions)
        .set({
          status: action === 'complete' ? 'completed' : 'cancelled',
          focusedSeconds,
          activeStartedAt: null,
          pausedAt: null,
          endedAt: now,
          updatedAt: now,
        })
        .where(eq(studySessions.id, sessionId))
    }

    await transaction.insert(studySessionEvents).values({
      sessionId,
      userId: currentUser.id,
      type: action,
      focusedSeconds,
      occurredAt: now,
    })
  })

  const updated = await findSession(currentUser.id, sessionId)
  if (!updated) throw new Error('Updated study session could not be loaded')
  response.json({ session: serializeSession(updated, now) })
})
