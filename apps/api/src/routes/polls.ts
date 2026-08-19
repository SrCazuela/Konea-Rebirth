import { and, eq, sql } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { pollVotes } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { getPollDetails } from '../services/chat-service.js'

const uuidSchema = z.string().uuid()
const voteSchema = z.strictObject({
  optionIds: z
    .array(uuidSchema)
    .min(1)
    .max(6)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'No puedes repetir opciones.',
    }),
})

function parseId(value: string | undefined) {
  const result = uuidSchema.safeParse(value)
  if (!result.success) {
    throw new ApiError(
      400,
      'INVALID_IDENTIFIER',
      'Se requiere un identificador válido.',
    )
  }
  return result.data
}

export const pollsRouter = Router()
pollsRouter.use(requireAuthentication)

pollsRouter.get('/:pollId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const pollId = parseId(request.params.pollId)
  response.json({ poll: await getPollDetails(pollId, currentUser.id) })
})

pollsRouter.post('/:pollId/votes', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const pollId = parseId(request.params.pollId)
  const input = parseBody(voteSchema, request.body)
  const poll = await getPollDetails(pollId, currentUser.id)
  if (!poll.allowMultiple && input.optionIds.length !== 1) {
    throw new ApiError(
      400,
      'SINGLE_CHOICE_POLL',
      'Esta encuesta permite seleccionar una sola opción.',
    )
  }
  const validOptionIds = new Set(poll.options.map((option) => option.id))
  if (input.optionIds.some((optionId) => !validOptionIds.has(optionId))) {
    throw new ApiError(
      400,
      'INVALID_POLL_OPTION',
      'Una opción no pertenece a esta encuesta.',
    )
  }

  await db.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${pollId}:${currentUser.id}`}))`,
    )
    await transaction
      .delete(pollVotes)
      .where(
        and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, currentUser.id)),
      )
    await transaction.insert(pollVotes).values(
      input.optionIds.map((optionId) => ({
        pollId,
        optionId,
        userId: currentUser.id,
      })),
    )
  })

  response.json({ poll: await getPollDetails(pollId, currentUser.id) })
})

pollsRouter.delete('/:pollId/votes', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const pollId = parseId(request.params.pollId)
  await getPollDetails(pollId, currentUser.id)
  await db
    .delete(pollVotes)
    .where(
      and(eq(pollVotes.pollId, pollId), eq(pollVotes.userId, currentUser.id)),
    )
  response.json({ poll: await getPollDetails(pollId, currentUser.id) })
})
