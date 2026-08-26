import { ApiClientError } from './auth'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type NotificationType =
  | 'connection'
  | 'like'
  | 'comment'
  | 'reply'
  | 'message'
  | 'task'
  | 'moderation'
  | 'support_request'

export type KoneaNotification = {
  id: string
  type: NotificationType
  title: string
  body: string
  href: string | null
  resourceId: string | null
  readAt: string | null
  createdAt: string
  actor?: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
  } | null
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

async function notificationRequest<T>(path: string, init?: RequestInit) {
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
      body.error?.message ?? 'No pudimos completar la solicitud.',
      body.error?.details?.fields,
    )
  }

  return body
}

export async function getNotifications() {
  const response = await notificationRequest<{
    notifications: KoneaNotification[]
  }>('/notifications')
  return response.notifications
}

export async function getUnreadNotificationCount() {
  const response = await notificationRequest<{ unreadCount: number }>(
    '/notifications/unread-count',
  )
  return response.unreadCount
}

export async function markNotificationRead(notificationId: string) {
  const response = await notificationRequest<{
    notification?: KoneaNotification
  }>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  })
  return response?.notification
}

export async function markAllNotificationsRead() {
  await notificationRequest<unknown>('/notifications/read-all', {
    method: 'POST',
  })
}
