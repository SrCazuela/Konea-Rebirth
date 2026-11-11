import { useEffect, useState } from 'react'
import { getAcademicDashboard, type AcademicDashboard } from '../api/academic'
import './CampusAgenda.css'

const dueDate = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
})

export function CampusAgenda() {
  const [dashboard, setDashboard] = useState<AcademicDashboard | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    let inFlight = false
    const refresh = () => {
      if (document.visibilityState !== 'visible' || inFlight) return
      inFlight = true
      void getAcademicDashboard()
        .then((data) => {
          if (active) {
            setDashboard(data)
            setFailed(false)
          }
        })
        .catch(() => {
          if (active) setFailed(true)
        })
        .finally(() => {
          inFlight = false
        })
    }
    refresh()
    const timer = window.setInterval(refresh, 10_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const tasks =
    dashboard?.tasks.filter((task) => task.status !== 'completed') ?? []
  const upcoming = [...tasks]
    .sort((a, b) => {
      const first = a.dueAt ? Date.parse(a.dueAt) : Infinity
      const second = b.dueAt ? Date.parse(b.dueAt) : Infinity
      return first - second || a.title.localeCompare(b.title, 'es')
    })
    .slice(0, 3)

  return (
    <section
      className="portal-card campus-agenda"
      aria-labelledby="campus-agenda-heading"
    >
      <div className="campus-agenda__heading">
        <div>
          <span className="portal-card-kicker">UN POCO DE ORDEN</span>
          <h2 id="campus-agenda-heading">Tu próxima meta</h2>
        </div>
        <span className="campus-agenda__symbol" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <rect x="4" y="5" width="16" height="16" rx="3" />
            <path d="M8 3v4m8-4v4M4 10h16m-11 5 2 2 4-4" />
          </svg>
        </span>
      </div>
      {!dashboard ? (
        <p role="status">
          {failed
            ? 'Puedes consultar tus pendientes en Materias.'
            : 'Buscando tus próximos pendientes…'}
        </p>
      ) : (
        <>
          <div className="campus-agenda__counts">
            <div>
              <strong>{tasks.length}</strong>
              <span>pendientes</span>
            </div>
            <div>
              <strong>{dashboard.courses.length}</strong>
              <span>materias activas</span>
            </div>
          </div>
          {upcoming.length ? (
            <ul>
              {upcoming.map((task) => (
                <li key={task.id}>
                  <span
                    className={`campus-agenda__dot${task.priority === 'high' ? ' is-important' : ''}`}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{task.title}</strong>
                    <span>
                      {task.dueAt
                        ? dueDate.format(new Date(task.dueAt))
                        : 'Sin fecha de entrega'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Tu agenda está despejada. Puedes preparar tu próximo pendiente
              cuando quieras.
            </p>
          )}
        </>
      )}
      <a className="campus-agenda__link" href="#academic">
        Ver mi agenda <span aria-hidden="true">↗</span>
      </a>
      <a className="campus-agenda__focus" href="#focusbuddy">
        <span aria-hidden="true">◷</span>
        <div>
          <strong>Encuentra tu ritmo</strong>
          <small>Abre una sesión de FocusBuddy</small>
        </div>
        <span aria-hidden="true">→</span>
      </a>
    </section>
  )
}
