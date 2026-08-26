import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { KoneaUser } from '../api/auth'
import {
  clearDucoMessages,
  createDucoSupportRequest,
  createDucoTask,
  getDucoMessages,
  getDucoSupportRequests,
  sendDucoMessage,
  type DucoMessage,
  type DucoRequestCategory,
  type DucoRequestDraft,
  type DucoSupportRequest,
  type DucoTaskDraft,
} from '../api/duco'
import './Duco.css'
import { AvaCalendarSync } from './AvaCalendarSync'

export type DucoProps = {
  currentUser: Pick<KoneaUser, 'displayName' | 'avatarUrl'>
  initialPanel?: DucoPanel
}

type MessageStatus = 'sent' | 'pending' | 'failed'
type VisibleMessage = DucoMessage & { status: MessageStatus }
type DucoPanel = 'conversation' | 'requests'
type IconName =
  | 'assistant'
  | 'arrow'
  | 'check'
  | 'clock'
  | 'inbox'
  | 'privacy'
  | 'refresh'
  | 'send'
  | 'sparkles'
  | 'tasks'
  | 'trash'

const quickActions = [
  {
    icon: 'tasks' as const,
    label: 'Ver mis pendientes',
    prompt: '¿Qué tareas tengo pendientes?',
  },
  {
    icon: 'clock' as const,
    label: 'Organizar mi día',
    prompt: 'Organiza mis tareas y dime por dónde debería empezar hoy.',
  },
  {
    icon: 'sparkles' as const,
    label: 'Gestionar una solicitud',
    prompt: 'Necesito ayuda para gestionar una solicitud institucional.',
  },
]

const requestCategoryLabels: Record<DucoRequestCategory, string> = {
  section_change: 'Cambio de sección',
  missing_course: 'Asignatura faltante',
  enrollment: 'Inscripción de asignaturas',
  schedule_conflict: 'Conflicto de horario',
  harassment: 'Convivencia o acoso',
  technical: 'Soporte técnico',
  financial: 'Asunto financiero',
  wellbeing: 'Bienestar estudiantil',
  other: 'Otra solicitud',
}

const requestStatusLabels = {
  pending: 'pendiente',
  reviewing: 'en revisión',
  resolved: 'resuelta',
  rejected: 'rechazada',
} as const

const requestUrgencyLabels = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
} as const

const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
})

const dateTimeFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    assistant: (
      <>
        <path d="M7 5.5h6.4a3.6 3.6 0 0 1 0 7.2H10l-3 3v-3.4A3.6 3.6 0 0 1 7 5.5Z" />
        <path d="m10 8.2 3 1.8-3 1.8V8.2Z" />
      </>
    ),
    arrow: <path d="m9 18 6-6-6-6" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    inbox: (
      <>
        <path d="M4 5h16v14H4z" />
        <path d="M4 14h4l2 2h4l2-2h4" />
      </>
    ),
    privacy: (
      <>
        <path d="M12 3 20 6v5.5c0 4.7-3.1 8-8 9.5-4.9-1.5-8-4.8-8-9.5V6l8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 8A7 7 0 0 1 18.5 6L20 12M4 12l1.5 6A7 7 0 0 0 18 16" />
      </>
    ),
    send: (
      <>
        <path d="m22 2-7 20-4-9-9-4 20-7Z" />
        <path d="M22 2 11 13" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" />
        <path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
        <path d="m5 13 .7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
      </>
    ),
    tasks: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="m8 10 1.5 1.5L12 9M8 16h8" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="duco-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      {paths[name]}
    </svg>
  )
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : dateTimeFormatter.format(date)
}

