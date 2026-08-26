import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { db, isUniqueViolation } from '../db/client.js'
import { profiles, users } from '../db/schema.js'
import {
  canonicalCatalogValue,
  profileCatalog,
} from '../domain/profile-catalog.js'
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

const optionalUrl = z
  .union([z.string().trim().url().max(2_048), z.literal(''), z.null()])
  .transform((value) => value || null)

const educationSchema = z
  .strictObject({
    id: z.string().uuid(),
    institution: z.string().trim().min(2).max(160),
    program: z.string().trim().min(2).max(160),
    startYear: z.number().int().min(1950).max(2100).nullable(),
    endYear: z.number().int().min(1950).max(2100).nullable(),
    current: z.boolean(),
  })
  .refine(
    (value) =>
      value.current ||
      !value.startYear ||
      !value.endYear ||
      value.endYear >= value.startYear,
    { message: 'El año de término debe ser posterior al de inicio.' },
  )

const projectSchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(2).max(1_000),
  url: optionalUrl,
  repositoryUrl: optionalUrl,
  imageUrl: z
    .union([profileMediaUrl, z.literal(''), z.null()])
    .transform((value) => value || null),
  technologies: z.array(z.string().trim().min(1).max(30)).max(12),
})

const achievementSchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  issuer: z.string().trim().min(2).max(160),
  issuedAt: z
    .union([z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), z.null()])
    .transform((value) => value || null),
  description: z.string().trim().max(600),
  credentialUrl: optionalUrl,
})

const uniqueEntryIds = <T extends { id: string }>(entries: T[]) =>
  new Set(entries.map((entry) => entry.id)).size === entries.length

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
  education: z
    .array(educationSchema)
    .max(6)
    .refine(uniqueEntryIds, 'Las formaciones no pueden repetirse.')
    .optional(),
  projects: z
    .array(projectSchema)
    .max(12)
    .refine(uniqueEntryIds, 'Los proyectos no pueden repetirse.')
    .optional(),
  achievements: z
    .array(achievementSchema)
    .max(12)
    .refine(uniqueEntryIds, 'Los logros no pueden repetirse.')
    .optional(),
})

export const profileRouter = Router()

profileRouter.use(requireAuthentication)

profileRouter.get('/catalog', (_request, response) => {
  response.json({ catalog: profileCatalog })
})

profileRouter.patch('/', async (request, response) => {
  const currentUser = getAuthenticatedUser(response)
  const parsedInput = parseBody(updateProfileSchema, request.body)
  const institution = canonicalCatalogValue(
    parsedInput.institution,
    profileCatalog.institutions,
  )
  const campus = canonicalCatalogValue(
    parsedInput.campus,
    profileCatalog.campuses,
  )
  const career = canonicalCatalogValue(
    parsedInput.career,
    profileCatalog.careers,
  )

  if (parsedInput.institution && !institution) {
    throw new ApiError(
      400,
      'INVALID_INSTITUTION',
      'Selecciona una institución disponible en el catálogo.',
    )
  }
  if (parsedInput.campus && !campus) {
    throw new ApiError(
      400,
      'INVALID_CAMPUS',
      'Selecciona una sede o campus disponible en el catálogo.',
    )
  }
  if (parsedInput.career && !career) {
    throw new ApiError(
      400,
      'INVALID_CAREER',
      'Selecciona una carrera disponible en el catálogo.',
    )
  }

  const education = parsedInput.education?.map((entry) => {
    const educationInstitution = canonicalCatalogValue(
      entry.institution,
      profileCatalog.institutions,
    )
    const program = canonicalCatalogValue(entry.program, profileCatalog.careers)
    if (!educationInstitution || !program) {
      throw new ApiError(
        400,
        'INVALID_EDUCATION',
        'La institución y carrera de cada formación deben seleccionarse del catálogo.',
      )
    }
    return { ...entry, institution: educationInstitution, program }
  })

  const input = {
    ...parsedInput,
    ...(parsedInput.institution !== undefined ? { institution } : {}),
    ...(parsedInput.campus !== undefined ? { campus } : {}),
    ...(parsedInput.career !== undefined ? { career } : {}),
    ...(education ? { education } : {}),
  }
  await Promise.all([
    requireOwnedLocalUpload(currentUser.id, input.avatarUrl, 'image'),
    requireOwnedLocalUpload(currentUser.id, input.coverUrl, 'image'),
    ...(input.projects ?? []).map((project) =>
      requireOwnedLocalUpload(currentUser.id, project.imageUrl, 'image'),
    ),
  ])

  try {
    await db
      .update(profiles)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(profiles.userId, currentUser.id))
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        'USERNAME_ALREADY_EXISTS',
        'Ese nombre de usuario ya está en uso.',
      )
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
      education: profiles.education,
      projects: profiles.projects,
      achievements: profiles.achievements,
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
