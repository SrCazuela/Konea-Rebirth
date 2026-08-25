import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import {
  chatParticipants,
  chatReads,
  chats,
  messageReceipts,
  messages,
  notifications,
  pollOptions,
  polls,
  profiles,
  tasks,
  users,
} from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import {
  createOrRestoreDirectChat,
  getActiveParticipant,
  getChatOrThrow,
  getChatParticipants,
  getPollDetails,
  getPollsForMessages,
  getUnreadCountForChat,
  listChatsForUser,
  MESSAGE_TAGS,
  requireActiveParticipant,
  requireActiveUsers,
  requireChatManager,
} from '../services/chat-service.js'
import {
  requireConnection,
  requireConnections,
} from '../services/connection-service.js'
import { createNotification } from '../services/notification-service.js'
import { requireOwnedLocalUpload } from '../services/upload-service.js'

const uuidSchema = z.string().uuid()
const absoluteOrLocalUrl = z
  .string()
  .trim()
  .max(2_048)
  .refine(
    (value) => value.startsWith('/') || z.url().safeParse(value).success,
    'Debe ser una URL absoluta o una ruta local.',
  )

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

function parseQuery<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
) {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Consulta inválida.', {
      fields: z.flattenError(result.error).fieldErrors,
    })
  }
  return result.data as z.infer<TSchema>
}

const directChatSchema = z.strictObject({ userId: uuidSchema })
const groupChatSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  participantIds: z.array(uuidSchema).max(99).default([]),
  avatarUrl: absoluteOrLocalUrl.nullable().optional(),
})
const updateChatSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    avatarUrl: absoluteOrLocalUrl.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debes enviar al menos un cambio.',
  })
const addParticipantSchema = z.strictObject({
  userId: uuidSchema,
  role: z.enum(['member', 'admin']).default('member'),
})
const updateParticipantSchema = z.strictObject({
  role: z.enum(['member', 'admin', 'owner']),
})
const messageTagSchema = z.enum(MESSAGE_TAGS)
const sendMessageSchema = z
  .strictObject({
    content: z.string().trim().max(4_000).default(''),
    type: z.enum(['text', 'image', 'file']).default('text'),
    fileUrl: absoluteOrLocalUrl.optional(),
    fileName: z.string().trim().min(1).max(255).optional(),
    fileSize: z
      .number()
      .int()
      .min(0)
      .max(10 * 1_024 * 1_024)
      .optional(),
    tags: z.array(messageTagSchema).max(MESSAGE_TAGS.length).default([]),
  })

  .superRefine((value, context) => {
    if (value.type === 'text' && !value.content) {
      context.addIssue({
        code: 'custom',
        path: ['content'],
        message: 'El mensaje no puede estar vacío.',
      })
    }
    if (value.type !== 'text' && !value.fileUrl) {
      context.addIssue({
        code: 'custom',
        path: ['fileUrl'],
        message: 'El archivo requiere una URL.',
      })
    }
  })

type PersistedDeliveryStatus = 'sent' | 'delivered' | 'read'

async function loadDeliveryStatuses(messageIds: string[]) {
  if (!messageIds.length) return new Map<string, PersistedDeliveryStatus>()

  const rows = await db
    .select({
      messageId: messageReceipts.messageId,
      recipients: count(),
      delivered: count(messageReceipts.deliveredAt),
      read: count(messageReceipts.readAt),
    })
    .from(messageReceipts)
    .where(inArray(messageReceipts.messageId, messageIds))
    .groupBy(messageReceipts.messageId)

  return new Map(
    rows.map((row) => {
      const recipients = Number(row.recipients)
      const delivered = Number(row.delivered)
      const read = Number(row.read)
      const status: PersistedDeliveryStatus =
        recipients > 0 && read === recipients
          ? 'read'
          : recipients > 0 && delivered === recipients
            ? 'delivered'
            : 'sent'
      return [row.messageId, status]
    }),
  )
}

