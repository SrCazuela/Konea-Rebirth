import type {
  ProfileAchievement,
  ProfileEducation,
  ProfileProject,
} from './network'
import { ApiClientError, apiRequest } from './base'

export type KoneaUser = {
  id: string
  email: string
  username: string
  displayName: string
  role: 'student' | 'professor' | 'moderator' | 'admin'
  status: 'active' | 'suspended' | 'deleted'
  bio: string | null
  institution: string | null
  career: string | null
  avatarUrl: string | null
  coverUrl: string | null
  campus: string | null
  website: string | null
  education: ProfileEducation[]
  projects: ProfileProject[]
  achievements: ProfileAchievement[]
  createdAt: string
}

export { ApiClientError }

export async function checkApiHealth() {
  await apiRequest('/health')
}

export async function getCurrentUser() {
  try {
    const response = await apiRequest<{ user: KoneaUser }>('/auth/me')
    return response.user
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null
    throw error
  }
}

export async function register(input: {
  email: string
  password: string
  username: string
  displayName: string
}) {
  const response = await apiRequest<{ user: KoneaUser }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.user
}

export async function login(input: { identifier: string; password: string }) {
  const response = await apiRequest<{ user: KoneaUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.user
}

export async function logout() {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
}
