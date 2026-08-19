const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

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
  createdAt: string
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

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string[] | undefined>

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[] | undefined>,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const body = (await response.json().catch(() => ({}))) as T & ErrorEnvelope

  if (!response.ok) {
    throw new ApiClientError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? 'The request could not be completed.',
      body.error?.details?.fields,
    )
  }

  return body
}

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

export async function login(input: { email: string; password: string }) {
  const response = await apiRequest<{ user: KoneaUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.user
}

export async function logout() {
  await apiRequest<void>('/auth/logout', { method: 'POST' })
}
