import { ApiClientError } from './auth'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export const messageTags = [
  'important',
  'question',
  'link',
  'delivery',
  'resources',
  'poll',
] as const

export type MessageTag = (typeof messageTags)[number]
export type ChatType = 'direct' | 'group'
export type ChatParticipantRole = 'owner' | 'admin' | 'member'
export type MessageType = 'text' | 'image' | 'file' | 'poll' | 'system'
export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'pending' | 'in_progress' | 'completed'

export type ChatPerson = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  lastSeenAt?: string
  role: ChatParticipantRole
  joinedAt?: string
}

export type ChatSummary = {
  id: string
  type: ChatType
  name: string | null
  avatarUrl: string | null
  createdById: string
  createdAt: string
  updatedAt: string
  myRole: ChatParticipantRole
  participants: ChatPerson[]
  lastMessage: {
    id: string
    content: string
    type: MessageType
    senderId: string
    createdAt: string
  } | null
  unreadCount: number
}

export type ChatDetail = Omit<ChatSummary, 'lastMessage'> & {
  participants: ChatPerson[]
}

export type ChatRecord = Pick<
  ChatSummary,
  | 'id'
  | 'type'
  | 'name'
  | 'avatarUrl'
  | 'createdById'
  | 'createdAt'
  | 'updatedAt'
>

export type PollOption = {
  id: string
  pollId: string
  label: string
  position: number
  voteCount: number
  votedByMe: boolean
}

export type ChatPoll = {
  id: string
  messageId: string
  chatId: string
  createdById: string
  question: string
  allowMultiple: boolean
  createdAt: string
  options: PollOption[]
  voteCount: number
}

export type ChatMessage = {
  id: string
  chatId: string
  content: string
  type: MessageType
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
  tags: MessageTag[]
  createdAt: string
  updatedAt: string
  sender: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
  }
  poll: ChatPoll | null
}

export type MessagePage = {
  messages: ChatMessage[]
  pageInfo: {
    hasMore: boolean
    nextBefore: string | null
    nextBeforeId: string | null
  }
}

export type ChatTask = {
  id: string
  chatId: string
  createdById: string
  assignedToId: string
  title: string
  description: string | null
  dueDate: string | null
  priority: TaskPriority
  status: TaskStatus
  createdAt: string
  updatedAt: string
  createdBy?: Pick<ChatPerson, 'id' | 'username' | 'displayName' | 'avatarUrl'>
  assignedTo?: Pick<ChatPerson, 'id' | 'username' | 'displayName' | 'avatarUrl'>
}

export type PersonalQrCode = {
  id: string
  ownerId: string
  code: string
  expiresAt: string
  createdAt: string
  usedAt: string | null
  usedById: string | null
}

export type UploadedFile = {
  name: string
  originalName: string
  mimeType: string
  size: number
  url: string
}

type ErrorEnvelope = {
  error?: {
    code?: string
    message?: string
    details?: {
      fields?: Record<string, string[] | undefined>
    }
  }
}

async function chatRequest<T>(path: string, init?: RequestInit) {
  const hasJsonBody = init?.body && !(init.body instanceof FormData)
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (response.status === 401) {
    window.dispatchEvent(new Event('konea:session-expired'))
  }
  if (response.status === 204) return undefined as T

  const body = (await response.json().catch(() => ({}))) as T & ErrorEnvelope
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'No pudimos completar la solicitud.',
      body.error?.details?.fields,
    )
  }
  return body
}

function chatPath(chatId: string, suffix = '') {
  return `/chats/${encodeURIComponent(chatId)}${suffix}`
}

export async function listChats() {
  const response = await chatRequest<{ chats: ChatSummary[] }>('/chats')
  return response.chats
}

export async function getChatUnreadCount() {
  return chatRequest<{ unreadCount: number }>('/chats/unread-count')
}

export async function createDirectChat(userId: string) {
  return chatRequest<{ chat: ChatSummary; created: boolean }>('/chats/direct', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  })
}

