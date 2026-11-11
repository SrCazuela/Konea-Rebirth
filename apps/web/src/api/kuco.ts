import { apiRequest } from './base'

export type KucoMessageRole = 'user' | 'assistant'
export type KucoAiProvider = 'local' | 'ollama' | 'openai'

export type KucoRequestCategory =
  | 'section_change'
  | 'missing_course'
  | 'enrollment'
  | 'schedule_conflict'
  | 'harassment'
  | 'technical'
  | 'financial'
  | 'wellbeing'
  | 'other'

export type KucoRequestUrgency = 'low' | 'medium' | 'high'
export type KucoRequestStatus =
  'pending' | 'reviewing' | 'resolved' | 'rejected'
export type KucoSupportRequestEventType =
  'created' | 'status_changed' | 'response'
export type KucoTaskPriority = 'low' | 'medium' | 'high'
export type KucoDraftStatus =
  | 'collecting_information'
  | 'ready_for_review'
  | 'confirmed'
  | 'cancelled'
  | 'expired'

export type KucoRequestDraft = {
  category: KucoRequestCategory
  subject: string
  description: string
  desiredOutcome: string
  urgency: KucoRequestUrgency
}

export type KucoManageRequestAction = {
  type: 'manage_request'
  label: 'Gestionar solicitud'
  draft: KucoRequestDraft
}

export type KucoTaskDraft = {
  title: string
  description: string
  courseName: string | null
  dueAt: string | null
  priority: KucoTaskPriority
}

export type KucoCreateTaskAction = {
  type: 'create_task'
  label: string
  draft: KucoTaskDraft
  draftId?: string | null
  draftStatus?: KucoDraftStatus
  task?: { id: string } | null
}

export type AssistantMessageAction =
  KucoManageRequestAction | KucoCreateTaskAction

export type KucoMessageAction = AssistantMessageAction

export type KucoSupportRequest = KucoRequestDraft & {
  id: string
  requesterId: string
  assignedToId: string | null
  sourceMessageId: string | null
  status: KucoRequestStatus
  createdAt: string
  updatedAt: string
  timeline: KucoSupportRequestEvent[]
}

export type KucoSupportRequestEvent = {
  id: string
  type: KucoSupportRequestEventType
  fromStatus: KucoRequestStatus | null
  toStatus: KucoRequestStatus
  note: string | null
  createdAt: string
  actor: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    role: 'student' | 'professor' | 'moderator' | 'admin'
  } | null
}

export type KucoMessage = {
  id: string
  role: KucoMessageRole
  content: string
  action: KucoMessageAction | null
  request: Pick<KucoSupportRequest, 'id' | 'status'> | null
  createdAt: string
}

export type KucoDraft = {
  id: string
  kind: string
  status: KucoDraftStatus
  payload: Partial<KucoTaskDraft>
  sourceMessageId: string | null
  completedResourceId: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export type KucoReply = {
  userMessage: KucoMessage
  assistantMessage: KucoMessage
  openTaskCount: number
  aiProvider: KucoAiProvider
}

export async function getKucoMessages(signal?: AbortSignal) {
  return apiRequest<{
    messages: KucoMessage[]
    openTaskCount: number
    aiProvider: KucoAiProvider
  }>('/kuco/messages', { signal })
}

export async function sendKucoMessage(content: string) {
  return apiRequest<KucoReply>('/kuco/messages', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function clearKucoMessages() {
  return apiRequest<{ deletedCount: number }>('/kuco/messages', {
    method: 'DELETE',
  })
}

export async function createKucoSupportRequest(
  sourceMessageId: string,
  draft: KucoRequestDraft,
) {
  const response = await apiRequest<{ request: KucoSupportRequest }>(
    '/kuco/requests',
    {
      method: 'POST',
      body: JSON.stringify({ sourceMessageId, ...draft }),
    },
  )
  return response.request
}

export async function getKucoSupportRequests(signal?: AbortSignal) {
  const response = await apiRequest<{ requests: KucoSupportRequest[] }>(
    '/kuco/requests',
    { signal },
  )
  return response.requests
}

export async function getKucoDrafts(signal?: AbortSignal) {
  const response = await apiRequest<{ drafts: KucoDraft[] }>('/kuco/drafts', {
    signal,
  })
  return response.drafts
}

export async function cancelKucoDraft(draftId: string) {
  const response = await apiRequest<{ draft?: KucoDraft } | undefined>(
    `/kuco/drafts/${encodeURIComponent(draftId)}`,
    { method: 'DELETE' },
  )
  return response?.draft
}

export async function createKucoTask(
  reference: {
    draftId?: string | null
    sourceMessageId?: string | null
  },
  draft: KucoTaskDraft,
) {
  const response = await apiRequest<{ task: { id: string } }>('/kuco/tasks', {
    method: 'POST',
    body: JSON.stringify({
      ...(reference.draftId
        ? { draftId: reference.draftId }
        : { sourceMessageId: reference.sourceMessageId }),
      ...draft,
    }),
  })
  return response.task
}
