import { ApiClientError, type KoneaUser } from './auth'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type PostVisibility = 'campus' | 'connections' | 'public'
export type PostContentType = 'announcement' | 'community'
export type ModerationStatus = 'pending' | 'approved' | 'rejected'

export type PostAuthor = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export type Post = {
  id: string
  content: string
  imageUrl: string | null
  contentType: PostContentType
  visibility: PostVisibility
  moderationStatus: ModerationStatus
  moderationReason: string | null
  createdAt: string
  updatedAt: string
  author: PostAuthor
  likeCount: number
  commentCount: number
  shareCount: number
  likedByMe: boolean
  canDelete: boolean
}

export type Comment = {
  id: string
  content: string
  parentCommentId: string | null
  createdAt: string
  updatedAt: string
  author: PostAuthor
  canEdit: boolean
  canDelete: boolean
}

export type ProfileUpdate = {
  username: string
  displayName: string
  bio: string | null
  institution: string | null
  career: string | null
  avatarUrl: string | null
  coverUrl: string | null
  campus: string | null
  website: string | null
  education: import('./network').ProfileEducation[]
  projects: import('./network').ProfileProject[]
  achievements: import('./network').ProfileAchievement[]
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

async function portalRequest<T>(path: string, init?: RequestInit) {
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

export async function getPosts() {
  const response = await portalRequest<{ posts: Post[] }>('/posts')
  return response.posts
}

export async function getPost(postId: string) {
  const response = await portalRequest<{ post: Post }>(
    `/posts/${encodeURIComponent(postId)}`,
  )
  return response.post
}

export async function createPost(input: {
  content: string
  contentType: PostContentType
  visibility: PostVisibility
  imageUrl?: string
}) {
  const response = await portalRequest<{ post: Post }>('/posts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.post
}

export async function deletePost(postId: string) {
  await portalRequest<void>(`/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE',
  })
}

export async function likePost(postId: string) {
  return portalRequest<{ liked: boolean; likeCount: number }>(
    `/posts/${encodeURIComponent(postId)}/likes`,
    { method: 'POST' },
  )
}

export async function unlikePost(postId: string) {
  return portalRequest<{ liked: boolean; likeCount: number }>(
    `/posts/${encodeURIComponent(postId)}/likes`,
    { method: 'DELETE' },
  )
}

export async function getPostComments(postId: string) {
  const response = await portalRequest<{ comments: Comment[] }>(
    `/posts/${encodeURIComponent(postId)}/comments`,
  )
  return response.comments
}

export async function createComment(
  postId: string,
  content: string,
  parentCommentId?: string,
) {
  const response = await portalRequest<{ comment: Comment }>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    {
      method: 'POST',
      body: JSON.stringify({ content, parentCommentId }),
    },
  )
  return response.comment
}

export async function updateComment(
  postId: string,
  commentId: string,
  content: string,
) {
  const response = await portalRequest<{ comment: Comment }>(
    `/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    },
  )
  return response.comment
}

export async function deleteComment(postId: string, commentId: string) {
  await portalRequest<void>(
    `/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' },
  )
}

export async function sharePost(postId: string) {
  return portalRequest<{ shareCount: number }>(
    `/posts/${encodeURIComponent(postId)}/shares`,
    { method: 'POST' },
  )
}

export async function getLikedPostsByUser(userId: string) {
  const response = await portalRequest<{ posts: Post[] }>(
    `/users/${encodeURIComponent(userId)}/likes`,
  )
  return response.posts
}

export async function updateProfile(input: ProfileUpdate) {
  const response = await portalRequest<{ user: KoneaUser }>('/profile', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return response.user
}

export async function getModerationPosts(
  status?: ModerationStatus,
): Promise<Post[]> {
  if (!status) {
    const statuses: ModerationStatus[] = ['pending', 'approved', 'rejected']
    return (await Promise.all(statuses.map(getModerationPosts))).flat()
  }
  const response = await portalRequest<{ posts: Post[] }>(
    `/moderation/posts?status=${encodeURIComponent(status)}`,
  )
  return response.posts
}

export async function moderatePost(
  postId: string,
  input: { status: 'approved' | 'rejected'; reason?: string },
) {
  const response = await portalRequest<{ post: Post }>(
    `/moderation/posts/${encodeURIComponent(postId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )
  return response.post
}
