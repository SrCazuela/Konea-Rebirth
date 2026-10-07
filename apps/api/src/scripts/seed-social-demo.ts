import { randomBytes } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inArray, or } from 'drizzle-orm'
import { env } from '../config/env.js'
import { closeDatabaseConnection, db } from '../db/client.js'
import {
  comments,
  postLikes,
  posts,
  profiles,
  uploadedFiles,
  users,
} from '../db/schema.js'
import {
  assertValidSocialDemoData,
  resolveSocialDemoAssets,
  SOCIAL_DEMO_COMMENTS,
  SOCIAL_DEMO_LIKES,
  SOCIAL_DEMO_POSTS,
  SOCIAL_DEMO_PROFILES,
  type ResolvedSocialDemoAsset,
  type SocialDemoMediaKey,
  type SocialDemoPost,
} from '../demo/social-demo-data.js'
import { hashPassword } from '../security/password.js'

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const UPLOAD_DIRECTORY = fileURLToPath(
  new URL('../../../../.local/uploads/', import.meta.url),
)

function assertLocalDevelopmentDatabase() {
  if (env.NODE_ENV !== 'development') {
    throw new Error(
      'El contenido social demo solo puede prepararse con NODE_ENV=development.',
    )
  }

  let databaseUrl: URL
  try {
    databaseUrl = new URL(env.DATABASE_URL)
  } catch {
    throw new Error('DATABASE_URL no es una URL PostgreSQL válida.')
  }

  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error(
      'DATABASE_URL debe usar el protocolo postgres o postgresql.',
    )
  }

  const hostname = databaseUrl.hostname.toLowerCase()
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new Error(
      `El contenido social demo solo puede prepararse en una base local; host recibido: ${hostname}.`,
    )
  }
}

function createdAtForPost(post: SocialDemoPost, seededAt: Date) {
  if (post.publishedAt) return new Date(post.publishedAt)
  return new Date(seededAt.getTime() - (post.ageHours ?? 0) * 60 * 60 * 1_000)
}

function uploadUrl(
  assets: Map<SocialDemoMediaKey, ResolvedSocialDemoAsset>,
  key: SocialDemoMediaKey | undefined | null,
) {
  if (!key) return null
  const asset = assets.get(key)
  if (!asset) throw new Error(`El asset social '${key}' no fue resuelto.`)
  return `/api/v1/uploads/files/${asset.storedName}`
}

async function assertReservedIdentifiersAreSafe(
  assets: Map<SocialDemoMediaKey, ResolvedSocialDemoAsset>,
) {
  const expectedUsersById = new Map(
    SOCIAL_DEMO_PROFILES.map((profile) => [profile.id, profile]),
  )
  const expectedUsersByEmail = new Map(
    SOCIAL_DEMO_PROFILES.map((profile) => [profile.email, profile]),
  )
  const existingUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      or(
        inArray(
          users.id,
          SOCIAL_DEMO_PROFILES.map((profile) => profile.id),
        ),
        inArray(
          users.email,
          SOCIAL_DEMO_PROFILES.map((profile) => profile.email),
        ),
      ),
    )

  for (const existing of existingUsers) {
    const expectedById = expectedUsersById.get(existing.id)
    const expectedByEmail = expectedUsersByEmail.get(existing.email)
    if (
      !expectedById ||
      !expectedByEmail ||
      expectedById.id !== expectedByEmail.id
    ) {
      throw new Error(
        `Colisión de cuenta demo: ${existing.email} (${existing.id}) no coincide con el identificador reservado.`,
      )
    }
  }

  const expectedProfilesById = new Map(
    SOCIAL_DEMO_PROFILES.map((profile) => [profile.id, profile]),
  )
  const expectedProfilesByUsername = new Map(
    SOCIAL_DEMO_PROFILES.map((profile) => [profile.username, profile]),
  )
  const existingProfiles = await db
    .select({ userId: profiles.userId, username: profiles.username })
    .from(profiles)
    .where(
      or(
        inArray(
          profiles.userId,
          SOCIAL_DEMO_PROFILES.map((profile) => profile.id),
        ),
        inArray(
          profiles.username,
          SOCIAL_DEMO_PROFILES.map((profile) => profile.username),
        ),
      ),
    )

  for (const existing of existingProfiles) {
    const expectedById = expectedProfilesById.get(existing.userId)
    const expectedByUsername = expectedProfilesByUsername.get(existing.username)
    if (
      !expectedById ||
      !expectedByUsername ||
      expectedById.id !== expectedByUsername.id
    ) {
      throw new Error(
        `Colisión de perfil demo: @${existing.username} (${existing.userId}) no coincide con el identificador reservado.`,
      )
    }
  }

  const expectedAssetsById = new Map(
    [...assets.values()].map((asset) => [asset.id, asset]),
  )
  const expectedAssetsByName = new Map(
    [...assets.values()].map((asset) => [asset.storedName, asset]),
  )
  const existingAssets = await db
    .select({
      id: uploadedFiles.id,
      ownerId: uploadedFiles.ownerId,
      storedName: uploadedFiles.storedName,
    })
    .from(uploadedFiles)
    .where(
      or(
        inArray(
          uploadedFiles.id,
          [...assets.values()].map((asset) => asset.id),
        ),
        inArray(
          uploadedFiles.storedName,
          [...assets.values()].map((asset) => asset.storedName),
        ),
      ),
    )

  for (const existing of existingAssets) {
    const expectedById = expectedAssetsById.get(existing.id)
    const expectedByName = expectedAssetsByName.get(existing.storedName)
    if (
      !expectedById ||
      !expectedByName ||
      expectedById.id !== expectedByName.id ||
      expectedById.ownerId !== existing.ownerId
    ) {
      throw new Error(
        `Colisión de archivo demo: ${existing.storedName} (${existing.id}) ya está reservado por otro recurso.`,
      )
    }
  }
}

