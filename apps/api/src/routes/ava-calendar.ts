import { and, asc, count, eq, gte, sql } from 'drizzle-orm'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  academicCalendarEvents,
  academicCalendarSyncs,
  academicCourses,
} from '../db/schema.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { fetchAvaCalendar } from '../services/ics-calendar-service.js'

const syncCalendarSchema = z.strictObject({
  calendarUrl: z.string().trim().min(1).max(2_000),
})

const syncLimiter = rateLimit({
  windowMs: 10 * 60 * 1_000, // 10 minutos
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_SYNC_REQUESTS',
      message:
        'Demasiadas sincronizaciones. Espera unos minutos antes de volver a intentarlo.',
    },
  },
})

async function loadCalendar(userId: string) {
  const now = new Date()
  const [syncRows, upcomingEvents, countRows] = await Promise.all([
    db
      .select({
        lastSyncedAt: academicCalendarSyncs.lastSyncedAt,
        lastEventCount: academicCalendarSyncs.lastEventCount,
      })
      .from(academicCalendarSyncs)
      .where(eq(academicCalendarSyncs.userId, userId))
      .limit(1),
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
          gte(academicCalendarEvents.startsAt, now),
        ),
      )
      .orderBy(asc(academicCalendarEvents.startsAt))
      .limit(50),
    db
      .select({ value: count() })
      .from(academicCalendarEvents)
      .where(
        and(
          eq(academicCalendarEvents.userId, userId),
          eq(academicCalendarEvents.active, true),
          gte(academicCalendarEvents.startsAt, now),
        ),
      ),
  ])

  return {
    sync: syncRows[0] ?? null,
    upcomingCount: countRows[0]?.value ?? 0,
    events: upcomingEvents,
  }
}

export const avaCalendarRouter = Router()
avaCalendarRouter.use(requireAuthentication)

avaCalendarRouter.get('/', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  response.json(await loadCalendar(currentUser.id))
})

avaCalendarRouter.post('/sync', syncLimiter, async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(syncCalendarSchema, request.body)
  const importedEvents = await fetchAvaCalendar(input.calendarUrl)
  const syncedAt = new Date()
  const detectedCourses = [
    ...new Map(
      importedEvents
        .filter((event) => event.courseName)
        .map((event) => {
          const name = event.courseName!.trim().replaceAll(/\s+/g, ' ')
          return [name.toLocaleLowerCase('es-CL'), name] as const
        }),
    ),
  ]

  await db.transaction(async (transaction) => {
    await transaction
      .update(academicCourses)
      .set({ active: false, updatedAt: syncedAt })
      .where(
        and(
          eq(academicCourses.userId, currentUser.id),
          eq(academicCourses.source, 'ava'),
        ),
      )

    if (detectedCourses.length > 0) {
      await transaction
        .insert(academicCourses)
        .values(
          detectedCourses.map(([normalizedName, name]) => ({
            userId: currentUser.id,
            name,
            normalizedName,
            source: 'ava' as const,
            active: true,
            updatedAt: syncedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [academicCourses.userId, academicCourses.normalizedName],
          set: {
            name: sql`excluded.name`,
            active: true,
            updatedAt: syncedAt,
          },
        })
    }

    await transaction
      .update(academicCalendarEvents)
      .set({ active: false, updatedAt: syncedAt })
      .where(eq(academicCalendarEvents.userId, currentUser.id))

    if (importedEvents.length > 0) {
      await transaction
        .insert(academicCalendarEvents)
        .values(
          importedEvents.map((event) => ({
            userId: currentUser.id,
            ...event,
            active: true,
            lastSyncedAt: syncedAt,
            updatedAt: syncedAt,
          })),
        )
        .onConflictDoUpdate({
          target: [
            academicCalendarEvents.userId,
            academicCalendarEvents.externalId,
          ],
          set: {
            uid: sql`excluded.uid`,
            title: sql`excluded.title`,
            description: sql`excluded.description`,
            location: sql`excluded.location`,
            courseName: sql`excluded.course_name`,
            startsAt: sql`excluded.starts_at`,
            endsAt: sql`excluded.ends_at`,
            allDay: sql`excluded.all_day`,
            active: true,
            lastSyncedAt: syncedAt,
            updatedAt: syncedAt,
          },
        })
    }

    await transaction
      .insert(academicCalendarSyncs)
      .values({
        userId: currentUser.id,
        lastSyncedAt: syncedAt,
        lastEventCount: importedEvents.length,
        updatedAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: academicCalendarSyncs.userId,
        set: {
          lastSyncedAt: syncedAt,
          lastEventCount: importedEvents.length,
          updatedAt: syncedAt,
        },
      })
  })

  response.json({
    ...(await loadCalendar(currentUser.id)),
    importedCount: importedEvents.length,
  })
})
