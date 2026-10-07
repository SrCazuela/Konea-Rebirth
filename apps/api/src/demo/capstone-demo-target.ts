import {
  and,
  count,
  eq,
  inArray,
  like,
  not,
  notInArray,
  sql,
} from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  academicCourses,
  chats,
  profiles,
  studySessions,
  supportRequests,
  users,
} from '../db/schema.js'
import { SOCIAL_DEMO_USER_IDS } from './social-demo-data.js'

export type CapstoneDemoStudent = {
  id: string
  email: string
  username: string
  displayName: string
}

const DEMO_GROUP_CHAT_ID = 'e1000000-0000-4000-8000-000000000003'
const DEMO_PRIMARY_REQUEST_ID = 'e1000000-0000-4000-8000-000000000001'
const DEMO_STUDY_SESSION_IDS = Array.from(
  { length: 8 },
  (_, index) =>
    `d3a00000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
)

async function findExistingScenarioOwnerId() {
  const [chatOwners, requestOwners, sessionOwners] = await Promise.all([
    db
      .select({ userId: chats.createdById })
      .from(chats)
      .where(eq(chats.id, DEMO_GROUP_CHAT_ID)),
    db
      .select({ userId: supportRequests.requesterId })
      .from(supportRequests)
      .where(eq(supportRequests.id, DEMO_PRIMARY_REQUEST_ID)),
    db
      .selectDistinct({ userId: studySessions.userId })
      .from(studySessions)
      .where(inArray(studySessions.id, DEMO_STUDY_SESSION_IDS)),
  ])
  const ownerIds = new Set(
    [...chatOwners, ...requestOwners, ...sessionOwners].map(
      (owner) => owner.userId,
    ),
  )
  if (ownerIds.size > 1) {
    throw new Error(
      'Los datos Capstone existentes pertenecen a cuentas diferentes. Elimina o migra únicamente el escenario demo antes de volver a prepararlo.',
    )
  }
  return [...ownerIds][0] ?? null
}

async function loadEligibleStudentById(userId: string) {
  const socialDemoIds = Object.values(SOCIAL_DEMO_USER_IDS)
  const [student] = await db
    .select({
      id: users.id,
      email: users.email,
      username: profiles.username,
      displayName: profiles.displayName,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.id, userId),
        eq(users.role, 'student'),
        eq(users.status, 'active'),
        notInArray(users.id, socialDemoIds),
        not(like(users.email, '%@konea.test')),
      ),
    )
    .limit(1)
  return student ?? null
}

/**
 * Selects one stable local student for every part of the Capstone scenario.
 * Returning null is intentional: a clean installation has no real student
 * until somebody completes registration, and demo data must never block that
 * first startup.
 */
export async function findCapstoneDemoStudent(): Promise<CapstoneDemoStudent | null> {
  const requestedUsername = process.env.CAPSTONE_DEMO_USERNAME?.trim().replace(
    /^@/,
    '',
  )
  const socialDemoIds = Object.values(SOCIAL_DEMO_USER_IDS)
  const existingOwnerId = await findExistingScenarioOwnerId()

  if (requestedUsername) {
    const [selected] = await db
      .select({
        id: users.id,
        email: users.email,
        username: profiles.username,
        displayName: profiles.displayName,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(
        and(
          eq(users.role, 'student'),
          eq(users.status, 'active'),
          notInArray(users.id, socialDemoIds),
          not(like(users.email, '%@konea.test')),
          sql`lower(${profiles.username}) = lower(${requestedUsername})`,
        ),
      )
      .limit(1)

    if (!selected) {
      throw new Error(
        `CAPSTONE_DEMO_USERNAME no corresponde a un estudiante local activo: @${requestedUsername}.`,
      )
    }
    if (existingOwnerId && selected.id !== existingOwnerId) {
      const currentOwner = await loadEligibleStudentById(existingOwnerId)
      throw new Error(
        `El escenario Capstone ya pertenece a @${currentOwner?.username ?? existingOwnerId}; no puede reasignarse automáticamente a @${selected.username}.`,
      )
    }
    return selected
  }

  if (existingOwnerId) {
    const existingOwner = await loadEligibleStudentById(existingOwnerId)
    if (!existingOwner) {
      console.warn(
        'Escenario Capstone omitido: su cuenta propietaria ya no es un estudiante local activo.',
      )
      return null
    }
    return existingOwner
  }

  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
      username: profiles.username,
      displayName: profiles.displayName,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        eq(users.role, 'student'),
        eq(users.status, 'active'),
        notInArray(users.id, socialDemoIds),
        not(like(users.email, '%@demo.konea.local')),
        not(like(users.email, '%@konea.test')),
      ),
    )

  if (candidates.length === 0) return null

  const candidateIds = candidates.map((candidate) => candidate.id)
  const [courseCounts, sessionCounts] = await Promise.all([
    db
      .select({ userId: academicCourses.userId, total: count() })
      .from(academicCourses)
      .where(
        and(
          inArray(academicCourses.userId, candidateIds),
          eq(academicCourses.active, true),
        ),
      )
      .groupBy(academicCourses.userId),
    db
      .select({ userId: studySessions.userId, total: count() })
      .from(studySessions)
      .where(inArray(studySessions.userId, candidateIds))
      .groupBy(studySessions.userId),
  ])
  const coursesByUser = new Map(
    courseCounts.map((row) => [row.userId, Number(row.total)]),
  )
  const sessionsByUser = new Map(
    sessionCounts.map((row) => [row.userId, Number(row.total)]),
  )

  candidates.sort((left, right) => {
    const leftCourses = coursesByUser.get(left.id) ?? 0
    const rightCourses = coursesByUser.get(right.id) ?? 0
    const leftSessions = sessionsByUser.get(left.id) ?? 0
    const rightSessions = sessionsByUser.get(right.id) ?? 0
    return (
      rightCourses + rightSessions - (leftCourses + leftSessions) ||
      rightCourses - leftCourses ||
      rightSessions - leftSessions ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.username.localeCompare(right.username)
    )
  })

  return candidates[0] ?? null
}
