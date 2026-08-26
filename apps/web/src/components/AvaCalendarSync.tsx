import { useEffect, useState, type FormEvent } from 'react'
import {
  getAvaCalendar,
  syncAvaCalendar,
  type AvaCalendarOverview,
} from '../api/ava-calendar'
import './AvaCalendarSync.css'

const dateFormatter = new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18" />
      <path d="m8 15 2 2 5-5" />
    </svg>
  )
}

function readableError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'No pudimos sincronizar el calendario de AVA.'
}

function formatSyncDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date)
}

export function AvaCalendarSync({
  onSynchronized,
}: {
  onSynchronized?: () => void
} = {}) {
  const [overview, setOverview] = useState<AvaCalendarOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [calendarUrl, setCalendarUrl] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [resultMessage, setResultMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    getAvaCalendar()
      .then((result) => {
        if (!cancelled) setOverview(result)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const openDialog = () => {
    setError('')
    setResultMessage('')
    setDialogOpen(true)
  }

  const synchronize = async (event: FormEvent) => {
    event.preventDefault()
    if (!calendarUrl.trim() || syncing) return
    setSyncing(true)
    setError('')
    setResultMessage('')
    try {
      const result = await syncAvaCalendar(calendarUrl.trim())
      setOverview(result)
      onSynchronized?.()
      setCalendarUrl('')
      setResultMessage(
        result.importedCount === 0
          ? 'Sincronización completada. AVA no publicó actividades en este calendario.'
          : `Sincronización completada: ${result.importedCount} ${result.importedCount === 1 ? 'actividad importada' : 'actividades importadas'}.`,
      )
    } catch (syncError) {
      setError(readableError(syncError))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <section className="ava-sync-card" aria-label="Calendario de AVA">
        <span className="ava-sync-card__icon">
          <CalendarIcon />
        </span>
        <div>
          <strong>Calendario AVA</strong>
          <p>
            {loading
              ? 'Revisando sincronización…'
              : overview?.sync
                ? `${overview.upcomingCount} ${overview.upcomingCount === 1 ? 'actividad próxima' : 'actividades próximas'}`
                : 'Aún no está sincronizado'}
          </p>
          <button type="button" onClick={openDialog}>
            {overview?.sync ? 'Sincronizar nuevamente' : 'Conectar calendario'}
          </button>
        </div>
      </section>

      {dialogOpen && (
        <div className="ava-sync-modal" role="presentation">
          <div
            className="ava-sync-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ava-sync-title"
          >
            <header>
              <span>
                <CalendarIcon />
              </span>
              <div>
                <p>Integración académica</p>
                <h3 id="ava-sync-title">Sincronizar calendario de AVA</h3>
              </div>
            </header>

            <div className="ava-sync-steps">
              <p>
                En AVA abre{' '}
                <strong>
                  Calendario → Configuración → Compartir calendario
                </strong>{' '}
                y copia el enlace privado.
              </p>
              <a
                href="https://campusvirtual.duoc.cl/"
                target="_blank"
                rel="noreferrer"
              >
                Abrir AVA en otra pestaña
              </a>
            </div>

            <form onSubmit={synchronize}>
              <label htmlFor="ava-calendar-url">
                Enlace privado del calendario
              </label>
              <input
                id="ava-calendar-url"
                type="password"
                value={calendarUrl}
                onChange={(event) => setCalendarUrl(event.target.value)}
                placeholder="https://campusvirtual.duoc.cl/.../learn.ics"
                autoComplete="off"
                maxLength={2_000}
                required
                disabled={syncing}
              />
              <small>
                Konea usa el enlace durante esta sincronización y luego lo
                descarta.
              </small>

              {error && (
                <p className="ava-sync-error" role="alert">
                  {error}
                </p>
              )}
              {resultMessage && (
                <p className="ava-sync-success" role="status">
                  {resultMessage}
                </p>
              )}

              <div className="ava-sync-actions">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  disabled={syncing}
                >
                  Cerrar
                </button>
                <button type="submit" disabled={!calendarUrl.trim() || syncing}>
                  <CalendarIcon />
                  {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
                </button>
              </div>
            </form>

            {overview?.sync && (
              <section
                className="ava-sync-events"
                aria-label="Próximas actividades"
              >
                <header>
                  <strong>Próximas actividades</strong>
                  <span>
                    Última sincronización:{' '}
                    {formatSyncDate(overview.sync.lastSyncedAt)}
                  </span>
                </header>
                {overview.events.length === 0 ? (
                  <p className="ava-sync-empty">
                    No hay actividades futuras publicadas en el calendario.
                  </p>
                ) : (
                  <ul>
                    {overview.events.slice(0, 8).map((calendarEvent) => (
                      <li key={calendarEvent.id}>
                        <span>
                          <CalendarIcon />
                        </span>
                        <div>
                          <strong>{calendarEvent.title}</strong>
                          <time dateTime={calendarEvent.startsAt}>
                            {formatSyncDate(calendarEvent.startsAt)}
                          </time>
                          {calendarEvent.courseName && (
                            <small>{calendarEvent.courseName}</small>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </>
  )
}
