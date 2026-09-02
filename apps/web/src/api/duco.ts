import { ApiClientError } from './auth'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type DucoMessageRole = 'user' | 'assistant'

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
  aiProvider: 'local' | 'ollama' | 'openai'
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

async function ducoRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
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
      body.error?.message ?? 'No pudimos completar la solicitud a DUCO.',
      body.error?.details?.fields,
    )
  }

  return body
}

export async function getDucoMessages(signal?: AbortSignal) {
  const response = await ducoRequest<{ messages: DucoMessage[] }>(
    '/duco/messages',
    { signal },
  )
  return response.messages
}

export async function sendDucoMessage(content: string) {
  return ducoRequest<DucoReply>('/duco/messages', {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function clearDucoMessages() {
  return ducoRequest<{ deletedCount: number }>('/duco/messages', {
    method: 'DELETE',
  })
}

export async function createDucoSupportRequest(
  sourceMessageId: string,
  draft: DucoRequestDraft,
) {
  const response = await ducoRequest<{ request: DucoSupportRequest }>(
    '/duco/requests',
    {
      method: 'POST',
      body: JSON.stringify({ sourceMessageId, ...draft }),
    },
  )
  return response.request
}

export async function getDucoSupportRequests(signal?: AbortSignal) {
  const response = await ducoRequest<{ requests: DucoSupportRequest[] }>(
    '/duco/requests',
    { signal },
  )
  return response.requests
}

export async function getDucoDrafts(signal?: AbortSignal) {
  const response = await ducoRequest<{ drafts: DucoDraft[] }>('/duco/drafts', {
    signal,
  })
  return response.drafts
}

export async function cancelDucoDraft(draftId: string) {
  const response = await ducoRequest<{ draft?: DucoDraft } | undefined>(
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
  const response = await ducoRequest<{ task: { id: string } }>('/duco/tasks', {
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
