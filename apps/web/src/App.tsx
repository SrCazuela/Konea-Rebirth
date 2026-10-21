import { lazy, Suspense, useEffect, useState } from 'react'
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

const LandingPage = lazy(() => import('./components/LandingPage'))

function SessionLoading() {
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
      .catch((error) => {
        console.error('Failed to restore session:', error)
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

  if (!sessionReady) {
    return <SessionLoading />
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
    <>
      <Suspense fallback={<SessionLoading />}>
        <LandingPage apiState={apiState} onAuth={setAuthMode} />
      </Suspense>
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
    </>
  )
}

export default App