async function markMessagesDelivered(userId: string, chatId?: string) {
  const chatFilter = chatId ? sql`and ${messages.chatId} = ${chatId}` : sql``
  await db.execute(sql`
    insert into ${messageReceipts} (message_id, user_id)
    select ${messages.id}, ${userId}
    from ${messages}
    inner join ${chatParticipants}
      on ${chatParticipants.chatId} = ${messages.chatId}
      and ${chatParticipants.userId} = ${userId}
      and ${chatParticipants.archivedAt} is null
      and ${messages.createdAt} >= ${chatParticipants.joinedAt}
    where ${messages.senderId} <> ${userId} ${chatFilter}
    on conflict do nothing
  `)

  const conditions = [
    eq(messageReceipts.userId, userId),
    isNull(messageReceipts.deliveredAt),
  ]

  if (chatId) {
    conditions.push(
      inArray(
        messageReceipts.messageId,
        db
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.chatId, chatId)),
      ),
    )
  }

  await db
    .update(messageReceipts)
    .set({ deliveredAt: new Date() })
    .where(and(...conditions))
}
const updateMessageSchema = z
  .strictObject({
    content: z.string().trim().min(1).max(4_000).optional(),
    tags: z.array(messageTagSchema).max(MESSAGE_TAGS.length).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debes enviar al menos un cambio.',
  })
const messageQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).catch(20),
  before: z.iso.datetime({ offset: true }).optional(),
  beforeId: uuidSchema.optional(),
  q: z.string().trim().max(100).optional(),
  tag: messageTagSchema.optional(),
})
const taskCreateSchema = z.strictObject({
  assignedToId: uuidSchema.optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1_000).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
})
const taskUpdateSchema = z
  .strictObject({
    assignedToId: uuidSchema.optional(),
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1_000).nullable().optional(),
    dueDate: z.iso.date().nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Debes enviar al menos un cambio.',
  })
const pollCreateSchema = z.strictObject({
  question: z.string().trim().min(1).max(80),
  options: z
    .array(z.string().trim().min(1).max(40))
    .min(2)
    .max(6)
    .refine(
      (options) =>
        new Set(options.map((option) => option.toLowerCase())).size ===
        options.length,
      {
        message: 'Las opciones no pueden repetirse.',
      },
    ),
  allowMultiple: z.boolean().default(false),
})

async function notifyParticipants(input: {
  chatId: string
  actorId: string
  actorName: string
  title: string
  body: string
  resourceId: string
  type?: 'message' | 'task'
}) {
  const recipients = await db
    .select({ userId: chatParticipants.userId })
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.chatId, input.chatId),
        isNull(chatParticipants.archivedAt),
        ne(chatParticipants.userId, input.actorId),
      ),
    )

  await Promise.all(
    recipients.map(({ userId }) =>
      createNotification({
        userId,
        actorId: input.actorId,
        type: input.type ?? 'message',
        title: input.title,
        body: input.body,
        href: `chat:${input.chatId}`,
        resourceId: input.resourceId,
      }),
    ),
  )
}

async function loadTasks(chatId: string) {
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.chatId, chatId))
    .orderBy(desc(tasks.createdAt))
  if (!rows.length) return []
  const userIds = [
    ...new Set(rows.flatMap((task) => [task.createdById, task.assignedToId])),
  ]
  const people = await db
    .select({
      id: users.id,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(users)
    .innerJoin(profiles, eq(users.id, profiles.userId))
    .where(inArray(users.id, userIds))
  const peopleById = new Map(people.map((person) => [person.id, person]))

  return rows.map((task) => ({
    ...task,
    createdBy: peopleById.get(task.createdById),
    assignedTo: peopleById.get(task.assignedToId),
  }))
}

export const chatsRouter = Router()
chatsRouter.use(requireAuthentication)

chatsRouter.get('/', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  await markMessagesDelivered(currentUser.id)
  response.json({ chats: await listChatsForUser(currentUser.id) })
})

chatsRouter.get('/unread-count', async (_request, response) => {
  const currentUser = getAuthenticatedUser(response)
  await markMessagesDelivered(currentUser.id)
  const userChats = await listChatsForUser(currentUser.id)
  response.json({
    unreadCount: userChats.reduce((total, chat) => total + chat.unreadCount, 0),
  })
})

