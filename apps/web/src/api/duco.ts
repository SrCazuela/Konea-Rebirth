import { apiRequest } from './base'

export type DucoMessageRole = 'user' | 'assistant'
export type DucoAiProvider = 'local' | 'ollama' | 'openai'

export type DucoRequestCategory =
  | 'section_change'
  | 'missing_course'
  | 'enrollment'
  | 'schedule_conflict'
  | 'harassment'
  | 'technical'
  | 'financial'
  | 'wellbeing'
  | 'other'

export type DucoRequestUrgency = 'low' | 'medium' | 'high'
export type DucoRequestStatus =
  'pending' | 'reviewing' | 'resolved' | 'rejected'
export type DucoSupportRequestEventType =
  'created' | 'status_changed' | 'response'
export type DucoTaskPriority = 'low' | 'medium' | 'high'
export type DucoDraftStatus =
  | 'collecting_information'
  | 'ready_for_review'
  | 'confirmed'
  | 'cancelled'
  | 'expired'

export type DucoRequestDraft = {
  category: DucoRequestCategory
  subject: string
  description: string
  desiredOutcome: string
  urgency: DucoRequestUrgency
}

export type DucoManageRequestAction = {
  type: 'manage_request'
  label: 'Gestionar solicitud'
  draft: DucoRequestDraft
}

export type DucoTaskDraft = {
  title: string
  description: string
  courseName: string | null
  dueAt: string | null
  priority: DucoTaskPriority
}

export type DucoCreateTaskAction = {
  type: 'create_task'
  label: string
  draft: DucoTaskDraft
  draftId?: string | null
  draftStatus?: DucoDraftStatus
  task?: { id: string } | null
}

export type AssistantMessageAction =
  DucoManageRequestAction | DucoCreateTaskAction

export type DucoMessageAction = AssistantMessageAction

export type DucoSupportRequest = DucoRequestDraft & {
  id: string
  requesterId: string
  assignedToId: string | null
  sourceMessageId: string | null
  status: DucoRequestStatus
  createdAt: string
  updatedAt: string
  timeline: DucoSupportRequestEvent[]
}

export type DucoSupportRequestEvent = {
  id: string
  type: DucoSupportRequestEventType
  fromStatus: DucoRequestStatus | null
  toStatus: DucoRequestStatus
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

export type DucoMessage = {
  id: string
  role: DucoMessageRole
  content: string
  action: DucoMessageAction | null
  request: Pick<DucoSupportRequest, 'id' | 'status'> | null
  createdAt: string
}

export type DucoDraft = {
  id: string
  kind: string
  status: DucoDraftStatus
  payload: Partial<DucoTaskDraft>
  sourceMessageId: string | null
  completedResourceId: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export type DucoReply = {
  userMessage: DucoMessage
  assistantMessage: DucoMessage
  openTaskCount: number
  aiProvider: DucoAiProvider
}

export async function getDucoMessages(signal?: AbortSignal) {
  return apiRequest<{
    messages: DucoMessage[]
    openTaskCount: number
    aiProvider: DucoAiProvider
  }>('/duco/messages', { signal })
}

export async function sendDucoMessage(content: string) {
  return apiRequest<DucoReply>('/duco/messages', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function clearDucoMessages() {
  return apiRequest<{ deletedCount: number }>('/duco/messages', {
    method: 'DELETE',
  })
}

export async function createDucoSupportRequest(
  sourceMessageId: string,
  draft: DucoRequestDraft,
) {
  const response = await apiRequest<{ request: DucoSupportRequest }>(
    '/duco/requests',
    {
      method: 'POST',
      body: JSON.stringify({ sourceMessageId, ...draft }),
    },
  )
  return response.request
}

export async function getDucoSupportRequests(signal?: AbortSignal) {
  const response = await apiRequest<{ requests: DucoSupportRequest[] }>(
    '/duco/requests',
    { signal },
  )
  return response.requests
}

export async function getDucoDrafts(signal?: AbortSignal) {
  const response = await apiRequest<{ drafts: DucoDraft[] }>('/duco/drafts', {
    signal,
  })
  return response.drafts
}

export async function cancelDucoDraft(draftId: string) {
  const response = await apiRequest<{ draft?: DucoDraft } | undefined>(
    `/duco/drafts/${encodeURIComponent(draftId)}`,
    { method: 'DELETE' },
  )
  return response?.draft
}

export async function createDucoTask(
  reference: {
    draftId?: string | null
    sourceMessageId?: string | null
  },
  draft: DucoTaskDraft,
) {
  const response = await apiRequest<{ task: { id: string } }>('/duco/tasks', {
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
