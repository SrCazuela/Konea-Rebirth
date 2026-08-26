import { randomInt } from 'node:crypto'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { db, isUniqueViolation } from '../db/client.js'
import { qrCodes } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { createOrRestoreDirectChat } from '../services/chat-service.js'
import { createConfirmedConnection } from '../services/connection-service.js'
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
    const [code] = await transaction
      .select()
      .from(qrCodes)
      .where(eq(qrCodes.code, input.code))
      .limit(1)
    if (!code) {
      throw new ApiError(404, 'QR_CODE_NOT_FOUND', 'El código QR no existe.')
    }
    if (code.ownerId === currentUser.id) {
      throw new ApiError(
        400,
        'CANNOT_REDEEM_OWN_QR',
        'No puedes usar tu propio código.',
      )
    }
    if (code.usedAt) {
      throw new ApiError(
        409,
        'QR_CODE_ALREADY_USED',
        'El código QR ya fue utilizado.',
      )
    }
    if (code.expiresAt <= new Date()) {
      throw new ApiError(410, 'QR_CODE_EXPIRED', 'El código QR expiró.')
    }

    const [claimed] = await transaction
      .update(qrCodes)
      .set({ usedAt: new Date(), usedById: currentUser.id })
      .where(and(eq(qrCodes.id, code.id), isNull(qrCodes.usedAt)))
      .returning({ id: qrCodes.id })

    // Si el UPDATE no afectó filas significa que el código fue canjeado
    // concurrentemente. Verificamos si lo canjeo el mismo usuario (idempotente)
    // o fue otro (error).
    let redemptionRepeated = false
    if (!claimed) {
      const [latest] = await transaction
        .select({ usedById: qrCodes.usedById })
        .from(qrCodes)
        .where(eq(qrCodes.id, code.id))
        .limit(1)
      if (latest?.usedById !== currentUser.id) {
        throw new ApiError(
          409,
          'QR_CODE_ALREADY_USED',
          'El código QR ya fue utilizado.',
        )
      }
      // El mismo usuario ya lo canjeó antes: operación idempotente
      redemptionRepeated = true
    }

    await createConfirmedConnection(transaction, currentUser.id, code.ownerId)
    const chat = await createOrRestoreDirectChat(
      transaction,
      currentUser.id,
      code.ownerId,
      currentUser.id,
    )
    return { ...chat, ownerId: code.ownerId, redemptionRepeated }
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
  response.status(result.created ? 201 : 200).json({
    chatId: result.chatId,
    created: result.created,
    redemptionRepeated: result.redemptionRepeated,
  })
})