chatsRouter.post('/direct', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(directChatSchema, request.body)
  if (input.userId !== currentUser.id) {
    await requireConnection(currentUser.id, input.userId)
  }
  const result = await db.transaction((transaction) =>
    createOrRestoreDirectChat(
      transaction,
      currentUser.id,
      input.userId,
      currentUser.id,
    ),
  )
  const chat = (await listChatsForUser(currentUser.id)).find(
    (candidate) => candidate.id === result.chatId,
  )
  response
    .status(result.created ? 201 : 200)
    .json({ chat, created: result.created })
})

chatsRouter.post('/groups', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(groupChatSchema, request.body)
  await requireOwnedLocalUpload(currentUser.id, input.avatarUrl, 'image')
  const participantIds = [
    currentUser.id,
    ...new Set(input.participantIds.filter((id) => id !== currentUser.id)),
  ]
  await requireConnections(currentUser.id, participantIds)
  const created = await db.transaction(async (transaction) => {
    await requireActiveUsers(transaction, participantIds)
    const [chat] = await transaction
      .insert(chats)
      .values({
        type: 'group',
        name: input.name,
        avatarUrl: input.avatarUrl ?? null,
        createdById: currentUser.id,
      })
      .returning()
    if (!chat) throw new Error('Database did not return the group chat')
    await transaction.insert(chatParticipants).values(
      participantIds.map((userId) => ({
        chatId: chat.id,
        userId,
        role:
          userId === currentUser.id ? ('owner' as const) : ('member' as const),
      })),
    )
    await transaction.insert(chatReads).values(
      participantIds.map((userId) => ({
        chatId: chat.id,
        userId,
        lastReadAt: new Date(),
      })),
    )
    return chat
  })

  await notifyParticipants({
    chatId: created.id,
    actorId: currentUser.id,
    actorName: currentUser.displayName,
    title: 'Nuevo grupo',
    body: `${currentUser.displayName} te agregó a ${created.name}.`,
    resourceId: created.id,
  })
  response.status(201).json({
    chat: (await listChatsForUser(currentUser.id)).find(
      (candidate) => candidate.id === created.id,
    ),
  })
})

chatsRouter.get('/:chatId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const { chat, participant } = await getChatOrThrow(chatId, currentUser.id)
  response.json({
    chat: {
      ...chat,
      myRole: participant.role,
      participants: await getChatParticipants(chatId),
      unreadCount: await getUnreadCountForChat(chatId, currentUser.id),
    },
  })
})

chatsRouter.patch('/:chatId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const input = parseBody(updateChatSchema, request.body)
  const { chat } = await getChatOrThrow(chatId, currentUser.id)
  if (chat.type !== 'group') {
    throw new ApiError(
      400,
      'DIRECT_CHAT_IMMUTABLE',
      'Un chat directo no se puede editar.',
    )
  }
  await requireChatManager(chatId, currentUser.id)
  await requireOwnedLocalUpload(currentUser.id, input.avatarUrl, 'image')
  const [updated] = await db
    .update(chats)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(chats.id, chatId))
    .returning()
  response.json({ chat: updated })
})

chatsRouter.get('/:chatId/participants', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  await requireActiveParticipant(chatId, currentUser.id)
  response.json({ participants: await getChatParticipants(chatId) })
})

