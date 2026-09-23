import type { AvaCalendarEvent } from './ava-calendar'
import { apiRequest } from './base'

export type AcademicCourse = {
  id: string
  name: string
  normalizedName: string
  code: string | null
  section: string | null
  term: string | null
  source: 'manual' | 'ava' | 'ava_extension'
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
  archivedCourses: AcademicCourse[]
  tasks: AcademicTask[]
  events: AvaCalendarEvent[]
  sync: { lastSyncedAt: string; lastEventCount: number } | null
}

const academicRequest = <T>(path = '', init?: RequestInit) =>
  apiRequest<T>(`/academic${path}`, init)

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

export async function updateAcademicCourse(
  courseId: string,
  input: {
    name?: string
    code?: string
    section?: string
    term?: string
  },
) {
  const result = await academicRequest<{ course: AcademicCourse }>(
    `/courses/${encodeURIComponent(courseId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
  return result.course
}

export function deactivateAcademicCourse(courseId: string) {
  return academicRequest<void>(`/courses/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
  })
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
