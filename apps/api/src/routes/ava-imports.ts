import { createHash } from 'node:crypto'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { env } from '../config/env.js'
import { db } from '../db/client.js'
import {
  academicCourses,
  academicTasks,
  avaDomImports,
  type AvaDomImportPayload,
  type AvaDomImportResult,
} from '../db/schema.js'
import { cleanCourseName, normalizeCourseName } from '../domain/academic.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody, parseId } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'

const CAMPUS_HOST = 'campusvirtual.duoc.cl'
const DRAFT_LIFETIME_MS = 24 * 60 * 60 * 1_000
const EXTERNAL_SOURCE = 'ava_extension' as const

function normalizeCampusUrl(value: string) {
  const parsed = new URL(value)
  parsed.username = ''
  parsed.password = ''
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

const campusUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2_000)
  .refine((value) => {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && parsed.hostname === CAMPUS_HOST
  }, 'La captura debe provenir del Campus Virtual de Duoc UC.')
  .transform(normalizeCampusUrl)

const nullableText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .transform((value) => value || null)

const clientIdSchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/u)

const courseSchema = z.strictObject({
  clientId: clientIdSchema,
  name: z.string().trim().min(2).max(300),
  code: nullableText(80),
  section: nullableText(80),
  term: nullableText(100),
})

const activitySchema = z.strictObject({
  clientId: clientIdSchema,
  title: z.string().trim().min(2).max(160),
  description: nullableText(1_000),
  courseName: nullableText(300),
  dueAt: z.string().datetime({ offset: true }).nullable(),
  sourceUrl: campusUrlSchema.nullable(),
})

function uniqueClientIds(
  values: Array<{ clientId: string }>,
  context: z.RefinementCtx,
) {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (seen.has(value.clientId)) {
      context.addIssue({
        code: 'custom',
        message: 'Los identificadores de la captura deben ser únicos.',
        path: [index, 'clientId'],
      })
    }
    seen.add(value.clientId)
  }
}

export const avaDomPayloadSchema = z
  .strictObject({
    version: z.literal(1),
    source: z.strictObject({
      pageUrl: campusUrlSchema,
      pageTitle: z.string().trim().min(1).max(300),
      capturedAt: z.string().datetime({ offset: true }),
    }),
    courses: z.array(courseSchema).max(100),
    activities: z.array(activitySchema).max(250),
  })
  .superRefine((payload, context) => {
    uniqueClientIds(payload.courses, context)
    uniqueClientIds(payload.activities, context)
    if (payload.courses.length === 0 && payload.activities.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'La captura no contiene materias ni actividades.',
      })
    }
  })

const selectionSchema = z.strictObject({
  courseClientIds: z.array(clientIdSchema).max(100),
  activityClientIds: z.array(clientIdSchema).max(250),
})

const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 15,
  skip: () => env.NODE_ENV === 'test',
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_AVA_IMPORTS',
      message:
        'Demasiados intentos de importación. Intenta nuevamente más tarde.',
    },
  },
})

function digestPayload(payload: AvaDomImportPayload) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function activityExternalId(payload: AvaDomImportPayload, clientId: string) {
  return createHash('sha256')
    .update(`${payload.source.pageUrl}\0${clientId}`)
    .digest('hex')
}

function discardedPayload(now: Date): AvaDomImportPayload {
  return {
    version: 1,
    source: {
      pageUrl: `https://${CAMPUS_HOST}/`,
      pageTitle: 'Captura descartada',
      capturedAt: now.toISOString(),
    },
    courses: [],
    activities: [],
  }
}

async function minimizeExpiredDrafts(userId: string, now: Date) {
  await db
    .update(avaDomImports)
    .set({
      status: 'discarded',
      payload: discardedPayload(now),
      updatedAt: now,
    })
    .where(
      and(
        eq(avaDomImports.userId, userId),
        eq(avaDomImports.status, 'draft'),
        lte(avaDomImports.expiresAt, now),
      ),
    )
}