chatsRouter.post('/:chatId/participants', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const input = parseBody(addParticipantSchema, request.body)
  const { chat } = await getChatOrThrow(chatId, currentUser.id)
  if (chat.type !== 'group') {
    throw new ApiError(
      400,
      'GROUP_CHAT_REQUIRED',
      'Solo los grupos admiten participantes.',
    )
  }
  await requireChatManager(chatId, currentUser.id)
  const existingParticipant = await getActiveParticipant(chatId, input.userId)
  if (existingParticipant?.role === 'owner') {
    throw new ApiError(
      409,
      'OWNER_ROLE_IMMUTABLE',
      'No se puede cambiar el rol del propietario.',
    )
  }
  if (existingParticipant) {
    throw new ApiError(
      409,
      'PARTICIPANT_ALREADY_ACTIVE',
      'La persona ya participa en este grupo. Usa la edición de rol.',
    )
  }
  await requireConnection(currentUser.id, input.userId)
  await db.transaction(async (transaction) => {
    await requireActiveUsers(transaction, [input.userId])
    await transaction
      .insert(chatParticipants)
      .values({ chatId, userId: input.userId, role: input.role })
      .onConflictDoUpdate({
        target: [chatParticipants.chatId, chatParticipants.userId],
        set: { role: input.role, archivedAt: null, joinedAt: new Date() },
      })
    await transaction
      .insert(chatReads)
      .values({ chatId, userId: input.userId, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [chatReads.chatId, chatReads.userId],
        set: { lastReadAt: new Date() },
      })
  })
  await createNotification({
    userId: input.userId,
    actorId: currentUser.id,
    type: 'message',
    title: 'Invitación a un grupo',
    body: `${currentUser.displayName} te agregó a ${chat.name}.`,
    href: `chat:${chatId}`,
    resourceId: chatId,
  })
  response.status(201).json({ participants: await getChatParticipants(chatId) })
})

chatsRouter.patch(
  '/:chatId/participants/:userId',
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const chatId = parseId(request.params.chatId)
    const userId = parseId(request.params.userId)
    const input = parseBody(updateParticipantSchema, request.body)
    const manager = await requireChatManager(chatId, currentUser.id)
    const target = await getActiveParticipant(chatId, userId)
    if (!target)
      throw new ApiError(
        404,
        'PARTICIPANT_NOT_FOUND',
        'El participante no existe.',
      )
    if (target.role === 'owner') {
      throw new ApiError(
        409,
        'OWNER_ROLE_IMMUTABLE',
        'No se puede cambiar el rol del propietario.',
      )
    }
    if (input.role === 'owner') {
      if (manager.role !== 'owner') {
        throw new ApiError(
          403,
          'OWNER_TRANSFER_REQUIRED',
          'Solo el propietario actual puede transferir el grupo.',
        )
      }

      await db.transaction(async (transaction) => {
        await transaction.execute(
          sql`select 1 from ${chatParticipants} where ${chatParticipants.chatId} = ${chatId} for update`,
        )
        const [lockedManager] = await transaction
          .select({ role: chatParticipants.role })
          .from(chatParticipants)
          .where(
            and(
              eq(chatParticipants.chatId, chatId),
              eq(chatParticipants.userId, currentUser.id),
              isNull(chatParticipants.archivedAt),
            ),
          )
          .limit(1)
        if (lockedManager?.role !== 'owner') {
          throw new ApiError(
            409,
            'OWNER_TRANSFER_CONFLICT',
            'La propiedad del grupo cambi\u00f3. Actualiza la conversaci\u00f3n.',
          )
        }
        await transaction
          .update(chatParticipants)
          .set({ role: 'admin' })
          .where(
            and(
              eq(chatParticipants.chatId, chatId),
              eq(chatParticipants.role, 'owner'),
            ),
          )
        await transaction
          .update(chatParticipants)
          .set({ role: 'owner' })
          .where(
            and(
              eq(chatParticipants.chatId, chatId),
              eq(chatParticipants.userId, userId),
            ),
          )
      })
    } else {
      await db
        .update(chatParticipants)
        .set({ role: input.role })
        .where(
          and(
            eq(chatParticipants.chatId, chatId),
            eq(chatParticipants.userId, userId),
          ),
        )
    }
    response.json({ participants: await getChatParticipants(chatId) })
  },
)

chatsRouter.delete(
  '/:chatId/participants/:userId',
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const chatId = parseId(request.params.chatId)
    const userId = parseId(request.params.userId)
    const { chat } = await getChatOrThrow(chatId, currentUser.id)
    const target = await getActiveParticipant(chatId, userId)
    if (!target)
      throw new ApiError(
        404,
        'PARTICIPANT_NOT_FOUND',
        'El participante no existe.',
      )

    if (userId !== currentUser.id)
      await requireChatManager(chatId, currentUser.id)
    if (target.role === 'owner') {
      const participants = await getChatParticipants(chatId)
      if (participants.length > 1) {
        throw new ApiError(
          409,
          'OWNER_MUST_TRANSFER_GROUP',
          'El propietario debe transferir o vaciar el grupo antes de salir.',
        )
      }
    }
    if (chat.type === 'direct' && userId !== currentUser.id) {
      throw new ApiError(
        400,
        'DIRECT_CHAT_IMMUTABLE',
        'No puedes quitar a la otra persona.',
      )
    }

    await db
      .update(chatParticipants)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          eq(chatParticipants.userId, userId),
        ),
      )
    response.status(204).send()
  },
)

