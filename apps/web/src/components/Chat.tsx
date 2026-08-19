import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import QRCode from 'qrcode'
import type { KoneaUser } from '../api/auth'
import {
  addChatParticipant,
  createChatPoll,
  createChatTask,
  createDirectChat,
  createGroupChat,
  createPersonalQrCode,
  deleteChatTask,
  deleteMessage,
  getChat,
  getChatTasks,
  getCurrentQrCode,
  getMessages,
  invalidateCurrentQrCode,
  listChats,
  markChatRead,
  messageTags,
  redeemQrCode,
  removeChatParticipant,
  removePollVote,
  sendMessage,
  updateChat,
  updateChatParticipant,
  updateChatTask,
  updateMessage,
  uploadChatFile,
  votePoll,
  type ChatDetail,
  type ChatMessage,
  type ChatParticipantRole,
  type ChatPerson,
  type ChatPoll,
  type ChatSummary,
  type ChatTask,
  type MessageTag,
  type PersonalQrCode,
  type TaskPriority,
  type TaskStatus,
} from '../api/chat'
import { searchUsers, type PublicUser } from '../api/network'
import { createReport } from '../api/reports'
import './Chat.css'
import { QrScanner } from './QrScanner'

export type ChatProps = {
  currentUser: KoneaUser
  initialChatId?: string | null
  initialUserId?: string | null
  onUnreadChange?: (count: number) => void
  onOpenUser?: (userId: string) => void
}

type ChatIconName =
  | 'arrow-left'
  | 'attachment'
  | 'check'
  | 'chevron-down'
  | 'close'
  | 'copy'
  | 'download'
  | 'edit'
  | 'file'
  | 'flag'
  | 'info'
  | 'message'
  | 'more'
  | 'people'
  | 'plus'
  | 'poll'
  | 'qr'
  | 'search'
  | 'send'
  | 'tasks'
  | 'trash'

type UtilityPanel = 'info' | 'tasks' | 'qr'
type NewChatMode = 'direct' | 'group'

type TaskDraft = {
  title: string
  description: string
  assignedToId: string
  dueDate: string
  priority: TaskPriority
}

const emptyTaskDraft: TaskDraft = {
  title: '',
  description: '',
  assignedToId: '',
  dueDate: '',
  priority: 'medium',
}

const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
})

const dayFormatter = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date)
}

function formatDay(value: string) {
  const localDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = localDate
    ? new Date(
        Number(localDate[1]),
        Number(localDate[2]) - 1,
        Number(localDate[3]),
      )
    : new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha desconocida'
    : dayFormatter.format(date)
}

