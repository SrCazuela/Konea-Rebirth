import { and, count, desc, eq, inArray, or, type SQL } from 'drizzle-orm'
import { db } from '../db/client.js'
import { comments, follows, postLikes, posts, profiles } from '../db/schema.js'
import type { AuthenticatedUser } from '../middleware/authentication.js'

type RawPost = {
  id: string
  authorId: string
  content: string
  imageUrl: string | null
  contentType: typeof posts.$inferSelect.contentType
  visibility: typeof posts.$inferSelect.visibility
  moderationStatus: typeof posts.$inferSelect.moderationStatus
  moderationReason: string | null
  shareCount: number
  createdAt: Date
  updatedAt: Date
  author: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
  }
}

const postSelection = {
  id: posts.id,
  authorId: posts.authorId,
  content: posts.content,
  imageUrl: posts.imageUrl,
  contentType: posts.contentType,
  visibility: posts.visibility,
  moderationStatus: posts.moderationStatus,
  moderationReason: posts.moderationReason,
  shareCount: posts.shareCount,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
  author: {
    id: profiles.userId,
    username: profiles.username,
    displayName: profiles.displayName,
    avatarUrl: profiles.avatarUrl,
  },
}

async function loadPostRows(condition: SQL | undefined, limit = 50) {
  return db
    .select(postSelection)
    .from(posts)
    .innerJoin(profiles, eq(posts.authorId, profiles.userId))
    .where(condition)
    .orderBy(desc(posts.createdAt))
    .limit(limit)
}

async function enrichPosts(rows: RawPost[], currentUser: AuthenticatedUser) {
  if (rows.length === 0) return []

  const postIds = rows.map((post) => post.id)
  const [likeCountRows, commentCountRows, currentUserLikes] = await Promise.all(
    [
      db
        .select({ postId: postLikes.postId, total: count() })
        .from(postLikes)
        .where(inArray(postLikes.postId, postIds))
        .groupBy(postLikes.postId),
      db
        .select({ postId: comments.postId, total: count() })
        .from(comments)
        .where(inArray(comments.postId, postIds))
        .groupBy(comments.postId),
      db
        .select({ postId: postLikes.postId })
        .from(postLikes)
        .where(
          and(
            inArray(postLikes.postId, postIds),
            eq(postLikes.userId, currentUser.id),
          ),
        ),
    ],
  )

  const likesByPost = new Map(
    likeCountRows.map((row) => [row.postId, Number(row.total)]),
  )
  const commentsByPost = new Map(
    commentCountRows.map((row) => [row.postId, Number(row.total)]),
  )
  const likedPostIds = new Set(currentUserLikes.map((row) => row.postId))

  return rows.map(({ authorId, ...post }) => ({
    ...post,
    likeCount: likesByPost.get(post.id) ?? 0,
    commentCount: commentsByPost.get(post.id) ?? 0,
    likedByMe: likedPostIds.has(post.id),
    canDelete: authorId === currentUser.id || currentUser.role === 'admin',
  }))
}

export async function getFeedPosts(currentUser: AuthenticatedUser) {
  const condition =
    currentUser.role === 'moderator' || currentUser.role === 'admin'
      ? or(
          eq(posts.moderationStatus, 'approved'),
          eq(posts.authorId, currentUser.id),
        )
      : postAccessCondition(currentUser)
  const rows = await loadPostRows(condition)
  return enrichPosts(rows, currentUser)
}

export async function getPostsByAuthor(
  authorId: string,
  currentUser: AuthenticatedUser,
) {
  const rows = await loadPostRows(
    and(eq(posts.authorId, authorId), postAccessCondition(currentUser)),
  )
  return enrichPosts(rows, currentUser)
}

export async function getLikedPostsByUser(
  userId: string,
  currentUser: AuthenticatedUser,
) {
  const likedPostIds = db
    .select({ id: postLikes.postId })
    .from(postLikes)
    .where(eq(postLikes.userId, userId))
  const rows = await loadPostRows(
    and(inArray(posts.id, likedPostIds), postAccessCondition(currentUser)),
  )
  return enrichPosts(rows, currentUser)
}

export async function getModerationPosts(currentUser: AuthenticatedUser) {
  const rows = await loadPostRows(undefined)
  return enrichPosts(rows, currentUser)
}

export async function getPostForUser(
  postId: string,
  currentUser: AuthenticatedUser,
) {
  const rows = await loadPostRows(
    and(eq(posts.id, postId), postAccessCondition(currentUser)),
    1,
  )
  const [row] = rows

  if (!row) return undefined

  const [post] = await enrichPosts([row], currentUser)
  return post
}

function postAccessCondition(currentUser: AuthenticatedUser) {
  if (currentUser.role === 'moderator' || currentUser.role === 'admin') {
    return undefined
  }

  const followedAuthorIds = db
    .select({ id: follows.followingId })
    .from(follows)
    .where(eq(follows.followerId, currentUser.id))

  return or(
    eq(posts.authorId, currentUser.id),
    and(
      eq(posts.moderationStatus, 'approved'),
      or(
        eq(posts.visibility, 'campus'),
        eq(posts.visibility, 'public'),
        and(
          eq(posts.visibility, 'followers'),
          inArray(posts.authorId, followedAuthorIds),
        ),
      ),
    ),
  )
}

export async function getLikeCount(postId: string) {
  const [result] = await db
    .select({ total: count() })
    .from(postLikes)
    .where(eq(postLikes.postId, postId))

  return Number(result?.total ?? 0)
}
