import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { env } from '../config/env.js'
import { ApiError } from '../errors/api-error.js'

export const UPLOAD_DIRECTORY =
  env.UPLOAD_DIRECTORY ??
  fileURLToPath(new URL('../../../../.local/uploads/', import.meta.url))

export interface UploadStorage {
  put(name: string, bytes: Buffer, mimeType: string): Promise<void>
  get(name: string): Promise<Buffer>
  remove(name: string): Promise<void>
}

function assertStoredName(name: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(gif|jpe?g|pdf|png|webp)$/.test(
      name,
    )
  ) {
    throw new ApiError(
      400,
      'INVALID_FILE_NAME',
      'El nombre de archivo no es válido.',
    )
  }
}

function storageFailure() {
  // Provider errors may include signed requests, URLs or credential identifiers.
  // Do not attach those errors as causes or expose them in response/log output.
  return new ApiError(
    503,
    'UPLOAD_STORAGE_UNAVAILABLE',
    'El almacenamiento no está disponible. Intenta nuevamente más tarde.',
  )
}

function fileNotFound() {
  return new ApiError(404, 'UPLOAD_NOT_FOUND', 'El archivo no existe.')
}

export function createFilesystemUploadStorage(
  directory: string,
): UploadStorage {
  return {
    async put(name, bytes) {
      assertStoredName(name)
      await mkdir(directory, { recursive: true })
      await writeFile(join(directory, name), bytes, { flag: 'wx', mode: 0o600 })
    },
    async get(name) {
      assertStoredName(name)
      try {
        return await readFile(join(directory, name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT')
          throw fileNotFound()
        throw storageFailure()
      }
    },
    async remove(name) {
      assertStoredName(name)
      await rm(join(directory, name), { force: true })
    },
  }
}

export function createS3UploadStorage(
  bucket: string,
  client: Pick<S3Client, 'send'>,
): UploadStorage {
  return {
    async put(name, bytes, mimeType) {
      assertStoredName(name)
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: name,
            Body: bytes,
            ContentType: mimeType,
            CacheControl: 'private, no-store',
            // Private bucket is configured on the provider. No public ACL or URL.
          }),
        )
      } catch {
        throw storageFailure()
      }
    },
    async get(name) {
      assertStoredName(name)
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: name }),
        )
        if (!result.Body) throw fileNotFound()
        return Buffer.from(await result.Body.transformToByteArray())
      } catch (error) {
        if (error instanceof ApiError) throw error
        const providerError = error as {
          name?: string
          $metadata?: { httpStatusCode?: number }
        }
        if (
          providerError.name === 'NoSuchKey' ||
          providerError.$metadata?.httpStatusCode === 404
        ) {
          throw fileNotFound()
        }
        throw storageFailure()
      }
    },
    async remove(name) {
      assertStoredName(name)
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: name }),
        )
      } catch {
        throw storageFailure()
      }
    },
  }
}

// Construct on first use, after authentication/authorization in the route.
let storage: UploadStorage | undefined
export function getUploadStorage(): UploadStorage {
  storage ??=
    env.UPLOAD_STORAGE === 's3'
      ? createS3UploadStorage(
          env.S3_BUCKET!,
          new S3Client({
            endpoint: env.S3_ENDPOINT!,
            region: env.S3_REGION,
            forcePathStyle: true,
            maxAttempts: 2,
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
            requestHandler: {
              connectionTimeout: 5_000,
              requestTimeout: 20_000,
            },
            credentials: {
              accessKeyId: env.S3_ACCESS_KEY_ID!,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
            },
          }),
        )
      : createFilesystemUploadStorage(UPLOAD_DIRECTORY)
  return storage
}
