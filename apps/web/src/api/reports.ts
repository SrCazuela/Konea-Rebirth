import { apiRequest as reportsRequest } from './base'
export type ReportResourceType =
  'post' | 'comment' | 'chat' | 'message' | 'user'
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
  name: string | null
  type: string
  avatarUrl: string | null
}

type MessageReportResource = {
  id: string
  chatId: string
  content: string
  type: string
  fileUrl: string | null
  fileName: string | null
  fileSize: number | null
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

export async function getReports(status?: ReportStatus): Promise<Report[]> {
  if (!status) {
    const statuses: ReportStatus[] = [
      'pending',
      'reviewing',
      'resolved',
      'dismissed',
    ]
    return (await Promise.all(statuses.map(getReports))).flat()
  }
  const query = `?status=${encodeURIComponent(status)}`
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