chatsRouter.get('/:chatId/messages', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const query = parseQuery(messageQuerySchema, request.query)
  await requireActiveParticipant(chatId, currentUser.id)
  await markMessagesDelivered(currentUser.id, chatId)

  const conditions = [eq(messages.chatId, chatId)]
  if (query.before) {
    const before = new Date(query.before)
    conditions.push(
      query.beforeId
        ? or(
            lt(messages.createdAt, before),
            and(
              eq(messages.createdAt, before),
              lt(messages.id, query.beforeId),
            ),
          )!
        : lt(messages.createdAt, before),
    )
  }
  if (query.q) conditions.push(ilike(messages.content, `%${query.q}%`))
  if (query.tag) {
    conditions.push(
      sql`${messages.tags} @> ${JSON.stringify([query.tag])}::jsonb`,
    )
  }
  const rows = await db
    .select({
      id: messages.id,
      chatId: messages.chatId,
      content: messages.content,
      type: messages.type,
      fileUrl: messages.fileUrl,
      fileName: messages.fileName,
      fileSize: messages.fileSize,
      tags: messages.tags,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      sender: {
        id: users.id,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      },
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .innerJoin(profiles, eq(users.id, profiles.userId))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(query.limit + 1)
  const hasMore = rows.length > query.limit
  const page = rows.slice(0, query.limit)
  const oldestMessage = page.at(-1)
  const pollByMessage = await getPollsForMessages(
    page
      .filter((message) => message.type === 'poll')
      .map((message) => message.id),
    currentUser.id,
  )
  const deliveryByMessage = await loadDeliveryStatuses(
    page.map((message) => message.id),
  )

  response.json({
    messages: [...page].reverse().map((message) => ({
      ...message,
      deliveryStatus: deliveryByMessage.get(message.id) ?? 'sent',
      poll: pollByMessage.get(message.id) ?? null,
    })),
    pageInfo: {
      hasMore,
      nextBefore: hasMore ? oldestMessage?.createdAt.toISOString() : null,
      nextBeforeId: hasMore ? oldestMessage?.id : null,
    },
  })
})

chatsRouter.post('/:chatId/messages', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const input = parseBody(sendMessageSchema, request.body)
  await requireActiveParticipant(chatId, currentUser.id)
  await requireOwnedLocalUpload(
    currentUser.id,
    input.fileUrl,
    input.type === 'image' ? 'image' : 'any',
  )
  const uniqueTags = [...new Set(input.tags)]
  const [message] = await db.transaction(async (transaction) => {
    const created = await transaction
      .insert(messages)
      .values({
        chatId,
        senderId: currentUser.id,
        content: input.content,
        type: input.type,
        fileUrl: input.fileUrl,
        fileName: input.fileName,
        fileSize: input.fileSize,
        tags: uniqueTags,
      })
      .returning()
    await transaction
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId))
    await transaction
      .insert(chatReads)
      .values({ chatId, userId: currentUser.id, lastReadAt: new Date() })
      .onConflictDoUpdate({
        target: [chatReads.chatId, chatReads.userId],
        set: { lastReadAt: new Date() },
      })
    const recipients = await transaction
      .select({ userId: chatParticipants.userId })
      .from(chatParticipants)
      .where(
        and(
          eq(chatParticipants.chatId, chatId),
          isNull(chatParticipants.archivedAt),
          ne(chatParticipants.userId, currentUser.id),
        ),
      )
    if (recipients.length && created[0]) {
      await transaction.insert(messageReceipts).values(
        recipients.map(({ userId }) => ({
          messageId: created[0]!.id,
          userId,
        })),
      )
    }
    return created
  })
  if (!message) throw new Error('Database did not return the message')

  await notifyParticipants({
    chatId,
    actorId: currentUser.id,
    actorName: currentUser.displayName,
    title: `Mensaje de ${currentUser.displayName}`,
    body:
      input.content ||
      (input.type === 'image' ? 'Envió una imagen.' : 'Envió un archivo.'),
    resourceId: message.id,
  })
  response.status(201).json({
    message: { ...message, deliveryStatus: 'sent' as const },
  })
})

