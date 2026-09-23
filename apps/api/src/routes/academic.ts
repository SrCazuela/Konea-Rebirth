import { and, asc, desc, eq, gt, gte, ne, or } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  academicCalendarEvents,
  academicCalendarSyncs,
  academicCourses,
  academicTasks,
} from '../db/schema.js'
import { cleanCourseName, normalizeCourseName } from '../domain/academic.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { calendarDateFloorInTimeZone } from '../services/ics-calendar-service.js'

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || null)
const optionalUpdateText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null)
    .optional()

const courseCreateSchema = z.strictObject({
  name: z.string().trim().min(2).max(300),
  code: optionalText(80),
  section: optionalText(80),
  term: optionalText(100),
})
const courseUpdateSchema = courseCreateSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Debes enviar al menos un cambio.',
  })
const taskCreateSchema = z.strictObject({
  courseId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(160),
  description: optionalText(1_000),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
})
const taskUpdateSchema = z
  .strictObject({
    courseId: z.string().uuid().nullable().optional(),
    title: z.string().trim().min(2).max(160).optional(),
    description: optionalUpdateText(1_000),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Debes enviar al menos un cambio.',
  })

function hasDatabaseCode(error: unknown, expectedCode: string) {
  let current = error
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== 'object' || current === null) return false
    if ('code' in current && current.code === expectedCode) return true
    current = 'cause' in current ? current.cause : null
  }
  return false
}

function courseConflict() {
  return new ApiError(
    409,
    'ACADEMIC_COURSE_EXISTS',
    'Ya existe otra materia con ese nombre.',
  )
}

function parseId(value: string | undefined) {
  const parsed = z.string().uuid().safeParse(value)
  if (!parsed.success) {
    throw new ApiError(400, 'INVALID_ID', 'El identificador no es válido.')
  }
  return parsed.data
}

async function ensureOwnedCourse(
  userId: string,
  courseId: string | null,
  allowInactive = false,
) {
  if (!courseId) return
  const [course] = await db
    .select({ id: academicCourses.id })
    .from(academicCourses)
    .where(
      and(
        eq(academicCourses.id, courseId),
        eq(academicCourses.userId, userId),
        ...(allowInactive ? [] : [eq(academicCourses.active, true)]),
      ),
    )
    .limit(1)
  if (!course) {
    throw new ApiError(
      404,
      'ACADEMIC_COURSE_NOT_FOUND',
      'La materia no existe.',
    )
  }
}

async function loadDashboard(userId: string) {
  const now = new Date()
  const currentAllDayDate = calendarDateFloorInTimeZone(now)
  const [allCourses, tasks, events, syncRows] = await Promise.all([
    db
      .select()
      .from(academicCourses)
      .where(eq(academicCourses.userId, userId))
      .orderBy(asc(academicCourses.name)),
    db
      .select()
      .from(academicTasks)
      .where(eq(academicTasks.userId, userId))
      .orderBy(asc(academicTasks.dueAt), desc(academicTasks.createdAt)),
    db
      .select({
        id: academicCalendarEvents.id,
        title: academicCalendarEvents.title,
        description: academicCalendarEvents.description,
        location: academicCalendarEvents.location,
        courseName: academicCalendarEvents.courseName,
        startsAt: academicCalendarEvents.startsAt,
        endsAt: academicCalendarEvents.endsAt,
        allDay: academicCalendarEvents.allDay,
      })
      .from(academicCalendarEvents)
      .where(
        and(
          eq(academicCalendarEvents.userId, userId),
          eq(academicCalendarEvents.active, true),
          or(
            and(
              eq(academicCalendarEvents.allDay, false),
              or(
                gte(academicCalendarEvents.startsAt, now),
                gte(academicCalendarEvents.endsAt, now),
              ),
            ),
            and(
              eq(academicCalendarEvents.allDay, true),
              or(
                gte(academicCalendarEvents.startsAt, currentAllDayDate),
                gt(academicCalendarEvents.endsAt, currentAllDayDate),
              ),
            ),
          ),
        ),
      )
      .orderBy(asc(academicCalendarEvents.startsAt))
      .limit(200),
    db
      .select({
        lastSyncedAt: academicCalendarSyncs.lastSyncedAt,
        lastEventCount: academicCalendarSyncs.lastEventCount,
      })
      .from(academicCalendarSyncs)
      .where(eq(academicCalendarSyncs.userId, userId))
      .limit(1),
  ])
  return {
    courses: allCourses.filter((course) => course.active),
    archivedCourses: allCourses.filter((course) => !course.active),
    tasks,
    events,
    sync: syncRows[0] ?? null,
  }
}

export const academicRouter = Router()
academicRouter.use(requireAuthentication)

academicRouter.get('/', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  response.json(await loadDashboard(currentUser.id))
})

academicRouter.post('/courses', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(courseCreateSchema, request.body)
  const name = cleanCourseName(input.name)
  const normalizedName = normalizeCourseName(name)
  const [existing] = await db
    .select()
    .from(academicCourses)
    .where(
      and(
        eq(academicCourses.userId, currentUser.id),
        eq(academicCourses.normalizedName, normalizedName),
      ),
    )
    .limit(1)
  if (existing) {
    if (existing.active) throw courseConflict()
    if (existing.source === 'ava') {
      throw new ApiError(
        409,
        'ACADEMIC_COURSE_READ_ONLY',
        'Las materias sincronizadas desde AVA se reactivan mediante la sincronización.',
      )
    }

    const [course] = await db
      .update(academicCourses)
      .set({
        ...input,
        name,
        normalizedName,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(academicCourses.id, existing.id))
      .returning()
    response.json({ course, reactivated: true })
    return
  }
  try {
    const [course] = await db
      .insert(academicCourses)
      .values({ userId: currentUser.id, ...input, name, normalizedName })
      .returning()
    response.status(201).json({ course, reactivated: false })
  } catch (error) {
    if (hasDatabaseCode(error, '23505')) throw courseConflict()
    throw error
  }
})