export async function createGroupChat(input: {
  name: string
  participantIds: string[]
  avatarUrl?: string | null
}) {
  return chatRequest<{ chat: ChatSummary }>('/chats/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getChat(chatId: string) {
  const response = await chatRequest<{ chat: ChatDetail }>(chatPath(chatId))
  return response.chat
}

export async function updateChat(
  chatId: string,
  input: { name?: string; avatarUrl?: string | null },
) {
  return chatRequest<{ chat: ChatRecord }>(chatPath(chatId), {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function getChatParticipants(chatId: string) {
  const response = await chatRequest<{ participants: ChatPerson[] }>(
    chatPath(chatId, '/participants'),
  )
  return response.participants
}

export async function addChatParticipant(
  chatId: string,
  userId: string,
  role: Exclude<ChatParticipantRole, 'owner'> = 'member',
) {
  const response = await chatRequest<{ participants: ChatPerson[] }>(
    chatPath(chatId, '/participants'),
    {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    },
  )
  return response.participants
}

export async function updateChatParticipant(
  chatId: string,
  userId: string,
  role: Exclude<ChatParticipantRole, 'owner'>,
) {
  const response = await chatRequest<{ participants: ChatPerson[] }>(
    chatPath(chatId, `/participants/${encodeURIComponent(userId)}`),
    {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    },
  )
  return response.participants
}

export async function removeChatParticipant(chatId: string, userId: string) {
  await chatRequest<void>(
    chatPath(chatId, `/participants/${encodeURIComponent(userId)}`),
    { method: 'DELETE' },
  )
}

export async function getMessages(
  chatId: string,
  input: {
    limit?: number
    before?: string
    beforeId?: string
    query?: string
    tag?: MessageTag
  } = {},
) {
  const query = new URLSearchParams()
  query.set('limit', String(input.limit ?? 30))
  if (input.before) query.set('before', input.before)
  if (input.beforeId) query.set('beforeId', input.beforeId)
  if (input.query?.trim()) query.set('q', input.query.trim())
  if (input.tag) query.set('tag', input.tag)
  return chatRequest<MessagePage>(
    `${chatPath(chatId, '/messages')}?${query.toString()}`,
  )
}

export async function sendMessage(
  chatId: string,
  input: {
    content?: string
    type?: Extract<MessageType, 'text' | 'image' | 'file'>
    fileUrl?: string
    fileName?: string
    fileSize?: number
    tags?: MessageTag[]
  },
) {
  return chatRequest<{ message: Omit<ChatMessage, 'sender' | 'poll'> }>(
    chatPath(chatId, '/messages'),
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function updateMessage(
  chatId: string,
  messageId: string,
  input: { content?: string; tags?: MessageTag[] },
) {
  return chatRequest<{ message: Omit<ChatMessage, 'sender' | 'poll'> }>(
    chatPath(chatId, `/messages/${encodeURIComponent(messageId)}`),
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export async function deleteMessage(chatId: string, messageId: string) {
  await chatRequest<void>(
    chatPath(chatId, `/messages/${encodeURIComponent(messageId)}`),
    { method: 'DELETE' },
  )
}

export async function markChatRead(chatId: string) {
  return chatRequest<{ readAt: string; unreadCount: 0 }>(
    chatPath(chatId, '/read'),
    { method: 'POST' },
  )
}

export async function getChatTasks(chatId: string) {
  const response = await chatRequest<{ tasks: ChatTask[] }>(
    chatPath(chatId, '/tasks'),
  )
  return response.tasks
}

export async function createChatTask(
  chatId: string,
  input: {
    assignedToId?: string
    title: string
    description?: string | null
    dueDate?: string | null
    priority?: TaskPriority
  },
) {
  return chatRequest<{ task: ChatTask }>(chatPath(chatId, '/tasks'), {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateChatTask(
  chatId: string,
  taskId: string,
  input: Partial<{
    assignedToId: string
    title: string
    description: string | null
    dueDate: string | null
    priority: TaskPriority
    status: TaskStatus
  }>,
) {
  return chatRequest<{ task: ChatTask }>(
    chatPath(chatId, `/tasks/${encodeURIComponent(taskId)}`),
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export async function deleteChatTask(chatId: string, taskId: string) {
  await chatRequest<void>(
    chatPath(chatId, `/tasks/${encodeURIComponent(taskId)}`),
    { method: 'DELETE' },
  )
}

export async function createChatPoll(
  chatId: string,
  input: { question: string; options: string[]; allowMultiple?: boolean },
) {
  const response = await chatRequest<{ poll: ChatPoll }>(
    chatPath(chatId, '/polls'),
    { method: 'POST', body: JSON.stringify(input) },
  )
  return response.poll
}

export async function getPoll(pollId: string) {
  const response = await chatRequest<{ poll: ChatPoll }>(
    `/polls/${encodeURIComponent(pollId)}`,
  )
  return response.poll
}

export async function votePoll(pollId: string, optionIds: string[]) {
  const response = await chatRequest<{ poll: ChatPoll }>(
    `/polls/${encodeURIComponent(pollId)}/votes`,
    { method: 'POST', body: JSON.stringify({ optionIds }) },
  )
  return response.poll
}

export async function removePollVote(pollId: string) {
  const response = await chatRequest<{ poll: ChatPoll }>(
    `/polls/${encodeURIComponent(pollId)}/votes`,
    { method: 'DELETE' },
  )
  return response.poll
}

export async function getCurrentQrCode() {
  return chatRequest<{ qrCode: PersonalQrCode | null }>('/qr-codes/current')
}

export async function createPersonalQrCode() {
  return chatRequest<{ qrCode: PersonalQrCode }>('/qr-codes/personal', {
    method: 'POST',
  })
}

export async function invalidateCurrentQrCode() {
  await chatRequest<void>('/qr-codes/current', { method: 'DELETE' })
}

export async function redeemQrCode(code: string) {
  return chatRequest<{
    chatId: string
    created: boolean
    redemptionRepeated: boolean
  }>('/qr-codes/redeem', {
    method: 'POST',
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  })
}

export async function uploadChatFile(file: File) {
  const data = new FormData()
  data.set('file', file)
  const response = await chatRequest<{ file: UploadedFile }>('/uploads/files', {
    method: 'POST',
    body: data,
  })
  return response.file
}