chatsRouter.patch('/:chatId/messages/:messageId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const messageId = parseId(request.params.messageId)
  const input = parseBody(updateMessageSchema, request.body)
  await requireActiveParticipant(chatId, currentUser.id)
  const [existing] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)))
    .limit(1)
  if (!existing)
    throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'El mensaje no existe.')
  if (existing.senderId !== currentUser.id || existing.type === 'poll') {
    throw new ApiError(
      403,
      'MESSAGE_EDIT_DENIED',
      'No puedes editar este mensaje.',
    )
  }
  const [updated] = await db
    .update(messages)
    .set({
      ...input,
      ...(input.tags ? { tags: [...new Set(input.tags)] } : {}),
      updatedAt: new Date(),
    })
    .where(eq(messages.id, messageId))
    .returning()
  response.json({ message: updated })
})

chatsRouter.delete(
  '/:chatId/messages/:messageId',
  async (request, response) => {
    const currentUser = getAuthenticatedUser(response)
    const chatId = parseId(request.params.chatId)
    const messageId = parseId(request.params.messageId)
    const participant = await requireActiveParticipant(chatId, currentUser.id)
    const [existing] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.id, messageId), eq(messages.chatId, chatId)))
      .limit(1)
    if (!existing)
      throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'El mensaje no existe.')
    if (
      existing.senderId !== currentUser.id &&
      participant.role !== 'owner' &&
      participant.role !== 'admin'
    ) {
      throw new ApiError(
        403,
        'MESSAGE_DELETE_DENIED',
        'No puedes eliminar este mensaje.',
      )
    }
    await db.delete(messages).where(eq(messages.id, messageId))
    response.status(204).send()
  },
)

chatsRouter.post('/:chatId/read', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  await requireActiveParticipant(chatId, currentUser.id)
  const readAt = new Date()
  const notificationsRead = await db.transaction(async (transaction) => {
    await transaction
      .insert(chatReads)
      .values({ chatId, userId: currentUser.id, lastReadAt: readAt })
      .onConflictDoUpdate({
        target: [chatReads.chatId, chatReads.userId],
        set: { lastReadAt: readAt },
      })
    await transaction
      .update(messageReceipts)
      .set({ deliveredAt: readAt, readAt })
      .where(
        and(
          eq(messageReceipts.userId, currentUser.id),
          inArray(
            messageReceipts.messageId,
            transaction
              .select({ id: messages.id })
              .from(messages)
              .where(eq(messages.chatId, chatId)),
          ),
        ),
      )
    return transaction
      .update(notifications)
      .set({ readAt })
      .where(
        and(
          eq(notifications.userId, currentUser.id),
          eq(notifications.type, 'message'),
          eq(notifications.href, `chat:${chatId}`),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id })
  })
  response.json({
    readAt,
    unreadCount: 0,
    notificationsRead: notificationsRead.length,
  })
})

chatsRouter.get('/:chatId/tasks', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  await requireActiveParticipant(chatId, currentUser.id)
  response.json({ tasks: await loadTasks(chatId) })
})

chatsRouter.post('/:chatId/tasks', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const input = parseBody(taskCreateSchema, request.body)
  await requireActiveParticipant(chatId, currentUser.id)
  const assignedToId = input.assignedToId ?? currentUser.id
  await requireActiveParticipant(chatId, assignedToId)
  const task = await db.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(tasks)
      .values({
        chatId,
        createdById: currentUser.id,
        assignedToId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ?? null,
        priority: input.priority,
      })
      .returning()
    if (!created) throw new Error('Database did not return the task')

    await transaction.insert(messages).values({
      chatId,
      senderId: currentUser.id,
      type: 'system',
      content: `${currentUser.displayName} creó la tarea “${created.title}”.`,
      tags: ['delivery'],
    })
    await transaction
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId))

    return created
  })
  await createNotification({
    userId: assignedToId,
    actorId: currentUser.id,
    type: 'task',
    title: 'Nueva tarea',
    body: `${currentUser.displayName} te asignó: ${task.title}`,
    href: `chat:${chatId}`,
    resourceId: task.id,
  })
  response.status(201).json({ task })
})

