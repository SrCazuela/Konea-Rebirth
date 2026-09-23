import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createStudySession,
  getStudyOverview,
  getStudySessions,
  updateStudySession,
} from './study'

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('study API client', () => {
  it('encodes the requested IANA time zone and includes the session cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        activeSession: null,
        stats: {},
        byDay: [],
        byCourse: [],
        recentSessions: [],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await getStudyOverview('America/Santiago')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/study/overview?timeZone=America%2FSantiago',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('sends an idempotent session draft as JSON', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ session: { id: 'session-1' } }))
    vi.stubGlobal('fetch', fetchMock)

    await createStudySession({
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      method: 'pomodoro',
      courseId: null,
      taskId: null,
      plannedDurationSeconds: 1_500,
      breakDurationSeconds: 300,
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/study/sessions',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: expect.stringContaining('11111111-1111-4111-8111-111111111111'),
      }),
    )
  })

  it('uses the heartbeat transition expected by the server', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ session: { id: 'session-1' } }))
    vi.stubGlobal('fetch', fetchMock)

    await updateStudySession('session-1', 'heartbeat')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/study/sessions/session-1',
      expect.objectContaining({
        method: 'PATCH',
        body: '{"action":"heartbeat"}',
      }),
    )
  })

  it('builds a filtered and cursor-based history query', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ sessions: [], nextCursor: null }))
    vi.stubGlobal('fetch', fetchMock)

    await getStudySessions({
      limit: 15,
      cursor: '2026-09-08T10:30:00.000Z',
      status: 'completed',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/study/sessions?limit=15&cursor=2026-09-08T10%3A30%3A00.000Z&status=completed',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})
