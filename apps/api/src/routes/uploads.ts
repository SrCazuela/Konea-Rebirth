import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { and, eq, isNull, or } from 'drizzle-orm'
import multer, { MulterError } from 'multer'
import { db } from '../db/client.js'
import {
  chatParticipants,
  chats,
  messages,
  posts,
  profiles,
  reports,
  uploadedFiles,
} from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'
import {
  getAuthenticatedUser,
  requireAuthentication,
} from '../middleware/authentication.js'
import { getPostForUser } from '../services/post-service.js'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const acceptedFiles = {
  'application/pdf': { extension: '.pdf', signature: 'pdf' },
  'image/gif': { extension: '.gif', signature: 'gif' },
  'image/jpeg': { extension: '.jpg', signature: 'jpeg' },
  'image/png': { extension: '.png', signature: 'png' },
  'image/webp': { extension: '.webp', signature: 'webp' },
} as const

type AcceptedMimeType = keyof typeof acceptedFiles
type FileSignature = (typeof acceptedFiles)[AcceptedMimeType]['signature']

export const UPLOAD_DIRECTORY = fileURLToPath(
  new URL('../../../../.local/uploads/', import.meta.url),
)

mkdirSync(UPLOAD_DIRECTORY, { recursive: true })

function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return Object.hasOwn(acceptedFiles, value)
}

function hasExpectedSignature(buffer: Buffer, signature: FileSignature) {
  switch (signature) {
    case 'gif':
      return ['GIF87a', 'GIF89a'].includes(
        buffer.subarray(0, 6).toString('ascii'),
      )
    case 'jpeg':
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    case 'pdf':
      return buffer.subarray(0, 5).toString('ascii') === '%PDF-'
    case 'png':
      return buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    case 'webp':
      return (
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      )
  }
}

function uploadError(error: unknown) {
  if (error instanceof ApiError) return error

  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(
        413,
        'UPLOAD_TOO_LARGE',
        'El archivo supera el límite de 5 MB.',
      )
    }

    return new ApiError(
      400,
      'INVALID_UPLOAD',
      error.code === 'LIMIT_UNEXPECTED_FILE'
        ? 'Envía un único archivo en el campo "file".'
        : 'No se pudo procesar el archivo.',
    )
  }

  return error
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, UPLOAD_DIRECTORY)
    },
    filename: (_request, file, callback) => {
      if (!isAcceptedMimeType(file.mimetype)) {
        callback(new Error('Unsupported MIME type'), '')
        return
      }

      callback(null, `${randomUUID()}${acceptedFiles[file.mimetype].extension}`)
    },
  }),
  fileFilter: (_request, file, callback) => {
    if (!isAcceptedMimeType(file.mimetype)) {
      callback(
        new ApiError(
          415,
          'UNSUPPORTED_FILE_TYPE',
          'Solo se aceptan imágenes JPEG, PNG, WebP, GIF o archivos PDF.',
        ),
      )
      return
    }

    callback(null, true)
  },
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 0,
  },
})

function receiveSingleFile(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  upload.single('file')(request, response, (error: unknown) => {
    if (error) {
      next(uploadError(error))
      return
    }

    void finishUpload(request, response).catch(next)
  })
}

async function finishUpload(request: Request, response: Response) {
  const currentUser = getAuthenticatedUser(response)
  const file = request.file

  if (!file || !isAcceptedMimeType(file.mimetype)) {
    throw new ApiError(
      400,
      'FILE_REQUIRED',
      'Envía un archivo en el campo "file".',
    )
  }

  const header = (await readFile(file.path)).subarray(0, 16)
  const expectedSignature = acceptedFiles[file.mimetype].signature

  if (!hasExpectedSignature(header, expectedSignature)) {
    await rm(file.path, { force: true })
    throw new ApiError(
      415,
      'FILE_SIGNATURE_MISMATCH',
      'El contenido del archivo no coincide con su tipo declarado.',
    )
  }

  const originalName = basename(file.originalname).slice(0, 255)

  try {
    await db.insert(uploadedFiles).values({
      ownerId: currentUser.id,
      storedName: file.filename,
      originalName,
      mimeType: file.mimetype,
      size: file.size,
    })
  } catch (error) {
    await rm(file.path, { force: true })
    throw error
  }

  response.status(201).json({
    file: {
      name: file.filename,
      originalName,
      mimeType: file.mimetype,
      size: file.size,
      url: `/api/v1/uploads/files/${file.filename}`,
    },
  })
}

