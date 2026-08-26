import { createHash } from 'node:crypto'
import { ApiError } from '../errors/api-error.js'

const AVA_CALENDAR_HOST = 'campusvirtual.duoc.cl'
const AVA_CALENDAR_PATH =
  /^\/webapps\/calendar\/calendarFeed\/[A-Za-z0-9_-]+\/learn\.ics$/
const MAX_CALENDAR_BYTES = 2 * 1024 * 1024
const MAX_CALENDAR_EVENTS = 2_000
const DEFAULT_TIME_ZONE = 'America/Santiago'

type IcsProperty = {
  value: string
  parameters: Record<string, string>
}

export type ImportedCalendarEvent = {
  externalId: string
  uid: string | null
  title: string
  description: string | null
  location: string | null
  courseName: string | null
  startsAt: Date
  endsAt: Date | null
  allDay: boolean
}

function truncate(value: string, maximum: number) {
  return Array.from(value).slice(0, maximum).join('')
}

function decodeIcsText(value: string) {
  return value
    .replaceAll(/\\[nN]/g, '\n')
    .replaceAll('\\,', ',')
    .replaceAll('\\;', ';')
    .replaceAll('\\\\', '\\')
    .trim()
}

function unfoldIcsLines(content: string) {
  return content.replaceAll(/\r?\n[ \t]/g, '').split(/\r?\n/)
}

function parseProperty(line: string) {
  const separator = line.indexOf(':')
  if (separator < 1) return null
  const descriptor = line.slice(0, separator)
  const [rawName, ...rawParameters] = descriptor.split(';')
  if (!rawName) return null
  const parameters: Record<string, string> = {}
  for (const parameter of rawParameters) {
    const equals = parameter.indexOf('=')
    if (equals < 1) continue
    parameters[parameter.slice(0, equals).toUpperCase()] = parameter
      .slice(equals + 1)
      .replace(/^"|"$/g, '')
  }
  return {
    name: rawName.toUpperCase(),
    property: { value: line.slice(separator + 1), parameters },
  }
}

function addProperty(
  properties: Map<string, IcsProperty[]>,
  name: string,
  property: IcsProperty,
) {
  properties.set(name, [...(properties.get(name) ?? []), property])
}

function firstProperty(
  properties: Map<string, IcsProperty[]>,
  ...names: string[]
) {
  for (const name of names) {
    const property = properties.get(name)?.[0]
    if (property) return property
  }
  return undefined
}

function dateParts(value: string) {
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z|[+-]\d{4})?$/,
  )
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
    second: Number(match[6] ?? 0),
    suffix: match[7] ?? '',
    hasTime: Boolean(match[4]),
  }
}

function zonedDateToUtc(
  parts: NonNullable<ReturnType<typeof dateParts>>,
  timeZone: string,
) {
  let timestamp = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const formatted = Object.fromEntries(
      formatter
        .formatToParts(new Date(timestamp))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    )
    const representedTimestamp = Date.UTC(
      formatted.year!,
      formatted.month! - 1,
      formatted.day!,
      formatted.hour!,
      formatted.minute!,
      formatted.second!,
    )
    const desiredTimestamp = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    timestamp += desiredTimestamp - representedTimestamp
  }
  return new Date(timestamp)
}

function parseIcsDate(property: IcsProperty | undefined) {
  if (!property) return null
  const parts = dateParts(property.value.trim())
  if (!parts) return null
  const allDay = property.parameters.VALUE === 'DATE' || !parts.hasTime

  if (allDay || parts.suffix === 'Z') {
    return {
      date: new Date(
        Date.UTC(
          parts.year,
          parts.month - 1,
          parts.day,
          parts.hour,
          parts.minute,
          parts.second,
        ),
      ),
      allDay,
    }
  }

  if (/^[+-]\d{4}$/.test(parts.suffix)) {
    const direction = parts.suffix.startsWith('+') ? 1 : -1
    const offsetMinutes =
      Number(parts.suffix.slice(1, 3)) * 60 + Number(parts.suffix.slice(3, 5))
    const utc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    )
    return {
      date: new Date(utc - direction * offsetMinutes * 60_000),
      allDay: false,
    }
  }

  try {
    return {
      date: zonedDateToUtc(
        parts,
        property.parameters.TZID || DEFAULT_TIME_ZONE,
      ),
      allDay: false,
    }
  } catch {
    return null
  }
}

