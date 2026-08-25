import { and, count, desc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  chatParticipants,
  chatReads,
  chats,
  messages,
  pollOptions,
  polls,
  pollVotes,
  profiles,
  users,
} from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'

export type ChatTransaction = Parameters<
  Parameters<(typeof db)['transaction']>[0]
>[0]

export const MESSAGE_TAGS = [
  'important',
  'question',
  'link',
  'delivery',
  'resources',
  'poll',
] as const

export function directChatKey(firstUserId: string, secondUserId: string) {
  return [firstUserId, secondUserId].sort().join(':')
}

export async function getActiveParticipant(chatId: string, userId: string) {
  const [participant] = await db
    .select()
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.chatId, chatId),
        eq(chatParticipants.userId, userId),
        isNull(chatParticipants.archivedAt),
      ),
    )
    .limit(1)

  return participant
}

export async function requireActiveParticipant(chatId: string, userId: string) {
  const participant = await getActiveParticipant(chatId, userId)

  if (!participant) {
    throw new ApiError(
      403,
      'CHAT_ACCESS_DENIED',
      'No tienes acceso a esta conversación.',
    )
  }

  return participant
}

export async function requireChatManager(chatId: string, userId: string) {
  const participant = await requireActiveParticipant(chatId, userId)

  if (participant.role !== 'owner' && participant.role !== 'admin') {
    throw new ApiError(
      403,
      'CHAT_MANAGER_REQUIRED',
      'Debes administrar el chat para realizar esta acción.',
    )
  }

  return participant
}

export async function requireActiveUsers(
  transaction: ChatTransaction,
  userIds: string[],
) {
  const uniqueIds = [...new Set(userIds)]
  const rows = await transaction
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, uniqueIds), eq(users.status, 'active')))

  if (rows.length !== uniqueIds.length) {
    throw new ApiError(
      400,
      'INVALID_CHAT_PARTICIPANT',
      'Uno o más participantes no existen o no están activos.',
    )
  }
}

export async function createOrRestoreDirectChat(
  transaction: ChatTransaction,
  firstUserId: string,
  secondUserId: string,
  createdById: string,
) {
  if (firstUserId === secondUserId) {
    throw new ApiError(
      400,
      'CANNOT_CHAT_WITH_SELF',
      'No puedes crear un chat contigo mismo.',
    )
  }

  await requireActiveUsers(transaction, [firstUserId, secondUserId])
  const directKey = directChatKey(firstUserId, secondUserId)
  const [insertedChat] = await transaction
    .insert(chats)
    .values({ type: 'direct', directKey, createdById })
    .onConflictDoNothing({ target: chats.directKey })
    .returning({ id: chats.id })

  const [chat] = insertedChat
    ? [insertedChat]
    : await transaction
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.directKey, directKey))
        .limit(1)

  if (!chat) {
    throw new Error('Database did not return the direct chat')
  }

  const now = new Date()
  await transaction
    .update(chats)
    .set({ updatedAt: now })
    .where(eq(chats.id, chat.id))

  await transaction
    .insert(chatParticipants)
    .values([
      { chatId: chat.id, userId: firstUserId, role: 'member' },
      { chatId: chat.id, userId: secondUserId, role: 'member' },
    ])
    .onConflictDoUpdate({
      target: [chatParticipants.chatId, chatParticipants.userId],
      set: { archivedAt: null, joinedAt: now },
    })

  await transaction
    .insert(chatReads)
    .values([
      { chatId: chat.id, userId: firstUserId, lastReadAt: now },
      { chatId: chat.id, userId: secondUserId, lastReadAt: now },
    ])
    .onConflictDoNothing()

  return { chatId: chat.id, created: Boolean(insertedChat) }
}

export async function getChatOrThrow(chatId: string, userId: string) {
  const participant = await requireActiveParticipant(chatId, userId)
  const [chat] = await db
    .select()
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1)

  if (!chat) {
    throw new ApiError(404, 'CHAT_NOT_FOUND', 'El chat no existe.')
  }

  return { chat, participant }
}

export async function getChatParticipants(chatId: string) {
  return db
    .select({
      id: users.id,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      lastSeenAt: profiles.lastSeenAt,
      role: chatParticipants.role,
      joinedAt: chatParticipants.joinedAt,
    })
    .from(chatParticipants)
    .innerJoin(users, eq(chatParticipants.userId, users.id))
    .innerJoin(profiles, eq(users.id, profiles.userId))
    .where(
      and(
        eq(chatParticipants.chatId, chatId),
        isNull(chatParticipants.archivedAt),
      ),
    )
    .orderBy(chatParticipants.joinedAt)
}

export async function getUnreadCountForChat(chatId: string, userId: string) {
  const [readState] = await db
    .select({ lastReadAt: chatReads.lastReadAt })
    .from(chatReads)
    .where(and(eq(chatReads.chatId, chatId), eq(chatReads.userId, userId)))
    .limit(1)

  const condition = and(
    eq(messages.chatId, chatId),
    ne(messages.senderId, userId),
    readState ? gt(messages.createdAt, readState.lastReadAt) : undefined,
  )
  const [result] = await db
    .select({ total: count() })
    .from(messages)
    .where(condition)

  return Number(result?.total ?? 0)
}

