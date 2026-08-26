import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type KoneaNotification,
  type NotificationType,
} from '../api/notifications'
import './Notifications.css'

type NotificationsProps = {
  unreadCount: number
  onUnreadCountChange: (count: number) => void
  onOpenUser: (userId: string) => void
  onOpenFeed: (postId?: string) => void
  onOpenChat?: (chatId: string) => void
  onOpenSupportRequests?: () => void
}

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : dateFormatter.format(date)
}

function NotificationGlyph({ type }: { type: NotificationType }) {
  const paths: Record<NotificationType, ReactNode> = {
    connection: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M3 20a6 6 0 0 1 12 0M18 8v6M15 11h6" />
      </>
    ),
    like: (
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
    ),
    comment: (
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.8 9.8 0 0 1-4-.9L3 21l1.8-4.7A8.5 8.5 0 1 1 21 11.5Z" />
    ),
    reply: (
      <>
        <path d="m9 17-5-5 5-5" />
        <path d="M20 19v-2a5 5 0 0 0-5-5H4" />
      </>
    ),
    message: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    task: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="m8 12 2 2 5-5M8 18h8" />
      </>
    ),
    moderation: (
      <path d="M12 3 20 6v5.5c0 4.7-3.1 8-8 9.5-4.9-1.5-8-4.8-8-9.5V6l8-3Zm-3 9 2 2 4-4" />
    ),
    support_request: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[type]}
    </svg>
  )
}

function notificationDestination(notification: KoneaNotification) {
  const href = notification.href ?? ''
  const separator = href.indexOf(':')
  if (separator < 1) return null
  return {
    type: href.slice(0, separator),
    id: href.slice(separator + 1),
  }
}

export function Notifications({
  unreadCount,
  onUnreadCountChange,
  onOpenUser,
  onOpenFeed,
  onOpenChat,
  onOpenSupportRequests,
}: NotificationsProps) {
  const [notifications, setNotifications] = useState<KoneaNotification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setNotifications(await getNotifications())
    } catch (loadError) {
      setError(
        readableError(loadError, 'No pudimos cargar tus notificaciones.'),
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getNotifications()
      .then((items) => {
        if (!cancelled) setNotifications(items)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            readableError(loadError, 'No pudimos cargar tus notificaciones.'),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visibleNotifications = useMemo(
    () =>
      filter === 'unread'
        ? notifications.filter((notification) => !notification.readAt)
        : notifications,
    [filter, notifications],
  )

  const markAsReadLocally = (notificationId: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId && !notification.readAt
          ? { ...notification, readAt: new Date().toISOString() }
          : notification,
      ),
    )
  }

  const openNotification = async (notification: KoneaNotification) => {
    if (busyId) return
    setBusyId(notification.id)
    setActionError('')
    const wasUnread = !notification.readAt

    if (wasUnread) {
      try {
        await markNotificationRead(notification.id)
        markAsReadLocally(notification.id)
        onUnreadCountChange(Math.max(0, unreadCount - 1))
      } catch (markError) {
        setActionError(
          readableError(markError, 'No pudimos marcar la notificación.'),
        )
      }
    }

    setBusyId(null)
    const destination = notificationDestination(notification)
    if (destination?.type === 'user' && destination.id) {
      onOpenUser(destination.id)
    } else if (destination?.type === 'post') {
      onOpenFeed(destination.id || undefined)
    } else if (destination?.type === 'chat' && destination.id) {
      onOpenChat?.(destination.id)
    } else if (destination?.type === 'duco-request') {
      onOpenSupportRequests?.()
    }
  }

  const markAll = async () => {
    if (!unreadCount || markingAll) return
    setMarkingAll(true)
    setActionError('')
    try {
      await markAllNotificationsRead()
      const now = new Date().toISOString()
      setNotifications((current) =>
        current.map((notification) => ({
          ...notification,
          readAt: notification.readAt ?? now,
        })),
      )
      onUnreadCountChange(0)
    } catch (markError) {
      setActionError(
        readableError(markError, 'No pudimos marcar las notificaciones.'),
      )
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="notifications-layout">
      <section className="notifications-toolbar">
        <div className="notifications-tabs" aria-label="Filtrar notificaciones">
          <button
            type="button"
            className={filter === 'all' ? 'is-active' : ''}
            onClick={() => setFilter('all')}
            aria-pressed={filter === 'all'}
          >
            Todas
          </button>
          <button
            type="button"
            className={filter === 'unread' ? 'is-active' : ''}
            onClick={() => setFilter('unread')}
            aria-pressed={filter === 'unread'}
          >
            Sin leer
            {unreadCount > 0 && <span>{unreadCount}</span>}
          </button>
        </div>
        <button
          className="notifications-read-all"
          type="button"
          onClick={() => void markAll()}
          disabled={!unreadCount || markingAll}
        >
          {markingAll ? 'Guardando…' : 'Marcar todas como leídas'}
        </button>
      </section>

      {actionError && (
        <p className="notifications-alert" role="alert">
          {actionError}
        </p>
      )}

      {loading ? (
        <div className="notifications-loading" role="status">
          <span className="notifications-spinner" />
          <span>Cargando notificaciones…</span>
        </div>
      ) : error ? (
        <section className="notifications-empty">
          <span className="notifications-empty__icon">
            <NotificationGlyph type="message" />
          </span>
          <h2>No pudimos cargar tus notificaciones</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadNotifications()}>
            Intentar nuevamente
          </button>
        </section>
      ) : visibleNotifications.length === 0 ? (
        <section className="notifications-empty">
          <span className="notifications-empty__icon">
            <NotificationGlyph type="moderation" />
          </span>
          <h2>
            {filter === 'unread' ? 'Estás al día' : 'Todo tranquilo por aquí'}
          </h2>
          <p>
            {filter === 'unread'
              ? 'No tienes notificaciones pendientes por leer.'
              : 'Las nuevas interacciones y conexiones aparecerán en este espacio.'}
          </p>
        </section>
      ) : (
        <section className="notifications-list" aria-label="Tus notificaciones">
          {visibleNotifications.map((notification) => (
            <article
              className={`notification-card${notification.readAt ? '' : ' notification-card--unread'}`}
              key={notification.id}
            >
              <button
                type="button"
                onClick={() => void openNotification(notification)}
                disabled={busyId === notification.id}
              >
                <span
                  className={`notification-card__icon notification-card__icon--${notification.type}`}
                >
                  <NotificationGlyph type={notification.type} />
                </span>
                <span className="notification-card__content">
                  <span className="notification-card__title-row">
                    <strong>{notification.title}</strong>
                    {!notification.readAt && (
                      <span className="notification-card__dot">
                        <span className="notifications-sr-only">Sin leer</span>
                      </span>
                    )}
                  </span>
                  <span className="notification-card__body">
                    {notification.body}
                  </span>
                  <time dateTime={notification.createdAt}>
                    {formatDate(notification.createdAt)}
                  </time>
                </span>
                <span className="notification-card__arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
