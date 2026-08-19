import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { profiles, users } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import { parseBody } from '../http/validation.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { requireOwnedLocalUpload } from '../services/upload-service.js'

const optionalText = (maximumLength: number) =>
  z
    .union([z.string().trim().max(maximumLength), z.null()])
    .transform((value) => value || null)
    .optional()

const profileMediaUrl = z
  .string()
  .trim()
  .max(2_048)
  .refine(
    (value) =>
      value.startsWith('/api/v1/uploads/files/') ||
      z.url().safeParse(value).success,
    'Debe ser una URL válida o un archivo subido a Konea.',
  )

const updateProfileSchema = z.strictObject({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9._]+$/)
    .optional(),
  displayName: z.string().trim().min(2).max(100).optional(),
  bio: optionalText(280),
  institution: optionalText(160),
  career: optionalText(160),
  avatarUrl: z
    .union([profileMediaUrl, z.literal(''), z.null()])
    .transform((value) => value || null)
    .optional(),
  coverUrl: z
    .union([profileMediaUrl, z.literal(''), z.null()])
    .transform((value) => value || null)
    .optional(),
  campus: optionalText(160),
  website: z
    .union([z.string().trim().url().max(2_048), z.literal(''), z.null()])
    .transform((value) => value || null)
    .optional(),
})

export const profileRouter = Router()

profileRouter.use(requireAuthentication)

profileRouter.patch('/', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const input = parseBody(updateProfileSchema, request.body)
  await Promise.all([
    requireOwnedLocalUpload(currentUser.id, input.avatarUrl, 'image'),
    requireOwnedLocalUpload(currentUser.id, input.coverUrl, 'image'),
  ])

  try {
    await db
      .update(profiles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(profiles.userId, currentUser.id))
  } catch (error) {
    let currentError = error

    for (let depth = 0; depth < 4; depth += 1) {
      if (typeof currentError !== 'object' || currentError === null) break
      if ('code' in currentError && currentError.code === '23505') {
        throw new ApiError(
          409,
          'USERNAME_ALREADY_EXISTS',
          'Ese nombre de usuario ya está en uso.',
        )
      }
      if (!('cause' in currentError)) break
      currentError = currentError.cause
    }

    throw error
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      username: profiles.username,
      displayName: profiles.displayName,
      bio: profiles.bio,
      institution: profiles.institution,
      career: profiles.career,
      avatarUrl: profiles.avatarUrl,
      coverUrl: profiles.coverUrl,
      campus: profiles.campus,
      website: profiles.website,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(profiles, eq(users.id, profiles.userId))
    .where(eq(users.id, currentUser.id))
    .limit(1)

  if (!user) {
    throw new ApiError(404, 'PROFILE_NOT_FOUND', 'El perfil no existe.')
  }

  response.json({ user })
})