async function copyAssetsToUploadDirectory(
  assets: Map<SocialDemoMediaKey, ResolvedSocialDemoAsset>,
) {
  await mkdir(UPLOAD_DIRECTORY, { recursive: true })
  await Promise.all(
    [...assets.values()].map((asset) =>
      copyFile(asset.sourcePath, join(UPLOAD_DIRECTORY, asset.storedName)),
    ),
  )
}

export async function seedSocialDemo() {
  assertLocalDevelopmentDatabase()
  assertValidSocialDemoData()
  const assets = await resolveSocialDemoAssets()
  await assertReservedIdentifiersAreSafe(assets)
  await copyAssetsToUploadDirectory(assets)

  const seededAt = new Date()
  const inaccessiblePasswordHash = await hashPassword(
    randomBytes(48).toString('base64url'),
  )
  const postDates = new Map(
    SOCIAL_DEMO_POSTS.map((post) => [
      post.id,
      createdAtForPost(post, seededAt),
    ]),
  )

  await db.transaction(async (transaction) => {
    for (const [index, profile] of SOCIAL_DEMO_PROFILES.entries()) {
      const createdAt = new Date(
        seededAt.getTime() - (120 + index * 4) * 24 * 60 * 60 * 1_000,
      )
      await transaction
        .insert(users)
        .values({
          id: profile.id,
          email: profile.email,
          passwordHash: inaccessiblePasswordHash,
          role: profile.role,
          status: 'active',
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: profile.email,
            passwordHash: inaccessiblePasswordHash,
            role: profile.role,
            status: 'active',
            updatedAt: seededAt,
          },
        })
    }

    for (const asset of assets.values()) {
      await transaction
        .insert(uploadedFiles)
        .values({
          id: asset.id,
          ownerId: asset.ownerId,
          storedName: asset.storedName,
          originalName: asset.sourceName,
          mimeType: asset.mimeType,
          size: asset.size,
          createdAt: seededAt,
        })
        .onConflictDoUpdate({
          target: uploadedFiles.id,
          set: {
            ownerId: asset.ownerId,
            storedName: asset.storedName,
            originalName: asset.sourceName,
            mimeType: asset.mimeType,
            size: asset.size,
          },
        })
    }

    for (const [index, profile] of SOCIAL_DEMO_PROFILES.entries()) {
      const createdAt = new Date(
        seededAt.getTime() - (120 + index * 4) * 24 * 60 * 60 * 1_000,
      )
      const projects = profile.projects.map(
        ({ imageMediaKey, ...project }) => ({
          ...project,
          imageUrl: uploadUrl(assets, imageMediaKey),
        }),
      )
      const achievements = profile.achievements.map(
        ({ imageMediaKey, ...achievement }) => ({
          ...achievement,
          imageUrl: uploadUrl(assets, imageMediaKey),
        }),
      )
      const profileValues = {
        userId: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        institution: profile.institution,
        campus: profile.campus,
        career: profile.career,
        avatarUrl: uploadUrl(assets, profile.avatarMediaKey),
        coverUrl: uploadUrl(assets, profile.coverMediaKey),
        website: null,
        education: profile.education,
        projects,
        achievements,
        lastSeenAt: new Date(seededAt.getTime() - index * 23 * 60 * 1_000),
        updatedAt: seededAt,
      }

      await transaction
        .insert(profiles)
        .values({ ...profileValues, createdAt })
        .onConflictDoUpdate({
          target: profiles.userId,
          set: profileValues,
        })
    }

    await transaction
      .insert(posts)
      .values(
        SOCIAL_DEMO_POSTS.map((post) => {
          const createdAt = postDates.get(post.id)
          if (!createdAt) {
            throw new Error(`No hay fecha para el post ${post.id}.`)
          }
          return {
            id: post.id,
            authorId: post.authorId,
            content: post.content,
            imageUrl: uploadUrl(assets, post.imageMediaKey),
            contentType: post.contentType,
            visibility: post.visibility,
            moderationStatus: 'approved' as const,
            moderationReason: null,
            shareCount: post.shareCount,
            createdAt,
            updatedAt: createdAt,
          }
        }),
      )
      .onConflictDoNothing()

    await transaction
      .insert(comments)
      .values(
        SOCIAL_DEMO_COMMENTS.map((comment) => {
          const postDate = postDates.get(comment.postId)
          if (!postDate) {
            throw new Error(`No hay post para el comentario ${comment.id}.`)
          }
          const createdAt = new Date(
            postDate.getTime() + comment.minutesAfterPost * 60 * 1_000,
          )
          return {
            id: comment.id,
            postId: comment.postId,
            authorId: comment.authorId,
            parentCommentId: comment.parentCommentId,
            content: comment.content,
            createdAt,
            updatedAt: createdAt,
          }
        }),
      )
      .onConflictDoNothing()

    await transaction
      .insert(postLikes)
      .values(
        SOCIAL_DEMO_LIKES.map((like) => ({
          ...like,
          createdAt: seededAt,
        })),
      )
      .onConflictDoNothing()
  })

  console.log(
    [
      'Entorno social demo listo.',
      `${SOCIAL_DEMO_PROFILES.length} perfiles`,
      `${SOCIAL_DEMO_POSTS.length} publicaciones`,
      `${SOCIAL_DEMO_COMMENTS.length} comentarios`,
      `${SOCIAL_DEMO_LIKES.length} reacciones`,
    ].join(' · '),
  )
}

try {
  await seedSocialDemo()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await closeDatabaseConnection()
}
