import { apiRequest } from './base'

export type StudyMethod =
  'pomodoro' | 'pomodoro_extended' | 'deep_work' | 'flowtime' | 'custom'

export type StudySessionStatus = 'active' | 'paused' | 'completed' | 'cancelled'

export type StudySessionCourse = {
  id: string
  name: string
}

export type StudySessionTask = {
  id: string
  title: string
}

export type StudySession = {
  id: string
  method: StudyMethod
  status: StudySessionStatus
  courseId: string | null
  taskId: string | null
  course: StudySessionCourse | null
  task: StudySessionTask | null
  plannedDurationSeconds: number
  breakDurationSeconds: number
  focusedSeconds: number
  accumulatedFocusedSeconds: number
  effectiveFocusedSeconds: number
  startedAt: string
  activeStartedAt: string | null
  lastHeartbeatAt: string
  lastResumedAt: string | null
  pausedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export type StudyStats = {
  todayFocusedSeconds: number
  weekFocusedSeconds: number
  totalFocusedSeconds: number
  totalSessions: number
  completedSessions: number
  currentStreakDays: number
  bestStreakDays: number
}

export type StudyDaySummary = {
  date: string
  focusedSeconds: number
  sessions: number
}

export type StudyCourseSummary = {
  courseId: string | null
  courseName: string
  focusedSeconds: number
  sessions: number
}

export type StudyOverview = {
  activeSession: StudySession | null
  stats: StudyStats
  byDay: StudyDaySummary[]
  byCourse: StudyCourseSummary[]
  recentSessions: StudySession[]
}

export type CreateStudySessionInput = {
  clientRequestId: string
  method: StudyMethod
  courseId?: string | null
  taskId?: string | null
  plannedDurationSeconds: number
  breakDurationSeconds?: number
}

export function getStudyOverview(timeZone: string) {
  const query = new URLSearchParams({ timeZone })
  return apiRequest<StudyOverview>(`/study/overview?${query.toString()}`)
}

export async function getStudySessions(input?: {
  limit?: number
  cursor?: string
  status?: StudySessionStatus
}) {
  const query = new URLSearchParams()
  if (input?.limit) query.set('limit', String(input.limit))
  if (input?.cursor) query.set('cursor', input.cursor)
  if (input?.status) query.set('status', input.status)
  const suffix = query.size ? `?${query.toString()}` : ''
  return apiRequest<{ sessions: StudySession[]; nextCursor: string | null }>(
    `/study/sessions${suffix}`,
  )
}

export function createStudySession(input: CreateStudySessionInput) {
  return apiRequest<{ session: StudySession; idempotent: boolean }>(
    '/study/sessions',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
}

export async function updateStudySession(
  sessionId: string,
  action: 'pause' | 'resume' | 'complete' | 'cancel' | 'heartbeat',
) {
  const result = await apiRequest<{ session: StudySession }>(
    `/study/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    },
  )
  return result.session
}

export function getStudySessionEvents(sessionId: string) {
  return apiRequest<{
    events: Array<{
      id: string
      type: 'start' | 'pause' | 'resume' | 'complete' | 'cancel'
      focusedSeconds: number
      occurredAt: string
    }>
  }>(`/study/sessions/${encodeURIComponent(sessionId)}/events`)
}
