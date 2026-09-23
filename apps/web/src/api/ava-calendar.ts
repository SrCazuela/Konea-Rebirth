import { apiRequest } from './base'

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

export function getAvaCalendar() {
  return apiRequest<AvaCalendarOverview>('/ava-calendar')
}

export function syncAvaCalendar(calendarUrl: string) {
  return apiRequest<AvaCalendarOverview & { importedCount: number }>(
    '/ava-calendar/sync',
    {
      method: 'POST',
      body: JSON.stringify({ calendarUrl }),
    },
  )
}