chatsRouter.patch('/:chatId/tasks/:taskId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const taskId = parseId(request.params.taskId)
  const input = parseBody(taskUpdateSchema, request.body)
  const participant = await requireActiveParticipant(chatId, currentUser.id)
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.chatId, chatId)))
    .limit(1)
  if (!task) throw new ApiError(404, 'TASK_NOT_FOUND', 'La tarea no existe.')
  const managesChat =
    participant.role === 'owner' || participant.role === 'admin'
  const onlyStatus = Object.keys(input).every((key) => key === 'status')
  if (
    task.createdById !== currentUser.id &&
    !managesChat &&
    !(task.assignedToId === currentUser.id && onlyStatus)
  ) {
    throw new ApiError(
      403,
      'TASK_UPDATE_DENIED',
      'No puedes modificar esta tarea.',
    )
  }
  if (input.assignedToId)
    await requireActiveParticipant(chatId, input.assignedToId)
  const [updated] = await db
    .update(tasks)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))
    .returning()
  if (input.assignedToId && input.assignedToId !== task.assignedToId) {
    await createNotification({
      userId: input.assignedToId,
      actorId: currentUser.id,
      type: 'task',
      title: 'Tarea asignada',
      body: `${currentUser.displayName} te asignó: ${updated?.title ?? task.title}`,
      href: `chat:${chatId}`,
      resourceId: taskId,
    })
  }
  response.json({ task: updated })
})

chatsRouter.delete('/:chatId/tasks/:taskId', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const taskId = parseId(request.params.taskId)
  const participant = await requireActiveParticipant(chatId, currentUser.id)
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.chatId, chatId)))
    .limit(1)
  if (!task) throw new ApiError(404, 'TASK_NOT_FOUND', 'La tarea no existe.')
  if (
    task.createdById !== currentUser.id &&
    participant.role !== 'owner' &&
    participant.role !== 'admin'
  ) {
    throw new ApiError(
      403,
      'TASK_DELETE_DENIED',
      'No puedes eliminar esta tarea.',
    )
  }
  await db.delete(tasks).where(eq(tasks.id, taskId))
  response.status(204).send()
})

chatsRouter.post('/:chatId/polls', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const chatId = parseId(request.params.chatId)
  const input = parseBody(pollCreateSchema, request.body)
  await requireActiveParticipant(chatId, currentUser.id)
  const pollId = await db.transaction(async (transaction) => {
    const [message] = await transaction
      .insert(messages)
      .values({
        chatId,
        senderId: currentUser.id,
        content: input.question,
        type: 'poll',
        tags: ['poll'],
      })
      .returning({ id: messages.id })
    if (!message) throw new Error('Database did not return the poll message')
    const [poll] = await transaction
      .insert(polls)
      .values({
        messageId: message.id,
        createdById: currentUser.id,
        question: input.question,
        allowMultiple: input.allowMultiple,
      })
      .returning({ id: polls.id })
    if (!poll) throw new Error('Database did not return the poll')
    await transaction.insert(pollOptions).values(
      input.options.map((label, position) => ({
        pollId: poll.id,
        label,
        position,
      })),
    )
    await transaction
      .update(chats)
      .set({ updatedAt: new Date() })
      .where(eq(chats.id, chatId))
    return poll.id
  })
  await notifyParticipants({
    chatId,
    actorId: currentUser.id,
    actorName: currentUser.displayName,
    title: `Encuesta de ${currentUser.displayName}`,
    body: input.question,
    resourceId: pollId,
  })
  response
    .status(201)
    .json({ poll: await getPollDetails(pollId, currentUser.id) })
})
