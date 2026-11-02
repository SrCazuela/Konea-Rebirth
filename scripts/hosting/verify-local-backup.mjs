import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  privateBackupPath,
  run,
  sessionSafeRestoreList,
  sha256,
} from './database-transfer-common.mjs'
import { verificationSql } from './restore-hosted-database.mjs'

export async function verifyLocalBackup(backupArgument) {
  if (!backupArgument) throw new Error('Falta la carpeta del respaldo.')
  const directory = await privateBackupPath(backupArgument)
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  )
  if (
    !manifest.completed ||
    manifest.formatVersion !== 1 ||
    (await sha256(join(directory, 'database.dump'))) !== manifest.archive.sha256
  ) {
    throw new Error('El respaldo esta incompleto o su SHA-256 no coincide.')
  }
  for (const file of manifest.uploads.files) {
    if ((await sha256(join(directory, file.relativePath))) !== file.sha256) {
      throw new Error('El SHA-256 de una carga copiada no coincide.')
    }
  }
  // The verification database has no host port, no network and no persistent volume.
  // It can never reach the source database or the hosted target.
  const containerName = `konea-backup-verify-${randomUUID().slice(0, 12)}`
  let created = false
  try {
    await run('docker', [
      'run',
      '-d',
      '--rm',
      '--network',
      'none',
      '--name',
      containerName,
      '--env',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '--mount',
      `type=bind,source=${directory},target=/backup,readonly`,
      'postgres:17-alpine',
    ])
    created = true
    let ready = false
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const result = await run('docker', [
        'exec',
        containerName,
        'pg_isready',
        '-U',
        'postgres',
      ]).catch(() => null)
      if (result) {
        ready = true
        break
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 500))
    }
    if (!ready)
      throw new Error('La base temporal de verificacion no estuvo disponible.')
    await run('docker', [
      'exec',
      containerName,
      'pg_restore',
      '--username=postgres',
      '--dbname=postgres',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      '/backup/database.dump',
    ])
    await run(
      'docker',
      [
        'exec',
        '-i',
        containerName,
        'psql',
        '--username=postgres',
        '--dbname=postgres',
        '--no-psqlrc',
        '--set=ON_ERROR_STOP=1',
      ],
      {
        input: verificationSql(manifest.tables, { sessionPolicy: 'include' }),
      },
    )
    await run('docker', [
      'exec',
      containerName,
      'createdb',
      '--username=postgres',
      'hosted_policy_test',
    ])
    await run(
      'docker',
      ['exec', '-i', containerName, 'sh', '-c', 'cat > /tmp/restore.list'],
      {
        input: sessionSafeRestoreList(
          await readFile(join(directory, 'archive.list'), 'utf8'),
          { sessionPolicy: 'exclude' },
        ),
      },
    )
    await run('docker', [
      'exec',
      containerName,
      'pg_restore',
      '--no-owner',
      '--no-privileges',
      '--use-list=/tmp/restore.list',
      '--file=/tmp/restore.sql',
      '/backup/database.dump',
    ])
    await run(
      'docker',
      [
        'exec',
        '-i',
        containerName,
        'psql',
        '--username=postgres',
        '--dbname=hosted_policy_test',
        '--no-psqlrc',
        '--set=ON_ERROR_STOP=1',
        '--single-transaction',
        '--file=/tmp/restore.sql',
        '--file=-',
      ],
      { input: verificationSql(manifest.tables, { sessionPolicy: 'exclude' }) },
    )
    const result = {
      verifiedAt: new Date().toISOString(),
      databaseRestoredSuccessfully: true,
      allTableCountsMatch: true,
      allUploadChecksumsMatch: true,
      hostedRestoreTransactionAndSessionPolicyVerified: true,
      tableCount: manifest.tables.length,
      fileCount: manifest.uploads.files.length,
      sourceUnchanged: true,
      method:
        'full pg_restore in network-isolated disposable PostgreSQL; exact counts including access sessions',
    }
    await writeFile(
      join(directory, 'verification.json'),
      `${JSON.stringify(result, null, 2)}\n`,
      { mode: 0o600 },
    )
    return result
  } finally {
    if (created)
      await run('docker', ['stop', '--time', '1', containerName]).catch(
        () => {},
      )
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--backup') {
    console.error(
      'Uso: node scripts/hosting/verify-local-backup.mjs --backup <carpeta>',
    )
    process.exitCode = 1
  } else {
    verifyLocalBackup(args[1])
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
  }
}
