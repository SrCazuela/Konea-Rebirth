import { useCallback, useEffect, useState } from 'react'
import type { KoneaUser } from '../api/auth'
import {
  cancelConnectionRequest,
  getPublicUser,
  listConnections,
  removeConnection,
  sendConnectionRequest,
  type ConnectionStatus,
  type PublicUser,
  type PublicUserRole,
} from '../api/network'
import type { Post } from '../api/portal'
import './Network.css'

type NetworkProps = {
  currentUser: KoneaUser
  initialUserId?: string | null
  onOpenOwnProfile: () => void
  onStartChat?: (userId: string) => void
  onProfileChange?: (userId: string | null) => void
}

const dateFormatter = new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' })
const monthFormatter = new Intl.DateTimeFormat('es-CL', {
  month: 'long',
  year: 'numeric',
})

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Fecha no disponible'
    : dateFormatter.format(date)
}

function formatMonth(value: string | null) {
  if (!value) return null
  const date = new Date(`${value}-01T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : monthFormatter.format(date)
}

function roleLabel(role: PublicUserRole) {
  const labels: Record<PublicUserRole, string> = {
    student: 'Estudiante',
    professor: 'Profesor/a',
    moderator: 'Moderación',
    admin: 'Administración',
  }
  return labels[role]
}

function NetworkAvatar({
  user,
  size = 'medium',
}: {
  user: Pick<PublicUser, 'displayName' | 'avatarUrl'>
  size?: 'small' | 'medium' | 'large'
}) {
  const className = `network-avatar network-avatar--${size}`
  if (user.avatarUrl) {
    return <img className={className} src={user.avatarUrl} alt="" />
  }
  return (
    <span className={className} aria-hidden="true">
      {initials(user.displayName) || 'K'}
    </span>
  )
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="network-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="network-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ConnectionButton({
  person,
  busy,
  onChange,
}: {
  person: PublicUser
  busy: boolean
  onChange: (person: PublicUser) => void
}) {
  if (person.isMe) return null
  const labels: Record<Exclude<ConnectionStatus, 'self'>, string> = {
    none: 'Mandar solicitud de conexión',
    requested: 'Cancelar solicitud',
    connected: 'Eliminar conexión',
  }
  return (
    <button
      className={`network-follow-button network-connection-button--${person.connectionStatus}`}
      type="button"
      onClick={() => onChange(person)}
      disabled={busy}
    >
      {busy
        ? 'Guardando…'
        : labels[
            person.connectionStatus === 'self'
              ? 'none'
              : person.connectionStatus
          ]}
    </button>
  )
}

function ConnectionCard({
  person,
  onOpen,
  onStartChat,
}: {
  person: PublicUser
  onOpen: (userId: string) => void
  onStartChat?: (userId: string) => void
}) {
  const context = [person.career, person.institution]
    .filter(Boolean)
    .join(' · ')
  return (
    <article className="network-person-card">
      <div className="network-person-card__top">
        <NetworkAvatar user={person} />
        <span className={`network-role network-role--${person.role}`}>
          {roleLabel(person.role)}
        </span>
      </div>
      <div className="network-person-card__identity">
        <h2>{person.displayName}</h2>
        <p>@{person.username}</p>
      </div>
      <p className="network-person-card__context">
        {context || 'Miembro de la comunidad Konea'}
      </p>
      <p className="network-person-card__bio">
        {person.bio || 'Todavía no ha agregado una presentación.'}
      </p>
      <dl className="network-person-card__stats">
        <div>
          <dt>{person.stats.projects}</dt>
          <dd>Proyectos</dd>
        </div>
        <div>
          <dt>{person.stats.achievements}</dt>
          <dd>Logros</dd>
        </div>
      </dl>
      <div className="network-person-card__actions">
        <button
          className="network-profile-button"
          type="button"
          onClick={() => onOpen(person.id)}
        >
          Ver portafolio
        </button>
        {onStartChat && (
          <button
            className="network-message-button"
            type="button"
            onClick={() => onStartChat(person.id)}
          >
            Mensaje
          </button>
        )}
      </div>
    </article>
  )
}

function PublicPost({ post }: { post: Post }) {
  return (
    <article className="network-public-post">
      <header>
        <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
      </header>
      <p>{post.content}</p>
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt="Adjunto de la publicación"
          loading="lazy"
        />
      )}
      <footer>
        <span>{post.likeCount} Me gusta</span>
        <span>{post.commentCount} comentarios</span>
      </footer>
    </article>
  )
}

function Portfolio({ person }: { person: PublicUser }) {
  const hasPortfolio =
    person.education.length ||
    person.projects.length ||
    person.achievements.length
  return (
    <section className="network-portfolio">
      <div className="network-section-heading">
        <span>Trayectoria</span>
        <h2>Portafolio académico y profesional</h2>
      </div>
      {!hasPortfolio ? (
        <div className="network-empty network-empty--compact">
          <h3>Portafolio en construcción</h3>
          <p>
            Este perfil todavía no ha publicado proyectos, estudios o logros.
          </p>
        </div>
      ) : (
        <div className="network-portfolio-grid">
          {person.education.length > 0 && (
            <section className="network-portfolio-block network-portfolio-block--wide">
              <h3>Formación</h3>
              <div className="network-timeline">
                {person.education.map((education) => (
                  <article key={education.id}>
                    <span className="network-timeline__dot" />
                    <div>
                      <h4>{education.program}</h4>
                      <p>{education.institution}</p>
                      <small>
                        {education.startYear ?? 'Inicio no indicado'} —{' '}
                        {education.current
                          ? 'Actualidad'
                          : (education.endYear ?? 'Término no indicado')}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {person.projects.map((project) => (
            <article className="network-project-card" key={project.id}>
              {project.imageUrl && (
                <img src={project.imageUrl} alt="" loading="lazy" />
              )}
              <div>
                <h3>{project.title}</h3>
                <p>{project.description}</p>
                {project.technologies.length > 0 && (
                  <div className="network-project-tags">
                    {project.technologies.map((technology) => (
                      <span key={technology}>{technology}</span>
                    ))}
                  </div>
                )}
                <div className="network-project-links">
                  {project.url && (
                    <a href={project.url} target="_blank" rel="noreferrer">
                      Ver proyecto
                    </a>
                  )}
                  {project.repositoryUrl && (
                    <a
                      href={project.repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Repositorio
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
          {person.achievements.length > 0 && (
            <section className="network-portfolio-block network-portfolio-block--wide">
              <h3>Logros y certificaciones</h3>
              <div className="network-achievement-list">
                {person.achievements.map((achievement) => (
                  <article key={achievement.id}>
                    <span aria-hidden="true">★</span>
                    <div>
                      <h4>{achievement.title}</h4>
                      <p>
                        {achievement.issuer}
                        {achievement.issuedAt
                          ? ` · ${formatMonth(achievement.issuedAt)}`
                          : ''}
                      </p>
                      {achievement.description && (
                        <small>{achievement.description}</small>
                      )}
                      {achievement.credentialUrl && (
                        <a
                          href={achievement.credentialUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver credencial
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  )
}

function PublicProfile({
  person,
  posts,
  busy,
  onBack,
  onConnectionChange,
  onOpenOwnProfile,
  onStartChat,
}: {
  person: PublicUser
  posts: Post[]
  busy: boolean
  onBack: () => void
  onConnectionChange: (person: PublicUser) => void
  onOpenOwnProfile: () => void
  onStartChat?: (userId: string) => void
}) {
  return (
    <div className="network-public-profile">
      <button className="network-back-button" type="button" onClick={onBack}>
        <ArrowIcon /> Volver a conexiones
      </button>
      <section className="network-profile-card">
        <div
          className={`network-profile-cover${person.coverUrl ? ' network-profile-cover--image' : ''}`}
          style={
            person.coverUrl
              ? { backgroundImage: `url("${person.coverUrl}")` }
              : undefined
          }
        />
        <div className="network-profile-card__body">
          <div className="network-profile-card__avatar-row">
            <NetworkAvatar user={person} size="large" />
            {person.isMe ? (
              <button
                className="network-follow-button network-follow-button--following"
                type="button"
                onClick={onOpenOwnProfile}
              >
                Editar mi perfil
              </button>
            ) : (
              <div className="network-profile-card__actions">
                <ConnectionButton
                  person={person}
                  busy={busy}
                  onChange={onConnectionChange}
                />
                {person.connectionStatus === 'connected' && onStartChat && (
                  <button
                    className="network-message-button"
                    type="button"
                    onClick={() => onStartChat(person.id)}
                  >
                    Mensaje
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="network-profile-card__title">
            <div>
              <h2>{person.displayName}</h2>
              <p>@{person.username}</p>
            </div>
            <span className={`network-role network-role--${person.role}`}>
              {roleLabel(person.role)}
            </span>
          </div>
          <p className="network-profile-card__bio">
            {person.bio || 'Todavía no ha agregado una presentación.'}
          </p>
          <div className="network-profile-card__meta">
            {person.institution && <span>{person.institution}</span>}
            {person.campus && <span>{person.campus}</span>}
            {person.career && <span>{person.career}</span>}
            {person.website && (
              <a href={person.website} target="_blank" rel="noreferrer">
                Sitio web
              </a>
            )}
          </div>
          {person.connectionStatus === 'requested' && (
            <p className="network-private-request-note">
              La solicitud es privada. La otra persona solo será notificada si
              también solicita conectarse contigo.
            </p>
          )}
        </div>
      </section>
      <Portfolio person={person} />
      <section className="network-posts-section">
        <div className="network-section-heading">
          <span>Creaciones compartidas</span>
          <h2>Publicaciones de {person.displayName}</h2>
        </div>
        {posts.length ? (
          <div className="network-public-post-list">
            {posts.map((post) => (
              <PublicPost key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="network-empty network-empty--compact">
            <h3>Aún no hay publicaciones visibles</h3>
            <p>Sus próximas creaciones aparecerán en este espacio.</p>
          </div>
        )}
      </section>
    </div>
  )
}

export function Network({
  currentUser,
  initialUserId = null,
  onOpenOwnProfile,
  onStartChat,
  onProfileChange,
}: NetworkProps) {
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<PublicUser[]>([])
  const [loading, setLoading] = useState(!initialUserId)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    initialUserId,
  )
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null)
  const [selectedPosts, setSelectedPosts] = useState<Post[]>([])
  const [profileLoading, setProfileLoading] = useState(Boolean(initialUserId))
  const [profileError, setProfileError] = useState('')

  const loadConnections = useCallback(async (search = '') => {
    setLoading(true)
    setError('')
    try {
      setPeople(await listConnections(search))
    } catch (loadError) {
      setError(readableError(loadError, 'No pudimos cargar tus conexiones.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedUserId) return
    const timeout = window.setTimeout(() => void loadConnections(query), 250)
    return () => window.clearTimeout(timeout)
  }, [loadConnections, query, selectedUserId])

  useEffect(() => {
    if (!selectedUserId) return
    let cancelled = false
    getPublicUser(selectedUserId)
      .then((result) => {
        if (!cancelled) {
          setSelectedUser(result.user)
          setSelectedPosts(result.posts)
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setProfileError(
            readableError(loadError, 'No pudimos abrir este perfil.'),
          )
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedUserId])

  const updatePerson = (userId: string, status: ConnectionStatus) => {
    const update = (person: PublicUser) =>
      person.id === userId ? { ...person, connectionStatus: status } : person
    setPeople((current) =>
      status === 'connected'
        ? current.map(update)
        : current.filter((person) => person.id !== userId),
    )
    setSelectedUser((current) => (current ? update(current) : current))
  }

  const changeConnection = async (person: PublicUser) => {
    if (person.isMe || busyUserId) return
    if (
      person.connectionStatus === 'connected' &&
      !window.confirm(
        '¿Eliminar esta conexión? El chat directo se archivará para ambas personas.',
      )
    ) {
      return
    }
    setBusyUserId(person.id)
    setError('')
    setNotice('')
    try {
      if (person.connectionStatus === 'requested') {
        const result = await cancelConnectionRequest(person.id)
        updatePerson(person.id, result.connectionStatus)
        setNotice('La solicitud privada fue retirada.')
      } else if (person.connectionStatus === 'connected') {
        const result = await removeConnection(person.id)
        updatePerson(person.id, result.connectionStatus)
        setNotice('La conexión fue eliminada y el chat quedó archivado.')
      } else {
        const result = await sendConnectionRequest(person.id)
        updatePerson(person.id, result.connectionStatus)
        setNotice(
          result.matched
            ? `Tú y ${person.displayName} ahora son una conexión.`
            : 'Solicitud enviada de forma privada.',
        )
      }
    } catch (changeError) {
      setError(readableError(changeError, 'No pudimos actualizar la conexión.'))
    } finally {
      setBusyUserId(null)
    }
  }

  const openProfile = (userId: string) => {
    setSelectedUserId(userId)
    setSelectedUser(null)
    setSelectedPosts([])
    setProfileLoading(true)
    setProfileError('')
    setNotice('')
    onProfileChange?.(userId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeProfile = () => {
    setSelectedUserId(null)
    setSelectedUser(null)
    setSelectedPosts([])
    setProfileError('')
    setNotice('')
    onProfileChange?.(null)
  }

  if (selectedUserId) {
    if (profileLoading) {
      return (
        <div className="network-loading" role="status">
          <span className="network-spinner" /> Cargando perfil…
        </div>
      )
    }
    if (profileError || !selectedUser) {
      return (
        <section className="network-empty">
          <h2>No pudimos abrir este perfil</h2>
          <p>{profileError || 'El perfil ya no está disponible.'}</p>
          <button type="button" onClick={closeProfile}>
            Volver a conexiones
          </button>
        </section>
      )
    }
    return (
      <>
        {error && <p className="network-alert">{error}</p>}
        {notice && <p className="network-success">{notice}</p>}
        <PublicProfile
          person={selectedUser}
          posts={selectedPosts}
          busy={busyUserId === selectedUser.id}
          onBack={closeProfile}
          onConnectionChange={(person) => void changeConnection(person)}
          onOpenOwnProfile={onOpenOwnProfile}
          onStartChat={onStartChat}
        />
      </>
    )
  }

  return (
    <div className="network-directory">
      <section className="network-intro">
        <div>
          <span>Privacidad por diseño</span>
          <h2>Mis conexiones</h2>
          <p>
            Aquí aparecen solo las personas que aceptaron conectarse contigo.
            Conoce nuevos perfiles mediante publicaciones, comentarios o un QR.
          </p>
        </div>
        <div className="network-intro__identity">
          <span>Conectado como</span>
          <strong>@{currentUser.username}</strong>
        </div>
      </section>
      <label className="network-search">
        <span className="network-sr-only">Buscar entre mis conexiones</span>
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={80}
          placeholder="Buscar entre mis conexiones…"
          autoComplete="off"
        />
      </label>
      {error && <p className="network-alert">{error}</p>}
      {notice && <p className="network-success">{notice}</p>}
      {loading ? (
        <div className="network-loading" role="status">
          <span className="network-spinner" /> Cargando conexiones…
        </div>
      ) : people.length ? (
        <div className="network-person-grid">
          {people.map((person) => (
            <ConnectionCard
              key={person.id}
              person={person}
              onOpen={openProfile}
              onStartChat={onStartChat}
            />
          ))}
        </div>
      ) : (
        <section className="network-empty">
          <h2>
            {query ? 'No encontramos esa conexión' : 'Aún no tienes conexiones'}
          </h2>
          <p>
            {query
              ? 'Prueba con otro nombre o usuario.'
              : 'Participa en publicaciones o intercambia un código QR. El chat se habilita únicamente con consentimiento mutuo.'}
          </p>
        </section>
      )}
    </div>
  )
}
