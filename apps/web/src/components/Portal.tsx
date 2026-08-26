import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { KoneaUser } from '../api/auth'
import { getChatUnreadCount } from '../api/chat'
import { getUnreadNotificationCount } from '../api/notifications'
import {
  getPublicUser,
  type ProfileAchievement,
  type ProfileEducation,
  type ProfileProject,
} from '../api/network'
import {
  createComment,
  createPost,
  deleteComment,
  deletePost,
  getLikedPostsByUser,
  getModerationPosts,
  getProfileCatalog,
  getPost,
  getPostComments,
  getPosts,
  likePost,
  moderatePost,
  sharePost,
  unlikePost,
  updateComment,
  updateProfile,
  type Comment,
  type ModerationStatus,
  type Post,
  type PostContentType,
  type PostVisibility,
  type ProfileCatalog,
  type ProfileUpdate,
} from '../api/portal'
import {
  createReport,
  getReports,
  updateReportStatus,
  type Report,
  type ReportResourceType,
  type ReportStatus,
} from '../api/reports'
import {
  getManagedSupportRequests,
  updateManagedSupportRequest,
  type ManagedSupportRequest,
  type SupportRequestCategory,
  type SupportRequestStatus,
} from '../api/support-requests'
import { uploadImage, validateImage } from '../api/uploads'
import { Network } from './Network'
import { Notifications } from './Notifications'
import { Chat } from './Chat'
import { Duco } from './Duco'
import { Academic } from './Academic'
import { ImageCropDialog } from './ImageCropDialog'
import { SearchableSelect } from './SearchableSelect'
import './Portal.css'

type PortalView =
  | 'feed'
  | 'network'
  | 'chat'
  | 'duco'
  | 'academic'
  | 'notifications'
  | 'profile'
  | 'moderation'

type PortalProps = {
  user: KoneaUser
  onUserChange: (user: KoneaUser) => void
  onLogout: () => Promise<void> | void
}

type PortalRoute = {
  view: PortalView
  networkUserId: string | null
  chatId: string | null
  postId: string | null
  canonicalHash: string
}

const uuidHashPattern =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

function routeFromHash(hash: string, canModerate: boolean): PortalRoute {
  const simpleRoutes: Record<string, PortalView> = {
    '#feed': 'feed',
    '#people': 'network',
    '#chat': 'chat',
    '#duco': 'duco',
    '#duco-requests': 'duco',
    '#academic': 'academic',
    '#profile': 'profile',
    '#notifications': 'notifications',
  }
  const simpleView = simpleRoutes[hash]
  if (simpleView) {
    return {
      view: simpleView,
      networkUserId: null,
      chatId: null,
      postId: null,
      canonicalHash: hash,
    }
  }

  if (hash === '#moderation' && canModerate) {
    return {
      view: 'moderation',
      networkUserId: null,
      chatId: null,
      postId: null,
      canonicalHash: '#moderation',
    }
  }

  const userMatch = hash.match(new RegExp(`^#user-(${uuidHashPattern})$`, 'i'))
  if (userMatch?.[1]) {
    return {
      view: 'network',
      networkUserId: userMatch[1],
      chatId: null,
      postId: null,
      canonicalHash: `#user-${userMatch[1]}`,
    }
  }

  const chatMatch = hash.match(new RegExp(`^#chat-(${uuidHashPattern})$`, 'i'))
  if (chatMatch?.[1]) {
    return {
      view: 'chat',
      networkUserId: null,
      chatId: chatMatch[1],
      postId: null,
      canonicalHash: `#chat-${chatMatch[1]}`,
    }
  }

  const postMatch = hash.match(new RegExp(`^#post-(${uuidHashPattern})$`, 'i'))
  if (postMatch?.[1]) {
    return {
      view: 'feed',
      networkUserId: null,
      chatId: null,
      postId: postMatch[1],
      canonicalHash: `#post-${postMatch[1]}`,
    }
  }

  return {
    view: 'feed',
    networkUserId: null,
    chatId: null,
    postId: null,
    canonicalHash: '#feed',
  }
}

function hashForView(view: PortalView) {
  const hashes: Record<PortalView, string> = {
    feed: '#feed',
    network: '#people',
    chat: '#chat',
    duco: '#duco',
    academic: '#academic',
    notifications: '#notifications',
    profile: '#profile',
    moderation: '#moderation',
  }
  return hashes[view]
}

type IconName =
  | 'brand'
  | 'feed'
  | 'profile'
  | 'shield'
  | 'logout'
  | 'heart'
  | 'comment'
  | 'trash'
  | 'globe'
  | 'users'
  | 'lock'
  | 'edit'
  | 'refresh'
  | 'check'
  | 'close'
  | 'bell'
  | 'share'
  | 'image'
  | 'flag'
  | 'reply'
  | 'megaphone'
  | 'chat'
  | 'duco'
  | 'academic'

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const monthFormatter = new Intl.DateTimeFormat('es-CL', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

function PortalIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    brand: (
      <>
        <path d="M7 5.5h6.4a3.6 3.6 0 0 1 0 7.2H10l-3 3v-3.4A3.6 3.6 0 0 1 7 5.5Z" />
        <path d="m10 8.2 3 1.8-3 1.8V8.2Z" />
      </>
    ),
    feed: (
      <>
        <path d="M4 9.7 12 3l8 6.7" />
        <path d="M6.5 8.5V21h11V8.5M9.5 21v-7h5v7" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    shield: (
      <path d="M12 3 20 6v5.5c0 4.7-3.1 8-8 9.5-4.9-1.5-8-4.8-8-9.5V6l8-3Zm-3 9 2 2 4-4" />
    ),
    logout: (
      <>
        <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
      </>
    ),
    heart: (
      <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />
    ),
    comment: (
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.8 9.8 0 0 1-4-.9L3 21l1.8-4.7A8.5 8.5 0 1 1 21 11.5Z" />
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14M10 11v6M14 11v6" />
      </>
    ),
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    edit: (
      <>
        <path d="m14 5 5 5M16.5 2.5a2.1 2.1 0 0 1 3 3L7 18l-4 1 1-4 12.5-12.5Z" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 8A7 7 0 0 1 18.5 6L20 12M4 12l1.5 6A7 7 0 0 0 18 16" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9" r="1.5" />
        <path d="m21 15-5-5L5 20" />
      </>
    ),
    flag: (
      <>
        <path d="M5 21V4" />
        <path d="M5 5h11l-2 4 2 4H5" />
      </>
    ),
    reply: (
      <>
        <path d="m9 17-5-5 5-5" />
        <path d="M20 19v-2a5 5 0 0 0-5-5H4" />
      </>
    ),
    megaphone: (
      <>
        <path d="M3 11v2a2 2 0 0 0 2 2h2l9 4V5L7 9H5a2 2 0 0 0-2 2Z" />
        <path d="m7 15 1 5h3l-1-4" />
        <path d="M19 9a4 4 0 0 1 0 6" />
      </>
    ),
    chat: (
      <>
        <path d="M21 12a8.5 8.5 0 0 1-9 8.5 10 10 0 0 1-4-.9L3 21l1.7-4.5A8.5 8.5 0 1 1 21 12Z" />
        <path d="M8 11h8M8 15h5" />
      </>
    ),
    duco: (
      <>
        <path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8L12 3Z" />
        <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 3l.7 2.3L8 6l-2.3.7L5 9l-.7-2.3L2 6l2.3-.7L5 3Z" />
      </>
    ),
    academic: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 3v18M8 8h8M8 13h8M8 18h5" />
      </>
    ),
  }

  return (
    <svg
      aria-hidden="true"
      className="portal-icon"
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

function Avatar({
  name,
  url,
  size = 'medium',
}: {
  name: string
  url: string | null
  size?: 'small' | 'medium' | 'large'
}) {
  const className = `portal-avatar portal-avatar--${size}`

  if (url) {
    return <img className={className} src={url} alt="" aria-hidden="true" />
  }

  return (
    <span className={className} aria-hidden="true">
      {initials(name) || 'K'}
    </span>
  )
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : dateFormatter.format(date)
}

function formatMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? value
    : monthFormatter
        .format(date)
        .replace(/^./, (letter) => letter.toUpperCase())
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Algunos navegadores exponen Clipboard sin conceder permisos.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('No pudimos copiar el enlace.')
}

function visibilityDetails(visibility: PostVisibility) {
  const values: Record<
    PostVisibility,
    { label: string; icon: Extract<IconName, 'globe' | 'users' | 'lock'> }
  > = {
    campus: { label: 'Comunidad Konea', icon: 'users' },
    connections: { label: 'Conexiones', icon: 'lock' },
    public: { label: 'Público', icon: 'globe' },
  }
  return values[visibility]
}

function statusLabel(status: ModerationStatus) {
  const values: Record<ModerationStatus, string> = {
    pending: 'En revisión',
    approved: 'Aprobada',
    rejected: 'Rechazada',
  }
  return values[status]
}

function userRoleLabel(role: KoneaUser['role']) {
  const labels: Record<KoneaUser['role'], string> = {
    student: 'Estudiante',
    professor: 'Profesor/a',
    moderator: 'Moderación',
    admin: 'Administración',
  }
  return labels[role]
}

function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: IconName
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <section className="portal-empty">
      <span className="portal-empty__icon">
        <PortalIcon name={icon} />
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  )
}

type ReportTarget = {
  resourceType: ReportResourceType
  resourceId: string
  label: string
}

function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
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
      className="portal-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="portal-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Imagen ampliada"
      >
        <button type="button" onClick={onClose} aria-label="Cerrar imagen">
          <PortalIcon name="close" />
        </button>
        <img src={src} alt={alt} />
      </section>
    </div>
  )
}

