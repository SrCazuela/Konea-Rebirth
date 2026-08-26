import { apiRequest } from './base'

export type SupportRequestStatus =
  'pending' | 'reviewing' | 'resolved' | 'rejected'

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
}

export async function getManagedSupportRequests() {
  const response = await apiRequest<{ requests: ManagedSupportRequest[] }>(
    '/duco/requests/all',
  )
  return response.requests
}

export async function updateManagedSupportRequest(
  requestId: string,
  status: SupportRequestStatus,
) {
  const response = await apiRequest<{
    request: Omit<ManagedSupportRequest, 'requester' | 'assignedTo'>
  }>(`/duco/requests/${encodeURIComponent(requestId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
  return response.request
}
