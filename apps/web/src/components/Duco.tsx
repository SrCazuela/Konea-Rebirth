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
  getDucoMessages,
  sendDucoMessage,
  type DucoMessage,
} from '../api/duco'
import './Duco.css'

export type DucoProps = {
  currentUser: Pick<KoneaUser, 'displayName' | 'avatarUrl'>
}

type MessageStatus = 'sent' | 'pending' | 'failed'
type VisibleMessage = DucoMessage & { status: MessageStatus }
type IconName =
  | 'assistant'
  | 'arrow'
  | 'clock'
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
    label: 'Conocer a DUCO',
    prompt: 'Hola, ¿qué puedes hacer por mí?',
  },
]

const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
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
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
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

export function Duco({ currentUser }: DucoProps) {
  const [messages, setMessages] = useState<VisibleMessage[]>([])
  const [draft, setDraft] = useState('')
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [openTaskCount, setOpenTaskCount] = useState<number | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const viewportRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

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

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || historyLoading) return
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [historyLoading, messages, sending])

  const sendPrompt = async (rawContent: string) => {
    const content = rawContent.trim()
    if (!content || sending || content.length > 2_000) return

    const temporaryId = `pending-${crypto.randomUUID()}`
    const optimisticMessage: VisibleMessage = {
      id: temporaryId,
      role: 'user',
      content,
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
              Modo local
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
              Esta versión trabaja con tus datos guardados en Konea local. No
              usa IA ni servicios externos.
            </p>
          </div>
        </div>

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
          DUCO puede consultar las tareas que te asignaron en Konea, pero no
          modifica nada sin tu intervención.
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
          <div className="duco-chat__header-actions">
            {openTaskCount !== null && (
              <span className="duco-task-count">
                {openTaskCount}{' '}
                {openTaskCount === 1 ? 'pendiente' : 'pendientes'}
              </span>
            )}
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
          </div>
        </header>

        <div
          className="duco-messages"
          ref={viewportRef}
          role="log"
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
                Puedo revisar tus pendientes y ayudarte a decidir qué hacer
                primero. Toda esta conversación permanece en tu entorno local.
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
              placeholder="Pregunta por tus tareas o pide un plan…"
              maxLength={2_000}
              rows={1}
              disabled={historyLoading || clearing}
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending || historyLoading || clearing}
              aria-label="Enviar mensaje"
            >
              <Icon name="send" />
            </button>
          </div>
          <div className="duco-composer__hint">
            <span>
              <Icon name="privacy" />
              Conversación local y privada
            </span>
            <span>{draft.length}/2000</span>
          </div>
        </form>

        <p className="duco-sr-only" aria-live="assertive" aria-atomic="true">
          {announcement}
        </p>
      </div>
    </section>
  )
}
