import { randomInt } from 'node:crypto'
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { db, isUniqueViolation } from '../db/client.js'
import { chatParticipants, chats, connections, qrCodes } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import {
  createOrRestoreDirectChat,
  directChatKey,
} from '../services/chat-service.js'
import {
  canonicalConnectionPair,
  createConfirmedConnection,
} from '../services/connection-service.js'
import { createNotification } from '../services/notification-service.js'

const redeemSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/),
})
const QR_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const QR_VALIDITY_MS = 5 * 60 * 1_000

const redeemLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: {
      code: 'TOO_MANY_QR_ATTEMPTS',
      message: 'Demasiados intentos de código QR. Intenta más tarde.',
    },
  },
})

function generateCode() {
  let code = ''
  for (let index = 0; index < 6; index += 1) {
    code += QR_ALPHABET[randomInt(QR_ALPHABET.length)]
  }
  return code
}

async function createPersonalCode(ownerId: string) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await db.transaction(async (transaction) => {
        const now = new Date()
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`qr-owner:${ownerId}`}))`,
        )
        await transaction
          .update(qrCodes)
          .set({ usedAt: now, usedById: ownerId })
          .where(and(eq(qrCodes.ownerId, ownerId), isNull(qrCodes.usedAt)))
        const [created] = await transaction
          .insert(qrCodes)
          .values({
            ownerId,
            code: generateCode(),
            expiresAt: new Date(now.getTime() + QR_VALIDITY_MS),
          })
          .returning()
        if (!created) throw new Error('Database did not return the QR code')
        return created
      })
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 7) throw error
    }
  }
  throw new Error('Could not allocate a QR code')
}

export const qrCodesRouter = Router()
qrCodesRouter.use(requireAuthentication)

qrCodesRouter.get('/current', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const [code] = await db
    .select()
    .from(qrCodes)
    .where(
      and(
        eq(qrCodes.ownerId, currentUser.id),
        isNull(qrCodes.usedAt),
        gt(qrCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(qrCodes.createdAt))
    .limit(1)
  response.json({ qrCode: code ?? null })
})

qrCodesRouter.post('/personal', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  response
    .status(201)
    .json({ qrCode: await createPersonalCode(currentUser.id) })
})

qrCodesRouter.delete('/current', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  await db
    .update(qrCodes)
    .set({ usedAt: new Date(), usedById: currentUser.id })
    .where(and(eq(qrCodes.ownerId, currentUser.id), isNull(qrCodes.usedAt)))
  response.status(204).send()
})

qrCodesRouter.post('/redeem', redeemLimiter, async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(redeemSchema, request.body)
  const result = await db.transaction(async (transaction) => {
    const [found] = await transaction
      .select({ ownerId: qrCodes.ownerId })
      .from(qrCodes)
      .where(eq(qrCodes.code, input.code))
      .limit(1)
    if (!found) {
      throw new ApiError(404, 'QR_CODE_NOT_FOUND', 'El código QR no existe.')
    }
    if (found.ownerId === currentUser.id) {
      throw new ApiError(
        400,
        'CANNOT_REDEEM_OWN_QR',
        'No puedes usar tu propio código.',
      )
    }
    const pair = canonicalConnectionPair(currentUser.id, found.ownerId)
    // Use the same pair lock as connection deletion and mutual acceptance.
    // Re-read after acquiring it so a pending redemption observes revocation.
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${pair.userOneId}:${pair.userTwoId}`}))`,
    )
    const [code] = await transaction
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.code, input.code))
      .limit(1)
      .for('update')
    if (!code) {
      throw new ApiError(404, 'QR_CODE_NOT_FOUND', 'El código QR no existe.')
    }
    if (code.usedAt && code.usedById !== currentUser.id) {
      throw new ApiError(
        409,
        'QR_CODE_ALREADY_USED',
        'El código QR ya fue utilizado.',
      )
    }
    if (!code.usedAt && code.expiresAt <= new Date()) {
      throw new ApiError(410, 'QR_CODE_EXPIRED', 'El código QR expiró.')
    }

    if (code.usedAt) {
      const [connection] = await transaction
        .select({ userOneId: connections.userOneId })
        .from(connections)
        .where(
          and(
            eq(connections.userOneId, pair.userOneId),
            eq(connections.userTwoId, pair.userTwoId),
          ),
        )
        .limit(1)
      const [chat] = await transaction
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.directKey, directChatKey(currentUser.id, code.ownerId)))
        .limit(1)
      const participants = chat
        ? await transaction
            .select({ userId: chatParticipants.userId })
            .from(chatParticipants)
            .where(
              and(
                eq(chatParticipants.chatId, chat.id),
                isNull(chatParticipants.archivedAt),
              ),
            )
        : []
      const activeUserIds = new Set(participants.map(({ userId }) => userId))
      if (
        !connection ||
        !chat ||
        !activeUserIds.has(currentUser.id) ||
        !activeUserIds.has(code.ownerId)
      ) {
        throw new ApiError(
          409,
          'QR_CODE_CONNECTION_REVOKED',
          'Este código ya fue utilizado. Solicita uno nuevo para volver a conectar.',
        )
      }
      // An idempotent retry only reads the existing result. It never restores
      // archived participants or recreates a relationship the owner removed.
      return {
        chatId: chat.id,
        created: false,
        ownerId: code.ownerId,
        redemptionRepeated: true,
      }
    }

    await transaction
      .update(qrCodes)
      .set({ usedAt: new Date(), usedById: currentUser.id })
      .where(eq(qrCodes.id, code.id))
    await createConfirmedConnection(transaction, currentUser.id, code.ownerId)
    const chat = await createOrRestoreDirectChat(
      transaction,
      currentUser.id,
      code.ownerId,
      currentUser.id,
    )
    return { ...chat, ownerId: code.ownerId, redemptionRepeated: false }
  })

  if (!result.redemptionRepeated) {
    await createNotification({
      userId: result.ownerId,
      actorId: currentUser.id,
      type: 'connection',
      title: 'Nueva conexión por QR',
      body: `${currentUser.displayName} utilizó tu código QR. Ya pueden conversar.`,
      href: `chat:${result.chatId}`,
      resourceId: result.chatId,
    })
  }
  response
    .status(!result.redemptionRepeated && result.created ? 201 : 200)
    .json({
      chatId: result.chatId,
      created: result.created,
      redemptionRepeated: result.redemptionRepeated,
    })
})