function toDateTimeLocal(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function AssistantAvatar() {
  return (
    <span className="duco-avatar duco-avatar--assistant" aria-hidden="true">
      <Icon name="assistant" />
    </span>
  )
}

function UserAvatar({ user }: { user: DucoProps['currentUser'] }) {
  if (user.avatarUrl) {
    return (
      <img
        className="duco-avatar duco-avatar--user"
        src={user.avatarUrl}
        alt=""
        aria-hidden="true"
      />
    )
  }

  return (
    <span
      className="duco-avatar duco-avatar--user duco-avatar--initials"
      aria-hidden="true"
    >
      {initials(user.displayName) || 'K'}
    </span>
  )
}

function SupportRequestCard({ request }: { request: DucoSupportRequest }) {
  return (
    <article className="duco-support-card">
      <header>
        <div>
          <span className="duco-support-card__category">
            {requestCategoryLabels[request.category]}
          </span>
          <h4>{request.subject}</h4>
        </div>
        <span
          className={`duco-support-status duco-support-status--${request.status}`}
        >
          {requestStatusLabels[request.status]}
        </span>
      </header>

      <p className="duco-support-card__description">{request.description}</p>

      {request.desiredOutcome && (
        <div className="duco-support-card__outcome">
          <strong>Resultado esperado</strong>
          <p>{request.desiredOutcome}</p>
        </div>
      )}

      <footer>
        <span
          className={`duco-support-urgency duco-support-urgency--${request.urgency}`}
        >
          Urgencia {requestUrgencyLabels[request.urgency].toLowerCase()}
        </span>
        <span>Creada el {formatDateTime(request.createdAt)}</span>
        {request.updatedAt !== request.createdAt && (
          <span>Actualizada el {formatDateTime(request.updatedAt)}</span>
        )}
      </footer>
    </article>
  )
}

export function Duco({
  currentUser,
  initialPanel = 'conversation',
}: DucoProps) {
  const [activePanel, setActivePanel] = useState<DucoPanel>(initialPanel)
  const [messages, setMessages] = useState<VisibleMessage[]>([])
  const [draft, setDraft] = useState('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [requestForm, setRequestForm] = useState<{
    sourceMessageId: string
    draft: DucoRequestDraft
  } | null>(null)
  const [requestSubmitting, setRequestSubmitting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [supportRequests, setSupportRequests] = useState<DucoSupportRequest[]>(
    [],
  )
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [requestsRefreshing, setRequestsRefreshing] = useState(false)
  const [requestsError, setRequestsError] = useState('')
  const [requestsLoaded, setRequestsLoaded] = useState(false)
  const [taskForm, setTaskForm] = useState<{
    sourceMessageId: string
    draft: DucoTaskDraft
  } | null>(null)
  const [taskSubmitting, setTaskSubmitting] = useState(false)
  const [taskError, setTaskError] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const requestsLoadedRef = useRef(false)
  const requestsRequestRef = useRef(0)

  useEffect(() => {
    const syncPanelWithHash = () =>
      setActivePanel(
        window.location.hash === '#duco-requests' ? 'requests' : 'conversation',
      )
    window.addEventListener('hashchange', syncPanelWithHash)
    window.addEventListener('popstate', syncPanelWithHash)
    return () => {
      window.removeEventListener('hashchange', syncPanelWithHash)
      window.removeEventListener('popstate', syncPanelWithHash)
    }
  }, [])

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const history = await getDucoMessages(signal)
      setMessages(history.map((message) => ({ ...message, status: 'sent' })))
    } catch (error) {
      if (!isAbortError(error)) {
        setHistoryError(
          readableError(error, 'No pudimos recuperar tu conversación.'),
        )
      }
    } finally {
      if (!signal?.aborted) setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    getDucoMessages(controller.signal)
      .then((history) => {
        setMessages(history.map((message) => ({ ...message, status: 'sent' })))
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setHistoryError(
            readableError(error, 'No pudimos recuperar tu conversación.'),
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [])

  const loadSupportRequests = useCallback(
    async (options: { signal?: AbortSignal; silent?: boolean } = {}) => {
      const { signal, silent = false } = options
      const requestId = ++requestsRequestRef.current
      if (silent || requestsLoadedRef.current) setRequestsRefreshing(true)
      else setRequestsLoading(true)
      setRequestsError('')

      try {
        const items = await getDucoSupportRequests(signal)
        if (signal?.aborted || requestId !== requestsRequestRef.current) return

        requestsLoadedRef.current = true
        setRequestsLoaded(true)
        setSupportRequests(items)
        const statuses = new Map(items.map((item) => [item.id, item.status]))
        setMessages((current) =>
          current.map((message) => {
            if (!message.request) return message
            const status = statuses.get(message.request.id)
            return status && status !== message.request.status
              ? { ...message, request: { ...message.request, status } }
              : message
          }),
        )
      } catch (error) {
        if (!isAbortError(error) && requestId === requestsRequestRef.current) {
          setRequestsError(
            readableError(error, 'No pudimos recuperar tus solicitudes.'),
          )
        }
      } finally {
        if (!signal?.aborted && requestId === requestsRequestRef.current) {
          setRequestsLoading(false)
          setRequestsRefreshing(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (activePanel !== 'requests') return

    const controller = new AbortController()
    const initialRefresh = window.setTimeout(
      () => void loadSupportRequests({ signal: controller.signal }),
      0,
    )
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadSupportRequests({ silent: true })
      }
    }
    const interval = window.setInterval(refreshIfVisible, 15_000)
    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)

    return () => {
      controller.abort()
      window.clearTimeout(initialRefresh)
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [activePanel, loadSupportRequests])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || historyLoading || activePanel !== 'conversation') return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [activePanel, historyLoading, messages, sending])

  const sendPrompt = async (rawContent: string) => {
    const content = rawContent.trim()
    if (!content || sending || content.length > 2_000) return

    const temporaryId = `pending-${crypto.randomUUID()}`
    const optimisticMessage: VisibleMessage = {
      id: temporaryId,
      role: 'user',
      content,
      action: null,
      request: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
    }

    setDraft('')
    setAnnouncement('Enviando mensaje a DUCO.')
    setMessages((current) => [...current, optimisticMessage])
    setSending(true)

    try {
      const reply = await sendDucoMessage(content)
      setMessages((current) => [
        ...current.filter((message) => message.id !== temporaryId),
        { ...reply.userMessage, status: 'sent' },
        { ...reply.assistantMessage, status: 'sent' },
      ])
      setOpenTaskCount(reply.openTaskCount)
      setAnnouncement('DUCO respondió tu mensaje.')
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === temporaryId
            ? { ...message, status: 'failed' }
            : message,
        ),
      )
      setAnnouncement(
        readableError(error, 'No pudimos enviar el mensaje a DUCO.'),
      )
    } finally {
      setSending(false)
      window.setTimeout(() => composerRef.current?.focus(), 0)
    }
  }

  const submitMessage = (event?: FormEvent) => {
    event?.preventDefault()
    void sendPrompt(draft)
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault()
      submitMessage()
    }
  }

  const retryMessage = (message: VisibleMessage) => {
    setMessages((current) =>
      current.filter((currentMessage) => currentMessage.id !== message.id),
    )
    void sendPrompt(message.content)
  }

  const dismissFailedMessage = (messageId: string) => {
    setMessages((current) =>
      current.filter((message) => message.id !== messageId),
    )
  }

  const openRequestForm = (message: VisibleMessage) => {
    if (message.action?.type !== 'manage_request' || message.request) return
    setRequestError('')
    setRequestForm({
      sourceMessageId: message.id,
      draft: { ...message.action.draft },
    })
  }

  const updateRequestDraft = <Field extends keyof DucoRequestDraft>(
    field: Field,
    value: DucoRequestDraft[Field],
  ) => {
    setRequestForm((current) =>
      current
        ? { ...current, draft: { ...current.draft, [field]: value } }
        : current,
    )
  }

  const openTaskForm = (message: VisibleMessage) => {
    if (message.action?.type !== 'create_task' || message.action.task) return
    setTaskError('')
    setTaskForm({
      sourceMessageId: message.id,
      draft: {
        ...message.action.draft,
        dueAt: toDateTimeLocal(message.action.draft.dueAt),
      },
    })
  }

  const updateTaskDraft = <Field extends keyof DucoTaskDraft>(
    field: Field,
    value: DucoTaskDraft[Field],
  ) => {
    setTaskForm((current) =>
      current
        ? { ...current, draft: { ...current.draft, [field]: value } }
        : current,
    )
  }

  const submitTask = async (event: FormEvent) => {
    event.preventDefault()
    if (!taskForm || taskSubmitting) return

    setTaskSubmitting(true)
    setTaskError('')
    try {
      const dueDate = taskForm.draft.dueAt
        ? new Date(taskForm.draft.dueAt)
        : null
      if (dueDate && Number.isNaN(dueDate.getTime())) {
        setTaskError('La fecha del pendiente no es válida.')
        return
      }

      const createdTask = await createDucoTask(taskForm.sourceMessageId, {
        ...taskForm.draft,
        title: taskForm.draft.title.trim(),
        description: taskForm.draft.description.trim(),
        courseName: taskForm.draft.courseName?.trim() || null,
        dueAt: dueDate?.toISOString() ?? null,
      })
      setMessages((current) =>
        current.map((message) => {
          if (
            message.id !== taskForm.sourceMessageId ||
            message.action?.type !== 'create_task'
          ) {
            return message
          }
          return {
            ...message,
            action: { ...message.action, task: createdTask },
          }
        }),
      )
      setOpenTaskCount((current) => (current ?? 0) + 1)
      setTaskForm(null)
      setAnnouncement(
        'Pendiente creado. Ya está disponible en tu espacio académico.',
      )
    } catch (error) {
      setTaskError(readableError(error, 'No pudimos crear el pendiente.'))
    } finally {
      setTaskSubmitting(false)
    }
  }

  const submitSupportRequest = async (event: FormEvent) => {
    event.preventDefault()
    if (!requestForm || requestSubmitting) return

    setRequestSubmitting(true)
    setRequestError('')
    try {
      const createdRequest = await createDucoSupportRequest(
        requestForm.sourceMessageId,
        requestForm.draft,
      )
      setMessages((current) =>
        current.map((message) =>
          message.id === requestForm.sourceMessageId
            ? {
                ...message,
                request: {
                  id: createdRequest.id,
                  status: createdRequest.status,
                },
              }
            : message,
        ),
      )
      setSupportRequests((current) => [
        createdRequest,
        ...current.filter((item) => item.id !== createdRequest.id),
      ])
      setRequestForm(null)
      setAnnouncement(
        'Solicitud enviada. El equipo institucional ya puede revisarla.',
      )
    } catch (error) {
      setRequestError(readableError(error, 'No pudimos enviar la solicitud.'))
    } finally {
      setRequestSubmitting(false)
    }
  }

  const clearHistory = async () => {
    const confirmed = window.confirm(
      '¿Quieres borrar toda tu conversación con DUCO? Esta acción no se puede deshacer.',
    )
    if (!confirmed) return

    setClearing(true)
    setAnnouncement('Borrando historial de DUCO.')
    try {
      const result = await clearDucoMessages()
      setMessages([])
      setOpenTaskCount(null)
      setAnnouncement(
        result.deletedCount > 0
          ? 'Historial de DUCO eliminado.'
          : 'El historial ya estaba vacío.',
      )
    } catch (error) {
      setAnnouncement(
        readableError(error, 'No pudimos borrar el historial de DUCO.'),
      )
    } finally {
      setClearing(false)
    }
  }

  const firstName =
    currentUser.displayName.trim().split(/\s+/)[0] || currentUser.displayName
  const hasMessages = messages.length > 0
  const byRecentUpdate = (
    left: DucoSupportRequest,
    right: DucoSupportRequest,
  ) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  const activeRequests = supportRequests
    .filter(
      (request) =>
        request.status === 'pending' || request.status === 'reviewing',
    )
    .sort(byRecentUpdate)
  const finishedRequests = supportRequests
    .filter(
      (request) =>
        request.status === 'resolved' || request.status === 'rejected',
    )
    .sort(byRecentUpdate)

  return (
    <section className="duco-layout" aria-label="Asistente académico DUCO">
      <aside className="duco-about">
        <div className="duco-about__identity">
          <span className="duco-about__mark" aria-hidden="true">
            <Icon name="assistant" />
          </span>
          <div>
            <span className="duco-mode-pill">
              <span aria-hidden="true" />
              IA local
            </span>
            <h2>DUCO</h2>
            <p>Tu compañero para organizar la vida académica.</p>
          </div>
        </div>

        <div className="duco-privacy-card">
          <span className="duco-privacy-card__icon">
            <Icon name="privacy" />
          </span>
          <div>
            <strong>Privado por diseño</strong>
            <p>
              DUCO organiza tus pendientes y prepara borradores con IA. Tú
              siempre revisas y confirmas antes de crear o enviar algo.
            </p>
          </div>
        </div>

        <AvaCalendarSync />

        <div className="duco-actions" aria-labelledby="duco-actions-title">
          <span id="duco-actions-title">Acciones rápidas</span>
          {quickActions.map((action) => (
            <button
              type="button"
              key={action.label}
              onClick={() => void sendPrompt(action.prompt)}
              disabled={sending || historyLoading}
            >
              <span className="duco-actions__icon">
                <Icon name={action.icon} />
              </span>
              <span>{action.label}</span>
              <Icon name="arrow" />
            </button>
          ))}
        </div>

        <p className="duco-about__note">
          DUCO organiza tu carga académica y prepara formularios, pero no
          realiza tus trabajos ni hace gestiones sin tu confirmación.
        </p>
      </aside>

      <div className="duco-chat">
        <header className="duco-chat__header">
          <div className="duco-chat__status">
            <AssistantAvatar />
            <span>
              <strong>DUCO</strong>
              <small>
                <span aria-hidden="true" />
                Disponible en este dispositivo
              </small>
            </span>
          </div>
          <div
            className="duco-view-tabs"
            role="tablist"
            aria-label="Secciones de DUCO"
          >
            <button
              id="duco-conversation-tab"
              type="button"
              role="tab"
              aria-selected={activePanel === 'conversation'}
              aria-controls="duco-conversation-panel"
              className={activePanel === 'conversation' ? 'is-active' : ''}
              onClick={() => setActivePanel('conversation')}
            >
              Conversación
            </button>
            <button
              id="duco-requests-tab"
              type="button"
              role="tab"
              aria-selected={activePanel === 'requests'}
              aria-controls="duco-requests-panel"
              className={activePanel === 'requests' ? 'is-active' : ''}
              onClick={() => setActivePanel('requests')}
            >
              Mis solicitudes
              {activeRequests.length > 0 && (
                <span
                  aria-label={`${activeRequests.length} solicitudes activas`}
                >
                  {activeRequests.length > 99 ? '99+' : activeRequests.length}
                </span>
              )}
            </button>
          </div>
          <div className="duco-chat__header-actions">
            {openTaskCount !== null && (
              <span className="duco-task-count">
                {openTaskCount} {openTaskCount === 1 ? 'tarea' : 'tareas'}
              </span>
            )}
            {activePanel === 'conversation' ? (
              <button
                className="duco-clear-button"
                type="button"
                onClick={() => void clearHistory()}
                disabled={!hasMessages || clearing || sending}
                aria-label="Borrar historial de DUCO"
              >
                <Icon name="trash" />
                <span>{clearing ? 'Borrando…' : 'Borrar historial'}</span>
              </button>
            ) : (
              <button
                className="duco-refresh-button"
                type="button"
                onClick={() => void loadSupportRequests({ silent: true })}
                disabled={requestsLoading || requestsRefreshing}
              >
                <Icon name="refresh" />
                <span>
                  {requestsRefreshing ? 'Actualizando…' : 'Actualizar'}
                </span>
              </button>
            )}
          </div>
        </header>

        {activePanel === 'conversation' && (
          <>
            <div
              id="duco-conversation-panel"
              role="tabpanel"
              aria-labelledby="duco-conversation-tab"
              className="duco-messages"
              ref={viewportRef}
              aria-live="polite"
              aria-relevant="additions"
              aria-label="Conversación con DUCO"
            >
              {historyLoading ? (
                <div className="duco-loading-history" role="status">
                  <span className="duco-loading-history__mark">
                    <Icon name="assistant" />
                  </span>
                  <span className="duco-loading-history__line" />
                  <span className="duco-loading-history__line duco-loading-history__line--short" />
                  <span className="duco-sr-only">Cargando conversación…</span>
                </div>
              ) : historyError && !hasMessages ? (
                <div className="duco-history-error" role="alert">
                  <span>
                    <Icon name="refresh" />
                  </span>
                  <h3>No pudimos abrir tu conversación</h3>
                  <p>{historyError}</p>
                  <button type="button" onClick={() => void loadHistory()}>
                    <Icon name="refresh" />
                    Intentar nuevamente
                  </button>
                </div>
              ) : !hasMessages ? (
                <div className="duco-welcome">
                  <span className="duco-welcome__mark">
                    <Icon name="sparkles" />
                  </span>
                  <p className="duco-welcome__eyebrow">Asistente Konea</p>
                  <h3>¡Hola, {firstName}!</h3>
                  <p>
                    Puedo revisar tus pendientes y preparar una solicitud
                    editable cuando necesites ayuda institucional.
                  </p>
                  <div className="duco-suggestions" aria-label="Sugerencias">
                    {quickActions.slice(0, 2).map((action) => (
                      <button
                        type="button"
                        key={action.prompt}
                        onClick={() => void sendPrompt(action.prompt)}
                        disabled={sending}
                      >
                        {action.prompt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    className={`duco-message duco-message--${message.role}${message.status === 'failed' ? ' duco-message--failed' : ''}`}
                    key={message.id}
                  >
                    {message.role === 'assistant' ? (
                      <AssistantAvatar />
                    ) : (
                      <UserAvatar user={currentUser} />
                    )}
                    <div className="duco-message__column">
                      <div className="duco-message__meta">
                        <strong>
                          {message.role === 'assistant'
                            ? 'DUCO'
                            : currentUser.displayName}
                        </strong>
                        {message.status === 'pending' ? (
                          <span>Enviando…</span>
                        ) : (
                          <time dateTime={message.createdAt}>
                            {formatTime(message.createdAt)}
                          </time>
                        )}
                      </div>
                      <div className="duco-message__bubble">
                        <p>{message.content}</p>
                      </div>
                      {message.action && message.status === 'sent' && (
                        <div className="duco-message__request-action">
                          {message.action.type === 'manage_request' ? (
                            message.request ? (
                              <span className="duco-request-sent">
                                <Icon name="privacy" />
                                Solicitud enviada ·{' '}
                                {requestStatusLabels[message.request.status]}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openRequestForm(message)}
                              >
                                <Icon name="tasks" />
                                {message.action.label}
                              </button>
                            )
                          ) : message.action.task ? (
                            <span className="duco-request-sent">
                              <Icon name="check" /> Pendiente creado
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openTaskForm(message)}
                            >
                              <Icon name="tasks" />
                              {message.action.label}
                            </button>
                          )}
                        </div>
                      )}
                      {message.status === 'failed' && (
                        <div className="duco-message__failure" role="alert">
                          <span>No se pudo enviar.</span>
                          <button
                            type="button"
                            onClick={() => retryMessage(message)}
                            disabled={sending}
                          >
                            <Icon name="refresh" />
                            Reintentar
                          </button>
                          <button
                            type="button"
                            onClick={() => dismissFailedMessage(message.id)}
                            disabled={sending}
                          >
                            Descartar
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))
              )}

              {sending && (
                <div className="duco-typing" role="status">
                  <AssistantAvatar />
                  <span className="duco-typing__bubble">
                    <span />
                    <span />
                    <span />
                  </span>
                  <span className="duco-sr-only">DUCO está escribiendo…</span>
                </div>
              )}
            </div>

            <form className="duco-composer" onSubmit={submitMessage}>
              <label className="duco-sr-only" htmlFor="duco-message-input">
                Escribe un mensaje para DUCO
              </label>
              <div className="duco-composer__field">
                <textarea
                  id="duco-message-input"
                  ref={composerRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Pregunta por tus tareas o cuéntame qué gestión necesitas…"
                  maxLength={2_000}
                  rows={1}
                  disabled={historyLoading || clearing}
                />
                <button
                  type="submit"
                  disabled={
                    !draft.trim() || sending || historyLoading || clearing
                  }
                  aria-label="Enviar mensaje"
                >
                  <Icon name="send" />
                </button>
              </div>
              <div className="duco-composer__hint">
                <span>
                  <Icon name="privacy" />
                  Ninguna solicitud se envía sin tu confirmación
                </span>
                <span>{draft.length}/2000</span>
              </div>
            </form>
          </>
        )}

        {activePanel === 'requests' && (
          <div
            id="duco-requests-panel"
            className="duco-requests-panel"
            role="tabpanel"
            aria-labelledby="duco-requests-tab"
          >
            <header className="duco-requests-panel__intro">
              <div>
                <span>Seguimiento institucional</span>
                <h3>Mis solicitudes</h3>
                <p>
                  Aquí puedes revisar qué solicitudes siguen activas y cuáles ya
                  fueron atendidas.
                </p>
              </div>
              <span className="duco-requests-panel__total">
                {supportRequests.length}{' '}
                {supportRequests.length === 1 ? 'solicitud' : 'solicitudes'}
              </span>
            </header>

            {requestsLoading && !requestsLoaded ? (
              <div className="duco-requests-state" role="status">
                <span className="duco-loading-history__mark">
                  <Icon name="inbox" />
                </span>
                <p>Cargando tus solicitudes…</p>
              </div>
            ) : requestsError && supportRequests.length === 0 ? (
              <div className="duco-requests-state" role="alert">
                <span>
                  <Icon name="refresh" />
                </span>
                <h4>No pudimos cargar tus solicitudes</h4>
                <p>{requestsError}</p>
                <button
                  type="button"
                  onClick={() => void loadSupportRequests()}
                >
                  Intentar nuevamente
                </button>
              </div>
            ) : supportRequests.length === 0 ? (
              <div className="duco-requests-state duco-requests-state--empty">
                <span>
                  <Icon name="inbox" />
                </span>
                <h4>Aún no tienes solicitudes</h4>
                <p>
                  Cuando confirmes un formulario preparado por DUCO aparecerá
                  aquí para que puedas seguir su estado.
                </p>
                <button
                  type="button"
                  onClick={() => setActivePanel('conversation')}
                >
                  Volver a la conversación
                </button>
              </div>
            ) : (
              <div className="duco-request-groups">
                {requestsError && (
                  <p className="duco-requests-inline-error" role="alert">
                    {requestsError}
                  </p>
                )}

                <section aria-labelledby="duco-active-requests-title">
                  <header className="duco-request-group__title">
                    <div>
                      <span className="duco-request-group__dot" />
                      <h4 id="duco-active-requests-title">Activas</h4>
                    </div>
                    <span>{activeRequests.length}</span>
                  </header>
                  {activeRequests.length > 0 ? (
                    <div className="duco-request-cards">
                      {activeRequests.map((request) => (
                        <SupportRequestCard
                          key={request.id}
                          request={request}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="duco-request-group__empty">
                      No tienes solicitudes pendientes o en revisión.
                    </p>
                  )}
                </section>

                <section aria-labelledby="duco-finished-requests-title">
                  <header className="duco-request-group__title duco-request-group__title--finished">
                    <div>
                      <Icon name="check" />
                      <h4 id="duco-finished-requests-title">Finalizadas</h4>
                    </div>
                    <span>{finishedRequests.length}</span>
                  </header>
                  {finishedRequests.length > 0 ? (
                    <div className="duco-request-cards">
                      {finishedRequests.map((request) => (
                        <SupportRequestCard
                          key={request.id}
                          request={request}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="duco-request-group__empty">
                      Las solicitudes resueltas o rechazadas aparecerán aquí.
                    </p>
                  )}
                </section>
              </div>
            )}
          </div>
        )}

        <p className="duco-sr-only" aria-live="assertive" aria-atomic="true">
          {announcement}
        </p>
      </div>

      {requestForm && (
        <div className="duco-request-modal" role="presentation">
          <div
            className="duco-request-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="duco-request-title"
          >
            <header>
              <span className="duco-request-dialog__mark">
                <Icon name="tasks" />
              </span>
              <div>
                <p>Borrador preparado por DUCO</p>
                <h3 id="duco-request-title">Gestionar solicitud</h3>
              </div>
            </header>

            <p className="duco-request-dialog__intro">
              Revisa y modifica los datos. La solicitud solo se enviará cuando
              confirmes este formulario.
            </p>

            <form onSubmit={submitSupportRequest}>
              <div className="duco-request-form__row">
                <label>
                  Tipo de solicitud
                  <select
                    value={requestForm.draft.category}
                    onChange={(event) =>
                      updateRequestDraft(
                        'category',
                        event.target.value as DucoRequestCategory,
                      )
                    }
                    disabled={requestSubmitting}
                  >
                    {(
                      Object.entries(requestCategoryLabels) as Array<
                        [DucoRequestCategory, string]
                      >
                    ).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Urgencia
                  <select
                    value={requestForm.draft.urgency}
                    onChange={(event) =>
                      updateRequestDraft(
                        'urgency',
                        event.target.value as DucoRequestDraft['urgency'],
                      )
                    }
                    disabled={requestSubmitting}
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </label>
              </div>

              <label>
                Asunto
                <input
                  value={requestForm.draft.subject}
                  onChange={(event) =>
                    updateRequestDraft('subject', event.target.value)
                  }
                  minLength={3}
                  maxLength={160}
                  required
                  disabled={requestSubmitting}
                />
              </label>

              <label>
                Descripción de la situación
                <textarea
                  value={requestForm.draft.description}
                  onChange={(event) =>
                    updateRequestDraft('description', event.target.value)
                  }
                  minLength={10}
                  maxLength={2_000}
                  rows={5}
                  required
                  disabled={requestSubmitting}
                />
                <small>{requestForm.draft.description.length}/2000</small>
              </label>

              <label>
                ¿Qué resultado esperas? <span>(opcional)</span>
                <textarea
                  value={requestForm.draft.desiredOutcome}
                  onChange={(event) =>
                    updateRequestDraft('desiredOutcome', event.target.value)
                  }
                  maxLength={1_000}
                  rows={3}
                  disabled={requestSubmitting}
                />
              </label>

              {requestError && (
                <p className="duco-request-form__error" role="alert">
                  {requestError}
                </p>
              )}

              <footer>
                <button
                  type="button"
                  className="duco-request-form__cancel"
                  onClick={() => setRequestForm(null)}
                  disabled={requestSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="duco-request-form__submit"
                  disabled={requestSubmitting}
                >
                  <Icon name="send" />
                  {requestSubmitting ? 'Enviando…' : 'Confirmar y enviar'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {taskForm && (
        <div className="duco-request-modal" role="presentation">
          <div
            className="duco-request-dialog duco-task-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="duco-task-title"
          >
            <header>
              <span className="duco-request-dialog__mark">
                <Icon name="tasks" />
              </span>
              <div>
                <p>Borrador preparado por DUCO</p>
                <h3 id="duco-task-title">Crear pendiente</h3>
              </div>
            </header>

            <p className="duco-request-dialog__intro">
              Revisa los datos antes de añadir este pendiente a “Próximas
              tareas”. DUCO no realizará la entrega por ti.
            </p>

            <form onSubmit={submitTask}>
              <label>
                Título
                <input
                  value={taskForm.draft.title}
                  onChange={(event) =>
                    updateTaskDraft('title', event.target.value)
                  }
                  minLength={2}
                  maxLength={160}
                  required
                  autoFocus
                  disabled={taskSubmitting}
                />
              </label>

              <div className="duco-request-form__row duco-task-form__row">
                <label>
                  Asignatura <span>(opcional)</span>
                  <input
                    value={taskForm.draft.courseName ?? ''}
                    onChange={(event) =>
                      updateTaskDraft('courseName', event.target.value || null)
                    }
                    maxLength={300}
                    placeholder="Ej. Fundamentos de Matemáticas"
                    disabled={taskSubmitting}
                  />
                </label>
                <label>
                  Prioridad
                  <select
                    value={taskForm.draft.priority}
                    onChange={(event) =>
                      updateTaskDraft(
                        'priority',
                        event.target.value as DucoTaskDraft['priority'],
                      )
                    }
                    disabled={taskSubmitting}
                  >
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                  </select>
                </label>
              </div>

              <label>
                Fecha de entrega <span>(opcional)</span>
                <input
                  type="datetime-local"
                  value={taskForm.draft.dueAt ?? ''}
                  onChange={(event) =>
                    updateTaskDraft('dueAt', event.target.value || null)
                  }
                  disabled={taskSubmitting}
                />
              </label>

              <label>
                Descripción <span>(opcional)</span>
                <textarea
                  value={taskForm.draft.description}
                  onChange={(event) =>
                    updateTaskDraft('description', event.target.value)
                  }
                  maxLength={1_000}
                  rows={4}
                  disabled={taskSubmitting}
                />
                <small>{taskForm.draft.description.length}/1000</small>
              </label>

              {taskError && (
                <p className="duco-request-form__error" role="alert">
                  {taskError}
                </p>
              )}

              <footer>
                <button
                  type="button"
                  className="duco-request-form__cancel"
                  onClick={() => setTaskForm(null)}
                  disabled={taskSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="duco-request-form__submit"
                  disabled={
                    taskSubmitting || taskForm.draft.title.trim().length < 2
                  }
                >
                  <Icon name="check" />
                  {taskSubmitting ? 'Creando…' : 'Confirmar y crear'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
