import { apiRequest } from './base'

export type SupportRequestStatus =
  'pending' | 'reviewing' | 'resolved' | 'rejected'

export type SupportRequestEvent = {
  id: string
  type: 'created' | 'status_changed' | 'response'
  fromStatus: SupportRequestStatus | null
  toStatus: SupportRequestStatus
  note: string | null
  createdAt: string
  actor:
    | (SupportRequestPerson & {
        role: 'student' | 'professor' | 'moderator' | 'admin'
      })
    | null
}

export type SupportRequestCategory =
  | 'section_change'
  | 'missing_course'
  | 'enrollment'
  | 'schedule_conflict'
  | 'harassment'
  | 'technical'
  | 'financial'
  | 'wellbeing'
  | 'other'

export type SupportRequestPerson = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export type ManagedSupportRequest = {
  id: string
  requesterId: string
  assignedToId: string | null
  sourceMessageId: string | null
  category: SupportRequestCategory
  subject: string
  description: string
  desiredOutcome: string
  urgency: 'low' | 'medium' | 'high'
  status: SupportRequestStatus
  createdAt: string
  updatedAt: string
  requester: SupportRequestPerson | null
  assignedTo: SupportRequestPerson | null
  timeline: SupportRequestEvent[]
}

export async function getManagedSupportRequests() {
  const response = await apiRequest<{ requests: ManagedSupportRequest[] }>(
    '/duco/requests/all',
  )
  return response.requests
}

export async function updateManagedSupportRequest(
  requestId: string,
  update: { status?: SupportRequestStatus; note?: string },
) {
  const response = await apiRequest<{
    request: Omit<ManagedSupportRequest, 'requester' | 'assignedTo'>
  }>(`/duco/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
  return response.request
}
