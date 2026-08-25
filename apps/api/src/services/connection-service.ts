import { and, eq, gt, or, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { connectionIntents, connections } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import type { ChatTransaction } from './chat-service.js'

const INTENT_VALIDITY_MS = 30 * 24 * 60 * 60 * 1_000

export function canonicalConnectionPair(
  firstUserId: string,
  secondUserId: string,
) {
  const [userOneId, userTwoId] = [firstUserId, secondUserId].sort()
  if (!userOneId || !userTwoId) throw new Error('Invalid connection pair')
  return { userOneId, userTwoId }
}

export async function connectionExists(
  firstUserId: string,
  secondUserId: string,
) {
  const pair = canonicalConnectionPair(firstUserId, secondUserId)
  const [connection] = await db
    .select({ userOneId: connections.userOneId })
    .from(connections)
    .where(
      and(
        eq(connections.userOneId, pair.userOneId),
        eq(connections.userTwoId, pair.userTwoId),
      ),
    )
    .limit(1)
  return Boolean(connection)
}

export async function requireConnection(
  firstUserId: string,
  secondUserId: string,
) {
  if (!(await connectionExists(firstUserId, secondUserId))) {
    throw new ApiError(
      403,
      'CONNECTION_REQUIRED',
      'Ambas personas deben aceptar la conexión antes de iniciar un chat.',
    )
  }
}

export async function requireConnections(ownerId: string, userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter((userId) => userId !== ownerId))]
  const results = await Promise.all(
    uniqueIds.map((userId) => connectionExists(ownerId, userId)),
  )
  if (results.some((connected) => !connected)) {
    throw new ApiError(
      403,
      'CONNECTION_REQUIRED',
      'Solo puedes iniciar conversaciones con tus conexiones.',
    )
  }
}

export async function createConfirmedConnection(
  transaction: ChatTransaction,
  firstUserId: string,
  secondUserId: string,
) {
  const pair = canonicalConnectionPair(firstUserId, secondUserId)
  const inserted = await transaction
    .insert(connections)
    .values(pair)
    .onConflictDoNothing()
    .returning({ userOneId: connections.userOneId })
  await transaction
    .delete(connectionIntents)
    .where(
      or(
        and(
          eq(connectionIntents.requesterId, firstUserId),
          eq(connectionIntents.recipientId, secondUserId),
        ),
        and(
          eq(connectionIntents.requesterId, secondUserId),
          eq(connectionIntents.recipientId, firstUserId),
        ),
      ),
    )
  return Boolean(inserted.length)
}

export async function sendPrivateConnectionRequest(
  requesterId: string,
  recipientId: string,
) {
  return db.transaction(async (transaction) => {
    const pair = canonicalConnectionPair(requesterId, recipientId)
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${pair.userOneId}:${pair.userTwoId}`}))`,
    )

    const [existingConnection] = await transaction
      .select({ userOneId: connections.userOneId })
      .from(connections)
      .where(
        and(
          eq(connections.userOneId, pair.userOneId),
          eq(connections.userTwoId, pair.userTwoId),
        ),
      )
      .limit(1)
    if (existingConnection)
      return { status: 'connected' as const, matched: false }

    const now = new Date()
    const expiresAt = new Date(now.getTime() + INTENT_VALIDITY_MS)
    await transaction
      .delete(connectionIntents)
      .where(
        and(
          or(
            and(
              eq(connectionIntents.requesterId, requesterId),
              eq(connectionIntents.recipientId, recipientId),
            ),
            and(
              eq(connectionIntents.requesterId, recipientId),
              eq(connectionIntents.recipientId, requesterId),
            ),
          ),
          sql`${connectionIntents.expiresAt} <= ${now}`,
        ),
      )
    await transaction
      .insert(connectionIntents)
      .values({ requesterId, recipientId, expiresAt })
      .onConflictDoUpdate({
        target: [connectionIntents.requesterId, connectionIntents.recipientId],
        set: { expiresAt },
      })

    const [reverseIntent] = await transaction
      .select({ requesterId: connectionIntents.requesterId })
      .from(connectionIntents)
      .where(
        and(
          eq(connectionIntents.requesterId, recipientId),
          eq(connectionIntents.recipientId, requesterId),
          gt(connectionIntents.expiresAt, now),
        ),
      )
      .limit(1)

    if (!reverseIntent) return { status: 'requested' as const, matched: false }
    const created = await createConfirmedConnection(
      transaction,
      requesterId,
      recipientId,
    )
    return { status: 'connected' as const, matched: created }
  })
}
