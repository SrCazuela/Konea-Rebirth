import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  connectionIdentity,
  privateBackupRoot,
  projectRoot,
  readEnvironment,
  run,
  sha256,
  tableCounts,
  validateStoredName,
} from './database-transfer-common.mjs'

export async function exportLocalDatabase() {
  const local = await readEnvironment('.env')
  if (!local.DATABASE_URL)
    throw new Error('Falta DATABASE_URL en el .env local.')
  const source = connectionIdentity(local.DATABASE_URL)
  if (!['localhost', '127.0.0.1', '::1'].includes(source.host)) {
    throw new Error(
      'El exportador solo acepta la base PostgreSQL local de este proyecto.',
    )
  }
  const { stdout: idOutput } = await run('docker', [
    'compose',
    'ps',
    '-q',
    'postgres',
  ])
  const containerId = idOutput.trim()
  if (!/^[a-f0-9]{12,64}$/.test(containerId)) {
    throw new Error(
      'Inicia Docker Desktop y ejecuta npm run db:up antes de exportar.',
    )
  }
  const { stdout: inspected } = await run('docker', ['inspect', containerId])
  const container = JSON.parse(inspected)[0]
  const values = Object.fromEntries(
    container.Config.Env.map((entry) => {
      const boundary = entry.indexOf('=')
      return [entry.slice(0, boundary), entry.slice(boundary + 1)]
    }),
  )
  const binding = container.NetworkSettings.Ports['5432/tcp'] ?? []
  if (
    values.POSTGRES_DB !== source.name ||
    !binding.some((entry) => entry.HostPort === source.port)
  ) {
    throw new Error(
      'La base de .env no coincide con PostgreSQL del compose; no se exporto otra base.',
    )
  }

  const id = `${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}-${randomUUID().slice(0, 8)}`
  const directory = join(privateBackupRoot, id)
  await mkdir(join(directory, 'uploads'), { recursive: true, mode: 0o700 })
  const containerArchive = `/tmp/konea-export-${randomUUID()}.dump`
  const client = new Client({
    connectionString: local.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  })
  let dumpCreated = false
  let transactionOpen = false
  try {
    await client.connect()
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transactionOpen = true
    const snapshot = await client.query(
      'SELECT pg_export_snapshot() AS snapshot',
    )
    const snapshotId = snapshot.rows[0].snapshot
    if (!/^[A-Fa-f0-9-]+$/.test(snapshotId))
      throw new Error('Snapshot PostgreSQL inesperado.')
    const tables = await tableCounts(client)
    const uploads = await client.query(`
      SELECT stored_name AS "storedName", mime_type AS "mimeType", size
      FROM public.uploaded_files ORDER BY stored_name
    `)
    const { stdout: versionOutput } = await client
      .query('SHOW server_version')
      .then((result) => ({ stdout: result.rows[0].server_version }))
    await run('docker', [
      'exec',
      containerId,
      'sh',
      '-c',
      'exec pg_dump --no-password --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=custom --no-owner --no-privileges --snapshot="$1" --file="$2"',
      'konea-export',
      snapshotId,
      containerArchive,
    ])
    dumpCreated = true
    await run('docker', [
      'cp',
      `${containerId}:${containerArchive}`,
      join(directory, 'database.dump'),
    ])
    const { stdout: list } = await run('docker', [
      'exec',
      containerId,
      'pg_restore',
      '--list',
      containerArchive,
    ])
    if (
      !list.includes('TABLE DATA public users ') ||
      !list.includes('TABLE DATA public profiles ')
    ) {
      throw new Error(
        'El archivo exportado no contiene las tablas esperadas de Konea.',
      )
    }
    await writeFile(join(directory, 'archive.list'), list, { mode: 0o600 })
    const { stdout: schema } = await run('docker', [
      'exec',
      containerId,
      'pg_restore',
      '--schema-only',
      '--no-owner',
      '--no-privileges',
      '--file=-',
      containerArchive,
    ])
    await writeFile(join(directory, 'schema.sql'), schema, { mode: 0o600 })

    const uploadDirectory = resolve(
      projectRoot,
      local.UPLOAD_DIRECTORY || '.local/uploads',
    )
    const files = []
    for (const upload of uploads.rows) {
      const storedName = validateStoredName(upload.storedName)
      const sourceFile = join(uploadDirectory, storedName)
      const destination = join(directory, 'uploads', storedName)
      const before = await stat(sourceFile).catch(() => null)
      if (!before?.isFile() || before.size !== upload.size) {
        throw new Error(
          'Falta una carga registrada o su tamano difiere; no se marcara el respaldo como completo.',
        )
      }
      await copyFile(sourceFile, destination)
      const after = await stat(sourceFile)
      if (
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        (await sha256(sourceFile)) !== (await sha256(destination))
      ) {
        throw new Error(
          'Una carga cambio durante la copia; repite la exportacion.',
        )
      }
      files.push({
        ...upload,
        relativePath: `uploads/${basename(storedName)}`,
        sha256: await sha256(destination),
      })
    }
    await client.query('COMMIT')
    transactionOpen = false
    const archiveStat = await stat(join(directory, 'database.dump'))
    const manifest = {
      formatVersion: 1,
      completed: true,
      exportedAt: new Date().toISOString(),
      sourceKind: 'local-postgresql-compose',
      database: {
        version: versionOutput,
        sizeBytes: Number(
          (
            await client.query(
              'SELECT pg_database_size(current_database())::text AS size',
            )
          ).rows[0].size,
        ),
      },
      archive: {
        relativePath: 'database.dump',
        size: archiveStat.size,
        sha256: await sha256(join(directory, 'database.dump')),
      },
      tables,
      uploads: {
        files,
        missingFiles: [],
        totalBytes: files.reduce((total, file) => total + file.size, 0),
      },
      hostedSessionPolicy:
        'user_sessions data excluded on hosted restore; source/archive remain unchanged',
    }
    await writeFile(
      join(directory, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    )
    await writeFile(
      join(directory, 'LEEME.txt'),
      'RESPALDO PRIVADO. Contiene los datos reales de la base local y adjuntos.\n' +
        'No subir esta carpeta a GitHub, Sites ni Google Drive publico.\n' +
        'database.dump conserva esquema, filas, secuencias y migraciones.\n' +
        'schema.sql permite revisar la estructura. manifest.json registra conteos y SHA-256.\n' +
        'La restauracion remota requiere base vacia y omite sesiones de acceso; exige iniciar sesion de nuevo.\n' +
        'Exportacion de solo lectura: la base y los archivos locales permanecen intactos.\n',
      { mode: 0o600 },
    )
    return {
      directory,
      tableCount: tables.length,
      rows: tables.reduce((total, table) => total + Number(table.count), 0),
      files: files.length,
      bytes: archiveStat.size,
    }
  } finally {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => {})
    await client.end().catch(() => {})
    if (dumpCreated)
      await run('docker', [
        'exec',
        containerId,
        'rm',
        '-f',
        containerArchive,
      ]).catch(() => {})
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  exportLocalDatabase()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
    })
    .catch((error) => {
      console.error(error.message)
      process.exitCode = 1
    })
}
