import { ApiClientError } from './auth'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type ReportResourceType =
  | 'post'
  | 'comment'
  | 'chat'
  | 'message'
  | 'user'
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed'

type ReportPerson = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

type ReportBase = {
  id: string
  resourceId: string
  reason: string
  details: string | null
  status: ReportStatus
  createdAt: string
  updatedAt: string
  reporter: ReportPerson
  assignedTo: ReportPerson | null
}

type PostReportResource = {
  id: string
  content: string
  imageUrl: string | null
  author: ReportPerson
}

type CommentReportResource = {
  id: string
  content: string
  postId: string
  author: ReportPerson
}

type ChatReportResource = {
  id: string
  name: string
  type: string
}

type MessageReportResource = {
  id: string
  chatId: string
  content: string
  type: string
  sender: ReportPerson
}

type UserReportResource = ReportPerson

export type Report = ReportBase &
  (
    | { resourceType: 'post'; resource: PostReportResource | null }
    | { resourceType: 'comment'; resource: CommentReportResource | null }
    | { resourceType: 'chat'; resource: ChatReportResource | null }
    | { resourceType: 'message'; resource: MessageReportResource | null }
    | { resourceType: 'user'; resource: UserReportResource | null }
  )

type ErrorEnvelope = {
  error?: {
    code?: string
    message?: string
    details?: {
      fields?: Record<string, string[] | undefined>
    }
  }
}

async function reportsRequest<T>(path: string, init?: RequestInit) {
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
      body.error?.code ?? 'REPORT_FAILED',
      body.error?.message ?? 'No pudimos enviar el reporte.',
      body.error?.details?.fields,
    )
  }
  return body
}

export async function createReport(input: {
  resourceType: ReportResourceType
  resourceId: string
  reason: string
  details?: string | null
}) {
  const response = await reportsRequest<{ report: { id: string } }>(
    '/reports',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  )
  return response.report
}

export async function getReports(status?: ReportStatus) {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const response = await reportsRequest<{ reports: Report[] }>(
    `/reports${query}`,
  )
  return response.reports
}

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
) {
  const response = await reportsRequest<{ report: Report }>(
    `/reports/${encodeURIComponent(reportId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  )
  return response.report
}
