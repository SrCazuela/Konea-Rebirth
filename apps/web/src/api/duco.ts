import { ApiClientError } from './auth'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type DucoMessageRole = 'user' | 'assistant'

export type DucoMessage = {
  id: string
  role: DucoMessageRole
  content: string
  createdAt: string
}

export type DucoReply = {
  userMessage: DucoMessage
  assistantMessage: DucoMessage
  openTaskCount: number
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
