import { ApiClientError } from './auth'
import type { Post } from './portal'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type PublicUserRole = 'student' | 'professor' | 'moderator' | 'admin'

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
  lastSeenAt: string
  role: PublicUserRole
  createdAt: string
  stats: {
    posts: number
    followers: number
    following: number
  }
  followedByMe: boolean
  isMe: boolean
}

type ErrorEnvelope = {
  error?: {
    code?: string
    message?: string
    details?: {
      fields?: Record<string, string[] | undefined>
    }
  }
}

async function networkRequest<T>(path: string, init?: RequestInit) {
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

  if (response.status === 204) return undefined as T

  const body = (await response.json().catch(() => ({}))) as T & ErrorEnvelope

  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'No pudimos completar la solicitud.',
      body.error?.details?.fields,
    )
  }

  return body
}

export async function searchUsers(query = '') {
  const search = query.trim()
  const suffix = search ? `?q=${encodeURIComponent(search)}` : ''
  const response = await networkRequest<{ users: PublicUser[] }>(
    `/users${suffix}`,
  )
  return response.users
}

export async function getPublicUser(userId: string) {
  return networkRequest<{ user: PublicUser; posts: Post[] }>(
    `/users/${encodeURIComponent(userId)}`,
  )
}

export async function followUser(userId: string) {
  return networkRequest<{ followed: true; followersCount: number }>(
    `/users/${encodeURIComponent(userId)}/follow`,
    { method: 'POST' },
  )
}

export async function unfollowUser(userId: string) {
  return networkRequest<{ followed: false; followersCount: number }>(
    `/users/${encodeURIComponent(userId)}/follow`,
    { method: 'DELETE' },
  )
}