function eventFromProperties(properties: Map<string, IcsProperty[]>) {
  const start = parseIcsDate(firstProperty(properties, 'DTSTART', 'DUE'))
  const summary = decodeIcsText(
    firstProperty(properties, 'SUMMARY')?.value ?? '',
  )
  if (!start || !summary) return null

  const end = parseIcsDate(firstProperty(properties, 'DTEND'))
  const uid = decodeIcsText(firstProperty(properties, 'UID')?.value ?? '')
  const recurrenceId = firstProperty(properties, 'RECURRENCE-ID')?.value ?? ''
  const sourceIdentity = `${uid || summary}|${start.date.toISOString()}|${recurrenceId}`
  const externalId = createHash('sha256').update(sourceIdentity).digest('hex')
  const description = decodeIcsText(
    firstProperty(properties, 'DESCRIPTION')?.value ?? '',
  )
  const location = decodeIcsText(
    firstProperty(properties, 'LOCATION')?.value ?? '',
  )
  const courseName = decodeIcsText(
    firstProperty(
      properties,
      'X-BLACKBOARD-CALENDAR-NAME',
      'X-BB-CALENDAR-NAME',
      'CATEGORIES',
    )?.value ?? '',
  )

  return {
    externalId,
    uid: uid ? truncate(uid, 500) : null,
    title: truncate(summary, 300),
    description: description ? truncate(description, 8_000) : null,
    location: location ? truncate(location, 300) : null,
    courseName: courseName ? truncate(courseName, 300) : null,
    startsAt: start.date,
    endsAt: end?.date ?? null,
    allDay: start.allDay,
  } satisfies ImportedCalendarEvent
}

export function parseIcsCalendar(content: string) {
  if (!content.includes('BEGIN:VCALENDAR')) {
    throw new ApiError(
      422,
      'INVALID_AVA_CALENDAR',
      'El enlace no devolvió un calendario válido.',
    )
  }

  const events: ImportedCalendarEvent[] = []
  let currentEvent: Map<string, IcsProperty[]> | null = null
  for (const line of unfoldIcsLines(content)) {
    if (line === 'BEGIN:VEVENT') {
      currentEvent = new Map()
      continue
    }
    if (line === 'END:VEVENT') {
      if (currentEvent) {
        const event = eventFromProperties(currentEvent)
        if (event) events.push(event)
      }
      currentEvent = null
      if (events.length > MAX_CALENDAR_EVENTS) {
        throw new ApiError(
          422,
          'AVA_CALENDAR_TOO_MANY_EVENTS',
          'El calendario contiene demasiadas actividades.',
        )
      }
      continue
    }
    if (!currentEvent) continue
    const parsed = parseProperty(line)
    if (parsed) addProperty(currentEvent, parsed.name, parsed.property)
  }

  return [...new Map(events.map((event) => [event.externalId, event])).values()]
}

export function validateAvaCalendarUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ApiError(
      400,
      'INVALID_AVA_CALENDAR_URL',
      'Ingresa un enlace válido del calendario de AVA.',
    )
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== AVA_CALENDAR_HOST ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !AVA_CALENDAR_PATH.test(url.pathname)
  ) {
    throw new ApiError(
      400,
      'INVALID_AVA_CALENDAR_URL',
      'El enlace debe ser el calendario privado generado por AVA Duoc.',
    )
  }
  return url
}

export async function fetchAvaCalendar(value: string) {
  const url = validateAvaCalendarUrl(value)
  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'text/calendar' },
    })
  } catch {
    throw new ApiError(
      502,
      'AVA_CALENDAR_UNAVAILABLE',
      'No pudimos conectarnos con AVA. Inténtalo nuevamente.',
    )
  }

  if (!response.ok) {
    throw new ApiError(
      422,
      'AVA_CALENDAR_REJECTED',
      'AVA rechazó el enlace. Genera uno nuevo desde Blackboard.',
    )
  }
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > MAX_CALENDAR_BYTES) {
    throw new ApiError(
      413,
      'AVA_CALENDAR_TOO_LARGE',
      'El calendario supera el tamaño permitido.',
    )
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_CALENDAR_BYTES) {
    throw new ApiError(
      413,
      'AVA_CALENDAR_TOO_LARGE',
      'El calendario supera el tamaño permitido.',
    )
  }
  return parseIcsCalendar(new TextDecoder('utf-8').decode(bytes))
}
