import { and, asc, desc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  academicCalendarEvents,
  academicCalendarSyncs,
  academicCourses,
  academicTasks,
} from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .optional()
    .transform((value) => value || null)

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
    description: optionalText(1_000),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Debes enviar al menos un cambio.',
  })

function normalizeCourseName(value: string) {
  return value.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase('es-CL')
}

function parseId(value: string | undefined) {
  const parsed = z.string().uuid().safeParse(value)
  if (!parsed.success) {
    throw new ApiError(400, 'INVALID_ID', 'El identificador no es válido.')
  }
  return parsed.data
}

async function ensureOwnedCourse(userId: string, courseId: string | null) {
  if (!courseId) return
  const [course] = await db
    .select({ id: academicCourses.id })
    .from(academicCourses)
    .where(
      and(
        eq(academicCourses.id, courseId),
        eq(academicCourses.userId, userId),
        eq(academicCourses.active, true),
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
  const [courses, tasks, events, syncRows] = await Promise.all([
    db
      .select()
      .from(academicCourses)
      .where(
        and(
          eq(academicCourses.userId, userId),
          eq(academicCourses.active, true),
        ),
      )
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
  return { courses, tasks, events, sync: syncRows[0] ?? null }
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
  const normalizedName = normalizeCourseName(input.name)
  const [existing] = await db
    .select({ id: academicCourses.id })
    .from(academicCourses)
    .where(
      and(
        eq(academicCourses.userId, currentUser.id),
        eq(academicCourses.normalizedName, normalizedName),
      ),
    )
    .limit(1)
  if (existing) {
    throw new ApiError(409, 'ACADEMIC_COURSE_EXISTS', 'Esta materia ya existe.')
  }
  const [course] = await db
    .insert(academicCourses)
    .values({ userId: currentUser.id, normalizedName, ...input })
    .returning()
  response.status(201).json({ course })
})

academicRouter.patch('/courses/:courseId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const courseId = parseId(request.params.courseId)
  const input = parseBody(courseUpdateSchema, request.body)
  const [course] = await db
    .update(academicCourses)
    .set({
      ...input,
      ...(input.name
        ? { normalizedName: normalizeCourseName(input.name) }
        : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(academicCourses.id, courseId),
        eq(academicCourses.userId, currentUser.id),
      ),
    )
    .returning()
  if (!course)
    throw new ApiError(
      404,
      'ACADEMIC_COURSE_NOT_FOUND',
      'La materia no existe.',
    )
  response.json({ course })
})

academicRouter.delete('/courses/:courseId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const courseId = parseId(request.params.courseId)
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
  if (input.courseId !== undefined) {
    await ensureOwnedCourse(currentUser.id, input.courseId)
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