function parseStoredFileName(value: string | undefined) {
  if (
    !value ||
    value !== basename(value) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(gif|jpe?g|pdf|png|webp)$/.test(
      value,
    )
  ) {
    throw new ApiError(
      400,
      'INVALID_FILE_NAME',
      'Se requiere un nombre de archivo válido.',
    )
  }

  return value
}

function mimeTypeForFile(fileName: string) {
  const extension = extname(fileName).toLowerCase()
  const entry = Object.entries(acceptedFiles).find(
    ([, value]) => value.extension === extension,
  )
  return entry?.[0]
}

async function canAccessUpload(fileName: string, response: Response) {
  const currentUser = getAuthenticatedUser(response)
  const [upload] = await db
    .select({ ownerId: uploadedFiles.ownerId })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.storedName, fileName))
    .limit(1)

  if (!upload) return false
  if (upload.ownerId === currentUser.id) return true

  const fileUrl = `/api/v1/uploads/files/${fileName}`
  const [profileReference, messageReference, chatReference, postReferences] =
    await Promise.all([
      db
        .select({ userId: profiles.userId })
        .from(profiles)
        .where(
          or(eq(profiles.avatarUrl, fileUrl), eq(profiles.coverUrl, fileUrl)),
        )
        .limit(1),
      db
        .select({ id: messages.id })
        .from(messages)
        .innerJoin(
          chatParticipants,
          and(
            eq(chatParticipants.chatId, messages.chatId),
            eq(chatParticipants.userId, currentUser.id),
            isNull(chatParticipants.archivedAt),
          ),
        )
        .where(eq(messages.fileUrl, fileUrl))
        .limit(1),
      db
        .select({ id: chats.id })
        .from(chats)
        .innerJoin(
          chatParticipants,
          and(
            eq(chatParticipants.chatId, chats.id),
            eq(chatParticipants.userId, currentUser.id),
            isNull(chatParticipants.archivedAt),
          ),
        )
        .where(eq(chats.avatarUrl, fileUrl))
        .limit(1),
      db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.imageUrl, fileUrl)),
    ])

  if (
    profileReference.length > 0 ||
    messageReference.length > 0 ||
    chatReference.length > 0
  ) {
    return true
  }

  if (currentUser.role === 'moderator' || currentUser.role === 'admin') {
    const [reportedPrivateResource] = await db
      .select({ id: reports.id })
      .from(reports)
      .leftJoin(
        messages,
        and(
          eq(reports.resourceType, 'message'),
          eq(reports.resourceId, messages.id),
        ),
      )
      .leftJoin(
        chats,
        and(eq(reports.resourceType, 'chat'), eq(reports.resourceId, chats.id)),
      )
      .where(or(eq(messages.fileUrl, fileUrl), eq(chats.avatarUrl, fileUrl)))
      .limit(1)

    if (reportedPrivateResource) return true
  }

  for (const post of postReferences) {
    if (await getPostForUser(post.id, currentUser)) return true
  }

  return false
}

export const uploadsRouter = Router()

uploadsRouter.use(requireAuthentication)

uploadsRouter.post('/files', receiveSingleFile)

uploadsRouter.get('/files/:fileName', async (request, response) => {
  const fileName = parseStoredFileName(request.params.fileName)
  const mimeType = mimeTypeForFile(fileName)

  if (!mimeType || !(await canAccessUpload(fileName, response))) {
    throw new ApiError(404, 'UPLOAD_NOT_FOUND', 'El archivo no existe.')
  }

  try {
    const file = await readFile(join(UPLOAD_DIRECTORY, fileName))
    response.set({
      'Cache-Control': 'private, max-age=3600',
      'Content-Type': mimeType,
      'X-Content-Type-Options': 'nosniff',
    })
    response.send(file)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      throw new ApiError(404, 'UPLOAD_NOT_FOUND', 'El archivo no existe.')
    }

    throw error
  }
})
