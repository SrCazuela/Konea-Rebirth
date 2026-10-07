import type { Post } from './portal'
import { apiRequest } from './base'

export type PublicUserRole = 'student' | 'professor' | 'moderator' | 'admin'
export type ConnectionStatus = 'self' | 'none' | 'requested' | 'connected'

export type ProfileEducation = {
  id: string
  institution: string
  program: string
  startYear: number | null
  endYear: number | null
  current: boolean
}

export type ProfileProject = {
  id: string
  title: string
  description: string
  url: string | null
  repositoryUrl: string | null
  imageUrl: string | null
  technologies: string[]
}

export type ProfileAchievement = {
  id: string
  title: string
  issuer: string
  issuedAt: string | null
  description: string
  credentialUrl: string | null
  imageUrl: string | null
}

export type PublicUser = {
  id: string
  username: string
  displayName: string
  bio: string | null
  institution: string | null
  career: string | null
  campus: string | null
  website: string | null
  avatarUrl: string | null
  coverUrl: string | null
  education: ProfileEducation[]
  projects: ProfileProject[]
  achievements: ProfileAchievement[]
  role: PublicUserRole
  createdAt: string
  stats: {
    posts: number
    projects: number
    achievements: number
  }
  connectionStatus: ConnectionStatus
  isMe: boolean
}

export async function listConnections(query = '') {
  const search = query.trim()
  const suffix = search ? `?q=${encodeURIComponent(search)}` : ''
  const response = await apiRequest<{ users: PublicUser[] }>(
    `/users/connections${suffix}`,
  )
  return response.users
}

export async function getPublicUser(userId: string) {
  return apiRequest<{ user: PublicUser; posts: Post[] }>(
    `/users/${encodeURIComponent(userId)}`,
  )
}

export async function sendConnectionRequest(userId: string) {
  return apiRequest<{
    connectionStatus: 'requested' | 'connected'
    matched: boolean
  }>(`/users/${encodeURIComponent(userId)}/connection-request`, {
    method: 'POST',
  })
}

export async function cancelConnectionRequest(userId: string) {
  return apiRequest<{ connectionStatus: 'none' }>(
    `/users/${encodeURIComponent(userId)}/connection-request`,
    { method: 'DELETE' },
  )
}

export async function removeConnection(userId: string) {
  return apiRequest<{ connectionStatus: 'none' }>(
    `/users/${encodeURIComponent(userId)}/connection`,
    { method: 'DELETE' },
  )
}