function formatBytes(bytes: number | null) {
  if (!bytes || bytes < 1) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function ChatIcon({ name }: { name: ChatIconName }) {
  const paths: Record<ChatIconName, ReactNode> = {
    'arrow-left': <path d="m15 18-6-6 6-6" />,
    attachment: (
      <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4 4 0 0 1 5.7 5.7l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.9-8.9" />
    ),
    check: <path d="m5 12 4 4L19 6" />,
    'chevron-down': <path d="m6 9 6 6 6-6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-4-4 4 4 4-4" />
        <path d="M5 21h14" />
      </>
    ),
    edit: (
      <>
        <path d="m14 5 5 5M16.5 2.5a2.1 2.1 0 0 1 3 3L7 18l-4 1 1-4 12.5-12.5Z" />
      </>
    ),
    file: (
      <>
        <path d="M6 2h8l4 4v16H6Z" />
        <path d="M14 2v5h5" />
      </>
    ),
    flag: (
      <>
        <path d="M5 21V4" />
        <path d="M5 5h10l-1.5 3L15 11H5" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    message: (
      <>
        <path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 10 10 0 0 1-4-.9L3 21l1.8-4.7A8.5 8.5 0 1 1 21 11.5Z" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
    people: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    poll: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    qr: (
      <>
        <rect x="3" y="3" width="6" height="6" />
        <rect x="15" y="3" width="6" height="6" />
        <rect x="3" y="15" width="6" height="6" />
        <path d="M15 15h2v2h-2zM19 15h2v6h-2M15 19h2v2h-2" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    send: <path d="m22 2-7 20-4-9-9-4 20-7Zm-11 11L22 2" />,
    tasks: (
      <>
        <path d="M9 11 11 13 15 9M5 4h14v17H5z" />
        <path d="M9 4V2h6v2" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="chat-icon"
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

function ChatAvatar({
  name,
  url,
  size = 'medium',
}: {
  name: string
  url: string | null
  size?: 'small' | 'medium' | 'large'
}) {
  const className = `chat-avatar chat-avatar--${size}`
  return url ? (
    <img className={className} src={url} alt="" />
  ) : (
    <span className={className} aria-hidden="true">
      {initials(name) || 'K'}
    </span>
  )
}

function getChatIdentity(
  chat: Pick<ChatSummary, 'type' | 'name' | 'avatarUrl' | 'participants'>,
  currentUserId: string,
) {
  if (chat.type === 'group') {
    return {
      name: chat.name || 'Grupo sin nombre',
      avatarUrl: chat.avatarUrl,
      subtitle: `${chat.participants.length} participantes`,
    }
  }
  const person = chat.participants.find(
    (participant) => participant.id !== currentUserId,
  )
  return {
    name: person?.displayName || 'Conversación directa',
    avatarUrl: person?.avatarUrl ?? null,
    subtitle: person ? `@${person.username}` : 'Chat privado',
  }
}

function messagePreview(chat: ChatSummary) {
  const message = chat.lastMessage
  if (!message) return 'Inicia la conversación'
  if (message.type === 'image') return 'Imagen'
  if (message.type === 'file') return 'Archivo adjunto'
  if (message.type === 'poll') return `Encuesta: ${message.content}`
  return message.content || 'Mensaje'
}

function roleLabel(role: ChatParticipantRole) {
  return {
    owner: 'Propietario/a',
    admin: 'Administrador/a',
    member: 'Miembro',
  }[role]
}

function tagLabel(tag: MessageTag) {
  return {
    important: 'Importante',
    question: 'Pregunta',
    link: 'Enlace',
    delivery: 'Entrega',
    resources: 'Recursos',
    poll: 'Encuesta',
  }[tag]
}

function priorityLabel(priority: TaskPriority) {
  return { low: 'Baja', medium: 'Media', high: 'Alta' }[priority]
}

function isRecentlyOnline(lastSeenAt?: string) {
  if (!lastSeenAt) return false
  const value = new Date(lastSeenAt).getTime()
  return Number.isFinite(value) && Date.now() - value < 2 * 60 * 1000
}

function Dialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div
      className="chat-dialog-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        aria-modal="true"
        className="chat-dialog"
        role="dialog"
        aria-labelledby="chat-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="chat-dialog__header">
          <div>
            <h2 id="chat-dialog-title">{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <ChatIcon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

function PollCard({
  poll,
  busy,
  onVote,
  onRemoveVote,
}: {
  poll: ChatPoll
  busy: boolean
  onVote: (poll: ChatPoll, optionIds: string[]) => void
  onRemoveVote: (poll: ChatPoll) => void
}) {
  const votedIds = poll.options
    .filter((option) => option.votedByMe)
    .map((option) => option.id)
  const [selection, setSelection] = useState<string[]>(votedIds)

  useEffect(() => {
    setSelection(
      poll.options
        .filter((option) => option.votedByMe)
        .map((option) => option.id),
    )
  }, [poll.id, poll.options])

  const toggle = (optionId: string) => {
    setSelection((current) => {
      if (!poll.allowMultiple) return [optionId]
      return current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId]
    })
  }

  const hasVote = votedIds.length > 0

  return (
    <section className="chat-poll" aria-label={`Encuesta: ${poll.question}`}>
      <span className="chat-poll__eyebrow">
        <ChatIcon name="poll" /> Encuesta
      </span>
      <h4>{poll.question}</h4>
      <p>
        {poll.allowMultiple
          ? 'Puedes elegir varias opciones'
          : 'Elige una opción'}
      </p>
      <div className="chat-poll__options">
        {poll.options.map((option) => {
          const percentage = poll.voteCount
            ? Math.round((option.voteCount / poll.voteCount) * 100)
            : 0
          return (
            <label key={option.id} className="chat-poll-option">
              <span
                className="chat-poll-option__fill"
                style={{ width: `${percentage}%` }}
              />
              <input
                type={poll.allowMultiple ? 'checkbox' : 'radio'}
                name={`poll-${poll.id}`}
                checked={selection.includes(option.id)}
                onChange={() => toggle(option.id)}
                disabled={busy}
              />
              <span className="chat-poll-option__label">{option.label}</span>
              <span className="chat-poll-option__count">
                {option.voteCount} · {percentage}%
              </span>
            </label>
          )
        })}
      </div>
      <div className="chat-poll__footer">
        <span>{poll.voteCount} votos</span>
        <div>
          {hasVote && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemoveVote(poll)}
            >
              Quitar voto
            </button>
          )}
          <button
            className="chat-button chat-button--primary chat-button--small"
            type="button"
            disabled={busy || selection.length === 0}
            onClick={() => onVote(poll, selection)}
          >
            {busy ? 'Guardando…' : 'Votar'}
          </button>
        </div>
      </div>
    </section>
  )
}

export function Chat({
  currentUser,
  initialChatId = null,
  initialUserId = null,
  onUnreadChange,
  onOpenUser,
}: ChatProps) {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialChatId,
  )
  const [detail, setDetail] = useState<ChatDetail | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [tasks, setTasks] = useState<ChatTask[]>([])
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [nextBeforeId, setNextBeforeId] = useState<string | null>(null)
  const [loadedOlder, setLoadedOlder] = useState(false)
  const [listQuery, setListQuery] = useState('')
  const [messageSearchInput, setMessageSearchInput] = useState('')
  const [messageQuery, setMessageQuery] = useState('')
  const [activeTag, setActiveTag] = useState<MessageTag | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [conversationLoading, setConversationLoading] = useState(
    Boolean(initialChatId),
  )
  const [olderLoading, setOlderLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [utilityPanel, setUtilityPanel] = useState<UtilityPanel | null>(null)
  const [composer, setComposer] = useState('')
  const [composerTags, setComposerTags] = useState<MessageTag[]>([])
  const [sending, setSending] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingMessageText, setEditingMessageText] = useState('')
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null)
  const [busyPollId, setBusyPollId] = useState<string | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatMode, setNewChatMode] = useState<NewChatMode>('direct')
  const [newChatQuery, setNewChatQuery] = useState('')
  const [newChatPeople, setNewChatPeople] = useState<PublicUser[]>([])
  const [newChatLoading, setNewChatLoading] = useState(false)
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<string[]>([])
  const [groupName, setGroupName] = useState('')
  const [creatingChat, setCreatingChat] = useState(false)
  const [showPollDialog, setShowPollDialog] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollAllowsMultiple, setPollAllowsMultiple] = useState(false)
  const [creatingPoll, setCreatingPoll] = useState(false)
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(emptyTaskDraft)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [infoQuery, setInfoQuery] = useState('')
  const [infoPeople, setInfoPeople] = useState<PublicUser[]>([])
  const [participantBusyId, setParticipantBusyId] = useState<string | null>(
    null,
  )
  const [qrCode, setQrCode] = useState<PersonalQrCode | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrBusy, setQrBusy] = useState(false)
  const [qrSeconds, setQrSeconds] = useState(0)
  const [redeemCode, setRedeemCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [qrImageUrl, setQrImageUrl] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<{
    type: 'chat' | 'message'
    id: string
    label: string
  } | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [reportDetails, setReportDetails] = useState('')
  const [reportBusy, setReportBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
  const handledInitialUserRef = useRef<string | null>(null)
  const loadedOlderRef = useRef(false)
  const selectedChatIdRef = useRef<string | null>(selectedChatId)
  const selectionGenerationRef = useRef(0)
  const latestMessageRequestRef = useRef(0)

  useLayoutEffect(() => {
    selectedChatIdRef.current = selectedChatId
    selectionGenerationRef.current += 1
    latestMessageRequestRef.current += 1
  }, [selectedChatId])

  const selectedSummary = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  const totalUnread = useMemo(
    () => chats.reduce((total, chat) => total + chat.unreadCount, 0),
    [chats],
  )

  useEffect(() => {
    onUnreadChange?.(totalUnread)
  }, [onUnreadChange, totalUnread])

  const filteredChats = useMemo(() => {
    const query = listQuery.trim().toLocaleLowerCase('es')
    if (!query) return chats
    return chats.filter((chat) => {
      const identity = getChatIdentity(chat, currentUser.id)
      return [identity.name, identity.subtitle, messagePreview(chat)].some(
        (value) => value.toLocaleLowerCase('es').includes(query),
      )
    })
  }, [chats, currentUser.id, listQuery])

  const isManager = detail?.myRole === 'owner' || detail?.myRole === 'admin'

  const refreshChats = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true)
    try {
      setChats(await listChats())
      if (!silent) setError('')
    } catch (loadError) {
      if (!silent) {
        setError(
          readableError(loadError, 'No pudimos cargar tus conversaciones.'),
        )
      }
    } finally {
      setListLoading(false)
    }
  }, [])

  const refreshDetail = useCallback(async (chatId: string) => {
    const chat = await getChat(chatId)
    setDetail(chat)
    setGroupNameDraft(chat.name ?? '')
    return chat
  }, [])

  const refreshTasks = useCallback(async (chatId: string) => {
    setTasks(await getChatTasks(chatId))
  }, [])

  const refreshLatestMessages = useCallback(
    async (silent = false) => {
      if (!selectedChatId) return
      const chatId = selectedChatId
      const requestId = ++latestMessageRequestRef.current
      if (!silent) setConversationLoading(true)
      try {
        const page = await getMessages(chatId, {
          limit: 30,
          query: messageQuery || undefined,
          tag: activeTag ?? undefined,
        })
        if (
          selectedChatIdRef.current !== chatId ||
          latestMessageRequestRef.current !== requestId
        ) {
          return
        }
        setMessages((current) => {
          if (!silent || !loadedOlderRef.current || messageQuery || activeTag) {
            return page.messages
          }

          if (!page.pageInfo.hasMore || page.messages.length === 0) {
            return page.messages
          }

          const oldestLatest = page.messages[0]!
          const oldestTime = new Date(oldestLatest.createdAt).getTime()
          const historical = current.filter((message) => {
            const messageTime = new Date(message.createdAt).getTime()
            return (
              messageTime < oldestTime ||
              (messageTime === oldestTime && message.id < oldestLatest.id)
            )
          })
          return [...historical, ...page.messages]
        })
        if (!loadedOlderRef.current || !silent) {
          setHasMoreMessages(page.pageInfo.hasMore)
          setNextBefore(page.pageInfo.nextBefore)
          setNextBeforeId(page.pageInfo.nextBeforeId)
        }
        await markChatRead(chatId)
        if (selectedChatIdRef.current !== chatId) return
        setChats((current) =>
          current.map((chat) =>
            chat.id === chatId ? { ...chat, unreadCount: 0 } : chat,
          ),
        )
      } catch (loadError) {
        if (!silent && selectedChatIdRef.current === chatId) {
          setError(readableError(loadError, 'No pudimos cargar los mensajes.'))
        }
      } finally {
        if (
          selectedChatIdRef.current === chatId &&
          latestMessageRequestRef.current === requestId
        ) {
          setConversationLoading(false)
        }
      }
    },
    [activeTag, messageQuery, selectedChatId],
  )

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshChats(false), 0)
    const interval = window.setInterval(() => void refreshChats(true), 8_000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
    }
  }, [refreshChats])

  useEffect(() => {
    if (!initialChatId) return
    const timeout = window.setTimeout(() => {
      loadedOlderRef.current = false
      setLoadedOlder(false)
      setOlderLoading(false)
      setNextBefore(null)
      setNextBeforeId(null)
      setDetail(null)
      setMessages([])
      setTasks([])
      setComposer('')
      setComposerTags([])
      setTaskDraft(emptyTaskDraft)
      setEditingTaskId(null)
      setTaskFormOpen(false)
      setConversationLoading(true)
      setSelectedChatId(initialChatId)
      setUtilityPanel(null)
      setMessageSearchInput('')
      setMessageQuery('')
      setActiveTag(null)
      setEditingMessageId(null)
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [initialChatId])

  useEffect(() => {
    if (
      !initialUserId ||
      initialUserId === currentUser.id ||
      handledInitialUserRef.current === initialUserId
    ) {
      return
    }
    handledInitialUserRef.current = initialUserId
    createDirectChat(initialUserId)
      .then(async (result) => {
        await refreshChats(true)
        loadedOlderRef.current = false
        setLoadedOlder(false)
        setOlderLoading(false)
        setNextBefore(null)
        setNextBeforeId(null)
        setDetail(null)
        setMessages([])
        setTasks([])
        setComposer('')
        setComposerTags([])
        setTaskDraft(emptyTaskDraft)
        setEditingTaskId(null)
        setTaskFormOpen(false)
        setConversationLoading(true)
        setSelectedChatId(result.chat.id)
      })
      .catch((createError: unknown) => {
        handledInitialUserRef.current = null
        setError(readableError(createError, 'No pudimos crear el chat.'))
      })
  }, [currentUser.id, initialUserId, refreshChats])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadedOlderRef.current = false
      setLoadedOlder(false)
      setMessageQuery(messageSearchInput.trim())
    }, 280)
    return () => window.clearTimeout(timeout)
  }, [messageSearchInput])

  useEffect(() => {
    if (!selectedChatId) return

    let cancelled = false
    Promise.all([
      getChat(selectedChatId),
      getChatTasks(selectedChatId),
      markChatRead(selectedChatId),
    ])
      .then(([chat, loadedTasks]) => {
        if (cancelled) return
        setDetail(chat)
        setTasks(loadedTasks)
        setGroupNameDraft(chat.name ?? '')
        setChats((current) =>
          current.map((item) =>
            item.id === selectedChatId ? { ...item, unreadCount: 0 } : item,
          ),
        )
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            readableError(loadError, 'No pudimos abrir esta conversación.'),
          )
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedChatId])

  useEffect(() => {
    const timeout = window.setTimeout(() => void refreshLatestMessages(true), 0)
    return () => window.clearTimeout(timeout)
  }, [refreshLatestMessages])

  useEffect(() => {
    if (!selectedChatId) return
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshLatestMessages(true)
      }
    }, 4_500)
    return () => window.clearInterval(interval)
  }, [refreshLatestMessages, selectedChatId])

  useEffect(() => {
    if (!selectedChatId || utilityPanel !== 'tasks') return
    const interval = window.setInterval(
      () => void refreshTasks(selectedChatId).catch(() => undefined),
      12_000,
    )
    return () => window.clearInterval(interval)
  }, [refreshTasks, selectedChatId, utilityPanel])

  useEffect(() => {
    if (!messages.length || loadedOlder) return
    messageEndRef.current?.scrollIntoView({ block: 'end' })
  }, [loadedOlder, messages.length, selectedChatId])

  useEffect(() => {
    if (!showNewChat) return
    let cancelled = false
    const timeout = window.setTimeout(
      () => {
        setNewChatLoading(true)
        searchUsers(newChatQuery)
          .then((people) => {
            if (!cancelled) {
              setNewChatPeople(people.filter((person) => !person.isMe))
            }
          })
          .catch((searchError: unknown) => {
            if (!cancelled) {
              setError(
                readableError(searchError, 'No pudimos buscar personas.'),
              )
            }
          })
          .finally(() => {
            if (!cancelled) setNewChatLoading(false)
          })
      },
      newChatQuery.trim() ? 280 : 0,
    )
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [newChatQuery, showNewChat])

  useEffect(() => {
    if (utilityPanel !== 'info' || detail?.type !== 'group' || !isManager) {
      return
    }
    let cancelled = false
    const timeout = window.setTimeout(() => {
      if (!infoQuery.trim()) {
        setInfoPeople([])
        return
      }
      searchUsers(infoQuery)
        .then((people) => {
          if (cancelled) return
          const memberIds = new Set(
            detail.participants.map((participant) => participant.id),
          )
          setInfoPeople(
            people.filter(
              (person) => !person.isMe && !memberIds.has(person.id),
            ),
          )
        })
        .catch(() => {
          if (!cancelled) setInfoPeople([])
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [detail, infoQuery, isManager, utilityPanel])

  useEffect(() => {
    if (utilityPanel !== 'qr') return
    getCurrentQrCode()
      .then((result) => setQrCode(result.qrCode))
      .catch((loadError: unknown) =>
        setError(readableError(loadError, 'No pudimos consultar tu código.')),
      )
      .finally(() => setQrLoading(false))
  }, [utilityPanel])

  useEffect(() => {
    if (!qrCode) return
    const calculate = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(qrCode.expiresAt).getTime() - Date.now()) / 1000),
      )
      setQrSeconds(remaining)
      if (remaining === 0) setQrCode(null)
    }
    const timeout = window.setTimeout(calculate, 0)
    const interval = window.setInterval(calculate, 1_000)
    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [qrCode])

  useEffect(() => {
    let cancelled = false
    if (!qrCode) return
    QRCode.toDataURL(`KONEA:${qrCode.code}`, {
      width: 240,
      margin: 2,
      color: { dark: '#2d213e', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQrImageUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrImageUrl('')
      })
    return () => {
      cancelled = true
    }
  }, [qrCode])

  const selectChat = (chatId: string) => {
    loadedOlderRef.current = false
    setLoadedOlder(false)
    setOlderLoading(false)
    setNextBefore(null)
    setNextBeforeId(null)
    setDetail(null)
    setMessages([])
    setTasks([])
    setComposer('')
    setComposerTags([])
    setTaskDraft(emptyTaskDraft)
    setEditingTaskId(null)
    setTaskFormOpen(false)
    setConversationLoading(true)
    setSelectedChatId(chatId)
    setUtilityPanel(null)
    setMessageSearchInput('')
    setMessageQuery('')
    setActiveTag(null)
    setEditingMessageId(null)
    setNotice('')
    setError('')
  }

  const closeSelectedChat = () => {
    loadedOlderRef.current = false
    setLoadedOlder(false)
    setOlderLoading(false)
    setSelectedChatId(null)
    setDetail(null)
    setMessages([])
    setTasks([])
    setComposer('')
    setComposerTags([])
    setTaskDraft(emptyTaskDraft)
    setEditingTaskId(null)
    setTaskFormOpen(false)
    setHasMoreMessages(false)
    setNextBefore(null)
    setNextBeforeId(null)
    setUtilityPanel(null)
  }

  const loadOlderMessages = async () => {
    if (!selectedChatId || !nextBefore || olderLoading) return
    const chatId = selectedChatId
    const generation = selectionGenerationRef.current
    const cursor = nextBefore
    const cursorId = nextBeforeId
    setOlderLoading(true)
    try {
      const page = await getMessages(chatId, {
        limit: 30,
        before: cursor,
        beforeId: cursorId ?? undefined,
        query: messageQuery || undefined,
        tag: activeTag ?? undefined,
      })
      if (
        selectedChatIdRef.current !== chatId ||
        selectionGenerationRef.current !== generation
      ) {
        return
      }
      setMessages((current) => {
        const currentIds = new Set(current.map((message) => message.id))
        return [
          ...page.messages.filter((message) => !currentIds.has(message.id)),
          ...current,
        ]
      })
      setHasMoreMessages(page.pageInfo.hasMore)
      setNextBefore(page.pageInfo.nextBefore)
      setNextBeforeId(page.pageInfo.nextBeforeId)
      loadedOlderRef.current = true
      setLoadedOlder(true)
    } catch (loadError) {
      setError(
        readableError(loadError, 'No pudimos cargar mensajes anteriores.'),
      )
    } finally {
      if (selectedChatIdRef.current === chatId) setOlderLoading(false)
    }
  }

  const resetNewChat = () => {
    setShowNewChat(false)
    setNewChatMode('direct')
    setNewChatQuery('')
    setNewChatPeople([])
    setSelectedPeopleIds([])
    setGroupName('')
  }

  const handleCreateDirect = async (userId: string) => {
    setCreatingChat(true)
    setError('')
    try {
      const result = await createDirectChat(userId)
      resetNewChat()
      await refreshChats(true)
      selectChat(result.chat.id)
    } catch (createError) {
      setError(readableError(createError, 'No pudimos crear el chat.'))
    } finally {
      setCreatingChat(false)
    }
  }

  const handleCreateGroup = async (event: FormEvent) => {
    event.preventDefault()
    if (!groupName.trim()) return
    setCreatingChat(true)
    setError('')
    try {
      const result = await createGroupChat({
        name: groupName.trim(),
        participantIds: selectedPeopleIds,
      })
      resetNewChat()
      await refreshChats(true)
      selectChat(result.chat.id)
    } catch (createError) {
      setError(readableError(createError, 'No pudimos crear el grupo.'))
    } finally {
      setCreatingChat(false)
    }
  }

  const toggleComposerTag = (tag: MessageTag) => {
    setComposerTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    )
  }

  const sendText = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedChatId || !composer.trim() || sending) return
    setSending(true)
    setError('')
    try {
      await sendMessage(selectedChatId, {
        content: composer.trim(),
        type: 'text',
        tags: composerTags,
      })
      setComposer('')
      setComposerTags([])
      loadedOlderRef.current = false
      setLoadedOlder(false)
      await Promise.all([refreshLatestMessages(), refreshChats(true)])
    } catch (sendError) {
      setError(readableError(sendError, 'No pudimos enviar el mensaje.'))
    } finally {
      setSending(false)
    }
  }

  const sendFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedChatId || sending) return
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo supera el límite de 5 MB.')
      return
    }
    const accepted =
      file.type === 'application/pdf' || file.type.startsWith('image/')
    if (!accepted) {
      setError('Solo puedes adjuntar imágenes o documentos PDF.')
      return
    }
    setSending(true)
    setNotice(`Subiendo ${file.name}…`)
    setError('')
    try {
      const uploaded = await uploadChatFile(file)
      await sendMessage(selectedChatId, {
        content: composer.trim(),
        type: uploaded.mimeType.startsWith('image/') ? 'image' : 'file',
        fileUrl: uploaded.url,
        fileName: uploaded.originalName,
        fileSize: uploaded.size,
        tags: composerTags,
      })
      setComposer('')
      setComposerTags([])
      setNotice('Archivo enviado.')
      loadedOlderRef.current = false
      setLoadedOlder(false)
      await Promise.all([refreshLatestMessages(), refreshChats(true)])
    } catch (uploadError) {
      setNotice('')
      setError(readableError(uploadError, 'No pudimos adjuntar el archivo.'))
    } finally {
      setSending(false)
    }
  }

  const saveMessageEdit = async (message: ChatMessage) => {
    if (!selectedChatId || !editingMessageText.trim()) return
    setBusyMessageId(message.id)
    try {
      await updateMessage(selectedChatId, message.id, {
        content: editingMessageText.trim(),
      })
      setEditingMessageId(null)
      await refreshLatestMessages()
    } catch (editError) {
      setError(readableError(editError, 'No pudimos editar el mensaje.'))
    } finally {
      setBusyMessageId(null)
    }
  }

  const removeMessage = async (message: ChatMessage) => {
    if (
      !selectedChatId ||
      !window.confirm('¿Eliminar este mensaje de la conversación?')
    ) {
      return
    }
    setBusyMessageId(message.id)
    try {
      await deleteMessage(selectedChatId, message.id)
      setMessages((current) => current.filter((item) => item.id !== message.id))
      await refreshChats(true)
    } catch (deleteError) {
      setError(readableError(deleteError, 'No pudimos eliminar el mensaje.'))
    } finally {
      setBusyMessageId(null)
    }
  }

  const patchPoll = (updated: ChatPoll) => {
    setMessages((current) =>
      current.map((message) =>
        message.poll?.id === updated.id
          ? { ...message, poll: updated }
          : message,
      ),
    )
  }

  const submitVote = async (poll: ChatPoll, optionIds: string[]) => {
    setBusyPollId(poll.id)
    try {
      patchPoll(await votePoll(poll.id, optionIds))
    } catch (voteError) {
      setError(readableError(voteError, 'No pudimos guardar tu voto.'))
    } finally {
      setBusyPollId(null)
    }
  }

  const clearVote = async (poll: ChatPoll) => {
    setBusyPollId(poll.id)
    try {
      patchPoll(await removePollVote(poll.id))
    } catch (voteError) {
      setError(readableError(voteError, 'No pudimos quitar tu voto.'))
    } finally {
      setBusyPollId(null)
    }
  }

  const submitPoll = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedChatId) return
    const options = pollOptions.map((option) => option.trim()).filter(Boolean)
    if (!pollQuestion.trim() || options.length < 2) return
    setCreatingPoll(true)
    try {
      await createChatPoll(selectedChatId, {
        question: pollQuestion.trim(),
        options,
        allowMultiple: pollAllowsMultiple,
      })
      setShowPollDialog(false)
      setPollQuestion('')
      setPollOptions(['', ''])
      setPollAllowsMultiple(false)
      await Promise.all([refreshLatestMessages(), refreshChats(true)])
    } catch (pollError) {
      setError(readableError(pollError, 'No pudimos crear la encuesta.'))
    } finally {
      setCreatingPoll(false)
    }
  }

  const resetTaskForm = () => {
    setTaskDraft(emptyTaskDraft)
    setEditingTaskId(null)
    setTaskFormOpen(false)
  }

  const startTaskEdit = (task: ChatTask) => {
    setEditingTaskId(task.id)
    setTaskDraft({
      title: task.title,
      description: task.description ?? '',
      assignedToId: task.assignedToId,
      dueDate: task.dueDate ?? '',
      priority: task.priority,
    })
    setTaskFormOpen(true)
  }

  const submitTask = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedChatId || !taskDraft.title.trim()) return
    setTaskBusyId(editingTaskId ?? 'new')
    try {
      const input = {
        title: taskDraft.title.trim(),
        description: taskDraft.description.trim() || null,
        assignedToId: taskDraft.assignedToId || currentUser.id,
        dueDate: taskDraft.dueDate || null,
        priority: taskDraft.priority,
      }
      if (editingTaskId) {
        await updateChatTask(selectedChatId, editingTaskId, input)
      } else {
        await createChatTask(selectedChatId, input)
      }
      resetTaskForm()
      await refreshTasks(selectedChatId)
    } catch (taskError) {
      setError(readableError(taskError, 'No pudimos guardar la tarea.'))
    } finally {
      setTaskBusyId(null)
    }
  }

  const changeTaskStatus = async (task: ChatTask, status: TaskStatus) => {
    if (!selectedChatId) return
    setTaskBusyId(task.id)
    try {
      await updateChatTask(selectedChatId, task.id, { status })
      await refreshTasks(selectedChatId)
    } catch (taskError) {
      setError(readableError(taskError, 'No pudimos actualizar la tarea.'))
    } finally {
      setTaskBusyId(null)
    }
  }

  const removeTask = async (task: ChatTask) => {
    if (
      !selectedChatId ||
      !window.confirm(`¿Eliminar la tarea “${task.title}”?`)
    ) {
      return
    }
    setTaskBusyId(task.id)
    try {
      await deleteChatTask(selectedChatId, task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
    } catch (taskError) {
      setError(readableError(taskError, 'No pudimos eliminar la tarea.'))
    } finally {
      setTaskBusyId(null)
    }
  }

  const saveGroupName = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedChatId || !groupNameDraft.trim()) return
    setParticipantBusyId('group')
    try {
      await updateChat(selectedChatId, { name: groupNameDraft.trim() })
      await Promise.all([refreshDetail(selectedChatId), refreshChats(true)])
      setNotice('Nombre del grupo actualizado.')
    } catch (updateError) {
      setError(readableError(updateError, 'No pudimos editar el grupo.'))
    } finally {
      setParticipantBusyId(null)
    }
  }

  const addParticipant = async (person: PublicUser) => {
    if (!selectedChatId) return
    setParticipantBusyId(person.id)
    try {
      const participants = await addChatParticipant(selectedChatId, person.id)
      setDetail((current) => (current ? { ...current, participants } : current))
      setInfoQuery('')
      setInfoPeople([])
      await refreshChats(true)
    } catch (addError) {
      setError(readableError(addError, 'No pudimos agregar a esta persona.'))
    } finally {
      setParticipantBusyId(null)
    }
  }

  const changeParticipantRole = async (
    participant: ChatPerson,
    role: Exclude<ChatParticipantRole, 'owner'>,
  ) => {
    if (!selectedChatId) return
    setParticipantBusyId(participant.id)
    try {
      const participants = await updateChatParticipant(
        selectedChatId,
        participant.id,
        role,
      )
      setDetail((current) => (current ? { ...current, participants } : current))
    } catch (roleError) {
      setError(readableError(roleError, 'No pudimos cambiar este rol.'))
    } finally {
      setParticipantBusyId(null)
    }
  }

  const removeParticipant = async (participant: ChatPerson) => {
    if (
      !selectedChatId ||
      !window.confirm(`¿Quitar a ${participant.displayName} del grupo?`)
    ) {
      return
    }
    setParticipantBusyId(participant.id)
    try {
      await removeChatParticipant(selectedChatId, participant.id)
      await Promise.all([refreshDetail(selectedChatId), refreshChats(true)])
    } catch (removeError) {
      setError(readableError(removeError, 'No pudimos quitar al participante.'))
    } finally {
      setParticipantBusyId(null)
    }
  }

  const leaveChat = async () => {
    if (
      !selectedChatId ||
      !window.confirm('¿Salir y archivar esta conversación para tu cuenta?')
    ) {
      return
    }
    setParticipantBusyId(currentUser.id)
    try {
      await removeChatParticipant(selectedChatId, currentUser.id)
      closeSelectedChat()
      await refreshChats()
    } catch (leaveError) {
      setError(readableError(leaveError, 'No pudimos salir del chat.'))
    } finally {
      setParticipantBusyId(null)
    }
  }

  const generateQr = async () => {
    setQrBusy(true)
    setCopied(false)
    try {
      const result = await createPersonalQrCode()
      setQrCode(result.qrCode)
    } catch (qrError) {
      setError(readableError(qrError, 'No pudimos generar tu código.'))
    } finally {
      setQrBusy(false)
    }
  }

  const copyQr = async () => {
    if (!qrCode) return
    try {
      await navigator.clipboard.writeText(qrCode.code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setError('No pudimos copiar el código. Puedes seleccionarlo manualmente.')
    }
  }

  const invalidateQr = async () => {
    setQrBusy(true)
    try {
      await invalidateCurrentQrCode()
      setQrCode(null)
    } catch (qrError) {
      setError(readableError(qrError, 'No pudimos invalidar tu código.'))
    } finally {
      setQrBusy(false)
    }
  }

  const redeemQr = async (event: FormEvent) => {
    event.preventDefault()
    if (redeemCode.length !== 6) return
    setQrBusy(true)
    try {
      const result = await redeemQrCode(redeemCode)
      setRedeemCode('')
      setUtilityPanel(null)
      await refreshChats(true)
      selectChat(result.chatId)
      setNotice('Código canjeado. Ya puedes conversar.')
    } catch (redeemError) {
      setError(readableError(redeemError, 'No pudimos usar ese código.'))
    } finally {
      setQrBusy(false)
    }
  }

  const closeReport = () => {
    setReportTarget(null)
    setReportReason('')
    setReportDetails('')
  }

  const submitReport = async (event: FormEvent) => {
    event.preventDefault()
    if (!reportTarget || reportReason.trim().length < 3) return
    setReportBusy(true)
    try {
      await createReport({
        resourceType: reportTarget.type,
        resourceId: reportTarget.id,
        reason: reportReason.trim(),
        details: reportDetails.trim() || null,
      })
      closeReport()
      setNotice('Reporte enviado a moderación.')
    } catch (reportError) {
      setError(readableError(reportError, 'No pudimos enviar el reporte.'))
    } finally {
      setReportBusy(false)
    }
  }

  const selectedIdentity = detail
    ? getChatIdentity(detail, currentUser.id)
    : selectedSummary
      ? getChatIdentity(selectedSummary, currentUser.id)
      : null

  const openUtility = (panel: UtilityPanel) => {
    if (panel === 'qr') setQrLoading(true)
    setUtilityPanel((current) => (current === panel ? null : panel))
    setError('')
  }

  return (
    <div
      className={`chat-shell${selectedChatId ? ' chat-shell--conversation-open' : ''}${
        utilityPanel ? ' chat-shell--utility-open' : ''
      }`}
    >
      <section className="chat-list-panel" aria-label="Conversaciones">
        <header className="chat-list-header">
          <div>
            <span>Comunidad</span>
            <h2>Mensajes</h2>
          </div>
          <button
            className="chat-icon-button chat-icon-button--primary"
            type="button"
            onClick={() => setShowNewChat(true)}
            aria-label="Crear conversación"
            title="Crear conversación"
          >
            <ChatIcon name="plus" />
          </button>
        </header>

        <label className="chat-search chat-search--list">
          <span className="chat-sr-only">Buscar conversaciones</span>
          <ChatIcon name="search" />
          <input
            type="search"
            value={listQuery}
            onChange={(event) => setListQuery(event.target.value)}
            placeholder="Buscar conversación…"
            autoComplete="off"
          />
          {listQuery && (
            <button
              type="button"
              onClick={() => setListQuery('')}
              aria-label="Limpiar búsqueda"
            >
              <ChatIcon name="close" />
            </button>
          )}
        </label>

        {!selectedChatId && (error || notice) && (
          <div
            className={`chat-alert${error ? ' chat-alert--error' : ''}`}
            role={error ? 'alert' : 'status'}
          >
            <span>{error || notice}</span>
            <button
              type="button"
              onClick={() => {
                setError('')
                setNotice('')
              }}
              aria-label="Cerrar aviso"
            >
              <ChatIcon name="close" />
            </button>
          </div>
        )}

        <div className="chat-list" role="list">
          {listLoading ? (
            <div className="chat-state chat-state--compact" role="status">
              <span className="chat-spinner" />
              <p>Cargando conversaciones…</p>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="chat-state chat-state--compact">
              <span className="chat-state__icon">
                <ChatIcon name="message" />
              </span>
              <h3>{listQuery ? 'Sin coincidencias' : 'Tu primer chat'}</h3>
              <p>
                {listQuery
                  ? 'Prueba buscando otro nombre o mensaje.'
                  : 'Conecta con alguien de Konea o crea un grupo de estudio.'}
              </p>
              {!listQuery && (
                <button
                  className="chat-button chat-button--primary"
                  type="button"
                  onClick={() => setShowNewChat(true)}
                >
                  Nueva conversación
                </button>
              )}
            </div>
          ) : (
            filteredChats.map((chat) => {
              const identity = getChatIdentity(chat, currentUser.id)
              return (
                <button
                  className={`chat-list-item${
                    chat.id === selectedChatId ? ' is-active' : ''
                  }`}
                  type="button"
                  role="listitem"
                  key={chat.id}
                  onClick={() => selectChat(chat.id)}
                  aria-current={chat.id === selectedChatId ? 'true' : undefined}
                >
                  <span className="chat-list-item__avatar">
                    <ChatAvatar name={identity.name} url={identity.avatarUrl} />
                    {chat.type === 'direct' &&
                      isRecentlyOnline(
                        chat.participants.find(
                          (person) => person.id !== currentUser.id,
                        )?.lastSeenAt,
                      ) && <span className="chat-presence" title="En línea" />}
                  </span>
                  <span className="chat-list-item__content">
                    <span className="chat-list-item__top">
                      <strong>{identity.name}</strong>
                      <time dateTime={chat.updatedAt}>
                        {formatTime(
                          chat.lastMessage?.createdAt ?? chat.updatedAt,
                        )}
                      </time>
                    </span>
                    <span className="chat-list-item__bottom">
                      <span>{messagePreview(chat)}</span>
                      {chat.unreadCount > 0 && (
                        <strong
                          className="chat-unread"
                          aria-label={`${chat.unreadCount} mensajes sin leer`}
                        >
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </strong>
                      )}
                    </span>
                  </span>
                </button>
              )
            })
          )}
        </div>

        <footer className="chat-list-footer">
          <button type="button" onClick={() => openUtility('qr')}>
            <ChatIcon name="qr" />
            <span>
              <strong>Conectar con código</strong>
              <small>Comparte o canjea uno</small>
            </span>
          </button>
        </footer>
      </section>

      <section className="chat-conversation" aria-label="Conversación activa">
        {!selectedChatId || !selectedIdentity ? (
          <div className="chat-welcome">
            <span className="chat-welcome__mark">
              <ChatIcon name="message" />
            </span>
            <span>Mensajería Konea</span>
            <h2>Tu espacio para avanzar en equipo</h2>
            <p>
              Conversa, comparte recursos, organiza tareas y decide con
              encuestas, todo dentro de tu comunidad académica.
            </p>
            <div>
              <button
                className="chat-button chat-button--primary"
                type="button"
                onClick={() => setShowNewChat(true)}
              >
                <ChatIcon name="plus" /> Nueva conversación
              </button>
              <button
                className="chat-button chat-button--secondary"
                type="button"
                onClick={() => openUtility('qr')}
              >
                <ChatIcon name="qr" /> Usar código
              </button>
            </div>
          </div>
        ) : (
          <>
            <header className="chat-conversation-header">
              <button
                className="chat-icon-button chat-mobile-back"
                type="button"
                onClick={closeSelectedChat}
                aria-label="Volver a conversaciones"
              >
                <ChatIcon name="arrow-left" />
              </button>
              <button
                className="chat-conversation-header__identity"
                type="button"
                onClick={() => openUtility('info')}
              >
                <span className="chat-list-item__avatar">
                  <ChatAvatar
                    name={selectedIdentity.name}
                    url={selectedIdentity.avatarUrl}
                  />
                  {detail?.type === 'direct' &&
                    isRecentlyOnline(
                      detail.participants.find(
                        (person) => person.id !== currentUser.id,
                      )?.lastSeenAt,
                    ) && <span className="chat-presence" />}
                </span>
                <span>
                  <strong>{selectedIdentity.name}</strong>
                  <small>
                    {detail?.type === 'direct' &&
                    isRecentlyOnline(
                      detail.participants.find(
                        (person) => person.id !== currentUser.id,
                      )?.lastSeenAt,
                    )
                      ? 'En línea'
                      : selectedIdentity.subtitle}
                  </small>
                </span>
              </button>
              <div className="chat-conversation-header__actions">
                <button
                  className={`chat-icon-button${utilityPanel === 'tasks' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => openUtility('tasks')}
                  aria-label="Tareas del chat"
                  title="Tareas"
                >
                  <ChatIcon name="tasks" />
                  {tasks.filter((task) => task.status !== 'completed').length >
                    0 && (
                    <span className="chat-action-count">
                      {
                        tasks.filter((task) => task.status !== 'completed')
                          .length
                      }
                    </span>
                  )}
                </button>
                <button
                  className={`chat-icon-button${utilityPanel === 'info' ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => openUtility('info')}
                  aria-label="Información del chat"
                  title="Información"
                >
                  <ChatIcon name="info" />
                </button>
              </div>
            </header>

            <div className="chat-message-tools">
              <label className="chat-search chat-search--messages">
                <span className="chat-sr-only">Buscar en los mensajes</span>
                <ChatIcon name="search" />
                <input
                  type="search"
                  value={messageSearchInput}
                  onChange={(event) =>
                    setMessageSearchInput(event.target.value)
                  }
                  maxLength={100}
                  placeholder="Buscar en esta conversación…"
                  autoComplete="off"
                />
                {messageSearchInput && (
                  <button
                    type="button"
                    onClick={() => setMessageSearchInput('')}
                    aria-label="Limpiar búsqueda"
                  >
                    <ChatIcon name="close" />
                  </button>
                )}
              </label>
              <label className="chat-tag-filter">
                <span className="chat-sr-only">Filtrar por etiqueta</span>
                <select
                  value={activeTag ?? ''}
                  onChange={(event) => {
                    loadedOlderRef.current = false
                    setLoadedOlder(false)
                    setActiveTag(
                      (event.target.value || null) as MessageTag | null,
                    )
                  }}
                >
                  <option value="">Todas las etiquetas</option>
                  {messageTags.map((tag) => (
                    <option key={tag} value={tag}>
                      {tagLabel(tag)}
                    </option>
                  ))}
                </select>
                <ChatIcon name="chevron-down" />
              </label>
            </div>

            {(error || notice) && (
              <div
                className={`chat-alert${error ? ' chat-alert--error' : ''}`}
                role={error ? 'alert' : 'status'}
              >
                <span>{error || notice}</span>
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setNotice('')
                  }}
                  aria-label="Cerrar aviso"
                >
                  <ChatIcon name="close" />
                </button>
              </div>
            )}

            <div className="chat-message-scroll" aria-live="polite">
              {hasMoreMessages && (
                <button
                  className="chat-load-older"
                  type="button"
                  disabled={olderLoading}
                  onClick={() => void loadOlderMessages()}
                >
                  {olderLoading ? 'Cargando…' : 'Ver mensajes anteriores'}
                </button>
              )}

              {conversationLoading && messages.length === 0 ? (
                <div className="chat-state" role="status">
                  <span className="chat-spinner" />
                  <p>Cargando conversación…</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="chat-state">
                  <span className="chat-state__icon">
                    <ChatIcon
                      name={messageQuery || activeTag ? 'search' : 'message'}
                    />
                  </span>
                  <h3>
                    {messageQuery || activeTag
                      ? 'No encontramos mensajes'
                      : 'Comienza la conversación'}
                  </h3>
                  <p>
                    {messageQuery || activeTag
                      ? 'Cambia la búsqueda o quita el filtro de etiqueta.'
                      : 'Envía un mensaje, recurso o encuesta al equipo.'}
                  </p>
                </div>
              ) : (
                <div className="chat-message-list">
                  {messages.map((message, index) => {
                    const previous = messages[index - 1]
                    const startsDay =
                      !previous ||
                      new Date(previous.createdAt).toDateString() !==
                        new Date(message.createdAt).toDateString()
                    const own = message.sender.id === currentUser.id
                    const canDelete = own || isManager
                    const canEdit =
                      own &&
                      message.type !== 'poll' &&
                      message.type !== 'system'

                    return (
                      <div key={message.id}>
                        {startsDay && (
                          <div className="chat-day-divider">
                            <span>{formatDay(message.createdAt)}</span>
                          </div>
                        )}

                        {message.type === 'system' ? (
                          <div className="chat-system-message">
                            <ChatIcon name="tasks" />
                            <span>{message.content}</span>
                            <time dateTime={message.createdAt}>
                              {formatTime(message.createdAt)}
                            </time>
                          </div>
                        ) : (
                          <article
                            className={`chat-message${own ? ' chat-message--own' : ''}`}
                          >
                            {!own && (
                              <ChatAvatar
                                name={message.sender.displayName}
                                url={message.sender.avatarUrl}
                                size="small"
                              />
                            )}
                            <div className="chat-message__body">
                              {!own && detail?.type === 'group' && (
                                <button
                                  className="chat-message__sender"
                                  type="button"
                                  onClick={() =>
                                    onOpenUser?.(message.sender.id)
                                  }
                                  disabled={!onOpenUser}
                                >
                                  {message.sender.displayName}
                                </button>
                              )}

                              <div className="chat-message__bubble">
                                {editingMessageId === message.id ? (
                                  <form
                                    className="chat-message-edit"
                                    onSubmit={(event) => {
                                      event.preventDefault()
                                      void saveMessageEdit(message)
                                    }}
                                  >
                                    <textarea
                                      value={editingMessageText}
                                      onChange={(event) =>
                                        setEditingMessageText(
                                          event.target.value,
                                        )
                                      }
                                      maxLength={4000}
                                      rows={3}
                                      autoFocus
                                    />
                                    <div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingMessageId(null)
                                        }
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        className="chat-button chat-button--primary chat-button--small"
                                        type="submit"
                                        disabled={
                                          busyMessageId === message.id ||
                                          !editingMessageText.trim()
                                        }
                                      >
                                        Guardar
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <>
                                    {message.content &&
                                      message.type !== 'poll' && (
                                        <p>{message.content}</p>
                                      )}
                                    {message.type === 'image' &&
                                      message.fileUrl && (
                                        <a
                                          className="chat-image-attachment"
                                          href={message.fileUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          title="Abrir imagen en tamaño completo"
                                        >
                                          <img
                                            src={message.fileUrl}
                                            alt={
                                              message.fileName ||
                                              'Imagen compartida'
                                            }
                                            loading="lazy"
                                          />
                                        </a>
                                      )}
                                    {message.type === 'file' &&
                                      message.fileUrl && (
                                        <a
                                          className="chat-file-attachment"
                                          href={message.fileUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <span>
                                            <ChatIcon name="file" />
                                          </span>
                                          <span>
                                            <strong>
                                              {message.fileName ||
                                                'Documento PDF'}
                                            </strong>
                                            <small>
                                              PDF
                                              {message.fileSize
                                                ? ` · ${formatBytes(message.fileSize)}`
                                                : ''}
                                            </small>
                                          </span>
                                          <ChatIcon name="download" />
                                        </a>
                                      )}
                                    {message.poll && (
                                      <PollCard
                                        poll={message.poll}
                                        busy={busyPollId === message.poll.id}
                                        onVote={(poll, optionIds) =>
                                          void submitVote(poll, optionIds)
                                        }
                                        onRemoveVote={(poll) =>
                                          void clearVote(poll)
                                        }
                                      />
                                    )}
                                    {message.tags.filter(
                                      (tag) => tag !== 'poll',
                                    ).length > 0 && (
                                      <div className="chat-message__tags">
                                        {message.tags
                                          .filter((tag) => tag !== 'poll')
                                          .map((tag) => (
                                            <span key={tag}>
                                              {tagLabel(tag)}
                                            </span>
                                          ))}
                                      </div>
                                    )}
                                  </>
                                )}
                                {editingMessageId !== message.id && (
                                  <footer className="chat-message__meta">
                                    <time dateTime={message.createdAt}>
                                      {formatTime(message.createdAt)}
                                    </time>
                                    {message.updatedAt !==
                                      message.createdAt && <span>Editado</span>}
                                    {own && <ChatIcon name="check" />}
                                  </footer>
                                )}
                              </div>

                              {(canEdit || canDelete || !own) &&
                                editingMessageId !== message.id && (
                                  <div className="chat-message__actions">
                                    {canEdit && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingMessageId(message.id)
                                          setEditingMessageText(message.content)
                                        }}
                                        aria-label="Editar mensaje"
                                        title="Editar"
                                      >
                                        <ChatIcon name="edit" />
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void removeMessage(message)
                                        }
                                        disabled={busyMessageId === message.id}
                                        aria-label="Eliminar mensaje"
                                        title="Eliminar"
                                      >
                                        <ChatIcon name="trash" />
                                      </button>
                                    )}
                                    {!own && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setReportTarget({
                                            type: 'message',
                                            id: message.id,
                                            label: `Mensaje de ${message.sender.displayName}`,
                                          })
                                        }
                                        aria-label="Reportar mensaje"
                                        title="Reportar"
                                      >
                                        <ChatIcon name="flag" />
                                      </button>
                                    )}
                                  </div>
                                )}
                            </div>
                          </article>
                        )}
                      </div>
                    )
                  })}
                  <div ref={messageEndRef} />
                </div>
              )}
            </div>

            <form
              className="chat-composer"
              onSubmit={(event) => void sendText(event)}
            >
              {composerTags.length > 0 && (
                <div className="chat-composer__selected-tags">
                  {composerTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleComposerTag(tag)}
                    >
                      {tagLabel(tag)} <ChatIcon name="close" />
                    </button>
                  ))}
                </div>
              )}
              <div className="chat-composer__main">
                <input
                  ref={fileInputRef}
                  className="chat-sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                  onChange={(event) => void sendFile(event)}
                  tabIndex={-1}
                />
                <button
                  className="chat-icon-button"
                  type="button"
                  disabled={sending}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Adjuntar imagen o PDF"
                  title="Adjuntar imagen o PDF (máximo 5 MB)"
                >
                  <ChatIcon name="attachment" />
                </button>
                <textarea
                  value={composer}
                  onChange={(event) => setComposer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                  rows={1}
                  maxLength={4000}
                  placeholder="Escribe un mensaje…"
                  aria-label="Mensaje"
                  disabled={sending}
                />
                <button
                  className="chat-icon-button"
                  type="button"
                  onClick={() => setShowPollDialog(true)}
                  aria-label="Crear encuesta"
                  title="Crear encuesta"
                >
                  <ChatIcon name="poll" />
                </button>
                <button
                  className="chat-send-button"
                  type="submit"
                  disabled={sending || !composer.trim()}
                  aria-label="Enviar mensaje"
                >
                  {sending ? (
                    <span className="chat-spinner" />
                  ) : (
                    <ChatIcon name="send" />
                  )}
                </button>
              </div>
              <div
                className="chat-composer__tags"
                aria-label="Etiquetas del mensaje"
              >
                {messageTags
                  .filter((tag) => tag !== 'poll')
                  .map((tag) => (
                    <button
                      className={composerTags.includes(tag) ? 'is-active' : ''}
                      key={tag}
                      type="button"
                      onClick={() => toggleComposerTag(tag)}
                      aria-pressed={composerTags.includes(tag)}
                    >
                      {tagLabel(tag)}
                    </button>
                  ))}
              </div>
            </form>
          </>
        )}
      </section>

      {utilityPanel && (
        <aside
          className="chat-utility"
          aria-label="Herramientas de conversación"
        >
          <header className="chat-utility__header">
            <div>
              <span>Herramientas</span>
              <h2>
                {utilityPanel === 'info'
                  ? 'Información'
                  : utilityPanel === 'tasks'
                    ? 'Tareas'
                    : 'Código de conexión'}
              </h2>
            </div>
            <button
              className="chat-icon-button"
              type="button"
              onClick={() => setUtilityPanel(null)}
              aria-label="Cerrar panel"
            >
              <ChatIcon name="close" />
            </button>
          </header>

          {utilityPanel === 'info' && detail && selectedIdentity && (
            <div className="chat-utility__scroll">
              <section className="chat-info-identity">
                <ChatAvatar
                  name={selectedIdentity.name}
                  url={selectedIdentity.avatarUrl}
                  size="large"
                />
                <h3>{selectedIdentity.name}</h3>
                <p>{selectedIdentity.subtitle}</p>
              </section>

              {detail.type === 'group' && isManager && (
                <form className="chat-group-name-form" onSubmit={saveGroupName}>
                  <label htmlFor="chat-group-name">Nombre del grupo</label>
                  <div>
                    <input
                      id="chat-group-name"
                      value={groupNameDraft}
                      onChange={(event) =>
                        setGroupNameDraft(event.target.value)
                      }
                      maxLength={120}
                      required
                    />
                    <button
                      className="chat-button chat-button--secondary chat-button--small"
                      type="submit"
                      disabled={
                        participantBusyId === 'group' ||
                        !groupNameDraft.trim() ||
                        groupNameDraft.trim() === detail.name
                      }
                    >
                      Guardar
                    </button>
                  </div>
                </form>
              )}

              <section className="chat-participants">
                <header>
                  <div>
                    <span>Integrantes</span>
                    <h3>{detail.participants.length} participantes</h3>
                  </div>
                </header>
                <div className="chat-participant-list">
                  {detail.participants.map((participant) => (
                    <article className="chat-participant" key={participant.id}>
                      <button
                        className="chat-participant__person"
                        type="button"
                        onClick={() => onOpenUser?.(participant.id)}
                        disabled={!onOpenUser}
                      >
                        <span className="chat-list-item__avatar">
                          <ChatAvatar
                            name={participant.displayName}
                            url={participant.avatarUrl}
                            size="small"
                          />
                          {isRecentlyOnline(participant.lastSeenAt) && (
                            <span className="chat-presence" />
                          )}
                        </span>
                        <span>
                          <strong>
                            {participant.displayName}
                            {participant.id === currentUser.id ? ' (tú)' : ''}
                          </strong>
                          <small>
                            @{participant.username} ·{' '}
                            {roleLabel(participant.role)}
                          </small>
                        </span>
                      </button>
                      {detail.type === 'group' &&
                        isManager &&
                        participant.role !== 'owner' &&
                        participant.id !== currentUser.id && (
                          <div className="chat-participant__manage">
                            <select
                              aria-label={`Rol de ${participant.displayName}`}
                              value={participant.role}
                              disabled={participantBusyId === participant.id}
                              onChange={(event) =>
                                void changeParticipantRole(
                                  participant,
                                  event.target.value as 'member' | 'admin',
                                )
                              }
                            >
                              <option value="member">Miembro</option>
                              <option value="admin">Admin</option>
                            </select>
                            <button
                              type="button"
                              disabled={participantBusyId === participant.id}
                              onClick={() =>
                                void removeParticipant(participant)
                              }
                              aria-label={`Quitar a ${participant.displayName}`}
                            >
                              <ChatIcon name="trash" />
                            </button>
                          </div>
                        )}
                    </article>
                  ))}
                </div>
              </section>

              {detail.type === 'group' && isManager && (
                <section className="chat-add-participant">
                  <label htmlFor="chat-add-person">Agregar participante</label>
                  <div className="chat-search">
                    <ChatIcon name="search" />
                    <input
                      id="chat-add-person"
                      type="search"
                      value={infoQuery}
                      onChange={(event) => setInfoQuery(event.target.value)}
                      placeholder="Buscar por nombre…"
                      autoComplete="off"
                    />
                  </div>
                  {infoQuery && (
                    <div className="chat-person-picker chat-person-picker--compact">
                      {infoPeople.length ? (
                        infoPeople.slice(0, 5).map((person) => (
                          <button
                            key={person.id}
                            type="button"
                            disabled={participantBusyId === person.id}
                            onClick={() => void addParticipant(person)}
                          >
                            <ChatAvatar
                              name={person.displayName}
                              url={person.avatarUrl}
                              size="small"
                            />
                            <span>
                              <strong>{person.displayName}</strong>
                              <small>@{person.username}</small>
                            </span>
                            <ChatIcon name="plus" />
                          </button>
                        ))
                      ) : (
                        <p>No hay personas disponibles con esa búsqueda.</p>
                      )}
                    </div>
                  )}
                </section>
              )}

              <button
                className="chat-danger-button"
                type="button"
                disabled={participantBusyId === currentUser.id}
                onClick={() => void leaveChat()}
              >
                Salir y archivar conversación
              </button>
              <button
                className="chat-report-button"
                type="button"
                onClick={() =>
                  setReportTarget({
                    type: 'chat',
                    id: detail.id,
                    label: selectedIdentity.name,
                  })
                }
              >
                <ChatIcon name="flag" /> Reportar conversación
              </button>
            </div>
          )}

          {utilityPanel === 'info' && !detail && (
            <div className="chat-state">
              <ChatIcon name="info" />
              <p>Selecciona una conversación para ver su información.</p>
            </div>
          )}

          {utilityPanel === 'tasks' && detail && (
            <div className="chat-utility__scroll">
              <section className="chat-task-summary">
                <div>
                  <strong>
                    {tasks.filter((task) => task.status !== 'completed').length}
                  </strong>
                  <span>Pendientes</span>
                </div>
                <div>
                  <strong>
                    {tasks.filter((task) => task.status === 'completed').length}
                  </strong>
                  <span>Completadas</span>
                </div>
              </section>
              <button
                className="chat-button chat-button--primary chat-button--full"
                type="button"
                onClick={() => {
                  resetTaskForm()
                  setTaskDraft({
                    ...emptyTaskDraft,
                    assignedToId: currentUser.id,
                  })
                  setTaskFormOpen(true)
                }}
              >
                <ChatIcon name="plus" /> Nueva tarea
              </button>

              {taskFormOpen && (
                <form className="chat-task-form" onSubmit={submitTask}>
                  <header>
                    <h3>{editingTaskId ? 'Editar tarea' : 'Nueva tarea'}</h3>
                    <button
                      type="button"
                      onClick={resetTaskForm}
                      aria-label="Cerrar formulario"
                    >
                      <ChatIcon name="close" />
                    </button>
                  </header>
                  <label>
                    <span>Título</span>
                    <input
                      value={taskDraft.title}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          title: event.target.value,
                        }))
                      }
                      maxLength={160}
                      required
                    />
                  </label>
                  <label>
                    <span>Descripción</span>
                    <textarea
                      value={taskDraft.description}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      maxLength={1000}
                      rows={3}
                    />
                  </label>
                  <div className="chat-task-form__row">
                    <label>
                      <span>Responsable</span>
                      <select
                        value={taskDraft.assignedToId || currentUser.id}
                        onChange={(event) =>
                          setTaskDraft((current) => ({
                            ...current,
                            assignedToId: event.target.value,
                          }))
                        }
                      >
                        {detail.participants.map((participant) => (
                          <option key={participant.id} value={participant.id}>
                            {participant.id === currentUser.id
                              ? 'Yo'
                              : participant.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Prioridad</span>
                      <select
                        value={taskDraft.priority}
                        onChange={(event) =>
                          setTaskDraft((current) => ({
                            ...current,
                            priority: event.target.value as TaskPriority,
                          }))
                        }
                      >
                        <option value="low">Baja</option>
                        <option value="medium">Media</option>
                        <option value="high">Alta</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>Fecha límite</span>
                    <input
                      type="date"
                      value={taskDraft.dueDate}
                      onChange={(event) =>
                        setTaskDraft((current) => ({
                          ...current,
                          dueDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="chat-button chat-button--primary chat-button--full"
                    type="submit"
                    disabled={taskBusyId !== null || !taskDraft.title.trim()}
                  >
                    {taskBusyId ? 'Guardando…' : 'Guardar tarea'}
                  </button>
                </form>
              )}

              <div className="chat-task-list">
                {tasks.length === 0 ? (
                  <div className="chat-state chat-state--compact">
                    <span className="chat-state__icon">
                      <ChatIcon name="tasks" />
                    </span>
                    <h3>Todo despejado</h3>
                    <p>Crea la primera tarea para organizar este chat.</p>
                  </div>
                ) : (
                  tasks.map((task) => {
                    const canUpdate =
                      task.createdById === currentUser.id ||
                      task.assignedToId === currentUser.id ||
                      isManager
                    const canManage =
                      task.createdById === currentUser.id || isManager
                    return (
                      <article
                        className={`chat-task chat-task--${task.status}`}
                        key={task.id}
                      >
                        <header>
                          <span
                            className={`chat-priority chat-priority--${task.priority}`}
                          >
                            {priorityLabel(task.priority)}
                          </span>
                          {canManage && (
                            <div>
                              <button
                                type="button"
                                onClick={() => startTaskEdit(task)}
                                aria-label={`Editar ${task.title}`}
                              >
                                <ChatIcon name="edit" />
                              </button>
                              <button
                                type="button"
                                disabled={taskBusyId === task.id}
                                onClick={() => void removeTask(task)}
                                aria-label={`Eliminar ${task.title}`}
                              >
                                <ChatIcon name="trash" />
                              </button>
                            </div>
                          )}
                        </header>
                        <h3>{task.title}</h3>
                        {task.description && <p>{task.description}</p>}
                        <dl>
                          <div>
                            <dt>Responsable</dt>
                            <dd>
                              {task.assignedTo?.displayName ||
                                detail.participants.find(
                                  (person) => person.id === task.assignedToId,
                                )?.displayName ||
                                'Sin asignar'}
                            </dd>
                          </div>
                          {task.dueDate && (
                            <div>
                              <dt>Entrega</dt>
                              <dd>{formatDay(task.dueDate)}</dd>
                            </div>
                          )}
                        </dl>
                        <label className="chat-task__status">
                          <span>Estado</span>
                          <select
                            value={task.status}
                            disabled={!canUpdate || taskBusyId === task.id}
                            onChange={(event) =>
                              void changeTaskStatus(
                                task,
                                event.target.value as TaskStatus,
                              )
                            }
                          >
                            <option value="pending">Pendiente</option>
                            <option value="in_progress">En curso</option>
                            <option value="completed">Completada</option>
                          </select>
                        </label>
                      </article>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {utilityPanel === 'tasks' && !detail && (
            <div className="chat-state">
              <ChatIcon name="tasks" />
              <p>Selecciona una conversación para organizar tareas.</p>
            </div>
          )}

          {utilityPanel === 'qr' && (
            <div className="chat-utility__scroll chat-qr-panel">
              <section className="chat-qr-intro">
                <span className="chat-qr-intro__icon">
                  <ChatIcon name="qr" />
                </span>
                <h3>Conecta en persona</h3>
                <p>
                  Genera un código de seis caracteres para abrir un chat directo
                  de forma segura.
                </p>
              </section>
              {qrLoading ? (
                <div className="chat-state chat-state--compact" role="status">
                  <span className="chat-spinner" />
                  <p>Consultando código…</p>
                </div>
              ) : qrCode ? (
                <section className="chat-qr-code">
                  <span>Tu código temporal</span>
                  {qrImageUrl && (
                    <img
                      src={qrImageUrl}
                      alt={`Código QR para conectar con ${currentUser.displayName}`}
                    />
                  )}
                  <strong aria-label={`Código ${qrCode.code}`}>
                    {qrCode.code.slice(0, 3)} {qrCode.code.slice(3)}
                  </strong>
                  <p>
                    Expira en{' '}
                    {String(Math.floor(qrSeconds / 60)).padStart(2, '0')}:
                    {String(qrSeconds % 60).padStart(2, '0')}
                  </p>
                  <div>
                    <button
                      className="chat-button chat-button--primary"
                      type="button"
                      onClick={() => void copyQr()}
                    >
                      <ChatIcon name={copied ? 'check' : 'copy'} />
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                    <button
                      className="chat-button chat-button--secondary"
                      type="button"
                      disabled={qrBusy}
                      onClick={() => void generateQr()}
                    >
                      Renovar
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={qrBusy}
                    onClick={() => void invalidateQr()}
                  >
                    Invalidar este código
                  </button>
                </section>
              ) : (
                <button
                  className="chat-button chat-button--primary chat-button--full"
                  type="button"
                  disabled={qrBusy}
                  onClick={() => void generateQr()}
                >
                  <ChatIcon name="qr" />
                  {qrBusy ? 'Generando…' : 'Generar mi código'}
                </button>
              )}
              <div className="chat-utility-divider">
                <span>o usa el de otra persona</span>
              </div>
              <form className="chat-redeem-form" onSubmit={redeemQr}>
                <button
                  className="chat-button chat-button--primary chat-button--full"
                  type="button"
                  onClick={() => setScannerOpen(true)}
                >
                  <ChatIcon name="qr" /> Escanear con la cámara
                </button>
                <label htmlFor="chat-redeem-code">Código de conexión</label>
                <input
                  id="chat-redeem-code"
                  value={redeemCode}
                  onChange={(event) =>
                    setRedeemCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 6),
                    )
                  }
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={6}
                  placeholder="ABC123"
                  pattern="[A-Z0-9]{6}"
                  required
                />
                <button
                  className="chat-button chat-button--secondary chat-button--full"
                  type="submit"
                  disabled={qrBusy || redeemCode.length !== 6}
                >
                  {qrBusy ? 'Conectando…' : 'Abrir conversación'}
                </button>
              </form>
              <p className="chat-qr-note">
                Cada código vence después de cinco minutos y solo puede usarlo
                una persona.
              </p>
            </div>
          )}
        </aside>
      )}

      {utilityPanel && (
        <button
          className="chat-utility-backdrop"
          type="button"
          onClick={() => setUtilityPanel(null)}
          aria-label="Cerrar herramientas"
        />
      )}

      {showNewChat && (
        <Dialog
          title="Nueva conversación"
          description="Encuentra personas o reúne a tu equipo en un grupo."
          onClose={resetNewChat}
        >
          <div className="chat-dialog-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={newChatMode === 'direct'}
              className={newChatMode === 'direct' ? 'is-active' : ''}
              onClick={() => {
                setNewChatMode('direct')
                setSelectedPeopleIds([])
              }}
            >
              Chat directo
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={newChatMode === 'group'}
              className={newChatMode === 'group' ? 'is-active' : ''}
              onClick={() => setNewChatMode('group')}
            >
              Crear grupo
            </button>
          </div>
          <label className="chat-search chat-dialog-search">
            <span className="chat-sr-only">Buscar personas</span>
            <ChatIcon name="search" />
            <input
              type="search"
              value={newChatQuery}
              onChange={(event) => setNewChatQuery(event.target.value)}
              placeholder="Buscar por nombre, usuario o carrera…"
              autoComplete="off"
              autoFocus
            />
          </label>
          <div className="chat-person-picker">
            {newChatLoading ? (
              <div className="chat-state chat-state--compact" role="status">
                <span className="chat-spinner" />
                <p>Buscando personas…</p>
              </div>
            ) : newChatPeople.length ? (
              newChatPeople.map((person) => {
                const selected = selectedPeopleIds.includes(person.id)
                return (
                  <button
                    type="button"
                    key={person.id}
                    disabled={creatingChat}
                    className={selected ? 'is-selected' : ''}
                    onClick={() => {
                      if (newChatMode === 'direct') {
                        void handleCreateDirect(person.id)
                      } else {
                        setSelectedPeopleIds((current) =>
                          selected
                            ? current.filter((id) => id !== person.id)
                            : [...current, person.id],
                        )
                      }
                    }}
                  >
                    <ChatAvatar
                      name={person.displayName}
                      url={person.avatarUrl}
                    />
                    <span>
                      <strong>{person.displayName}</strong>
                      <small>
                        @{person.username}
                        {person.career ? ` · ${person.career}` : ''}
                      </small>
                    </span>
                    {newChatMode === 'group' ? (
                      <span className="chat-person-picker__check">
                        {selected && <ChatIcon name="check" />}
                      </span>
                    ) : (
                      <ChatIcon name="message" />
                    )}
                  </button>
                )
              })
            ) : (
              <div className="chat-state chat-state--compact">
                <p>No encontramos personas disponibles.</p>
              </div>
            )}
          </div>
          {newChatMode === 'group' && (
            <form className="chat-group-create" onSubmit={handleCreateGroup}>
              <label>
                <span>Nombre del grupo</span>
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  maxLength={120}
                  placeholder="Ej. Equipo Capstone"
                  required
                />
              </label>
              <button
                className="chat-button chat-button--primary"
                type="submit"
                disabled={creatingChat || !groupName.trim()}
              >
                {creatingChat
                  ? 'Creando…'
                  : `Crear grupo${
                      selectedPeopleIds.length
                        ? ` con ${selectedPeopleIds.length + 1}`
                        : ''
                    }`}
              </button>
            </form>
          )}
        </Dialog>
      )}

      {showPollDialog && selectedChatId && (
        <Dialog
          title="Crear encuesta"
          description="Haz una pregunta rápida al equipo y reúne sus votos."
          onClose={() => setShowPollDialog(false)}
        >
          <form className="chat-poll-form" onSubmit={submitPoll}>
            <label>
              <span>Pregunta</span>
              <input
                value={pollQuestion}
                onChange={(event) => setPollQuestion(event.target.value)}
                maxLength={80}
                placeholder="¿Qué opción elegimos?"
                autoFocus
                required
              />
            </label>
            <fieldset>
              <legend>Opciones</legend>
              {pollOptions.map((option, index) => (
                <div key={index}>
                  <span>{index + 1}</span>
                  <input
                    value={option}
                    onChange={(event) =>
                      setPollOptions((current) =>
                        current.map((item, optionIndex) =>
                          optionIndex === index ? event.target.value : item,
                        ),
                      )
                    }
                    maxLength={40}
                    placeholder={`Opción ${index + 1}`}
                    required={index < 2}
                  />
                  {pollOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() =>
                        setPollOptions((current) =>
                          current.filter(
                            (_, optionIndex) => optionIndex !== index,
                          ),
                        )
                      }
                      aria-label={`Quitar opción ${index + 1}`}
                    >
                      <ChatIcon name="close" />
                    </button>
                  )}
                </div>
              ))}
              {pollOptions.length < 6 && (
                <button
                  className="chat-add-option"
                  type="button"
                  onClick={() => setPollOptions((current) => [...current, ''])}
                >
                  <ChatIcon name="plus" /> Agregar opción
                </button>
              )}
            </fieldset>
            <label className="chat-checkbox">
              <input
                type="checkbox"
                checked={pollAllowsMultiple}
                onChange={(event) =>
                  setPollAllowsMultiple(event.target.checked)
                }
              />
              <span>
                <strong>Permitir varias respuestas</strong>
                <small>Cada persona podrá seleccionar más de una opción.</small>
              </span>
            </label>
            <button
              className="chat-button chat-button--primary chat-button--full"
              type="submit"
              disabled={
                creatingPoll ||
                !pollQuestion.trim() ||
                pollOptions.filter((option) => option.trim()).length < 2
              }
            >
              {creatingPoll ? 'Publicando…' : 'Publicar encuesta'}
            </button>
          </form>
        </Dialog>
      )}

      {reportTarget && (
        <Dialog
          title={`Reportar ${reportTarget.type === 'message' ? 'mensaje' : 'conversación'}`}
          description={`${reportTarget.label}. El equipo de moderación revisará el contexto.`}
          onClose={closeReport}
        >
          <form className="chat-report-form" onSubmit={submitReport}>
            <label>
              <span>Motivo</span>
              <select
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                required
              >
                <option value="">Selecciona un motivo</option>
                <option value="Acoso o intimidación">
                  Acoso o intimidación
                </option>
                <option value="Contenido ofensivo">Contenido ofensivo</option>
                <option value="Spam o contenido engañoso">
                  Spam o contenido engañoso
                </option>
                <option value="Riesgo para la comunidad">
                  Riesgo para la comunidad
                </option>
                <option value="Otro incumplimiento">Otro incumplimiento</option>
              </select>
            </label>
            <label>
              <span>Detalles opcionales</span>
              <textarea
                value={reportDetails}
                onChange={(event) => setReportDetails(event.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="Explica brevemente qué ocurrió…"
              />
            </label>
            <p>
              El reporte es confidencial. No notifica a la persona reportada.
            </p>
            <button
              className="chat-button chat-button--primary chat-button--full"
              type="submit"
              disabled={reportBusy || reportReason.trim().length < 3}
            >
              {reportBusy ? 'Enviando…' : 'Enviar a moderación'}
            </button>
          </form>
        </Dialog>
      )}

      {scannerOpen && (
        <QrScanner
          onDetected={(code) => {
            setRedeemCode(code)
            setScannerOpen(false)
            setNotice('Código detectado. Confirma para abrir la conversación.')
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  )
}
