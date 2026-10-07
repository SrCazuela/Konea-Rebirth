import { apiRequest } from './base'

export type AvaDomImportPayload = {
  version: 1
  source: {
    pageUrl: string
    pageTitle: string
    capturedAt: string
  }
  courses: Array<{
    clientId: string
    name: string
    code: string | null
    section: string | null
    term: string | null
  }>
  activities: Array<{
    clientId: string
    title: string
    description: string | null
    courseName: string | null
    dueAt: string | null
    sourceUrl: string | null
  }>
}

export type AvaImportResult = {
  importedCourses: number
  reactivatedCourses: number
  importedTasks: number
  existingCourses: number
  existingTasks: number
}

export type AvaImportPreview = {
  import: {
    id: string
    status: 'draft' | 'confirmed' | 'discarded'
    expiresAt: string
    result: AvaImportResult | null
  }
  courses: Array<
    AvaDomImportPayload['courses'][number] & {
      existing: boolean
      reactivatable: boolean
      state: 'new' | 'reactivatable' | 'existing'
    }
  >
  activities: Array<
    AvaDomImportPayload['activities'][number] & { existing: boolean }
  >
}

export function createAvaImportPreview(payload: AvaDomImportPayload) {
  return apiRequest<AvaImportPreview>('/ava-imports/previews', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function confirmAvaImport(
  importId: string,
  selection: {
    courseClientIds: string[]
    activityClientIds: string[]
  },
) {
  return apiRequest<{ result: AvaImportResult }>(
    `/ava-imports/previews/${encodeURIComponent(importId)}/confirm`,
    {
      method: 'POST',
      body: JSON.stringify(selection),
    },
  )
}

export function discardAvaImport(importId: string) {
  return apiRequest<void>(
    `/ava-imports/previews/${encodeURIComponent(importId)}`,
    { method: 'DELETE' },
  )
}
