import { ApiClientError } from './auth'
import type { AvaCalendarEvent } from './ava-calendar'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type AcademicCourse = {
  id: string
  name: string
  normalizedName: string
  code: string | null
  section: string | null
  term: string | null
  source: 'manual' | 'ava'
  active: boolean
  createdAt: string
  updatedAt: string
}

export type AcademicTask = {
  id: string
  courseId: string | null
  title: string
  description: string | null
  dueAt: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'pending' | 'in_progress' | 'completed'
  createdAt: string
  updatedAt: string
}

export type AcademicDashboard = {
  courses: AcademicCourse[]
  tasks: AcademicTask[]
  events: AvaCalendarEvent[]
  sync: { lastSyncedAt: string; lastEventCount: number } | null
}

type ErrorEnvelope = { error?: { code?: string; message?: string } }

async function academicRequest<T>(path = '', init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}/academic${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (response.status === 401)
    window.dispatchEvent(new Event('konea:session-expired'))
  if (response.status === 204) return undefined as T
  const body = (await response.json().catch(() => ({}))) as T & ErrorEnvelope
  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      body.error?.code ?? 'ACADEMIC_REQUEST_FAILED',
      body.error?.message ?? 'No pudimos completar la acción académica.',
    )
  }
  return body
}

export function getAcademicDashboard() {
  return academicRequest<AcademicDashboard>()
}

export async function createAcademicCourse(input: {
  name: string
  code?: string
  section?: string
  term?: string
}) {
  const result = await academicRequest<{ course: AcademicCourse }>('/courses', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.course
}

export async function createAcademicTask(input: {
  courseId: string | null
  title: string
  description?: string
  dueAt: string | null
  priority: AcademicTask['priority']
}) {
  const result = await academicRequest<{ task: AcademicTask }>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return result.task
}

export async function updateAcademicTask(
  taskId: string,
  input: Partial<
    Pick<
      AcademicTask,
      'courseId' | 'title' | 'description' | 'dueAt' | 'priority' | 'status'
    >
  >,
) {
  const result = await academicRequest<{ task: AcademicTask }>(
    `/tasks/${encodeURIComponent(taskId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return result.task
}

export function deleteAcademicTask(taskId: string) {
  return academicRequest<void>(`/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
  })
}