function ReportModal({
  target,
  onClose,
  onSent,
}: {
  target: ReportTarget
  onClose: () => void
  onSent: () => void
}) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sending) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, sending])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reason) return
    setSending(true)
    setError('')
    try {
      await createReport({
        resourceType: target.resourceType,
        resourceId: target.resourceId,
        reason,
        details: details.trim() || null,
      })
      onSent()
      onClose()
    } catch (submitError) {
      setError(readableError(submitError, 'No pudimos enviar el reporte.'))
      setSending(false)
    }
  }

  return (
    <div
      className="portal-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sending) onClose()
      }}
    >
      <section
        className="portal-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
      >
        <header>
          <div>
            <span className="portal-card-kicker">Comunidad segura</span>
            <h2 id="report-title">Reportar {target.label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Cerrar reporte"
          >
            <PortalIcon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>Motivo</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
              disabled={sending}
              autoFocus
            >
              <option value="">Selecciona un motivo</option>
              <option value="Contenido ofensivo o acoso">
                Contenido ofensivo o acoso
              </option>
              <option value="Spam o contenido engañoso">
                Spam o contenido engañoso
              </option>
              <option value="Información personal o peligrosa">
                Información personal o peligrosa
              </option>
              <option value="No corresponde a la comunidad">
                No corresponde a la comunidad
              </option>
              <option value="Otro motivo">Otro motivo</option>
            </select>
          </label>
          <label>
            <span>Detalles opcionales</span>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={1000}
              rows={4}
              disabled={sending}
              placeholder="Ayúdanos a comprender el problema…"
            />
            <small>{details.length}/1000</small>
          </label>
          {error && (
            <p className="portal-inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="portal-form-actions">
            <button
              className="portal-secondary-button"
              type="button"
              onClick={onClose}
              disabled={sending}
            >
              Cancelar
            </button>
            <button
              className="portal-primary-button"
              type="submit"
              disabled={sending || !reason}
            >
              {sending ? 'Enviando…' : 'Enviar reporte'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

function commentDescendants(comments: Comment[], commentId: string) {
  const ids = new Set([commentId])
  let changed = true
  while (changed) {
    changed = false
    for (const comment of comments) {
      if (
        comment.parentCommentId &&
        ids.has(comment.parentCommentId) &&
        !ids.has(comment.id)
      ) {
        ids.add(comment.id)
        changed = true
      }
    }
  }
  return ids
}

function CommentBranch({
  comment,
  childrenByParent,
  editingId,
  editDraft,
  busyId,
  depth,
  currentUserId,
  onReply,
  onEditStart,
  onEditDraft,
  onEditSave,
  onEditCancel,
  onDelete,
  onReport,
}: {
  comment: Comment
  childrenByParent: Map<string, Comment[]>
  editingId: string | null
  editDraft: string
  busyId: string | null
  depth: number
  currentUserId: string
  onReply: (comment: Comment) => void
  onEditStart: (comment: Comment) => void
  onEditDraft: (value: string) => void
  onEditSave: (comment: Comment) => void
  onEditCancel: () => void
  onDelete: (comment: Comment) => void
  onReport: (comment: Comment) => void
}) {
  const replies = childrenByParent.get(comment.id) ?? []
  const isEditing = editingId === comment.id
  const wasEdited = comment.updatedAt !== comment.createdAt

  return (
    <div
      className={`portal-comment-branch${depth ? ' portal-comment-branch--reply' : ''}`}
    >
      <article className="portal-comment">
        <Avatar
          name={comment.author.displayName}
          url={comment.author.avatarUrl}
          size="small"
        />
        <div className="portal-comment__bubble">
          <strong>{comment.author.displayName}</strong>
          {isEditing ? (
            <div className="portal-comment-edit">
              <textarea
                value={editDraft}
                onChange={(event) => onEditDraft(event.target.value)}
                maxLength={1000}
                rows={2}
                disabled={busyId === comment.id}
                aria-label="Editar comentario"
              />
              <div>
                <button
                  type="button"
                  onClick={onEditCancel}
                  disabled={busyId === comment.id}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => onEditSave(comment)}
                  disabled={busyId === comment.id || !editDraft.trim()}
                >
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <p>{comment.content}</p>
          )}
          <div className="portal-comment__meta">
            <time dateTime={comment.createdAt}>
              {formatDate(comment.createdAt)}
              {wasEdited ? ' · Editado' : ''}
            </time>
            <button type="button" onClick={() => onReply(comment)}>
              <PortalIcon name="reply" /> Responder
            </button>
            {comment.canEdit && (
              <button type="button" onClick={() => onEditStart(comment)}>
                Editar
              </button>
            )}
            {comment.canDelete && (
              <button
                type="button"
                onClick={() => onDelete(comment)}
                disabled={busyId === comment.id}
              >
                Eliminar
              </button>
            )}
            {comment.author.id !== currentUserId && (
              <button type="button" onClick={() => onReport(comment)}>
                <PortalIcon name="flag" /> Reportar
              </button>
            )}
          </div>
        </div>
      </article>
      {replies.length > 0 && (
        <div className="portal-comment-replies">
          {replies.map((reply) => (
            <CommentBranch
              key={reply.id}
              comment={reply}
              childrenByParent={childrenByParent}
              editingId={editingId}
              editDraft={editDraft}
              busyId={busyId}
              depth={depth + 1}
              currentUserId={currentUserId}
              onReply={onReply}
              onEditStart={onEditStart}
              onEditDraft={onEditDraft}
              onEditSave={onEditSave}
              onEditCancel={onEditCancel}
              onDelete={onDelete}
              onReport={onReport}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PostCard({
  post,
  currentUser,
  onPostUpdate,
  onDelete,
  onCommentCountChange,
}: {
  post: Post
  currentUser: KoneaUser
  onPostUpdate: (postId: string, update: Partial<Post>) => void
  onDelete: (postId: string) => Promise<void>
  onCommentCountChange: (postId: string, delta: number) => void
}) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [commentBusyId, setCommentBusyId] = useState<string | null>(null)
  const [commentSaving, setCommentSaving] = useState(false)
  const [likeSaving, setLikeSaving] = useState(false)
  const [shareSaving, setShareSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionStatus, setActionStatus] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const visibility = visibilityDetails(post.visibility)

  const childrenByParent = useMemo(() => {
    const map = new Map<string, Comment[]>()
    for (const comment of comments ?? []) {
      if (!comment.parentCommentId) continue
      map.set(comment.parentCommentId, [
        ...(map.get(comment.parentCommentId) ?? []),
        comment,
      ])
    }
    return map
  }, [comments])
  const commentIds = useMemo(
    () => new Set((comments ?? []).map((comment) => comment.id)),
    [comments],
  )
  const rootComments = (comments ?? []).filter(
    (comment) =>
      !comment.parentCommentId || !commentIds.has(comment.parentCommentId),
  )

  const loadComments = async () => {
    setCommentsLoading(true)
    setCommentsError('')
    try {
      setComments(await getPostComments(post.id))
    } catch (error) {
      setCommentsError(
        readableError(error, 'No pudimos cargar los comentarios.'),
      )
    } finally {
      setCommentsLoading(false)
    }
  }

  const toggleComments = () => {
    const shouldOpen = !commentsOpen
    setCommentsOpen(shouldOpen)
    if (shouldOpen && comments === null && !commentsLoading) void loadComments()
  }

  const handleLike = async () => {
    setLikeSaving(true)
    setActionError('')
    try {
      const result = post.likedByMe
        ? await unlikePost(post.id)
        : await likePost(post.id)
      onPostUpdate(post.id, {
        likedByMe: result.liked,
        likeCount: result.likeCount,
      })
    } catch (error) {
      setActionError(readableError(error, 'No pudimos actualizar tu reacción.'))
    } finally {
      setLikeSaving(false)
    }
  }

  const handleShare = async () => {
    if (shareSaving) return
    setShareSaving(true)
    setActionError('')
    setActionStatus('')
    const url = `${window.location.origin}${window.location.pathname}#post-${post.id}`
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Publicación de ${post.author.displayName} en Konea`,
          text: post.content.slice(0, 180),
          url,
        })
      } else {
        await copyText(url)
        setActionStatus('Enlace copiado al portapapeles.')
      }
      const result = await sharePost(post.id)
      onPostUpdate(post.id, { shareCount: result.shareCount })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setActionError(
        readableError(error, 'No pudimos compartir esta publicación.'),
      )
    } finally {
      setShareSaving(false)
    }
  }

  const handleDelete = async () => {
    if (
      !window.confirm(
        '¿Quieres eliminar esta publicación? Esta acción no se puede deshacer.',
      )
    )
      return
    setDeleting(true)
    setActionError('')
    try {
      await onDelete(post.id)
    } catch (error) {
      setActionError(
        readableError(error, 'No pudimos eliminar la publicación.'),
      )
      setDeleting(false)
    }
  }

  const handleComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = commentDraft.trim()
    if (!content) return
    setCommentSaving(true)
    setActionError('')
    try {
      const comment = await createComment(post.id, content, replyingTo?.id)
      setComments((current) => [...(current ?? []), comment])
      setCommentsError('')
      setCommentDraft('')
      setReplyingTo(null)
      onCommentCountChange(post.id, 1)
    } catch (error) {
      setActionError(readableError(error, 'No pudimos publicar el comentario.'))
    } finally {
      setCommentSaving(false)
    }
  }

  const saveCommentEdit = async (comment: Comment) => {
    const content = editDraft.trim()
    if (!content) return
    setCommentBusyId(comment.id)
    setActionError('')
    try {
      const updated = await updateComment(post.id, comment.id, content)
      setComments(
        (current) =>
          current?.map((item) => (item.id === comment.id ? updated : item)) ??
          null,
      )
      setEditingId(null)
      setEditDraft('')
    } catch (error) {
      setActionError(readableError(error, 'No pudimos editar el comentario.'))
    } finally {
      setCommentBusyId(null)
    }
  }

  const removeComment = async (comment: Comment) => {
    if (!window.confirm('¿Eliminar este comentario y sus respuestas?')) return
    setCommentBusyId(comment.id)
    setActionError('')
    try {
      await deleteComment(post.id, comment.id)
      const removedIds = commentDescendants(comments ?? [], comment.id)
      setComments(
        (current) =>
          current?.filter((item) => !removedIds.has(item.id)) ?? null,
      )
      onCommentCountChange(post.id, -removedIds.size)
      if (replyingTo && removedIds.has(replyingTo.id)) setReplyingTo(null)
    } catch (error) {
      setActionError(readableError(error, 'No pudimos eliminar el comentario.'))
    } finally {
      setCommentBusyId(null)
    }
  }

  return (
    <article className="portal-card portal-post" id={`post-${post.id}`}>
      <header className="portal-post__header">
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
        <div className="portal-post__identity">
          <strong>{post.author.displayName}</strong>
          <span>
            @{post.author.username} · {formatDate(post.createdAt)}
          </span>
        </div>
        {post.contentType === 'announcement' && (
          <span className="portal-content-type">
            <PortalIcon name="megaphone" /> Anuncio
          </span>
        )}
        <span
          className="portal-visibility"
          title={`Visibilidad: ${visibility.label}`}
        >
          <PortalIcon name={visibility.icon} />
          {visibility.label}
        </span>
      </header>

      {post.moderationStatus !== 'approved' && (
        <div
          className={`portal-moderation-note portal-moderation-note--${post.moderationStatus}`}
        >
          <strong>{statusLabel(post.moderationStatus)}</strong>
          <span>
            {post.moderationReason ??
              (post.moderationStatus === 'pending'
                ? 'Solo tú puedes verla mientras el equipo la revisa.'
                : 'Consulta el motivo antes de volver a publicarla.')}
          </span>
        </div>
      )}

      <p className="portal-post__content">{post.content}</p>
      {post.imageUrl && (
        <button
          className="portal-post__image-button"
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label="Ampliar imagen de la publicación"
        >
          <img
            className="portal-post__image"
            src={post.imageUrl}
            alt={`Imagen compartida por ${post.author.displayName}`}
            loading="lazy"
          />
        </button>
      )}

      <div className="portal-post__actions">
        <button
          className={`portal-action${post.likedByMe ? ' portal-action--active' : ''}`}
          type="button"
          onClick={() => void handleLike()}
          disabled={likeSaving}
          aria-pressed={post.likedByMe}
          aria-label={`${post.likedByMe ? 'Quitar Me gusta' : 'Dar Me gusta'}. ${post.likeCount} reacciones`}
        >
          <PortalIcon name="heart" />
          <span>{post.likeCount || 'Me gusta'}</span>
        </button>
        <button
          className="portal-action"
          type="button"
          onClick={toggleComments}
          aria-expanded={commentsOpen}
          aria-controls={`comments-${post.id}`}
        >
          <PortalIcon name="comment" />
          <span>{post.commentCount || 'Comentar'}</span>
        </button>
        <button
          className="portal-action"
          type="button"
          onClick={() => void handleShare()}
          disabled={shareSaving}
          aria-label={`Compartir. ${post.shareCount} veces compartida`}
        >
          <PortalIcon name="share" />
          <span>{post.shareCount || 'Compartir'}</span>
        </button>
        {post.author.id !== currentUser.id && (
          <button
            className="portal-action"
            type="button"
            onClick={() =>
              setReportTarget({
                resourceType: 'post',
                resourceId: post.id,
                label: 'publicación',
              })
            }
          >
            <PortalIcon name="flag" />
            <span>Reportar</span>
          </button>
        )}
        {post.canDelete && (
          <button
            className="portal-action portal-action--danger"
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            <PortalIcon name="trash" />
            <span>{deleting ? 'Eliminando…' : 'Eliminar'}</span>
          </button>
        )}
      </div>

      {actionError && (
        <p className="portal-inline-error" role="alert">
          {actionError}
        </p>
      )}
      {actionStatus && (
        <p className="portal-inline-status" role="status">
          {actionStatus}
        </p>
      )}

      {commentsOpen && (
        <section className="portal-comments" id={`comments-${post.id}`}>
          <h3>Comentarios</h3>
          {commentsLoading ? (
            <div
              className="portal-loading portal-loading--compact"
              role="status"
            >
              <span className="portal-spinner" /> Cargando comentarios…
            </div>
          ) : commentsError ? (
            <div className="portal-comments__error" role="alert">
              <p>{commentsError}</p>
              <button type="button" onClick={() => void loadComments()}>
                Intentar nuevamente
              </button>
            </div>
          ) : rootComments.length ? (
            <div className="portal-comment-list">
              {rootComments.map((comment) => (
                <CommentBranch
                  key={comment.id}
                  comment={comment}
                  childrenByParent={childrenByParent}
                  editingId={editingId}
                  editDraft={editDraft}
                  busyId={commentBusyId}
                  depth={0}
                  currentUserId={currentUser.id}
                  onReply={(target) => {
                    setReplyingTo(target)
                    setCommentsOpen(true)
                  }}
                  onEditStart={(target) => {
                    setEditingId(target.id)
                    setEditDraft(target.content)
                  }}
                  onEditDraft={setEditDraft}
                  onEditSave={(target) => void saveCommentEdit(target)}
                  onEditCancel={() => {
                    setEditingId(null)
                    setEditDraft('')
                  }}
                  onDelete={(target) => void removeComment(target)}
                  onReport={(target) =>
                    setReportTarget({
                      resourceType: 'comment',
                      resourceId: target.id,
                      label: 'comentario',
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <p className="portal-comments__empty">
              Aún no hay comentarios. Puedes iniciar la conversación.
            </p>
          )}

          {!commentsError && !commentsLoading && (
            <form className="portal-comment-form-wrap" onSubmit={handleComment}>
              {replyingTo && (
                <div className="portal-reply-context">
                  <span>
                    Respondiendo a{' '}
                    <strong>{replyingTo.author.displayName}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    aria-label="Cancelar respuesta"
                  >
                    <PortalIcon name="close" />
                  </button>
                </div>
              )}
              <div className="portal-comment-form">
                <Avatar
                  name={currentUser.displayName}
                  url={currentUser.avatarUrl}
                  size="small"
                />
                <label
                  className="portal-sr-only"
                  htmlFor={`comment-${post.id}`}
                >
                  Escribe un comentario
                </label>
                <input
                  id={`comment-${post.id}`}
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  maxLength={1000}
                  placeholder={
                    replyingTo
                      ? `Responder a ${replyingTo.author.displayName}…`
                      : 'Aporta a la conversación…'
                  }
                  disabled={commentSaving}
                />
                <button
                  type="submit"
                  disabled={commentSaving || !commentDraft.trim()}
                >
                  {commentSaving
                    ? 'Enviando…'
                    : replyingTo
                      ? 'Responder'
                      : 'Publicar'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {lightboxOpen && post.imageUrl && (
        <ImageLightbox
          src={post.imageUrl}
          alt={`Imagen compartida por ${post.author.displayName}`}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      {reportTarget && (
        <ReportModal
          key={`${reportTarget.resourceType}:${reportTarget.resourceId}`}
          target={reportTarget}
          onClose={() => setReportTarget(null)}
          onSent={() =>
            setActionStatus('Gracias. El reporte fue enviado a moderación.')
          }
        />
      )}
    </article>
  )
}

function FeedView({ user }: { user: KoneaUser }) {
  const [posts, setPosts] = useState<Post[]>([])
  const [activeType, setActiveType] = useState<PostContentType>('community')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<PostVisibility>('campus')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [uploadedImageUrl, setUploadedImageUrl] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const imageInput = useRef<HTMLInputElement>(null)
  const previewObjectUrl = useRef('')
  const canAnnounce =
    user.role === 'professor' ||
    user.role === 'moderator' ||
    user.role === 'admin'

  const clearComposerImage = useCallback(() => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
    previewObjectUrl.current = ''
    setImageFile(null)
    setImagePreview('')
    setUploadedImageUrl('')
    setUploadProgress(0)
    if (imageInput.current) imageInput.current.value = ''
  }, [])

  useEffect(
    () => () => {
      if (previewObjectUrl.current)
        URL.revokeObjectURL(previewObjectUrl.current)
    },
    [],
  )

  const loadPosts = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      setPosts(await getPosts())
    } catch (error) {
      setLoadError(readableError(error, 'No pudimos cargar el feed.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let scrollTimer = 0

    getPosts()
      .then(async (loadedPosts) => {
        const postId = window.location.hash.match(
          /^#post-([0-9a-f-]{36})$/i,
        )?.[1]
        let target = postId
          ? loadedPosts.find((post) => post.id === postId)
          : undefined

        if (postId && !target) {
          try {
            target = await getPost(postId)
            loadedPosts = [target, ...loadedPosts]
          } catch {
            // Un enlace antiguo no debe impedir abrir el feed normal.
          }
        }

        if (!cancelled) {
          setPosts(loadedPosts)
          if (target) {
            setActiveType(target.contentType)
            scrollTimer = window.setTimeout(() => {
              document.getElementById(`post-${target.id}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
              })
            }, 80)
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLoadError(readableError(error, 'No pudimos cargar el feed.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
      window.clearTimeout(scrollTimer)
    }
  }, [])

  const selectImage = (file: File | undefined) => {
    if (!file) return
    const validationError = validateImage(file)
    if (validationError) {
      setPublishError(validationError)
      if (imageInput.current) imageInput.current.value = ''
      return
    }
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
    const preview = URL.createObjectURL(file)
    previewObjectUrl.current = preview
    setImageFile(file)
    setImagePreview(preview)
    setUploadedImageUrl('')
    setUploadProgress(0)
    setPublishError('')
  }

  const handlePublish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanContent = content.trim()
    if (!cleanContent || (activeType === 'announcement' && !canAnnounce)) return
    setPublishing(true)
    setPublishError('')
    try {
      let imageUrl = uploadedImageUrl
      if (imageFile && !imageUrl) {
        setUploadProgress(1)
        const uploaded = await uploadImage(imageFile, setUploadProgress)
        imageUrl = uploaded.url
        setUploadedImageUrl(imageUrl)
      }
      const post = await createPost({
        content: cleanContent,
        contentType: activeType,
        visibility,
        ...(imageUrl ? { imageUrl } : {}),
      })
      setPosts((current) => [post, ...current])
      setContent('')
      clearComposerImage()
    } catch (error) {
      setPublishError(readableError(error, 'No pudimos crear la publicación.'))
    } finally {
      setPublishing(false)
    }
  }

  const updatePost = (postId: string, update: Partial<Post>) =>
    setPosts((current) =>
      current.map((post) =>
        post.id === postId ? { ...post, ...update } : post,
      ),
    )
  const handleDelete = async (postId: string) => {
    await deletePost(postId)
    setPosts((current) => current.filter((post) => post.id !== postId))
  }
  const changeCommentCount = (postId: string, delta: number) =>
    setPosts((current) =>
      current.map((post) =>
        post.id === postId
          ? { ...post, commentCount: Math.max(0, post.commentCount + delta) }
          : post,
      ),
    )
  const counts = useMemo(
    () => ({
      announcement: posts.filter((post) => post.contentType === 'announcement')
        .length,
      community: posts.filter((post) => post.contentType === 'community')
        .length,
    }),
    [posts],
  )
  const visiblePosts = posts.filter((post) => post.contentType === activeType)
  const showComposer = activeType === 'community' || canAnnounce

  return (
    <div className="portal-feed-layout">
      <div className="portal-feed-column">
        <div
          className="portal-feed-tabs"
          role="tablist"
          aria-label="Tipo de publicaciones"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeType === 'announcement'}
            className={activeType === 'announcement' ? 'is-active' : ''}
            onClick={() => setActiveType('announcement')}
          >
            <PortalIcon name="megaphone" /> Anuncios{' '}
            <span>{counts.announcement}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeType === 'community'}
            className={activeType === 'community' ? 'is-active' : ''}
            onClick={() => setActiveType('community')}
          >
            <PortalIcon name="users" /> Comunidad{' '}
            <span>{counts.community}</span>
          </button>
        </div>

        {showComposer ? (
          <form
            className="portal-card portal-composer"
            onSubmit={handlePublish}
          >
            <div className="portal-composer__body">
              <Avatar name={user.displayName} url={user.avatarUrl} />
              <div className="portal-composer__field">
                <label htmlFor="new-post">
                  {activeType === 'announcement'
                    ? 'Publica un anuncio para la comunidad'
                    : 'Comparte algo con tu comunidad'}
                </label>
                <textarea
                  id="new-post"
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder={
                    activeType === 'announcement'
                      ? 'Escribe información clara y relevante…'
                      : `¿Qué estás pensando, ${user.displayName.split(' ')[0] || user.username}?`
                  }
                  disabled={publishing}
                />
                <span className="portal-character-count">
                  {content.length}/2000
                </span>
              </div>
            </div>

            {imagePreview && (
              <div className="portal-composer-image">
                <img
                  src={imagePreview}
                  alt="Vista previa para la publicación"
                />
                <button
                  type="button"
                  onClick={clearComposerImage}
                  disabled={publishing}
                  aria-label="Quitar imagen"
                >
                  <PortalIcon name="close" />
                </button>
                {publishing && uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="portal-upload-progress" role="status">
                    <span style={{ width: `${uploadProgress}%` }} />
                    <small>Subiendo imagen: {uploadProgress}%</small>
                  </div>
                )}
              </div>
            )}

            <div className="portal-composer__footer">
              <div className="portal-composer-tools">
                <label className="portal-select-label">
                  <span className="portal-sr-only">Visibilidad</span>
                  <PortalIcon name={visibilityDetails(visibility).icon} />
                  <select
                    value={visibility}
                    onChange={(event) =>
                      setVisibility(event.target.value as PostVisibility)
                    }
                    disabled={publishing}
                  >
                    <option value="campus">Comunidad Konea</option>
                    <option value="connections">Solo conexiones</option>
                    <option value="public">Público</option>
                  </select>
                </label>
                <label className="portal-image-picker">
                  <PortalIcon name="image" />
                  <span>{imageFile ? 'Cambiar imagen' : 'Agregar imagen'}</span>
                  <input
                    ref={imageInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(event) => selectImage(event.target.files?.[0])}
                    disabled={publishing}
                  />
                </label>
              </div>
              <button
                className="portal-primary-button"
                type="submit"
                disabled={publishing || !content.trim()}
              >
                {publishing
                  ? uploadProgress > 0 && uploadProgress < 100
                    ? `Subiendo ${uploadProgress}%`
                    : 'Publicando…'
                  : activeType === 'announcement'
                    ? 'Publicar anuncio'
                    : 'Publicar'}
              </button>
            </div>
            {publishError && (
              <p className="portal-inline-error" role="alert">
                {publishError}
              </p>
            )}
          </form>
        ) : (
          <section className="portal-announcement-notice">
            <PortalIcon name="megaphone" />
            <div>
              <strong>Espacio de anuncios</strong>
              <p>
                Profesores y el equipo de moderación publican aquí información
                importante.
              </p>
            </div>
          </section>
        )}

        {loading ? (
          <div className="portal-loading" role="status">
            <span className="portal-spinner" />
            <span>Cargando publicaciones…</span>
          </div>
        ) : loadError ? (
          <EmptyState
            icon="refresh"
            title="El feed no está disponible"
            action={
              <button
                className="portal-secondary-button"
                type="button"
                onClick={() => void loadPosts()}
              >
                Intentar nuevamente
              </button>
            }
          >
            {loadError}
          </EmptyState>
        ) : visiblePosts.length === 0 ? (
          <EmptyState
            icon={activeType === 'announcement' ? 'megaphone' : 'feed'}
            title={
              activeType === 'announcement'
                ? 'Aún no hay anuncios'
                : 'Tu comunidad está comenzando'
            }
          >
            {activeType === 'announcement'
              ? 'Los avisos importantes de profesores y moderación aparecerán aquí.'
              : 'Sé la primera persona en compartir una idea, pregunta o logro.'}
          </EmptyState>
        ) : (
          <div
            className="portal-post-list"
            aria-label={
              activeType === 'announcement'
                ? 'Anuncios'
                : 'Publicaciones de la comunidad'
            }
          >
            {visiblePosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={user}
                onPostUpdate={updatePost}
                onDelete={handleDelete}
                onCommentCountChange={changeCommentCount}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="portal-rail" aria-label="Información de tu comunidad">
        <section className="portal-card portal-community-card">
          <span className="portal-card-kicker">Tu comunidad</span>
          <h2>{user.institution || 'Konea Campus'}</h2>
          <p>
            {user.career ||
              'Completa tu carrera en el perfil para conectar con estudiantes afines.'}
          </p>
        </section>
        <section className="portal-card portal-info-card">
          <span className="portal-info-card__icon">
            <PortalIcon name="shield" />
          </span>
          <div>
            <h2>Una comunidad cuidada</h2>
            <p>
              Puedes reportar publicaciones y comentarios; el equipo revisará
              cada caso.
            </p>
          </div>
        </section>
      </aside>
    </div>
  )
}

function ProfileImageUpload({
  label,
  value,
  variant,
  disabled,
  onChange,
  onUploadingChange,
}: {
  label: string
  value: string | null
  variant: 'avatar' | 'cover'
  disabled: boolean
  onChange: (value: string | null) => void
  onUploadingChange: (uploading: boolean) => void
}) {
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const selectFile = (file: File | undefined) => {
    if (!file) return
    const validationError = validateImage(file)
    if (validationError) {
      setError(validationError)
      if (input.current) input.current.value = ''
      return
    }
    setError('')
    setPendingFile(file)
  }

  const uploadCroppedFile = async (file: File) => {
    setPendingFile(null)
    setProgress(1)
    onUploadingChange(true)
    try {
      const uploaded = await uploadImage(file, setProgress)
      onChange(uploaded.url)
    } catch (uploadError) {
      setError(
        readableError(uploadError, `No pudimos subir ${label.toLowerCase()}.`),
      )
    } finally {
      setProgress(0)
      onUploadingChange(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className={`portal-profile-upload portal-profile-upload--${variant}`}>
      <span>{label}</span>
      <div className="portal-profile-upload__preview">
        {value ? (
          <img src={value} alt={`Vista previa: ${label}`} />
        ) : (
          <span>
            <PortalIcon name="image" /> Sin imagen
          </span>
        )}
      </div>
      {progress > 0 && (
        <div className="portal-upload-progress" role="status">
          <span style={{ width: `${progress}%` }} />
          <small>Subiendo: {progress}%</small>
        </div>
      )}
      <div className="portal-profile-upload__actions">
        <label className="portal-secondary-button">
          <PortalIcon name="image" />
          {value ? 'Cambiar' : 'Subir imagen'}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => selectFile(event.target.files?.[0])}
            disabled={disabled || progress > 0}
          />
        </label>
        {value && (
          <button
            className="portal-secondary-button"
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled || progress > 0}
          >
            Quitar
          </button>
        )}
      </div>
      {error && (
        <p className="portal-inline-error" role="alert">
          {error}
        </p>
      )}
      {pendingFile && (
        <ImageCropDialog
          file={pendingFile}
          variant={variant}
          onCancel={() => {
            setPendingFile(null)
            if (input.current) input.current.value = ''
          }}
          onConfirm={(file) => void uploadCroppedFile(file)}
        />
      )}
    </div>
  )
}

type ProfileActivityTab = 'posts' | 'likes' | 'media'

function ProfileView({
  user,
  onUserChange,
}: {
  user: KoneaUser
  onUserChange: (user: KoneaUser) => void
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activityTab, setActivityTab] = useState<ProfileActivityTab>('posts')
  const [profileStats, setProfileStats] = useState<{
    posts: number
    projects: number
    achievements: number
  } | null>(null)
  const [profilePosts, setProfilePosts] = useState<Post[]>([])
  const [likedPosts, setLikedPosts] = useState<Post[]>([])
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityError, setActivityError] = useState('')
  const [catalog, setCatalog] = useState<ProfileCatalog | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [form, setForm] = useState<ProfileUpdate>({
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    institution: user.institution,
    career: user.career,
    avatarUrl: user.avatarUrl,
    coverUrl: user.coverUrl,
    campus: user.campus,
    website: user.website,
    education: user.education,
    projects: user.projects,
    achievements: user.achievements,
  })

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    setActivityError('')
    try {
      const [profileResult, likes] = await Promise.all([
        getPublicUser(user.id),
        getLikedPostsByUser(user.id),
      ])
      setProfileStats(profileResult.user.stats)
      setProfilePosts(profileResult.posts)
      setLikedPosts(likes)
    } catch (loadError) {
      setActivityError(
        readableError(
          loadError,
          'No pudimos cargar la actividad de tu perfil.',
        ),
      )
    } finally {
      setActivityLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    Promise.all([getPublicUser(user.id), getLikedPostsByUser(user.id)])
      .then(([profileResult, likes]) => {
        if (!cancelled) {
          setProfileStats(profileResult.user.stats)
          setProfilePosts(profileResult.posts)
          setLikedPosts(likes)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setActivityError(
            readableError(
              loadError,
              'No pudimos cargar la actividad de tu perfil.',
            ),
          )
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    getProfileCatalog()
      .then((result) => {
        if (!cancelled) setCatalog(result)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setCatalogError(
            readableError(
              loadError,
              'No pudimos cargar las opciones del perfil.',
            ),
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setField = <Field extends keyof ProfileUpdate>(
    field: Field,
    value: ProfileUpdate[Field],
  ) => setForm((current) => ({ ...current, [field]: value }))
  const resetForm = (source = user) =>
    setForm({
      username: source.username,
      displayName: source.displayName,
      bio: source.bio,
      institution: source.institution,
      career: source.career,
      avatarUrl: source.avatarUrl,
      coverUrl: source.coverUrl,
      campus: source.campus,
      website: source.website,
      education: source.education,
      projects: source.projects,
      achievements: source.achievements,
    })

  const cancelEditing = () => {
    setEditing(false)
    setError('')
    resetForm()
  }

  const beginEditing = () => {
    resetForm()
    setEditing(true)
    setError('')
    setSuccess('')
    window.requestAnimationFrame(() =>
      document
        .getElementById('profile-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }

  const updateEducation = (id: string, update: Partial<ProfileEducation>) =>
    setField(
      'education',
      form.education.map((entry) =>
        entry.id === id ? { ...entry, ...update } : entry,
      ),
    )
  const updateProject = (id: string, update: Partial<ProfileProject>) =>
    setField(
      'projects',
      form.projects.map((entry) =>
        entry.id === id ? { ...entry, ...update } : entry,
      ),
    )
  const updateAchievement = (id: string, update: Partial<ProfileAchievement>) =>
    setField(
      'achievements',
      form.achievements.map((entry) =>
        entry.id === id ? { ...entry, ...update } : entry,
      ),
    )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const hasOption = (value: string | null, options: string[] | undefined) =>
      !value ||
      Boolean(
        options?.some(
          (option) =>
            option.localeCompare(value, 'es-CL', { sensitivity: 'base' }) === 0,
        ),
      )
    const invalidEducation = form.education.find(
      (entry) =>
        !entry.institution.trim() ||
        !entry.program.trim() ||
        !hasOption(entry.institution, catalog?.institutions) ||
        !hasOption(entry.program, catalog?.careers) ||
        (!entry.current &&
          entry.startYear &&
          entry.endYear &&
          entry.endYear < entry.startYear),
    )
    const invalidProject = form.projects.find(
      (entry) =>
        entry.title.trim().length < 2 || entry.description.trim().length < 2,
    )
    const invalidAchievement = form.achievements.find(
      (entry) =>
        entry.title.trim().length < 2 || entry.issuer.trim().length < 2,
    )
    let validationMessage = ''
    if (!catalog) {
      validationMessage =
        catalogError || 'Espera mientras cargamos las opciones oficiales.'
    } else if (form.displayName.trim().length < 2) {
      validationMessage = 'El nombre visible debe tener al menos 2 caracteres.'
    } else if (!/^[a-z0-9._]{3,30}$/.test(form.username.trim().toLowerCase())) {
      validationMessage =
        'El nombre de usuario debe tener entre 3 y 30 caracteres y usar solo letras minúsculas, números, punto o guion bajo.'
    } else if (!hasOption(form.institution, catalog.institutions)) {
      validationMessage =
        'Selecciona una institución desde las opciones oficiales.'
    } else if (!hasOption(form.campus, catalog.campuses)) {
      validationMessage =
        'Selecciona una sede o campus desde las opciones oficiales.'
    } else if (!hasOption(form.career, catalog.careers)) {
      validationMessage = 'Selecciona una carrera desde las opciones oficiales.'
    } else if (invalidEducation) {
      validationMessage =
        'Revisa la formación académica: institución, carrera y años deben ser válidos.'
    } else if (invalidProject) {
      validationMessage =
        'Cada proyecto necesita un título y una descripción de al menos 2 caracteres.'
    } else if (invalidAchievement) {
      validationMessage =
        'Cada logro necesita un título y una institución emisora.'
    }

    if (validationMessage) {
      setError(validationMessage)
      setSuccess('')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    const cleaned: ProfileUpdate = {
      username: form.username.trim().toLowerCase(),
      displayName: form.displayName.trim(),
      bio: form.bio?.trim() || null,
      institution: form.institution?.trim() || null,
      career: form.career?.trim() || null,
      avatarUrl: form.avatarUrl?.trim() || null,
      coverUrl: form.coverUrl?.trim() || null,
      campus: form.campus?.trim() || null,
      website: form.website?.trim() || null,
      education: form.education.map((entry) => ({
        ...entry,
        institution: entry.institution.trim(),
        program: entry.program.trim(),
      })),
      projects: form.projects.map((entry) => ({
        ...entry,
        title: entry.title.trim(),
        description: entry.description.trim(),
        url: entry.url?.trim() || null,
        repositoryUrl: entry.repositoryUrl?.trim() || null,
        imageUrl: entry.imageUrl?.trim() || null,
        technologies: entry.technologies
          .map((technology) => technology.trim())
          .filter(Boolean),
      })),
      achievements: form.achievements.map((entry) => ({
        ...entry,
        title: entry.title.trim(),
        issuer: entry.issuer.trim(),
        description: entry.description.trim(),
        credentialUrl: entry.credentialUrl?.trim() || null,
      })),
    }
    try {
      const updatedUser = await updateProfile(cleaned)
      resetForm(updatedUser)
      const updateAuthor = (post: Post): Post =>
        post.author.id === updatedUser.id
          ? {
              ...post,
              author: {
                ...post.author,
                username: updatedUser.username,
                displayName: updatedUser.displayName,
                avatarUrl: updatedUser.avatarUrl,
              },
            }
          : post
      setProfilePosts((current) => current.map(updateAuthor))
      setLikedPosts((current) => current.map(updateAuthor))
      onUserChange(updatedUser)
      setEditing(false)
      setSuccess('Tu perfil se actualizó correctamente.')
    } catch (submitError) {
      setError(readableError(submitError, 'No pudimos actualizar tu perfil.'))
    } finally {
      setSaving(false)
    }
  }

  const updateActivityPost = (postId: string, update: Partial<Post>) => {
    const patch = (post: Post) =>
      post.id === postId ? { ...post, ...update } : post
    setProfilePosts((current) => current.map(patch))
    setLikedPosts((current) => {
      if (update.likedByMe === false) {
        return current.filter((post) => post.id !== postId)
      }
      if (
        update.likedByMe === true &&
        !current.some((post) => post.id === postId)
      ) {
        const source = profilePosts.find((post) => post.id === postId)
        return source ? [{ ...source, ...update }, ...current] : current
      }
      return current.map(patch)
    })
  }
  const deleteActivityPost = async (postId: string) => {
    await deletePost(postId)
    setProfilePosts((current) => current.filter((post) => post.id !== postId))
    setLikedPosts((current) => current.filter((post) => post.id !== postId))
    setProfileStats((current) =>
      current ? { ...current, posts: Math.max(0, current.posts - 1) } : current,
    )
  }
  const changeActivityCommentCount = (postId: string, delta: number) =>
    updateActivityPost(postId, {
      commentCount: Math.max(
        0,
        ([...profilePosts, ...likedPosts].find((post) => post.id === postId)
          ?.commentCount ?? 0) + delta,
      ),
    })

  const activityPosts =
    activityTab === 'likes'
      ? likedPosts
      : activityTab === 'media'
        ? profilePosts.filter((post) => post.imageUrl)
        : profilePosts
  const uploadsBusy = uploadingAvatar || uploadingCover

  return (
    <div className="portal-profile-layout">
      <section className="portal-card portal-profile-summary">
        <div
          className={`portal-profile-cover${user.coverUrl ? ' portal-profile-cover--image' : ''}`}
          style={
            user.coverUrl
              ? { backgroundImage: `url("${user.coverUrl}")` }
              : undefined
          }
        />
        <div className="portal-profile-summary__body">
          <Avatar name={user.displayName} url={user.avatarUrl} size="large" />
          <div className="portal-profile-summary__title">
            <div>
              <h2>{user.displayName}</h2>
              <p>@{user.username}</p>
            </div>
            {!editing && (
              <button
                className="portal-secondary-button"
                type="button"
                onClick={beginEditing}
              >
                <PortalIcon name="edit" /> Editar perfil
              </button>
            )}
          </div>
          <p
            className={`portal-profile-bio${user.bio ? '' : ' portal-profile-bio--empty'}`}
          >
            {user.bio || 'Aún no has agregado una presentación.'}
          </p>
          {user.website && (
            <a
              className="portal-profile-website"
              href={user.website}
              target="_blank"
              rel="noreferrer"
            >
              <PortalIcon name="globe" /> Visitar sitio web
            </a>
          )}
          {profileStats && (
            <dl className="portal-profile-social-stats">
              <div>
                <dt>{profileStats.posts}</dt>
                <dd>Publicaciones</dd>
              </div>
              <div>
                <dt>{profileStats.projects}</dt>
                <dd>Proyectos</dd>
              </div>
              <div>
                <dt>{profileStats.achievements}</dt>
                <dd>Logros</dd>
              </div>
            </dl>
          )}
          <dl className="portal-profile-facts">
            <div>
              <dt>Institución</dt>
              <dd>{user.institution || 'Sin especificar'}</dd>
            </div>
            <div>
              <dt>Campus</dt>
              <dd>{user.campus || 'Sin especificar'}</dd>
            </div>
            <div>
              <dt>Carrera</dt>
              <dd>{user.career || 'Sin especificar'}</dd>
            </div>
            <div>
              <dt>Miembro desde</dt>
              <dd>{formatDate(user.createdAt)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section
        className="portal-card portal-profile-details"
        id="profile-editor"
      >
        <div className="portal-section-title">
          <div>
            <span className="portal-card-kicker">Cuenta</span>
            <h2>{editing ? 'Edita tu información' : 'Información personal'}</h2>
          </div>
          <span className={`portal-role portal-role--${user.role}`}>
            {userRoleLabel(user.role)}
          </span>
        </div>
        {editing ? (
          <form
            className="portal-profile-form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="portal-profile-upload-grid">
              <ProfileImageUpload
                label="Foto de perfil"
                value={form.avatarUrl}
                variant="avatar"
                disabled={saving}
                onChange={(value) => setField('avatarUrl', value)}
                onUploadingChange={setUploadingAvatar}
              />
              <ProfileImageUpload
                label="Imagen de portada"
                value={form.coverUrl}
                variant="cover"
                disabled={saving}
                onChange={(value) => setField('coverUrl', value)}
                onUploadingChange={setUploadingCover}
              />
            </div>
            <div className="portal-field-grid">
              <label>
                <span>Nombre visible</span>
                <input
                  value={form.displayName}
                  onChange={(event) =>
                    setField('displayName', event.target.value)
                  }
                  minLength={2}
                  maxLength={100}
                  required
                  disabled={saving || uploadsBusy}
                />
              </label>
              <label>
                <span>Nombre de usuario</span>
                <div className="portal-input-prefix">
                  <span>@</span>
                  <input
                    value={form.username}
                    onChange={(event) =>
                      setField('username', event.target.value.toLowerCase())
                    }
                    minLength={3}
                    maxLength={30}
                    pattern="[a-z0-9._]+"
                    title="Usa letras minúsculas, números, punto y guion bajo"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={saving || uploadsBusy}
                  />
                </div>
              </label>
              <SearchableSelect
                label="Institución"
                value={form.institution}
                options={catalog?.institutions ?? []}
                placeholder="Busca tu institución"
                disabled={saving || uploadsBusy || !catalog}
                onChange={(value) => {
                  setField('institution', value)
                  if (!value) {
                    setField('campus', null)
                    setField('career', null)
                  }
                }}
              />
              <SearchableSelect
                key={`campus-${form.institution ?? 'none'}`}
                label="Campus o sede"
                value={form.campus}
                options={catalog?.campuses ?? []}
                placeholder="Busca tu sede o campus"
                disabled={
                  saving || uploadsBusy || !catalog || !form.institution
                }
                onChange={(value) => setField('campus', value)}
              />
              <SearchableSelect
                key={`career-${form.institution ?? 'none'}`}
                label="Carrera"
                value={form.career}
                options={catalog?.careers ?? []}
                placeholder="Busca tu carrera"
                disabled={
                  saving || uploadsBusy || !catalog || !form.institution
                }
                onChange={(value) => setField('career', value)}
              />
              <label>
                <span>Sitio web</span>
                <input
                  type="text"
                  inputMode="url"
                  value={form.website ?? ''}
                  onChange={(event) => setField('website', event.target.value)}
                  placeholder="https://mi-portafolio.cl"
                  disabled={saving || uploadsBusy}
                />
              </label>
            </div>
            <label>
              <span>Presentación</span>
              <textarea
                value={form.bio ?? ''}
                onChange={(event) => setField('bio', event.target.value)}
                maxLength={280}
                rows={4}
                placeholder="Cuéntale a tu comunidad un poco sobre ti…"
                disabled={saving || uploadsBusy}
              />
              <small>{form.bio?.length ?? 0}/280</small>
            </label>
            <section className="portal-portfolio-editor">
              <div className="portal-portfolio-editor__heading">
                <div>
                  <span className="portal-card-kicker">Portafolio</span>
                  <h3>Formación académica</h3>
                </div>
                <button
                  className="portal-secondary-button"
                  type="button"
                  disabled={form.education.length >= 6 || saving || uploadsBusy}
                  onClick={() =>
                    setField('education', [
                      ...form.education,
                      {
                        id: crypto.randomUUID(),
                        institution: form.institution ?? '',
                        program: form.career ?? '',
                        startYear: null,
                        endYear: null,
                        current: false,
                      },
                    ])
                  }
                >
                  Agregar formación
                </button>
              </div>
              {form.education.map((entry) => (
                <fieldset className="portal-portfolio-entry" key={entry.id}>
                  <legend>Estudio o título</legend>
                  <div className="portal-field-grid">
                    <SearchableSelect
                      label="Institución"
                      value={entry.institution || null}
                      options={catalog?.institutions ?? []}
                      placeholder="Busca la institución"
                      required
                      disabled={saving || uploadsBusy || !catalog}
                      onChange={(value) =>
                        updateEducation(entry.id, { institution: value ?? '' })
                      }
                    />
                    <SearchableSelect
                      label="Carrera, título o programa"
                      value={entry.program || null}
                      options={catalog?.careers ?? []}
                      placeholder="Busca la carrera"
                      required
                      disabled={saving || uploadsBusy || !catalog}
                      onChange={(value) =>
                        updateEducation(entry.id, { program: value ?? '' })
                      }
                    />
                    <label>
                      <span>Año de inicio</span>
                      <input
                        type="number"
                        min={1950}
                        max={2100}
                        value={entry.startYear ?? ''}
                        onChange={(event) =>
                          updateEducation(entry.id, {
                            startYear: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Año de término</span>
                      <input
                        type="number"
                        min={1950}
                        max={2100}
                        value={entry.endYear ?? ''}
                        disabled={entry.current}
                        onChange={(event) =>
                          updateEducation(entry.id, {
                            endYear: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="portal-checkbox-row">
                    <input
                      type="checkbox"
                      checked={entry.current}
                      onChange={(event) =>
                        updateEducation(entry.id, {
                          current: event.target.checked,
                          endYear: event.target.checked ? null : entry.endYear,
                        })
                      }
                    />
                    <span>Actualmente estudio aquí</span>
                  </label>
                  <button
                    className="portal-text-danger"
                    type="button"
                    onClick={() =>
                      setField(
                        'education',
                        form.education.filter((item) => item.id !== entry.id),
                      )
                    }
                  >
                    Quitar formación
                  </button>
                </fieldset>
              ))}
            </section>

            <section className="portal-portfolio-editor">
              <div className="portal-portfolio-editor__heading">
                <div>
                  <span className="portal-card-kicker">Creaciones</span>
                  <h3>Proyectos</h3>
                </div>
                <button
                  className="portal-secondary-button"
                  type="button"
                  disabled={form.projects.length >= 12 || saving || uploadsBusy}
                  onClick={() =>
                    setField('projects', [
                      ...form.projects,
                      {
                        id: crypto.randomUUID(),
                        title: '',
                        description: '',
                        url: null,
                        repositoryUrl: null,
                        imageUrl: null,
                        technologies: [],
                      },
                    ])
                  }
                >
                  Agregar proyecto
                </button>
              </div>
              {form.projects.map((entry) => (
                <fieldset className="portal-portfolio-entry" key={entry.id}>
                  <legend>Proyecto</legend>
                  <div className="portal-field-grid">
                    <label>
                      <span>Título</span>
                      <input
                        value={entry.title}
                        onChange={(event) =>
                          updateProject(entry.id, { title: event.target.value })
                        }
                        maxLength={120}
                        required
                      />
                    </label>
                    <label>
                      <span>Tecnologías, separadas por comas</span>
                      <input
                        value={entry.technologies.join(', ')}
                        onChange={(event) =>
                          updateProject(entry.id, {
                            technologies: event.target.value
                              .split(',')
                              .slice(0, 12),
                          })
                        }
                        placeholder="React, PostgreSQL, Docker"
                      />
                    </label>
                    <label>
                      <span>Enlace del proyecto</span>
                      <input
                        type="url"
                        value={entry.url ?? ''}
                        onChange={(event) =>
                          updateProject(entry.id, { url: event.target.value })
                        }
                        placeholder="https://mi-proyecto.cl"
                      />
                    </label>
                    <label>
                      <span>Repositorio</span>
                      <input
                        type="url"
                        value={entry.repositoryUrl ?? ''}
                        onChange={(event) =>
                          updateProject(entry.id, {
                            repositoryUrl: event.target.value,
                          })
                        }
                        placeholder="https://github.com/usuario/proyecto"
                      />
                    </label>
                    <label>
                      <span>Imagen del proyecto</span>
                      <input
                        type="url"
                        value={entry.imageUrl ?? ''}
                        onChange={(event) =>
                          updateProject(entry.id, {
                            imageUrl: event.target.value,
                          })
                        }
                        placeholder="https://…"
                      />
                    </label>
                  </div>
                  <label>
                    <span>Descripción</span>
                    <textarea
                      value={entry.description}
                      onChange={(event) =>
                        updateProject(entry.id, {
                          description: event.target.value,
                        })
                      }
                      maxLength={1000}
                      rows={3}
                      required
                    />
                  </label>
                  <button
                    className="portal-text-danger"
                    type="button"
                    onClick={() =>
                      setField(
                        'projects',
                        form.projects.filter((item) => item.id !== entry.id),
                      )
                    }
                  >
                    Quitar proyecto
                  </button>
                </fieldset>
              ))}
            </section>

            <section className="portal-portfolio-editor">
              <div className="portal-portfolio-editor__heading">
                <div>
                  <span className="portal-card-kicker">Trayectoria</span>
                  <h3>Logros y certificaciones</h3>
                </div>
                <button
                  className="portal-secondary-button"
                  type="button"
                  disabled={
                    form.achievements.length >= 12 || saving || uploadsBusy
                  }
                  onClick={() =>
                    setField('achievements', [
                      ...form.achievements,
                      {
                        id: crypto.randomUUID(),
                        title: '',
                        issuer: '',
                        issuedAt: null,
                        description: '',
                        credentialUrl: null,
                      },
                    ])
                  }
                >
                  Agregar logro
                </button>
              </div>
              {form.achievements.map((entry) => (
                <fieldset className="portal-portfolio-entry" key={entry.id}>
                  <legend>Logro o certificación</legend>
                  <div className="portal-field-grid">
                    <label>
                      <span>Título</span>
                      <input
                        value={entry.title}
                        onChange={(event) =>
                          updateAchievement(entry.id, {
                            title: event.target.value,
                          })
                        }
                        maxLength={160}
                        required
                      />
                    </label>
                    <label>
                      <span>Institución emisora</span>
                      <input
                        value={entry.issuer}
                        onChange={(event) =>
                          updateAchievement(entry.id, {
                            issuer: event.target.value,
                          })
                        }
                        maxLength={160}
                        required
                      />
                    </label>
                    <label>
                      <span>Fecha</span>
                      <input
                        type="month"
                        value={entry.issuedAt ?? ''}
                        onChange={(event) =>
                          updateAchievement(entry.id, {
                            issuedAt: event.target.value || null,
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Enlace de credencial</span>
                      <input
                        type="url"
                        value={entry.credentialUrl ?? ''}
                        onChange={(event) =>
                          updateAchievement(entry.id, {
                            credentialUrl: event.target.value,
                          })
                        }
                        placeholder="https://…"
                      />
                    </label>
                  </div>
                  <label>
                    <span>Descripción opcional</span>
                    <textarea
                      value={entry.description}
                      onChange={(event) =>
                        updateAchievement(entry.id, {
                          description: event.target.value,
                        })
                      }
                      maxLength={600}
                      rows={2}
                    />
                  </label>
                  <button
                    className="portal-text-danger"
                    type="button"
                    onClick={() =>
                      setField(
                        'achievements',
                        form.achievements.filter(
                          (item) => item.id !== entry.id,
                        ),
                      )
                    }
                  >
                    Quitar logro
                  </button>
                </fieldset>
              ))}
            </section>
            <details className="portal-profile-url-fields">
              <summary>Usar enlaces externos para las imágenes</summary>
              <label>
                <span>URL de foto de perfil</span>
                <input
                  type="text"
                  inputMode="url"
                  value={form.avatarUrl ?? ''}
                  onChange={(event) =>
                    setField('avatarUrl', event.target.value)
                  }
                  placeholder="https://ejemplo.cl/mi-foto.jpg"
                  disabled={saving || uploadsBusy}
                />
              </label>
              <label>
                <span>URL de imagen de portada</span>
                <input
                  type="url"
                  value={form.coverUrl ?? ''}
                  onChange={(event) => setField('coverUrl', event.target.value)}
                  placeholder="https://ejemplo.cl/mi-portada.jpg"
                  disabled={saving || uploadsBusy}
                />
              </label>
            </details>
            {error && (
              <p className="portal-inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="portal-form-actions">
              <button
                className="portal-secondary-button"
                type="button"
                onClick={cancelEditing}
                disabled={saving || uploadsBusy}
              >
                Cancelar
              </button>
              <button
                className="portal-primary-button"
                type="submit"
                disabled={saving || uploadsBusy}
              >
                {uploadsBusy
                  ? 'Subiendo imágenes…'
                  : saving
                    ? 'Guardando…'
                    : 'Guardar cambios'}
              </button>
            </div>
          </form>
        ) : (
          <dl className="portal-account-list">
            <div>
              <dt>Correo electrónico</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Estado de la cuenta</dt>
              <dd>
                <span className="portal-active-status">Activa</span>
              </dd>
            </div>
          </dl>
        )}
        {success && (
          <p className="portal-success-message" role="status">
            <PortalIcon name="check" /> {success}
          </p>
        )}
      </section>

      {!editing && (
        <section className="portal-card portal-own-portfolio">
          <div className="portal-section-title">
            <div>
              <span className="portal-card-kicker">Portafolio</span>
              <h2>Trayectoria y proyectos</h2>
            </div>
            <button
              className="portal-secondary-button"
              type="button"
              onClick={beginEditing}
            >
              <PortalIcon name="edit" /> Editar portafolio
            </button>
          </div>
          {user.education.length === 0 &&
          user.projects.length === 0 &&
          user.achievements.length === 0 ? (
            <EmptyState
              icon="academic"
              title="Tu portafolio está vacío"
              action={
                <button
                  className="portal-primary-button"
                  type="button"
                  onClick={beginEditing}
                >
                  Crear mi portafolio
                </button>
              }
            >
              Agrega formación, proyectos y logros para acreditar tu trayectoria
              ante tu comunidad.
            </EmptyState>
          ) : (
            <div className="portal-own-portfolio__grid">
              {user.education.length > 0 && (
                <section>
                  <header>
                    <span className="portal-own-portfolio__icon">
                      <PortalIcon name="academic" />
                    </span>
                    <h3>Formación</h3>
                  </header>
                  {user.education.map((entry) => (
                    <article key={entry.id}>
                      <strong>{entry.program}</strong>
                      <span>{entry.institution}</span>
                      <small>
                        {entry.startYear ?? 'Inicio no indicado'} —{' '}
                        {entry.current
                          ? 'Actualidad'
                          : (entry.endYear ?? 'Término no indicado')}
                      </small>
                    </article>
                  ))}
                </section>
              )}
              {user.projects.length > 0 && (
                <section>
                  <header>
                    <span className="portal-own-portfolio__icon">
                      <PortalIcon name="image" />
                    </span>
                    <h3>Proyectos</h3>
                  </header>
                  {user.projects.map((entry) => (
                    <article key={entry.id}>
                      {entry.imageUrl && (
                        <img
                          className="portal-own-portfolio__project-image"
                          src={entry.imageUrl}
                          alt={`Vista previa de ${entry.title}`}
                          loading="lazy"
                        />
                      )}
                      <strong>{entry.title}</strong>
                      <span>{entry.description}</span>
                      {entry.technologies.length > 0 && (
                        <div className="portal-own-portfolio__technologies">
                          {entry.technologies.map((technology) => (
                            <span key={technology}>{technology}</span>
                          ))}
                        </div>
                      )}
                      {(entry.url || entry.repositoryUrl) && (
                        <div className="portal-own-portfolio__links">
                          {entry.url && (
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Ver proyecto
                            </a>
                          )}
                          {entry.repositoryUrl && (
                            <a
                              href={entry.repositoryUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Repositorio
                            </a>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                </section>
              )}
              {user.achievements.length > 0 && (
                <section>
                  <header>
                    <span className="portal-own-portfolio__icon">
                      <PortalIcon name="check" />
                    </span>
                    <h3>Logros</h3>
                  </header>
                  {user.achievements.map((entry) => (
                    <article key={entry.id}>
                      <strong>{entry.title}</strong>
                      <span>{entry.issuer}</span>
                      {entry.issuedAt && (
                        <small>{formatMonth(entry.issuedAt)}</small>
                      )}
                      {entry.description && <small>{entry.description}</small>}
                      {entry.credentialUrl && (
                        <a
                          href={entry.credentialUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver credencial
                        </a>
                      )}
                    </article>
                  ))}
                </section>
              )}
            </div>
          )}
        </section>
      )}

      <section className="portal-profile-activity">
        <div
          className="portal-profile-tabs"
          role="tablist"
          aria-label="Actividad del perfil"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activityTab === 'posts'}
            className={activityTab === 'posts' ? 'is-active' : ''}
            onClick={() => setActivityTab('posts')}
          >
            Publicaciones <span>{profilePosts.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activityTab === 'likes'}
            className={activityTab === 'likes' ? 'is-active' : ''}
            onClick={() => setActivityTab('likes')}
          >
            Me gusta <span>{likedPosts.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activityTab === 'media'}
            className={activityTab === 'media' ? 'is-active' : ''}
            onClick={() => setActivityTab('media')}
          >
            Multimedia{' '}
            <span>{profilePosts.filter((post) => post.imageUrl).length}</span>
          </button>
        </div>
        {activityLoading ? (
          <div className="portal-loading" role="status">
            <span className="portal-spinner" /> Cargando actividad…
          </div>
        ) : activityError ? (
          <EmptyState
            icon="refresh"
            title="No pudimos cargar tu actividad"
            action={
              <button
                className="portal-secondary-button"
                type="button"
                onClick={() => void loadActivity()}
              >
                Intentar nuevamente
              </button>
            }
          >
            {activityError}
          </EmptyState>
        ) : activityPosts.length ? (
          <div className="portal-post-list">
            {activityPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUser={user}
                onPostUpdate={updateActivityPost}
                onDelete={deleteActivityPost}
                onCommentCountChange={changeActivityCommentCount}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={
              activityTab === 'media'
                ? 'image'
                : activityTab === 'likes'
                  ? 'heart'
                  : 'feed'
            }
            title={
              activityTab === 'media'
                ? 'Aún no has compartido imágenes'
                : activityTab === 'likes'
                  ? 'Aún no marcas publicaciones'
                  : 'Aún no tienes publicaciones'
            }
          >
            {activityTab === 'likes'
              ? 'Las publicaciones que te gusten aparecerán aquí.'
              : 'Tu actividad aparecerá aquí cuando comiences a compartir.'}
          </EmptyState>
        )}
      </section>
    </div>
  )
}

function ModerationCard({
  post,
  onModerate,
}: {
  post: Post
  onModerate: (
    postId: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [showReason, setShowReason] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submitDecision = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && reason.trim().length < 3) {
      setShowReason(true)
      setError('El motivo del rechazo debe tener al menos 3 caracteres.')
      return
    }

    setSaving(true)
    setError('')
    try {
      await onModerate(post.id, status, reason.trim() || undefined)
    } catch (submitError) {
      setError(readableError(submitError, 'No pudimos guardar la decisión.'))
      setSaving(false)
    }
  }

  return (
    <article className="portal-card portal-review-card">
      <header className="portal-post__header">
        <Avatar name={post.author.displayName} url={post.author.avatarUrl} />
        <div className="portal-post__identity">
          <strong>{post.author.displayName}</strong>
          <span>
            @{post.author.username} · {formatDate(post.createdAt)}
          </span>
        </div>
        <span
          className={`portal-status-chip portal-status-chip--${post.moderationStatus}`}
        >
          {statusLabel(post.moderationStatus)}
        </span>
      </header>
      <p className="portal-post__content">{post.content}</p>
      {post.imageUrl && (
        <img
          className="portal-post__image"
          src={post.imageUrl}
          alt="Contenido adjunto para moderar"
          loading="lazy"
        />
      )}
      <div className="portal-review-meta">
        <span>
          <PortalIcon name={visibilityDetails(post.visibility).icon} />
          {visibilityDetails(post.visibility).label}
        </span>
        <span>{post.content.length} caracteres</span>
      </div>

      {post.moderationReason && post.moderationStatus !== 'pending' && (
        <p className="portal-previous-reason">
          <strong>Motivo:</strong> {post.moderationReason}
        </p>
      )}

      {post.moderationStatus === 'pending' && (
        <div className="portal-review-controls">
          {showReason && (
            <label>
              <span>Motivo del rechazo</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder="Entrega una indicación clara para la persona autora…"
                disabled={saving}
                autoFocus
              />
              <small>{reason.length}/500</small>
            </label>
          )}
          {error && (
            <p className="portal-inline-error" role="alert">
              {error}
            </p>
          )}
          <div className="portal-review-actions">
            <button
              className="portal-decision-button portal-decision-button--reject"
              type="button"
              onClick={() => {
                if (!showReason) {
                  setShowReason(true)
                  setError('')
                } else {
                  void submitDecision('rejected')
                }
              }}
              disabled={saving}
            >
              <PortalIcon name="close" />
              {showReason ? 'Confirmar rechazo' : 'Rechazar'}
            </button>
            <button
              className="portal-decision-button portal-decision-button--approve"
              type="button"
              onClick={() => void submitDecision('approved')}
              disabled={saving}
            >
              <PortalIcon name="check" />
              {saving ? 'Guardando…' : 'Aprobar'}
            </button>
          </div>
        </div>
      )}
    </article>
  )
}

function reportStatusLabel(status: ReportStatus) {
  const labels: Record<ReportStatus, string> = {
    pending: 'Pendiente',
    reviewing: 'En revisión',
    resolved: 'Resuelto',
    dismissed: 'Descartado',
  }
  return labels[status]
}

function ReportResourcePreview({ report }: { report: Report }) {
  if (!report.resource) {
    return (
      <p className="portal-report-resource-note">
        Este recurso fue eliminado o ya no está disponible.
      </p>
    )
  }

  switch (report.resourceType) {
    case 'post':
      return (
        <div className="portal-report-resource-preview">
          <span>Publicación de {report.resource.author.displayName}</span>
          <p>{report.resource.content}</p>
          {report.resource.imageUrl && (
            <img
              src={report.resource.imageUrl}
              alt="Imagen de la publicación reportada"
              loading="lazy"
            />
          )}
        </div>
      )
    case 'comment':
      return (
        <div className="portal-report-resource-preview">
          <span>Comentario de {report.resource.author.displayName}</span>
          <p>{report.resource.content}</p>
          <small>
            En publicación <code>{report.resource.postId}</code>
          </small>
        </div>
      )
    case 'chat':
      return (
        <div className="portal-report-resource-preview">
          <span>Chat {report.resource.type}</span>
          <p>{report.resource.name ?? 'Conversaci\u00f3n directa'}</p>
          {report.resource.avatarUrl && (
            <img
              src={report.resource.avatarUrl}
              alt="Imagen del chat reportado"
              loading="lazy"
            />
          )}
        </div>
      )
    case 'message':
      return (
        <div className="portal-report-resource-preview">
          <span>Mensaje de {report.resource.sender.displayName}</span>
          <p>{report.resource.content}</p>
          {report.resource.fileUrl && report.resource.type === 'image' && (
            <img
              src={report.resource.fileUrl}
              alt="Imagen del mensaje reportado"
              loading="lazy"
            />
          )}
          {report.resource.fileUrl && report.resource.type === 'file' && (
            <a href={report.resource.fileUrl} target="_blank" rel="noreferrer">
              Abrir archivo: {report.resource.fileName ?? 'adjunto'}
            </a>
          )}
          <small>
            En chat <code>{report.resource.chatId}</code>
          </small>
        </div>
      )
    case 'user':
      return (
        <div className="portal-report-resource-preview portal-report-resource-preview--user">
          <Avatar
            name={report.resource.displayName}
            url={report.resource.avatarUrl}
            size="small"
          />
          <p>
            <strong>{report.resource.displayName}</strong> @
            {report.resource.username}
          </p>
        </div>
      )
  }
}

function ReportReviewCard({
  report,
  onStatusChange,
}: {
  report: Report
  onStatusChange: (reportId: string, status: ReportStatus) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const changeStatus = async (status: ReportStatus) => {
    setSaving(true)
    setError('')
    try {
      await onStatusChange(report.id, status)
    } catch (updateError) {
      setError(readableError(updateError, 'No pudimos actualizar el reporte.'))
    } finally {
      setSaving(false)
    }
  }

  const resourceLabels: Record<Report['resourceType'], string> = {
    post: 'Publicación',
    comment: 'Comentario',
    chat: 'Chat',
    message: 'Mensaje',
    user: 'Usuario',
  }

  return (
    <article className="portal-card portal-report-review-card">
      <header>
        <Avatar
          name={report.reporter.displayName}
          url={report.reporter.avatarUrl}
        />
        <div>
          <strong>{report.reporter.displayName}</strong>
          <span>
            @{report.reporter.username} · {formatDate(report.createdAt)}
          </span>
        </div>
        <span
          className={`portal-report-status portal-report-status--${report.status}`}
        >
          {reportStatusLabel(report.status)}
        </span>
      </header>
      <div className="portal-report-review-card__resource">
        <span>{resourceLabels[report.resourceType]}</span>
        <code title={report.resourceId}>{report.resourceId}</code>
      </div>
      <div className="portal-report-review-card__reason">
        <strong>{report.reason}</strong>
        {report.details && <p>{report.details}</p>}
      </div>
      <ReportResourcePreview report={report} />
      {report.assignedTo && (
        <p className="portal-report-assignee">
          Revisado por {report.assignedTo.displayName}
        </p>
      )}
      {error && (
        <p className="portal-inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="portal-report-review-actions">
        {report.status === 'pending' && (
          <button
            type="button"
            onClick={() => void changeStatus('reviewing')}
            disabled={saving}
          >
            Comenzar revisión
          </button>
        )}
        {(report.status === 'pending' || report.status === 'reviewing') && (
          <>
            <button
              className="is-dismiss"
              type="button"
              onClick={() => void changeStatus('dismissed')}
              disabled={saving}
            >
              Descartar
            </button>
            <button
              className="is-resolve"
              type="button"
              onClick={() => void changeStatus('resolved')}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Resolver'}
            </button>
          </>
        )}
        {(report.status === 'resolved' || report.status === 'dismissed') && (
          <button
            type="button"
            onClick={() => void changeStatus('reviewing')}
            disabled={saving}
          >
            Reabrir
          </button>
        )}
      </div>
    </article>
  )
}

const supportRequestCategoryLabels: Record<SupportRequestCategory, string> = {
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

const supportRequestStatusLabels: Record<SupportRequestStatus, string> = {
  pending: 'Pendiente',
  reviewing: 'En revisión',
  resolved: 'Resuelta',
  rejected: 'Rechazada',
}

function SupportRequestReviewCard({
  request,
  onStatusChange,
}: {
  request: ManagedSupportRequest
  onStatusChange: (
    requestId: string,
    status: SupportRequestStatus,
  ) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const changeStatus = async (status: SupportRequestStatus) => {
    setSaving(true)
    setError('')
    try {
      await onStatusChange(request.id, status)
    } catch (updateError) {
      setError(
        readableError(updateError, 'No pudimos actualizar esta solicitud.'),
      )
    } finally {
      setSaving(false)
    }
  }

  const requesterName = request.requester?.displayName ?? 'Estudiante'
  return (
    <article className="portal-card portal-support-review-card">
      <header>
        <Avatar
          name={requesterName}
          url={request.requester?.avatarUrl ?? null}
        />
        <div>
          <strong>{requesterName}</strong>
          <span>
            {request.requester
              ? `@${request.requester.username}`
              : `ID ${request.requesterId.slice(0, 8)}`}{' '}
            · {formatDate(request.createdAt)}
          </span>
        </div>
        <span
          className={`portal-support-status portal-support-status--${request.status}`}
        >
          {supportRequestStatusLabels[request.status]}
        </span>
      </header>

      <div className="portal-support-review-card__heading">
        <span>{supportRequestCategoryLabels[request.category]}</span>
        <span
          className={`portal-support-urgency portal-support-urgency--${request.urgency}`}
        >
          Urgencia{' '}
          {{ low: 'baja', medium: 'media', high: 'alta' }[request.urgency]}
        </span>
        <h3>{request.subject}</h3>
      </div>

      <div className="portal-support-review-card__details">
        <div>
          <strong>Situación informada</strong>
          <p>{request.description}</p>
        </div>
        {request.desiredOutcome && (
          <div>
            <strong>Resultado esperado</strong>
            <p>{request.desiredOutcome}</p>
          </div>
        )}
      </div>

      <footer className="portal-support-review-card__footer">
        <span>
          {request.assignedTo
            ? `Asignada a ${request.assignedTo.displayName}`
            : 'Sin asignar'}
        </span>
        <span>Actualizada {formatDate(request.updatedAt)}</span>
      </footer>

      {error && (
        <p className="portal-inline-error" role="alert">
          {error}
        </p>
      )}

      <div className="portal-support-review-actions">
        {request.status === 'pending' && (
          <button
            type="button"
            onClick={() => void changeStatus('reviewing')}
            disabled={saving}
          >
            Comenzar revisión
          </button>
        )}
        {(request.status === 'pending' || request.status === 'reviewing') && (
          <>
            <button
              className="is-reject"
              type="button"
              onClick={() => void changeStatus('rejected')}
              disabled={saving}
            >
              Rechazar
            </button>
            <button
              className="is-resolve"
              type="button"
              onClick={() => void changeStatus('resolved')}
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Resolver'}
            </button>
          </>
        )}
        {(request.status === 'resolved' || request.status === 'rejected') && (
          <button
            type="button"
            onClick={() => void changeStatus('reviewing')}
            disabled={saving}
          >
            Reabrir
          </button>
        )}
      </div>
    </article>
  )
}

function ModerationView() {
  const [posts, setPosts] = useState<Post[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [supportRequests, setSupportRequests] = useState<
    ManagedSupportRequest[]
  >([])
  const [section, setSection] = useState<'posts' | 'reports' | 'requests'>(
    'posts',
  )
  const [filter, setFilter] = useState<ModerationStatus>('pending')
  const [reportFilter, setReportFilter] = useState<ReportStatus>('pending')
  const [requestFilter, setRequestFilter] =
    useState<SupportRequestStatus>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadModeration = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [loadedPosts, loadedReports, loadedRequests] = await Promise.all([
        getModerationPosts(),
        getReports(),
        getManagedSupportRequests(),
      ])
      setPosts(loadedPosts)
      setReports(loadedReports)
      setSupportRequests(loadedRequests)
    } catch (loadError) {
      setError(
        readableError(loadError, 'No pudimos cargar el centro de moderación.'),
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    Promise.all([
      getModerationPosts(),
      getReports(),
      getManagedSupportRequests(),
    ])
      .then(([loadedPosts, loadedReports, loadedRequests]) => {
        if (!cancelled) {
          setPosts(loadedPosts)
          setReports(loadedReports)
          setSupportRequests(loadedRequests)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            readableError(
              loadError,
              'No pudimos cargar el centro de moderación.',
            ),
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

  const filteredPosts = useMemo(
    () => posts.filter((post) => post.moderationStatus === filter),
    [filter, posts],
  )

  const pendingCount = posts.filter(
    (post) => post.moderationStatus === 'pending',
  ).length
  const openReportsCount = reports.filter(
    (report) => report.status === 'pending' || report.status === 'reviewing',
  ).length
  const filteredReports = reports.filter(
    (report) => report.status === reportFilter,
  )
  const openRequestsCount = supportRequests.filter(
    (item) => item.status === 'pending' || item.status === 'reviewing',
  ).length
  const filteredSupportRequests = supportRequests.filter(
    (item) => item.status === requestFilter,
  )

  const handleModerate = async (
    postId: string,
    status: 'approved' | 'rejected',
    reason?: string,
  ) => {
    const updated = await moderatePost(postId, { status, reason })
    setPosts((current) =>
      current.map((post) => (post.id === postId ? updated : post)),
    )
  }

  const handleReportStatus = async (reportId: string, status: ReportStatus) => {
    const updated = await updateReportStatus(reportId, status)
    setReports((current) =>
      current.map((report) => (report.id === reportId ? updated : report)),
    )
  }

  const handleSupportRequestStatus = async (
    requestId: string,
    status: SupportRequestStatus,
  ) => {
    const updated = await updateManagedSupportRequest(requestId, status)
    setSupportRequests((current) =>
      current.map((item) =>
        item.id === requestId ? { ...item, ...updated } : item,
      ),
    )
  }

  return (
    <div className="portal-moderation-layout">
      <section className="portal-card portal-moderation-overview">
        <span className="portal-moderation-overview__icon">
          <PortalIcon name="shield" />
        </span>
        <div>
          <span className="portal-card-kicker">Cola de revisión</span>
          <h2>
            {pendingCount} publicaciones · {openReportsCount} reportes ·{' '}
            {openRequestsCount} solicitudes abiertas
          </h2>
          <p>
            Revisa contenido, reportes y solicitudes estudiantiles con criterios
            consistentes y un seguimiento claro.
          </p>
        </div>
      </section>

      <div
        className="portal-moderation-section-tabs"
        role="tablist"
        aria-label="Secciones de moderación"
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === 'posts'}
          className={section === 'posts' ? 'is-active' : ''}
          onClick={() => setSection('posts')}
        >
          Publicaciones <span>{pendingCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'reports'}
          className={section === 'reports' ? 'is-active' : ''}
          onClick={() => setSection('reports')}
        >
          Reportes <span>{openReportsCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'requests'}
          className={section === 'requests' ? 'is-active' : ''}
          onClick={() => setSection('requests')}
        >
          Solicitudes <span>{openRequestsCount}</span>
        </button>
      </div>

      <div
        className="portal-filter-bar"
        aria-label={
          section === 'posts'
            ? 'Filtrar publicaciones'
            : section === 'reports'
              ? 'Filtrar reportes'
              : 'Filtrar solicitudes'
        }
      >
        {section === 'posts'
          ? (
              [
                ['pending', 'Pendientes'],
                ['approved', 'Aprobadas'],
                ['rejected', 'Rechazadas'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'is-active' : ''}
                onClick={() => setFilter(value)}
                aria-pressed={filter === value}
              >
                {label}
                <span>
                  {
                    posts.filter((post) => post.moderationStatus === value)
                      .length
                  }
                </span>
              </button>
            ))
          : section === 'reports'
            ? (
                [
                  ['pending', 'Pendientes'],
                  ['reviewing', 'En revisión'],
                  ['resolved', 'Resueltos'],
                  ['dismissed', 'Descartados'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={reportFilter === value ? 'is-active' : ''}
                  onClick={() => setReportFilter(value)}
                  aria-pressed={reportFilter === value}
                >
                  {label}
                  <span>
                    {reports.filter((report) => report.status === value).length}
                  </span>
                </button>
              ))
            : (
                [
                  ['pending', 'Pendientes'],
                  ['reviewing', 'En revisión'],
                  ['resolved', 'Resueltas'],
                  ['rejected', 'Rechazadas'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={requestFilter === value ? 'is-active' : ''}
                  onClick={() => setRequestFilter(value)}
                  aria-pressed={requestFilter === value}
                >
                  {label}
                  <span>
                    {
                      supportRequests.filter((item) => item.status === value)
                        .length
                    }
                  </span>
                </button>
              ))}
      </div>

      {loading ? (
        <div className="portal-loading" role="status">
          <span className="portal-spinner" />
          <span>Cargando la cola de moderación…</span>
        </div>
      ) : error ? (
        <EmptyState
          icon="refresh"
          title="No pudimos abrir la moderación"
          action={
            <button
              className="portal-secondary-button"
              type="button"
              onClick={() => void loadModeration()}
            >
              Intentar nuevamente
            </button>
          }
        >
          {error}
        </EmptyState>
      ) : section === 'posts' && filteredPosts.length === 0 ? (
        <EmptyState icon="check" title="Todo está al día">
          No hay publicaciones{' '}
          {filter === 'pending'
            ? 'pendientes'
            : statusLabel(filter).toLowerCase()}{' '}
          en esta vista.
        </EmptyState>
      ) : section === 'posts' ? (
        <div className="portal-review-list">
          {filteredPosts.map((post) => (
            <ModerationCard
              key={post.id}
              post={post}
              onModerate={handleModerate}
            />
          ))}
        </div>
      ) : section === 'reports' && filteredReports.length === 0 ? (
        <EmptyState icon="check" title="No hay reportes en esta vista">
          No hay reportes con estado “
          {reportStatusLabel(reportFilter).toLowerCase()}”.
        </EmptyState>
      ) : section === 'reports' ? (
        <div className="portal-report-review-list">
          {filteredReports.map((report) => (
            <ReportReviewCard
              key={report.id}
              report={report}
              onStatusChange={handleReportStatus}
            />
          ))}
        </div>
      ) : filteredSupportRequests.length === 0 ? (
        <EmptyState icon="check" title="No hay solicitudes en esta vista">
          No hay solicitudes con estado “
          {supportRequestStatusLabels[requestFilter].toLowerCase()}”.
        </EmptyState>
      ) : (
        <div className="portal-support-review-list">
          {filteredSupportRequests.map((request) => (
            <SupportRequestReviewCard
              key={request.id}
              request={request}
              onStatusChange={handleSupportRequestStatus}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function Portal({ user, onUserChange, onLogout }: PortalProps) {
  const canModerate = user.role === 'moderator' || user.role === 'admin'
  const [initialRoute] = useState(() =>
    routeFromHash(window.location.hash, canModerate),
  )
  const [view, setView] = useState<PortalView>(initialRoute.view)
  const [networkUserId, setNetworkUserId] = useState<string | null>(
    initialRoute.networkUserId,
  )
  const [initialChatId, setInitialChatId] = useState<string | null>(
    initialRoute.chatId,
  )
  const [initialChatUserId, setInitialChatUserId] = useState<string | null>(
    null,
  )
  const [activePostId, setActivePostId] = useState<string | null>(
    initialRoute.postId,
  )
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [unreadChats, setUnreadChats] = useState(0)
  const notificationRequestRef = useRef(0)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState('')

  const applyRoute = useCallback(
    (
      route: PortalRoute,
      options: { history?: 'push' | 'replace' | 'none'; smooth?: boolean } = {},
    ) => {
      const historyMode = options.history ?? 'push'
      if (
        historyMode !== 'none' &&
        window.location.hash !== route.canonicalHash
      ) {
        const method = historyMode === 'replace' ? 'replaceState' : 'pushState'
        window.history[method](null, '', route.canonicalHash)
      }

      setView(route.view)
      setNetworkUserId(route.networkUserId)
      setInitialChatId(route.chatId)
      setInitialChatUserId(null)
      setActivePostId(route.postId)
      window.scrollTo({
        top: 0,
        behavior: options.smooth === false ? 'auto' : 'smooth',
      })
    },
    [],
  )

  useEffect(() => {
    if (window.location.hash !== initialRoute.canonicalHash) {
      window.history.replaceState(null, '', initialRoute.canonicalHash)
    }
  }, [initialRoute.canonicalHash])

  useEffect(() => {
    const applyLocation = () => {
      const route = routeFromHash(window.location.hash, canModerate)
      if (window.location.hash !== route.canonicalHash) {
        window.history.replaceState(null, '', route.canonicalHash)
      }
      applyRoute(route, { history: 'none', smooth: false })
    }

    window.addEventListener('popstate', applyLocation)
    window.addEventListener('hashchange', applyLocation)
    return () => {
      window.removeEventListener('popstate', applyLocation)
      window.removeEventListener('hashchange', applyLocation)
    }
  }, [applyRoute, canModerate])

  const refreshUnreadNotifications = useCallback(() => {
    const requestId = ++notificationRequestRef.current
    return getUnreadNotificationCount()
      .then((count) => {
        if (requestId === notificationRequestRef.current) {
          setUnreadNotifications(count)
        }
      })
      .catch(() => {
        // La campana no debe bloquear el resto del portal si este contador falla.
      })
  }, [])

  useEffect(() => {
    const refreshUnreadCount = () => void refreshUnreadNotifications()

    refreshUnreadCount()
    const interval = window.setInterval(refreshUnreadCount, 5_000)
    window.addEventListener('focus', refreshUnreadCount)

    return () => {
      notificationRequestRef.current += 1
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshUnreadCount)
    }
  }, [refreshUnreadNotifications])

  useEffect(() => {
    let cancelled = false

    const refreshUnreadChats = () => {
      getChatUnreadCount()
        .then(({ unreadCount }) => {
          if (!cancelled) setUnreadChats(unreadCount)
        })
        .catch(() => {
          // El contador no debe impedir usar el resto del portal.
        })
    }

    refreshUnreadChats()
    const interval = window.setInterval(refreshUnreadChats, 5_000)
    window.addEventListener('focus', refreshUnreadChats)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshUnreadChats)
    }
  }, [])

  type NavigationItem = {
    view: PortalView
    label: string
    icon: IconName
  }

  const desktopNavigation: NavigationItem[] = [
    { view: 'feed', label: 'Inicio', icon: 'feed' },
    { view: 'network', label: 'Conexiones', icon: 'users' },
    { view: 'chat', label: 'Chat', icon: 'chat' },
    { view: 'academic', label: 'Materias', icon: 'academic' },
    { view: 'duco', label: 'DUCO', icon: 'duco' },
    ...(canModerate
      ? ([
          { view: 'moderation', label: 'Moderación', icon: 'shield' },
        ] satisfies NavigationItem[])
      : []),
  ]

  const mobileNavigation: NavigationItem[] = [
    { view: 'feed', label: 'Inicio', icon: 'feed' },
    { view: 'network', label: 'Conexiones', icon: 'users' },
    { view: 'chat', label: 'Chat', icon: 'chat' },
    { view: 'academic', label: 'Materias', icon: 'academic' },
    { view: 'duco', label: 'DUCO', icon: 'duco' },
    { view: 'profile', label: 'Perfil', icon: 'profile' },
  ]

  const pageDetails: Record<PortalView, { eyebrow: string; title: string }> = {
    feed: { eyebrow: 'Comunidad', title: 'Tu campus, en un solo lugar' },
    network: { eyebrow: 'Privacidad por diseño', title: 'Mis conexiones' },
    chat: { eyebrow: 'Conversaciones', title: 'Chat Konea' },
    duco: { eyebrow: 'Asistente', title: 'Organízate con DUCO' },
    academic: { eyebrow: 'Planificación', title: 'Mi espacio académico' },
    notifications: { eyebrow: 'Actividad', title: 'Tus notificaciones' },
    profile: { eyebrow: 'Identidad', title: 'Tu perfil Konea' },
    moderation: { eyebrow: 'Seguridad', title: 'Centro de moderación' },
  }

  const goTo = (nextView: PortalView) => {
    applyRoute(routeFromHash(hashForView(nextView), canModerate))
  }

  const openNetworkUser = (userId: string) => {
    applyRoute(routeFromHash(`#user-${userId}`, canModerate))
  }

  const startChatWithUser = (userId: string) => {
    if (window.location.hash !== '#chat') {
      window.history.pushState(null, '', '#chat')
    }
    setNetworkUserId(null)
    setInitialChatId(null)
    setInitialChatUserId(userId)
    setActivePostId(null)
    setView('chat')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openChat = (chatId: string) => {
    applyRoute(routeFromHash(`#chat-${chatId}`, canModerate))
  }

  const syncChatRoute = (chatId: string | null) => {
    const nextHash = chatId ? `#chat-${chatId}` : '#chat'
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash)
    }
  }

  const openPost = (postId?: string) => {
    if (postId) {
      applyRoute(routeFromHash(`#post-${postId}`, canModerate))
      return
    }
    goTo('feed')
  }

  const openNotifications = () => {
    applyRoute(routeFromHash('#notifications', canModerate))
  }

  const openSupportRequests = () => {
    applyRoute(routeFromHash('#duco-requests', canModerate))
  }

  const openProfile = () => {
    applyRoute(routeFromHash('#profile', canModerate))
  }

  const renderChatBadge = (compact = false) => {
    if (unreadChats <= 0) return null
    return (
      <span
        className={compact ? 'portal-bottom-badge' : 'portal-nav-badge'}
        aria-label={`${unreadChats} chats sin leer`}
      >
        {unreadChats > 99 ? '99+' : unreadChats}
      </span>
    )
  }

  const navigationButtonContent = (item: NavigationItem, compact = false) => (
    <>
      <PortalIcon name={item.icon} />
      <span>{item.label}</span>
      {item.view === 'chat' && renderChatBadge(compact)}
    </>
  )

  const handleLogout = async () => {
    setLoggingOut(true)
    setLogoutError('')
    try {
      await onLogout()
    } catch (error) {
      setLogoutError(readableError(error, 'No pudimos cerrar tu sesión.'))
      setLoggingOut(false)
    }
  }

  return (
    <div className="portal-shell">
      <button
        className="portal-skip-link"
        type="button"
        onClick={() => document.getElementById('portal-main')?.focus()}
      >
        Saltar al contenido principal
      </button>

      <aside className="portal-sidebar">
        <button
          className="portal-brand"
          type="button"
          onClick={() => goTo('feed')}
          aria-label="Ir al inicio de Konea"
        >
          <img
            className="portal-brand__logo"
            src="/konea-logo.svg"
            alt=""
            aria-hidden="true"
          />
        </button>

        <nav className="portal-nav" aria-label="Navegación principal">
          {desktopNavigation.map((item) => (
            <button
              key={item.view}
              className={view === item.view ? 'is-active' : ''}
              type="button"
              onClick={() => goTo(item.view)}
              aria-current={view === item.view ? 'page' : undefined}
            >
              {navigationButtonContent(item)}
            </button>
          ))}
        </nav>

        <div className="portal-sidebar__account">
          <button
            className={`portal-account-button${view === 'profile' ? ' is-active' : ''}`}
            type="button"
            onClick={openProfile}
            aria-current={view === 'profile' ? 'page' : undefined}
          >
            <Avatar name={user.displayName} url={user.avatarUrl} size="small" />
            <span>
              <strong>{user.displayName}</strong>
              <small>@{user.username}</small>
            </span>
          </button>
          <button
            className="portal-logout"
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
          >
            <PortalIcon name="logout" />
            {loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
          {logoutError && (
            <p className="portal-inline-error" role="alert">
              {logoutError}
            </p>
          )}
        </div>
      </aside>

      <header className="portal-mobile-header">
        <button
          className="portal-brand"
          type="button"
          onClick={() => goTo('feed')}
          aria-label="Ir al inicio de Konea"
        >
          <img
            className="portal-brand__logo"
            src="/konea-logo.svg"
            alt=""
            aria-hidden="true"
          />
        </button>
        <div className="portal-mobile-actions">
          {canModerate && (
            <button
              className={`portal-notification-button portal-notification-button--mobile${view === 'moderation' ? ' is-active' : ''}`}
              type="button"
              onClick={() => goTo('moderation')}
              aria-label={'Abrir moderaci\u00f3n'}
              aria-current={view === 'moderation' ? 'page' : undefined}
            >
              <PortalIcon name="shield" />
            </button>
          )}
          <button
            className={`portal-notification-button portal-notification-button--mobile${view === 'notifications' ? ' is-active' : ''}`}
            type="button"
            onClick={openNotifications}
            aria-label={`Notificaciones${unreadNotifications ? `, ${unreadNotifications} sin leer` : ''}`}
            aria-current={view === 'notifications' ? 'page' : undefined}
          >
            <PortalIcon name="bell" />
            {unreadNotifications > 0 && (
              <span className="portal-notification-badge" aria-hidden="true">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            )}
          </button>
          <button
            className="portal-mobile-logout"
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            aria-label="Cerrar sesión"
          >
            <PortalIcon name="logout" />
          </button>
        </div>
      </header>

      <main
        className={`portal-main${view === 'chat' || view === 'duco' ? ' portal-main--immersive' : ''}`}
        id="portal-main"
        tabIndex={-1}
      >
        <header
          className={`portal-page-header${view === 'chat' || view === 'duco' ? ' portal-page-header--immersive' : ''}`}
        >
          <div>
            <span>{pageDetails[view].eyebrow}</span>
            <h1>{pageDetails[view].title}</h1>
          </div>
          <div className="portal-page-actions">
            <button
              className={`portal-notification-button${view === 'notifications' ? ' is-active' : ''}`}
              type="button"
              onClick={openNotifications}
              aria-label={`Notificaciones${unreadNotifications ? `, ${unreadNotifications} sin leer` : ''}`}
              aria-current={view === 'notifications' ? 'page' : undefined}
            >
              <PortalIcon name="bell" />
              {unreadNotifications > 0 && (
                <span className="portal-notification-badge" aria-hidden="true">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>
            <button
              className="portal-header-account"
              type="button"
              onClick={openProfile}
            >
              <span>
                Hola, {user.displayName.split(' ')[0] || user.username}
              </span>
              <Avatar
                name={user.displayName}
                url={user.avatarUrl}
                size="small"
              />
            </button>
          </div>
        </header>

        {logoutError && (
          <p className="portal-mobile-error" role="alert">
            {logoutError}
          </p>
        )}

        {view === 'feed' && (
          <FeedView key={activePostId ?? 'feed'} user={user} />
        )}
        {view === 'network' && (
          <Network
            key={networkUserId ?? 'directory'}
            currentUser={user}
            initialUserId={networkUserId}
            onOpenOwnProfile={openProfile}
            onStartChat={startChatWithUser}
            onProfileChange={(userId) => {
              if (userId) openNetworkUser(userId)
              else goTo('network')
            }}
          />
        )}
        {view === 'chat' && (
          <Chat
            currentUser={user}
            initialChatId={initialChatId}
            initialUserId={initialChatUserId}
            onUnreadChange={setUnreadChats}
            onNotificationsRead={() => void refreshUnreadNotifications()}
            onOpenUser={openNetworkUser}
            onChatChange={syncChatRoute}
          />
        )}
        {view === 'duco' && (
          <Duco
            currentUser={user}
            initialPanel={
              window.location.hash === '#duco-requests'
                ? 'requests'
                : 'conversation'
            }
          />
        )}
        {view === 'academic' && <Academic />}
        {view === 'notifications' && (
          <Notifications
            unreadCount={unreadNotifications}
            onUnreadCountChange={setUnreadNotifications}
            onOpenUser={openNetworkUser}
            onOpenFeed={openPost}
            onOpenChat={openChat}
            onOpenSupportRequests={openSupportRequests}
          />
        )}
        {view === 'profile' && (
          <ProfileView user={user} onUserChange={onUserChange} />
        )}
        {view === 'moderation' && canModerate && <ModerationView />}
      </main>

      <nav className="portal-bottom-nav" aria-label="Navegación móvil">
        {mobileNavigation.map((item) => (
          <button
            key={item.view}
            className={view === item.view ? 'is-active' : ''}
            type="button"
            onClick={() => goTo(item.view)}
            aria-current={view === item.view ? 'page' : undefined}
          >
            {navigationButtonContent(item, true)}
          </button>
        ))}
      </nav>
    </div>
  )
}