async function buildPreview(userId: string, payload: AvaDomImportPayload) {
  const courseNames = payload.courses.map((course) =>
    normalizeCourseName(course.name),
  )
  const taskExternalIds = payload.activities.map((activity) =>
    activityExternalId(payload, activity.clientId),
  )
  const [courses, tasks] = await Promise.all([
    courseNames.length
      ? db
          .select({
            normalizedName: academicCourses.normalizedName,
            active: academicCourses.active,
            source: academicCourses.source,
          })
          .from(academicCourses)
          .where(
            and(
              eq(academicCourses.userId, userId),
              inArray(academicCourses.normalizedName, courseNames),
            ),
          )
      : [],
    taskExternalIds.length
      ? db
          .select({ externalId: academicTasks.externalId })
          .from(academicTasks)
          .where(
            and(
              eq(academicTasks.userId, userId),
              eq(academicTasks.externalSource, EXTERNAL_SOURCE),
              inArray(academicTasks.externalId, taskExternalIds),
            ),
          )
      : [],
  ])
  const coursesByName = new Map(
    courses.map((course) => [course.normalizedName, course]),
  )
  const existingTaskIds = new Set(tasks.map((task) => task.externalId))

  return {
    courses: payload.courses.map((course) => {
      const storedCourse = coursesByName.get(normalizeCourseName(course.name))
      const reactivatable = Boolean(
        storedCourse &&
        !storedCourse.active &&
        storedCourse.source === EXTERNAL_SOURCE,
      )
      return {
        ...course,
        // `existing` means that there is nothing the importer can do. Keeping
        // it false for a reactivatable course also makes older clients select
        // it instead of silently skipping it.
        existing: Boolean(storedCourse) && !reactivatable,
        reactivatable,
        state: !storedCourse
          ? ('new' as const)
          : reactivatable
            ? ('reactivatable' as const)
            : ('existing' as const),
      }
    }),
    activities: payload.activities.map((activity) => ({
      ...activity,
      existing: existingTaskIds.has(
        activityExternalId(payload, activity.clientId),
      ),
    })),
  }
}

function assertSelection(
  payload: AvaDomImportPayload,
  selection: z.infer<typeof selectionSchema>,
) {
  const courseIds = new Set(payload.courses.map((course) => course.clientId))
  const activityIds = new Set(
    payload.activities.map((activity) => activity.clientId),
  )
  const selectionHasDuplicates =
    new Set(selection.courseClientIds).size !==
      selection.courseClientIds.length ||
    new Set(selection.activityClientIds).size !==
      selection.activityClientIds.length
  if (
    selectionHasDuplicates ||
    selection.courseClientIds.some((id) => !courseIds.has(id)) ||
    selection.activityClientIds.some((id) => !activityIds.has(id))
  ) {
    throw new ApiError(
      400,
      'INVALID_AVA_IMPORT_SELECTION',
      'La selección no corresponde a esta captura de AVA.',
    )
  }
}

export const avaImportsRouter = Router()
avaImportsRouter.use(requireAuthentication)

