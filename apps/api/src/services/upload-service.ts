import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { uploadedFiles } from '../db/schema.js'
import { ApiError } from '../errors/api-error.js'

const localUploadPattern =
  /^\/api\/v1\/uploads\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:gif|jpe?g|pdf|png|webp))$/

export function getLocalUploadName(value: string) {
  if (!value.startsWith('/api/v1/uploads/files/')) return null

  const match = localUploadPattern.exec(value)
  if (!match?.[1]) {
    throw new ApiError(
      400,
      'INVALID_UPLOAD_URL',
      'La ruta del archivo subido no es v\u00e1lida.',
    )
  }

  return match[1]
}

export async function requireOwnedLocalUpload(
  ownerId: string,
  value: string | null | undefined,
  expectedType: 'any' | 'image' = 'any',
) {
  if (!value) return
  const storedName = getLocalUploadName(value)
  if (!storedName) return

  const [file] = await db
    .select({
      ownerId: uploadedFiles.ownerId,
      mimeType: uploadedFiles.mimeType,
    })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.storedName, storedName))
    .limit(1)

  if (!file || file.ownerId !== ownerId) {
    throw new ApiError(
      403,
      'UPLOAD_OWNERSHIP_REQUIRED',
      'Solo puedes usar archivos que hayas subido con tu cuenta.',
    )
  }

  if (expectedType === 'image' && !file.mimeType.startsWith('image/')) {
    throw new ApiError(
      415,
      'IMAGE_UPLOAD_REQUIRED',
      'Debes seleccionar un archivo de imagen.',
    )
  }
}
