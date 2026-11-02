import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GetBucketAclCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import {
  privateBackupPath,
  readEnvironment,
  sha256,
  validateHostedDns,
} from './database-transfer-common.mjs'

export function validateStorageEndpoint(value) {
  let endpoint
  try {
    endpoint = new URL(value)
  } catch {
    throw new Error('S3_ENDPOINT no es una URL válida.')
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.pathname !== '/' ||
    endpoint.search ||
    endpoint.hash ||
    !endpoint.hostname.endsWith('.neon.tech')
  ) {
    throw new Error(
      'El destino de esta copia debe ser un endpoint HTTPS de Neon Object Storage.',
    )
  }
  return endpoint
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function verifyUploadSnapshot(directory, manifest) {
  if (
    manifest.formatVersion !== 1 ||
    manifest.completed !== true ||
    !Array.isArray(manifest.uploads?.files) ||
    manifest.uploads.missingFiles?.length
  ) {
    throw new Error('El respaldo de archivos está incompleto.')
  }
  const names = new Set()
  for (const file of manifest.uploads.files) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(gif|jpe?g|pdf|png|webp)$/.test(
        file.storedName,
      ) ||
      names.has(file.storedName) ||
      file.relativePath !== `uploads/${file.storedName}` ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !/^[0-9a-f]{64}$/.test(file.sha256) ||
      ![
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
      ].includes(file.mimeType)
    ) {
      throw new Error('El manifiesto contiene un archivo inválido o repetido.')
    }
    names.add(file.storedName)
    const path = join(directory, 'uploads', file.storedName)
    const bytes = await readFile(path)
    if (bytes.length !== file.size || (await sha256(path)) !== file.sha256) {
      throw new Error(
        'Un archivo no coincide con el SHA-256 del respaldo; no se copiará ningún archivo.',
      )
    }
  }
  return manifest.uploads.files
}

export async function importHostedUploads(
  backupArgument,
  { checkOnly = false } = {},
) {
  if (!backupArgument) throw new Error('Falta --backup <carpeta>.')
  const directory = await privateBackupPath(backupArgument)
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  )
  const files = await verifyUploadSnapshot(directory, manifest)
  if (checkOnly)
    return { checked: files.length, uploaded: 0, skipped: 0, checkOnly: true }

  const configured = await readEnvironment('.env.hosting.local')
  const environment = { ...configured, ...process.env }
  for (const key of [
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ]) {
    if (!environment[key])
      throw new Error(`Falta ${key} en .env.hosting.local.`)
  }
  const endpoint = validateStorageEndpoint(environment.S3_ENDPOINT)
  await validateHostedDns(endpoint.hostname)
  const client = new S3Client({
    endpoint: endpoint.origin,
    region: environment.S3_REGION || 'us-east-2',
    forcePathStyle: true,
    maxAttempts: 2,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 20_000 },
    credentials: {
      accessKeyId: environment.S3_ACCESS_KEY_ID,
      secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
    },
  })
  const Bucket = environment.S3_BUCKET
  let uploaded = 0
  let skipped = 0
  try {
    const acl = await client.send(new GetBucketAclCommand({ Bucket }))
    if (
      !Array.isArray(acl.Grants) ||
      acl.Grants.some(({ Grantee }) => Grantee?.Type === 'Group')
    ) {
      throw new Error(
        'La copia requiere un bucket privado; corrige sus permisos en Neon antes de continuar.',
      )
    }
    // Check every existing key before the first write. An unrelated bucket or
    // changed file must not be overwritten by a retry of this migration.
    const pending = []
    for (const file of files) {
      try {
        const current = await client.send(
          new HeadObjectCommand({ Bucket, Key: file.storedName }),
        )
        if (current.ContentLength !== file.size)
          throw new Error(
            'Existe un objeto diferente con el mismo nombre; no se sobreescribirá.',
          )
        const remote = await client.send(
          new GetObjectCommand({ Bucket, Key: file.storedName }),
        )
        if (
          !remote.Body ||
          digest(await remote.Body.transformToByteArray()) !== file.sha256
        ) {
          throw new Error(
            'Existe un objeto diferente con el mismo nombre; no se sobreescribirá.',
          )
        }
        skipped += 1
      } catch (error) {
        if (
          error?.name === 'NotFound' ||
          error?.name === 'NoSuchKey' ||
          error?.$metadata?.httpStatusCode === 404
        )
          pending.push(file)
        else throw error
      }
    }
    for (const file of pending) {
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: file.storedName,
          Body: await readFile(join(directory, 'uploads', file.storedName)),
          ContentType: file.mimeType,
          CacheControl: 'private, no-store',
          Metadata: { sha256: file.sha256 },
          IfNoneMatch: '*',
        }),
      )
      const remote = await client.send(
        new GetObjectCommand({ Bucket, Key: file.storedName }),
      )
      if (
        !remote.Body ||
        digest(await remote.Body.transformToByteArray()) !== file.sha256
      ) {
        throw new Error(
          'Un objeto remoto no coincide con el archivo original; la copia quedó incompleta.',
        )
      }
      uploaded += 1
    }
    const result = {
      completedAt: new Date().toISOString(),
      checked: files.length,
      uploaded,
      skipped,
      privateBucketVerified: true,
    }
    await writeFile(
      join(directory, 'uploads-hosted-result.json'),
      `${JSON.stringify(result, null, 2)}\n`,
      { mode: 0o600 },
    )
    return result
  } catch (error) {
    if (
      error instanceof Error &&
      !('$metadata' in error) &&
      !/https?:|secret|signature|credential/i.test(error.message)
    )
      throw error
    throw new Error(
      'No se pudo completar la copia de archivos. Comprueba conexión, permisos y configuración privada del bucket; las claves no se mostrarán.',
    )
  } finally {
    client.destroy()
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2)
  if (
    (args.length !== 2 && args.length !== 3) ||
    args[0] !== '--backup' ||
    (args[2] && args[2] !== '--check')
  ) {
    console.error(
      'Uso: node scripts/hosting/import-hosted-uploads.mjs --backup <carpeta> [--check]',
    )
    process.exitCode = 1
  } else {
    importHostedUploads(args[1], { checkOnly: args[2] === '--check' })
      .then((result) => {
        console.log(
          result.checkOnly
            ? `Respaldo verificado: ${result.checked} archivos. No se contactó ningún servidor remoto.`
            : `Archivos remotos verificados: ${result.uploaded} copiados y ${result.skipped} ya coincidentes. Los archivos locales se conservaron.`,
        )
      })
      .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
  }
}