avaImportsRouter.post('/previews', importLimiter, async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const payload = parseBody(avaDomPayloadSchema, request.body)
  const digest = digestPayload(payload)
  const now = new Date()
  const expiresAt = new Date(now.getTime() + DRAFT_LIFETIME_MS)
  await minimizeExpiredDrafts(currentUser.id, now)

  const [existing] = await db
    .select()
    .from(avaDomImports)
    .where(
      and(
        eq(avaDomImports.userId, currentUser.id),
        eq(avaDomImports.payloadDigest, digest),
      ),
    )
    .limit(1)

  let avaImport = existing
  if (!avaImport) {
    const insertedImports = await db
      .insert(avaDomImports)
      .values({
        userId: currentUser.id,
        payloadDigest: digest,
        payload,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning()
    avaImport = insertedImports[0]
    if (!avaImport) {
      const concurrentImports = await db
        .select()
        .from(avaDomImports)
        .where(
          and(
            eq(avaDomImports.userId, currentUser.id),
            eq(avaDomImports.payloadDigest, digest),
          ),
        )
        .limit(1)
      avaImport = concurrentImports[0]
    }
  } else if (
    avaImport.status !== 'confirmed' &&
    (avaImport.status === 'discarded' || avaImport.expiresAt <= now)
  ) {
    const refreshedImports = await db
      .update(avaDomImports)
      .set({
        payload,
        status: 'draft',
        result: null,
        expiresAt,
        confirmedAt: null,
        updatedAt: now,
      })
      .where(eq(avaDomImports.id, avaImport.id))
      .returning()
    const refreshedImport = refreshedImports[0]
    if (!refreshedImport) {
      throw new ApiError(
        409,
        'AVA_IMPORT_CONFLICT',
        'No pudimos actualizar la captura. Intenta nuevamente.',
      )
    }
    avaImport = refreshedImport
  }

  if (!avaImport) {
    throw new ApiError(
      409,
      'AVA_IMPORT_CONFLICT',
      'No pudimos preparar la captura. Intenta nuevamente.',
    )
  }

  let preview = await buildPreview(currentUser.id, payload)
  const canImportAnything =
    preview.courses.some((course) => !course.existing) ||
    preview.activities.some((activity) => !activity.existing)

  // A confirmed capture is normally idempotent. If its persisted data was
  // later archived or removed, however, the same file must become actionable
  // again instead of returning a stale "already confirmed" result.
  if (avaImport.status === 'confirmed' && canImportAnything) {
    const refreshedImports = await db
      .update(avaDomImports)
      .set({
        payload,
        status: 'draft',
        result: null,
        expiresAt,
        confirmedAt: null,
        updatedAt: now,
      })
      .where(eq(avaDomImports.id, avaImport.id))
      .returning()
    avaImport = refreshedImports[0]
    preview = await buildPreview(currentUser.id, payload)
  }

  if (!avaImport) {
    throw new ApiError(
      409,
      'AVA_IMPORT_CONFLICT',
      'No pudimos preparar la captura. Intenta nuevamente.',
    )
  }

  response.status(existing ? 200 : 201).json({
    import: {
      id: avaImport.id,
      status: avaImport.status,
      expiresAt: avaImport.expiresAt,
      result: avaImport.result,
    },
    ...preview,
  })
})

avaImportsRouter.post(
  '/previews/:importId/confirm',
  importLimiter,
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const importId = parseId(
      request.params.importId,
      'El identificador de importación no es válido.',
    )
    const selection = parseBody(selectionSchema, request.body)

    const result = await db.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`ava-dom-import:${currentUser.id}`}))`,
      )
      const [avaImport] = await transaction
        .select()
        .from(avaDomImports)
        .where(
          and(
            eq(avaDomImports.id, importId),
            eq(avaDomImports.userId, currentUser.id),
          ),
        )
        .limit(1)
      if (!avaImport) {
        throw new ApiError(
          404,
          'AVA_IMPORT_NOT_FOUND',
          'La vista previa ya no está disponible.',
        )
      }
      if (avaImport.status === 'confirmed') {
        return (
          avaImport.result ?? {
            importedCourses: 0,
            reactivatedCourses: 0,
            importedTasks: 0,
            existingCourses: 0,
            existingTasks: 0,
          }
        )
      }
      if (avaImport.status !== 'draft' || avaImport.expiresAt <= new Date()) {
        throw new ApiError(
          409,
          'AVA_IMPORT_EXPIRED',
          'La vista previa venció. Vuelve a cargar la captura.',
        )
      }

      const payloadResult = avaDomPayloadSchema.safeParse(avaImport.payload)
      if (!payloadResult.success) {
        throw new ApiError(
          409,
          'AVA_IMPORT_INVALID',
          'La captura guardada ya no es válida.',
        )
      }
      const payload = payloadResult.data
      assertSelection(payload, selection)
      const selectedCourseIds = new Set(selection.courseClientIds)
      const selectedActivityIds = new Set(selection.activityClientIds)
      const selectedCourses = payload.courses.filter((course) =>
        selectedCourseIds.has(course.clientId),
      )
      const selectedActivities = payload.activities.filter((activity) =>
        selectedActivityIds.has(activity.clientId),
      )
      const now = new Date()

      const selectedCourseNames = selectedCourses.map((course) =>
        normalizeCourseName(course.name),
      )
      const storedCourses = selectedCourseNames.length
        ? await transaction
            .select({
              id: academicCourses.id,
              normalizedName: academicCourses.normalizedName,
              active: academicCourses.active,
              source: academicCourses.source,
              code: academicCourses.code,
              section: academicCourses.section,
              term: academicCourses.term,
            })
            .from(academicCourses)
            .where(
              and(
                eq(academicCourses.userId, currentUser.id),
                inArray(academicCourses.normalizedName, selectedCourseNames),
              ),
            )
        : []
      const storedCoursesByName = new Map(
        storedCourses.map((course) => [course.normalizedName, course]),
      )
      const coursesToReactivate = new Map(
        selectedCourses.flatMap((course) => {
          const normalizedName = normalizeCourseName(course.name)
          const storedCourse = storedCoursesByName.get(normalizedName)
          return storedCourse &&
            !storedCourse.active &&
            storedCourse.source === EXTERNAL_SOURCE
            ? [[storedCourse.id, { course, storedCourse }] as const]
            : []
        }),
      )
      let reactivatedCourses = 0
      for (const [courseId, { course, storedCourse }] of coursesToReactivate) {
        const name = cleanCourseName(course.name)
        const reactivated = await transaction
          .update(academicCourses)
          .set({
            name,
            normalizedName: normalizeCourseName(name),
            code: course.code ?? storedCourse.code,
            section: course.section ?? storedCourse.section,
            term: course.term ?? storedCourse.term,
            active: true,
            updatedAt: now,
          })
          .where(
            and(
              eq(academicCourses.id, courseId),
              eq(academicCourses.userId, currentUser.id),
              eq(academicCourses.active, false),
              eq(academicCourses.source, EXTERNAL_SOURCE),
            ),
          )
          .returning({ id: academicCourses.id })
        reactivatedCourses += reactivated.length
      }

      const coursesToInsert = selectedCourses.filter(
        (course) => !storedCoursesByName.has(normalizeCourseName(course.name)),
      )

      const insertedCourses = coursesToInsert.length
        ? await transaction
            .insert(academicCourses)
            .values(
              coursesToInsert.map((course) => {
                const name = cleanCourseName(course.name)
                return {
                  userId: currentUser.id,
                  name,
                  normalizedName: normalizeCourseName(name),
                  code: course.code,
                  section: course.section,
                  term: course.term,
                  source: EXTERNAL_SOURCE,
                  active: true,
                  updatedAt: now,
                }
              }),
            )
            .onConflictDoNothing()
            .returning({ id: academicCourses.id })
        : []

      const userCourses = await transaction
        .select({
          id: academicCourses.id,
          normalizedName: academicCourses.normalizedName,
        })
        .from(academicCourses)
        .where(
          and(
            eq(academicCourses.userId, currentUser.id),
            eq(academicCourses.active, true),
          ),
        )
      const courseIdsByName = new Map(
        userCourses.map((course) => [course.normalizedName, course.id]),
      )
      const activitiesWithExternalIds = selectedActivities.map((activity) => ({
        activity,
        externalId: activityExternalId(payload, activity.clientId),
      }))
      const externalIds = activitiesWithExternalIds.map(
        ({ externalId }) => externalId,
      )
      const existingTasks = externalIds.length
        ? await transaction
            .select({ externalId: academicTasks.externalId })
            .from(academicTasks)
            .where(
              and(
                eq(academicTasks.userId, currentUser.id),
                eq(academicTasks.externalSource, EXTERNAL_SOURCE),
                inArray(academicTasks.externalId, externalIds),
              ),
            )
        : []
      const existingTaskIds = new Set(
        existingTasks.map((task) => task.externalId),
      )
      const newTasks = activitiesWithExternalIds.filter(
        ({ externalId }) => !existingTaskIds.has(externalId),
      )
      const insertedTasks = newTasks.length
        ? await transaction
            .insert(academicTasks)
            .values(
              newTasks.map(({ activity, externalId }) => ({
                userId: currentUser.id,
                courseId: activity.courseName
                  ? (courseIdsByName.get(
                      normalizeCourseName(activity.courseName),
                    ) ?? null)
                  : null,
                title: activity.title,
                description: activity.description,
                dueAt: activity.dueAt ? new Date(activity.dueAt) : null,
                priority: 'medium' as const,
                status: 'pending' as const,
                externalSource: EXTERNAL_SOURCE,
                externalId,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: academicTasks.id })
        : []

      const importResult: AvaDomImportResult = {
        importedCourses: insertedCourses.length,
        reactivatedCourses,
        importedTasks: insertedTasks.length,
        existingCourses:
          selectedCourses.length - insertedCourses.length - reactivatedCourses,
        existingTasks: selectedActivities.length - insertedTasks.length,
      }
      await transaction
        .update(avaDomImports)
        .set({
          status: 'confirmed',
          result: importResult,
          payload: { ...payload, courses: [], activities: [] },
          confirmedAt: now,
          updatedAt: now,
        })
        .where(eq(avaDomImports.id, avaImport.id))
      return importResult
    })

    response.json({ result })
  },
)

avaImportsRouter.delete('/previews/:importId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const importId = parseId(
    request.params.importId,
    'El identificador de importación no es válido.',
  )
  const [discarded] = await db
    .update(avaDomImports)
    .set({
      status: 'discarded',
      payload: discardedPayload(new Date()),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(avaDomImports.id, importId),
        eq(avaDomImports.userId, currentUser.id),
        eq(avaDomImports.status, 'draft'),
      ),
    )
    .returning({ id: avaDomImports.id })
  if (!discarded) {
    throw new ApiError(
      404,
      'AVA_IMPORT_NOT_FOUND',
      'La vista previa ya no está disponible.',
    )
  }
  response.status(204).end()
})