academicRouter.patch('/courses/:courseId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const courseId = parseId(request.params.courseId)
  const input = parseBody(courseUpdateSchema, request.body)
  const [ownedCourse] = await db
    .select({ id: academicCourses.id, source: academicCourses.source })
    .from(academicCourses)
    .where(
      and(
        eq(academicCourses.id, courseId),
        eq(academicCourses.userId, currentUser.id),
      ),
    )
    .limit(1)
  if (!ownedCourse)
    throw new ApiError(
      404,
      'ACADEMIC_COURSE_NOT_FOUND',
      'La materia no existe.',
    )
  if (ownedCourse.source === 'ava') {
    throw new ApiError(
      409,
      'ACADEMIC_COURSE_READ_ONLY',
      'Las materias sincronizadas desde AVA son de solo lectura.',
    )
  }

  const name = input.name ? cleanCourseName(input.name) : undefined
  const normalizedName = name ? normalizeCourseName(name) : undefined
  if (normalizedName) {
    const [duplicate] = await db
      .select({ id: academicCourses.id })
      .from(academicCourses)
      .where(
        and(
          eq(academicCourses.userId, currentUser.id),
          eq(academicCourses.normalizedName, normalizedName),
          ne(academicCourses.id, courseId),
        ),
      )
      .limit(1)
    if (duplicate) throw courseConflict()
  }

  try {
    const [course] = await db
      .update(academicCourses)
      .set({
        ...input,
        ...(name ? { name } : {}),
        ...(normalizedName ? { normalizedName } : {}),
        updatedAt: new Date(),
      })
      .where(eq(academicCourses.id, courseId))
      .returning()
    response.json({ course })
  } catch (error) {
    if (hasDatabaseCode(error, '23505')) throw courseConflict()
    throw error
  }
})

academicRouter.delete('/courses/:courseId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const courseId = parseId(request.params.courseId)
  const [ownedCourse] = await db
    .select({ source: academicCourses.source })
    .from(academicCourses)
    .where(
      and(
        eq(academicCourses.id, courseId),
        eq(academicCourses.userId, currentUser.id),
      ),
    )
    .limit(1)
  if (!ownedCourse)
    throw new ApiError(
      404,
      'ACADEMIC_COURSE_NOT_FOUND',
      'La materia no existe.',
    )
  if (ownedCourse.source === 'ava') {
    throw new ApiError(
      409,
      'ACADEMIC_COURSE_READ_ONLY',
      'Las materias sincronizadas desde AVA se administran mediante la sincronización.',
    )
  }
  const [course] = await db
    .update(academicCourses)
    .set({ active: false, updatedAt: new Date() })
    .where(
      and(
        eq(academicCourses.id, courseId),
        eq(academicCourses.userId, currentUser.id),
      ),
    )
    .returning({ id: academicCourses.id })
  if (!course)
    throw new ApiError(
      404,
      'ACADEMIC_COURSE_NOT_FOUND',
      'La materia no existe.',
    )
  response.status(204).end()
})

academicRouter.post('/tasks', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(taskCreateSchema, request.body)
  await ensureOwnedCourse(currentUser.id, input.courseId ?? null)
  const [task] = await db
    .insert(academicTasks)
    .values({
      ...input,
      userId: currentUser.id,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    })
    .returning()
  response.status(201).json({ task })
})

academicRouter.patch('/tasks/:taskId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const taskId = parseId(request.params.taskId)
  const input = parseBody(taskUpdateSchema, request.body)
  const { dueAt, ...updates } = input
  const [ownedTask] = await db
    .select({ courseId: academicTasks.courseId })
    .from(academicTasks)
    .where(
      and(
        eq(academicTasks.id, taskId),
        eq(academicTasks.userId, currentUser.id),
      ),
    )
    .limit(1)
  if (!ownedTask)
    throw new ApiError(404, 'ACADEMIC_TASK_NOT_FOUND', 'La tarea no existe.')
  if (input.courseId !== undefined) {
    await ensureOwnedCourse(
      currentUser.id,
      input.courseId,
      input.courseId === ownedTask.courseId,
    )
  }
  const [task] = await db
    .update(academicTasks)
    .set({
      ...updates,
      ...(dueAt !== undefined ? { dueAt: dueAt ? new Date(dueAt) : null } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(academicTasks.id, taskId),
        eq(academicTasks.userId, currentUser.id),
      ),
    )
    .returning()
  if (!task)
    throw new ApiError(404, 'ACADEMIC_TASK_NOT_FOUND', 'La tarea no existe.')
  response.json({ task })
})

academicRouter.delete('/tasks/:taskId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const taskId = parseId(request.params.taskId)
  const deleted = await db
    .delete(academicTasks)
    .where(
      and(
        eq(academicTasks.id, taskId),
        eq(academicTasks.userId, currentUser.id),
      ),
    )
    .returning({ id: academicTasks.id })
  if (!deleted[0])
    throw new ApiError(404, 'ACADEMIC_TASK_NOT_FOUND', 'La tarea no existe.')
  response.status(204).end()
})
