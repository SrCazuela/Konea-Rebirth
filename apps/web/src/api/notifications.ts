import { apiRequest } from './base'

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

export async function getNotifications() {
  return apiRequest<{
    notifications: KoneaNotification[]
    unreadCount: number
  }>('/notifications')
}

export async function getUnreadNotificationCount() {
  const response = await apiRequest<{ unreadCount: number }>(
    '/notifications/unread-count',
  )
  return response.unreadCount
}

export async function markNotificationRead(notificationId: string) {
  return apiRequest<{
    notification?: KoneaNotification
    unreadCount: number
  }>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  })
}

export async function markAllNotificationsRead() {
  return apiRequest<{ updated: boolean; unreadCount: number }>(
    '/notifications/read-all',
    {
      method: 'POST',
    },
  )
}
