import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KoneaUser } from '../api/auth'
import {
  followUser,
  getPublicUser,
  searchUsers,
  unfollowUser,
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
}

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
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

function FollowButton({
  person,
  busy,
  onToggle,
}: {
  person: PublicUser
  busy: boolean
  onToggle: (person: PublicUser) => void
}) {
  if (person.isMe) return null

  return (
    <button
      className={`network-follow-button${person.followedByMe ? ' network-follow-button--following' : ''}`}
      type="button"
      onClick={() => onToggle(person)}
      disabled={busy}
      aria-pressed={person.followedByMe}
    >
      {busy ? 'Guardando…' : person.followedByMe ? 'Siguiendo' : 'Seguir'}
    </button>
  )
}

function PersonCard({
  person,
  busy,
  onOpen,
  onToggleFollow,
  onStartChat,
}: {
  person: PublicUser
  busy: boolean
  onOpen: (userId: string) => void
  onToggleFollow: (person: PublicUser) => void
  onStartChat?: (userId: string) => void
}) {
  const location = person.campus || person.institution
  const context = [person.career, location].filter(Boolean).join(' · ')

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
          <dt>{person.stats.posts}</dt>
          <dd>Publicaciones</dd>
        </div>
        <div>
          <dt>{person.stats.followers}</dt>
          <dd>Seguidores</dd>
        </div>
      </dl>
      <div className="network-person-card__actions">
        <button
          className="network-profile-button"
          type="button"
          onClick={() => onOpen(person.id)}
        >
          Ver perfil
        </button>
        <FollowButton person={person} busy={busy} onToggle={onToggleFollow} />
        {!person.isMe && onStartChat && (
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
        {post.moderationStatus !== 'approved' && (
          <span
            className={`network-post-status network-post-status--${post.moderationStatus}`}
          >
            {post.moderationStatus === 'pending' ? 'En revisión' : 'Rechazada'}
          </span>
        )}
      </header>
      <p>{post.content}</p>
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt="Contenido adjunto a la publicación"
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

function PublicProfile({
  person,
  posts,
  busy,
  onBack,
  onToggleFollow,
  onOpenOwnProfile,
  onStartChat,
}: {
  person: PublicUser
  posts: Post[]
  busy: boolean
  onBack: () => void
  onToggleFollow: (person: PublicUser) => void
  onOpenOwnProfile: () => void
  onStartChat?: (userId: string) => void
}) {
  return (
    <div className="network-public-profile">
      <button className="network-back-button" type="button" onClick={onBack}>
        <ArrowIcon /> Volver a personas
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
                <FollowButton
                  person={person}
                  busy={busy}
                  onToggle={onToggleFollow}
                />
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
          <dl className="network-profile-stats">
            <div>
              <dt>{person.stats.posts}</dt>
              <dd>Publicaciones</dd>
            </div>
            <div>
              <dt>{person.stats.followers}</dt>
              <dd>Seguidores</dd>
            </div>
            <div>
              <dt>{person.stats.following}</dt>
              <dd>Siguiendo</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="network-posts-section">
        <div className="network-section-heading">
          <span>Actividad</span>
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
            <h3>Aún no hay publicaciones</h3>
            <p>Cuando comparta algo con Konea, aparecerá en este espacio.</p>
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
}: NetworkProps) {
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<PublicUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [followError, setFollowError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    initialUserId,
  )
  const [selectedUser, setSelectedUser] = useState<PublicUser | null>(null)
  const [selectedPosts, setSelectedPosts] = useState<Post[]>([])
  const [profileLoading, setProfileLoading] = useState(Boolean(initialUserId))
  const [profileError, setProfileError] = useState('')

  const loadDirectory = useCallback(
    async (search = query) => {
      setLoading(true)
      setError('')
      try {
        setPeople(await searchUsers(search))
      } catch (loadError) {
        setError(readableError(loadError, 'No pudimos cargar las personas.'))
      } finally {
        setLoading(false)
      }
    },
    [query],
  )

  useEffect(() => {
    let cancelled = false
    const delay = query.trim() ? 320 : 0
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setError('')
      searchUsers(query)
        .then((users) => {
          if (!cancelled) setPeople(users)
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setError(
              readableError(loadError, 'No pudimos cargar las personas.'),
            )
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, delay)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [query])

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

  const visiblePeople = useMemo(
    () => [...people].sort((a, b) => Number(a.isMe) - Number(b.isMe)),
    [people],
  )

  const applyFollow = (
    userId: string,
    followed: boolean,
    followersCount: number,
  ) => {
    const update = (person: PublicUser) =>
      person.id === userId
        ? {
            ...person,
            followedByMe: followed,
            stats: { ...person.stats, followers: followersCount },
          }
        : person

    setPeople((current) => current.map(update))
    setSelectedUser((current) => (current ? update(current) : current))
  }

  const toggleFollow = async (person: PublicUser) => {
    if (person.isMe || busyUserId) return
    setBusyUserId(person.id)
    setFollowError('')
    try {
      const result = person.followedByMe
        ? await unfollowUser(person.id)
        : await followUser(person.id)
      applyFollow(person.id, result.followed, result.followersCount)
    } catch (toggleError) {
      setFollowError(
        readableError(toggleError, 'No pudimos actualizar la conexión.'),
      )
    } finally {
      setBusyUserId(null)
    }
  }

  const openProfile = (userId: string) => {
    setSelectedUserId(userId)
    setSelectedUser(null)
    setSelectedPosts([])
    setProfileError('')
    setProfileLoading(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeProfile = () => {
    setSelectedUserId(null)
    setSelectedUser(null)
    setSelectedPosts([])
    setProfileError('')
  }

  const retryProfile = async () => {
    if (!selectedUserId) return
    setProfileLoading(true)
    setProfileError('')
    try {
      const result = await getPublicUser(selectedUserId)
      setSelectedUser(result.user)
      setSelectedPosts(result.posts)
    } catch (loadError) {
      setProfileError(readableError(loadError, 'No pudimos abrir este perfil.'))
    } finally {
      setProfileLoading(false)
    }
  }

  if (selectedUserId) {
    if (profileLoading) {
      return (
        <div className="network-loading" role="status">
          <span className="network-spinner" />
          <span>Cargando perfil…</span>
        </div>
      )
    }

    if (profileError || !selectedUser) {
      return (
        <section className="network-empty">
          <h2>No pudimos abrir este perfil</h2>
          <p>{profileError || 'El perfil ya no está disponible.'}</p>
          <div className="network-empty__actions">
            <button type="button" onClick={closeProfile}>
              Volver a personas
            </button>
            <button type="button" onClick={() => void retryProfile()}>
              Intentar nuevamente
            </button>
          </div>
        </section>
      )
    }

    return (
      <>
        {followError && (
          <p className="network-alert" role="alert">
            {followError}
          </p>
        )}
        <PublicProfile
          person={selectedUser}
          posts={selectedPosts}
          busy={busyUserId === selectedUser.id}
          onBack={closeProfile}
          onToggleFollow={(person) => void toggleFollow(person)}
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
          <span>Personas</span>
          <h2>Encuentra tu próxima conexión</h2>
          <p>
            Descubre estudiantes y docentes de la comunidad Konea por nombre,
            carrera, institución o campus.
          </p>
        </div>
        <div className="network-intro__identity">
          <span>Conectado como</span>
          <strong>@{currentUser.username}</strong>
        </div>
      </section>

      <label className="network-search">
        <span className="network-sr-only">Buscar personas</span>
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={80}
          placeholder="Buscar por nombre, carrera, institución o campus…"
          autoComplete="off"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}>
            Limpiar
          </button>
        )}
      </label>

      {followError && (
        <p className="network-alert" role="alert">
          {followError}
        </p>
      )}

      {loading ? (
        <div className="network-loading" role="status">
          <span className="network-spinner" />
          <span>Buscando personas…</span>
        </div>
      ) : error ? (
        <section className="network-empty">
          <h2>No pudimos cargar la comunidad</h2>
          <p>{error}</p>
          <button type="button" onClick={() => void loadDirectory()}>
            Intentar nuevamente
          </button>
        </section>
      ) : visiblePeople.length === 0 ? (
        <section className="network-empty">
          <h2>No encontramos coincidencias</h2>
          <p>
            Prueba con otro nombre, carrera, institución o campus de la
            comunidad.
          </p>
          {query && (
            <button type="button" onClick={() => setQuery('')}>
              Ver todas las personas
            </button>
          )}
        </section>
      ) : (
        <>
          <p className="network-results-count" role="status">
            {query.trim()
              ? `${visiblePeople.length} resultado${visiblePeople.length === 1 ? '' : 's'}`
              : `${visiblePeople.length} persona${visiblePeople.length === 1 ? '' : 's'} en Konea`}
          </p>
          <div className="network-person-grid">
            {visiblePeople.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                busy={busyUserId === person.id}
                onOpen={openProfile}
                onToggleFollow={(target) => void toggleFollow(target)}
                onStartChat={onStartChat}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
