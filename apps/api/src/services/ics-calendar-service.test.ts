import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  calendarDateFloorInTimeZone,
  fetchAvaCalendar,
  parseIcsCalendar,
  validateAvaCalendarUrl,
} from './ics-calendar-service.js'

const calendar = `BEGIN:VCALENDAR\r
VERSION:2.0\r
BEGIN:VEVENT\r
UID:activity-1@blackboard\r
DTSTART:20300115T150000Z\r
DTEND:20300115T160000Z\r
SUMMARY:Entrega avance Capstone\r
DESCRIPTION:Subir informe y presentación al aula virtual.\r
CATEGORIES:Proyecto de Título\r
LOCATION:AVA Ultra\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:activity-2@blackboard\r
DTSTART;VALUE=DATE:20300120\r
SUMMARY:Inicio de unidad 3\r
DESCRIPTION:Texto largo que continúa en la siguiente \r
 línea.\r
END:VEVENT\r
END:VCALENDAR\r
`

describe('AVA ICS calendar parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses timed and all-day Blackboard events without exposing the feed URL', () => {
    const events = parseIcsCalendar(calendar)

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      title: 'Entrega avance Capstone',
      description: 'Subir informe y presentación al aula virtual.',
      courseName: 'Proyecto de Título',
      location: 'AVA Ultra',
      allDay: false,
    })
    expect(events[0]?.startsAt.toISOString()).toBe('2030-01-15T15:00:00.000Z')
    expect(events[1]).toMatchObject({
      title: 'Inicio de unidad 3',
      description: 'Texto largo que continúa en la siguiente línea.',
      allDay: true,
    })
  })

  it('deduplicates repeated events and accepts an empty valid calendar', () => {
    const duplicate = calendar.replace(
      'END:VCALENDAR',
      `${calendar.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/)?.[0]}\r\nEND:VCALENDAR`,
    )
    expect(parseIcsCalendar(duplicate)).toHaveLength(2)
    expect(parseIcsCalendar('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toEqual([])
  })

  it('only accepts private calendar feeds from the official AVA host', () => {
    expect(
      validateAvaCalendarUrl(
        'https://campusvirtual.duoc.cl/webapps/calendar/calendarFeed/example_token/learn.ics',
      ).hostname,
    ).toBe('campusvirtual.duoc.cl')

    expect(() =>
      validateAvaCalendarUrl(
        'https://example.com/webapps/calendar/calendarFeed/token/learn.ics',
      ),
    ).toThrow('calendario privado generado por AVA Duoc')
    expect(() =>
      validateAvaCalendarUrl(
        'https://campusvirtual.duoc.cl/webapps/calendar/calendarFeed/token/learn.ics?redirect=1',
      ),
    ).toThrow('calendario privado generado por AVA Duoc')
  })

  it('rejects incomplete containers and ignores invalid or cancelled events', () => {
    expect(() =>
      parseIcsCalendar('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VCALENDAR'),
    ).toThrow('calendario válido')
    expect(() =>
      parseIcsCalendar('contenido previo BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
    ).toThrow('calendario válido')
    expect(() =>
      parseIcsCalendar('BEGIN:VCALENDAR\r\nEND:VEVENT\r\nEND:VCALENDAR'),
    ).toThrow('calendario válido')
    expect(() =>
      parseIcsCalendar(
        'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR',
      ),
    ).toThrow('calendario válido')

    const guardedCalendar = `BEGIN:VCALENDAR\r
BEGIN:VEVENT\r
UID:invalid-date\r
DTSTART;VALUE=DATE:20300230\r
SUMMARY:Fecha imposible\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled\r
DTSTART:20300115T150000Z\r
STATUS:CANCELLED\r
SUMMARY:Actividad cancelada\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:reversed\r
DTSTART:20300115T160000Z\r
DTEND:20300115T150000Z\r
SUMMARY:Intervalo invertido\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:valid\r
DTSTART:20300116T150000Z\r
SUMMARY:Actividad\u0000 válida\r
END:VEVENT\r
END:VCALENDAR\r
`
    expect(parseIcsCalendar(guardedCalendar)).toEqual([
      expect.objectContaining({ title: 'Actividad válida' }),
    ])
  })

  it('represents the current calendar date independently of the UTC rollover', () => {
    expect(
      calendarDateFloorInTimeZone(
        new Date('2026-09-09T00:30:00.000Z'),
        'America/Santiago',
      ).toISOString(),
    ).toBe('2026-09-08T00:00:00.000Z')
  })

  it('rejects login HTML and caps streamed responses before parsing', async () => {
    const calendarUrl =
      'https://campusvirtual.duoc.cl/webapps/calendar/calendarFeed/test_token/learn.ics'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('<html>BEGIN:VCALENDAR</html>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      ),
    )
    await expect(fetchAvaCalendar(calendarUrl)).rejects.toMatchObject({
      code: 'AVA_CALENDAR_REJECTED',
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        new Response('x'.repeat(2 * 1024 * 1024 + 1), {
          headers: { 'Content-Type': 'text/calendar' },
        }),
      ),
    )
    await expect(fetchAvaCalendar(calendarUrl)).rejects.toMatchObject({
      code: 'AVA_CALENDAR_TOO_LARGE',
    })
  })
})