export async function listChatsForUser(userId: string) {
  const memberships = await db
    .select({
      id: chats.id,
      type: chats.type,
      name: chats.name,
      avatarUrl: chats.avatarUrl,
      createdById: chats.createdById,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
      myRole: chatParticipants.role,
    })
    .from(chatParticipants)
    .innerJoin(chats, eq(chatParticipants.chatId, chats.id))
    .where(
      and(
        eq(chatParticipants.userId, userId),
        isNull(chatParticipants.archivedAt),
      ),
    )
    .orderBy(desc(chats.updatedAt))
    .limit(50)

  if (!memberships.length) return []
  const chatIds = memberships.map((membership) => membership.id)
  const [participants, latestMessages, unreadRows] = await Promise.all([
    db
      .select({
        chatId: chatParticipants.chatId,
        id: users.id,
        username: profiles.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        lastSeenAt: profiles.lastSeenAt,
        role: chatParticipants.role,
      })
      .from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .innerJoin(profiles, eq(users.id, profiles.userId))
      .where(
        and(
          inArray(chatParticipants.chatId, chatIds),
          isNull(chatParticipants.archivedAt),
        ),
      ),
    db
      .selectDistinctOn([messages.chatId], {
        chatId: messages.chatId,
        id: messages.id,
        content: messages.content,
        type: messages.type,
        senderId: messages.senderId,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(inArray(messages.chatId, chatIds))
      .orderBy(messages.chatId, desc(messages.createdAt)),
    db
      .select({ chatId: messages.chatId, total: count() })
      .from(messages)
      .leftJoin(
        chatReads,
        and(
          eq(chatReads.chatId, messages.chatId),
          eq(chatReads.userId, userId),
        ),
      )
      .where(
        and(
          inArray(messages.chatId, chatIds),
          ne(messages.senderId, userId),
          sql`${messages.createdAt} > coalesce(${chatReads.lastReadAt}, to_timestamp(0))`,
        ),
      )
      .groupBy(messages.chatId),
  ])

  const participantsByChat = new Map<string, typeof participants>()
  for (const participant of participants) {
    const current = participantsByChat.get(participant.chatId) ?? []
    current.push(participant)
    participantsByChat.set(participant.chatId, current)
  }
  const messageByChat = new Map(
    latestMessages.map((message) => [message.chatId, message]),
  )
  const unreadByChat = new Map(
    unreadRows.map((row) => [row.chatId, Number(row.total)]),
  )

  return memberships.map((membership) => ({
    ...membership,
    participants: (participantsByChat.get(membership.id) ?? []).map(
      ({ chatId: _chatId, ...participant }) => participant,
    ),
    lastMessage: messageByChat.get(membership.id) ?? null,
    unreadCount: unreadByChat.get(membership.id) ?? 0,
  }))
}

export async function getPollDetails(pollId: string, currentUserId: string) {
  const [poll] = await db
    .select({
      id: polls.id,
      messageId: polls.messageId,
      createdById: polls.createdById,
      question: polls.question,
      allowMultiple: polls.allowMultiple,
      createdAt: polls.createdAt,
      chatId: messages.chatId,
    })
    .from(polls)
    .innerJoin(messages, eq(polls.messageId, messages.id))
    .where(eq(polls.id, pollId))
    .limit(1)

  if (!poll) {
    throw new ApiError(404, 'POLL_NOT_FOUND', 'La encuesta no existe.')
  }

  await requireActiveParticipant(poll.chatId, currentUserId)
  const [options, votes] = await Promise.all([
    db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.pollId, pollId))
      .orderBy(pollOptions.position),
    db
      .select({ optionId: pollVotes.optionId, userId: pollVotes.userId })
      .from(pollVotes)
      .where(eq(pollVotes.pollId, pollId)),
  ])
  const counts = new Map<string, number>()
  const mine = new Set<string>()
  for (const vote of votes) {
    counts.set(vote.optionId, (counts.get(vote.optionId) ?? 0) + 1)
    if (vote.userId === currentUserId) mine.add(vote.optionId)
  }

  return {
    ...poll,
    options: options.map((option) => ({
      ...option,
      voteCount: counts.get(option.id) ?? 0,
      votedByMe: mine.has(option.id),
    })),
    voteCount: votes.length,
  }
}

export async function getPollsForMessages(
  messageIds: string[],
  currentUserId: string,
) {
  if (!messageIds.length) return new Map<string, unknown>()
  const pollRows = await db
    .select({ id: polls.id, messageId: polls.messageId })
    .from(polls)
    .where(inArray(polls.messageId, messageIds))
  const detailed = await Promise.all(
    pollRows.map((poll) => getPollDetails(poll.id, currentUserId)),
  )
  return new Map(detailed.map((poll) => [poll.messageId, poll]))
}
