import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  checkApiHealth,
  getCurrentUser,
  logout,
  type KoneaUser,
} from './api/auth'
import { AuthDialog, type AuthMode } from './components/AuthDialog'
import { Portal } from './components/Portal'
import { KoneaLogo } from './components/KoneaLogo'
import './App.css'

type ApiState = 'checking' | 'online' | 'offline'

const LandingPage = lazy(() => import('./components/LandingPage'))

function SessionLoading() {
  return (
    <main className="session-loading">
      <div className="session-loading__card" role="status" aria-live="polite">
        <KoneaLogo className="session-loading__logo" width={180} />
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
  const accountVersion = useRef(0)
  const commitUser = useCallback((user: KoneaUser | null) => {
    accountVersion.current += 1
    setCurrentUser((previous) =>
      JSON.stringify(previous) === JSON.stringify(user) ? previous : user,
    )
  }, [])

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
        if (active) commitUser(user)
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
  }, [commitUser])

  useEffect(() => {
    const handleSessionExpired = () => commitUser(null)
    window.addEventListener('konea:session-expired', handleSessionExpired)
    return () =>
      window.removeEventListener('konea:session-expired', handleSessionExpired)
  }, [commitUser])

  useEffect(() => {
    if (!currentUser?.id) return
    let active = true
    let refreshing = false
    const refreshAccount = async () => {
      if (!active || refreshing || document.visibilityState !== 'visible')
        return
      refreshing = true
      const version = accountVersion.current
      try {
        const user = await getCurrentUser()
        if (active && version === accountVersion.current) commitUser(user)
      } catch {
        // A temporary outage must not discard an authenticated account.
      } finally {
        refreshing = false
      }
    }
    const refresh = () => void refreshAccount()
    const timer = window.setInterval(refresh, 10_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [currentUser?.id, commitUser])

  async function signOut() {
    await logout()
    commitUser(null)
  }

  if (!sessionReady) {
    return <SessionLoading />
  }

  if (currentUser) {
    return (
      <Portal user={currentUser} onUserChange={commitUser} onLogout={signOut} />
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
            commitUser(user)
            setApiState('online')
          }}
        />
      ) : null}
    </>
  )
}

export default App
