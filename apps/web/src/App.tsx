import { useEffect, useState } from 'react'
import {
  checkApiHealth,
  getCurrentUser,
  logout,
  type KoneaUser,
} from './api/auth'
import { AuthDialog, type AuthMode } from './components/AuthDialog'
import { Portal } from './components/Portal'
import './App.css'

type ApiState = 'checking' | 'online' | 'offline'

const foundations = [
  {
    number: '01',
    title: 'Comunidad universitaria',
    description:
      'Un espacio para compartir anuncios, experiencias y oportunidades dentro del campus.',
  },
  {
    number: '02',
    title: 'Colaboración real',
    description:
      'Portafolios académicos, comentarios y conexiones recíprocas pensadas para colaborar sin contactos no deseados.',
  },
  {
    number: '03',
    title: 'Convivencia segura',
    description:
      'Moderación transparente, roles claros y herramientas que cuidan a la comunidad.',
  },
]

function App() {
  const [apiState, setApiState] = useState<ApiState>('checking')
  const [currentUser, setCurrentUser] = useState<KoneaUser | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)

  useEffect(() => {
    let active = true

    void checkApiHealth()
      .then(() => {
        if (active) setApiState('online')
      })
      .catch(() => {
        if (active) setApiState('offline')
      })

    void getCurrentUser()
      .then((user) => {
        if (active) setCurrentUser(user)
      })
      .catch(() => {
        if (active) setApiState('offline')
      })
      .finally(() => {
        if (active) setSessionReady(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const handleSessionExpired = () => setCurrentUser(null)
    window.addEventListener('konea:session-expired', handleSessionExpired)
    return () =>
      window.removeEventListener('konea:session-expired', handleSessionExpired)
  }, [])

  async function signOut() {
    await logout()
    setCurrentUser(null)
  }

  const apiLabel = {
    checking: 'Comprobando servicios',
    online: 'API conectada',
    offline: 'API local sin iniciar',
  }[apiState]

  if (!sessionReady) {
    return (
      <main className="session-loading">
        <div className="session-loading__card" role="status" aria-live="polite">
          <img
            className="session-loading__logo"
            src="/konea-logo.svg"
            alt="Konea"
          />
          <span className="session-loading__spinner" aria-hidden="true" />
          <p>Preparando tu espacio…</p>
        </div>
      </main>
    )
  }

  if (currentUser) {
    return (
      <Portal
        user={currentUser}
        onUserChange={setCurrentUser}
        onLogout={signOut}
      />
    )
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Konea, inicio">
          <img className="brand-logo" src="/konea-logo.svg" alt="" />
        </a>

        <nav aria-label="Navegación principal">
          <a href="#vision">Visión</a>
          <a href="#foundation">Fundamentos</a>
        </nav>

        <div className="header-actions">
          <span className={`api-status api-status--${apiState}`}>
            <span className="status-dot" aria-hidden="true" />
            {apiLabel}
          </span>

          <button
            className="header-login"
            type="button"
            onClick={() => setAuthMode('login')}
          >
            Ingresar
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero" id="vision">
          <div className="hero-copy">
            <span className="eyebrow">Konea · Proyecto Capstone 2026</span>
            <h1>
              Tu campus,
              <span> conectado.</span>
            </h1>
            <p className="hero-summary">
              La red social universitaria donde estudiantes y docentes pueden
              compartir sus proyectos, formar conexiones por consentimiento,
              colaborar y sentirse parte de su comunidad.
            </p>

            <div className="hero-actions">
              <button
                className="button button--primary"
                type="button"
                onClick={() => setAuthMode('register')}
              >
                Crear mi cuenta
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setAuthMode('login')}
              >
                Ya tengo una cuenta
              </button>
            </div>
          </div>

          <div className="hero-visual" aria-label="Vista conceptual de Konea">
            <div className="orbit orbit--large" />
            <div className="orbit orbit--small" />
            <div className="connection connection--one" />
            <div className="connection connection--two" />
            <div className="person person--one">A</div>
            <div className="person person--two">M</div>
            <div className="person person--three">J</div>
            <div className="visual-center">
              <img className="visual-logo" src="/konea-logo.svg" alt="Konea" />
              <small>Campus conectado</small>
            </div>
          </div>
        </section>

        <section className="foundation" id="foundation">
          <div className="section-heading">
            <span className="eyebrow">Una comunidad conectada</span>
            <h2>Todo lo necesario para colaborar dentro del campus.</h2>
            <p>
              Konea reúne publicaciones, perfiles, conexiones, conversaciones,
              tareas y moderación en una experiencia coherente para escritorio y
              móvil.
            </p>
          </div>

          <div className="foundation-grid">
            {foundations.map((foundation) => (
              <article className="foundation-card" key={foundation.number}>
                <span>{foundation.number}</span>
                <h3>{foundation.title}</h3>
                <p>{foundation.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <a
          className="brand brand--footer"
          href="#top"
          aria-label="Konea, inicio"
        >
          <img className="brand-logo" src="/konea-logo.svg" alt="" />
        </a>
        <p>Proyecto Capstone · Desarrollo responsable y portable.</p>
      </footer>

      {authMode ? (
        <AuthDialog
          mode={authMode}
          onModeChange={setAuthMode}
          onClose={() => setAuthMode(null)}
          onAuthenticated={(user) => {
            setCurrentUser(user)
            setApiState('online')
          }}
        />
      ) : null}
    </div>
  )
}

export default App
