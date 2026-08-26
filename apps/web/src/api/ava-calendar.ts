import { ApiClientError } from './auth'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type AvaCalendarEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  courseName: string | null
  startsAt: string
  endsAt: string | null
  allDay: boolean
}

export type AvaCalendarOverview = {
  sync: {
    lastSyncedAt: string
    lastEventCount: number
  } | null
  upcomingCount: number
  events: AvaCalendarEvent[]
}

type ErrorEnvelope = {
  error?: { code?: string; message?: string }
}

async function calendarRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (response.status === 401) {
    window.dispatchEvent(new Event('konea:session-expired'))
  }
  const body = (await response.json().catch(() => ({}))) as T & ErrorEnvelope
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      body.error?.code ?? 'AVA_CALENDAR_REQUEST_FAILED',
      body.error?.message ?? 'No pudimos sincronizar el calendario de AVA.',
    )
  }
  return body
}

export function getAvaCalendar() {
  return calendarRequest<AvaCalendarOverview>('/ava-calendar')
}

export function syncAvaCalendar(calendarUrl: string) {
  return calendarRequest<AvaCalendarOverview & { importedCount: number }>(
    '/ava-calendar/sync',
    {
      method: 'POST',
      body: JSON.stringify({ calendarUrl }),
    },
  )
}
