import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  privateBackupPath,
  quoteIdentifier,
  readEnvironment,
  run,
  sessionSafeRestoreList,
  sha256,
  tableCounts,
  validateHostedDns,
  validateHostedTarget,
} from './database-transfer-common.mjs'

export function verificationSql(tables, { excludeSessions = true } = {}) {
  const checks = tables
    .map((table) => {
      const expected =
        excludeSessions &&
        table.schema === 'public' &&
        table.name === 'user_sessions'
          ? '0'
          : table.count
      if (!/^\d+$/.test(expected))
        throw new Error('Conteo invalido en manifiesto.')
      const name = `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`
      return `IF (SELECT count(*) FROM ${name}) <> ${expected} THEN RAISE EXCEPTION 'Conteo de respaldo inconsistente'; END IF;`
    })
    .join('\n')
  return `DO $konea_verify$ BEGIN\n${checks}\nEND $konea_verify$;\n`
}

export async function restoreHostedDatabase(backupArgument) {
  if (!backupArgument)
    throw new Error(
      'Uso: node scripts/hosting/restore-hosted-database.mjs --backup <carpeta>',
    )
  const directory = await privateBackupPath(backupArgument)
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  )
  if (
    manifest.formatVersion !== 1 ||
    manifest.completed !== true ||
    manifest.archive?.relativePath !== 'database.dump' ||
    !manifest.tables?.length
  ) {
    throw new Error(
      'El respaldo no esta completo o su formato no es compatible.',
    )
  }
  if (
    (await sha256(join(directory, 'database.dump'))) !== manifest.archive.sha256
  ) {
    throw new Error(
      'El SHA-256 del respaldo no coincide; restauracion cancelada.',
    )
  }
  const local = await readEnvironment('.env')
  const hosted = await readEnvironment('.env.hosting.local')
  const targetValue =
    process.env.HOSTED_DATABASE_URL || hosted.HOSTED_DATABASE_URL
  if (!targetValue)
    throw new Error(
      'Falta HOSTED_DATABASE_URL en .env.hosting.local; la base local no se usara como destino.',
    )
  if (!local.DATABASE_URL)
    throw new Error(
      'Falta DATABASE_URL local para verificar la separacion entre origen y destino.',
    )
  const target = validateHostedTarget(targetValue, local.DATABASE_URL)
  await validateHostedDns(target.host)
  const client = new Client({
    connectionString: targetValue,
    connectionTimeoutMillis: 20_000,
  })
  await client.connect()
  try {
    const existing = await client.query(`
      SELECT count(*)::int AS count FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
        AND c.relkind IN ('r','p','S','v','m','f')
    `)
    const existingEnums = await client.query(`
      SELECT count(*)::int AS count FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typtype='e' AND n.nspname NOT LIKE 'pg_%'
    `)
    if (existing.rows[0].count !== 0 || existingEnums.rows[0].count !== 0) {
      throw new Error(
        'El destino contiene objetos. No se sobreescribira: usa una base remota nueva y vacia.',
      )
    }
    const work = await mkdtemp(join(directory, 'restore-'))
    const workName = basename(work)
    const list = sessionSafeRestoreList(
      await readFile(join(directory, 'archive.list'), 'utf8'),
    )
    await writeFile(join(work, 'archive.list'), list, { mode: 0o600 })
    const tables = manifest.tables
    const emptyGuard = `DO $konea_empty$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','S','v','m','f')) THEN RAISE EXCEPTION 'El destino dejo de estar vacio'; END IF; END $konea_empty$;\n`
    await writeFile(join(work, 'guard.sql'), emptyGuard, { mode: 0o600 })
    await writeFile(join(work, 'verify.sql'), verificationSql(tables), {
      mode: 0o600,
    })
    const mount = `type=bind,source=${directory},target=/backup`
    await run('docker', [
      'run',
      '--rm',
      '--mount',
      mount,
      'postgres:17-alpine',
      'pg_restore',
      '--no-owner',
      '--no-privileges',
      `--use-list=/backup/${workName}/archive.list`,
      `--file=/backup/${workName}/restore.sql`,
      '/backup/database.dump',
    ])
    const url = new URL(targetValue)
    const input =
      [
        target.host,
        target.port,
        decodeURIComponent(url.username),
        decodeURIComponent(url.password),
        target.name,
        url.searchParams.get('sslmode'),
        url.searchParams.get('channel_binding') || 'prefer',
      ].join('\n') + '\n'
    // Credentials travel through stdin; they never appear in process arguments or logs.
    const shell =
      'IFS= read -r PGHOST; IFS= read -r PGPORT; IFS= read -r PGUSER; ' +
      'IFS= read -r PGPASSWORD; IFS= read -r PGDATABASE; IFS= read -r PGSSLMODE; IFS= read -r PGCHANNELBINDING; ' +
      'export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE PGCHANNELBINDING; ' +
      'export PGCONNECT_TIMEOUT=20; exec psql --no-password --no-psqlrc --set=ON_ERROR_STOP=1 --single-transaction ' +
      `--file=/backup/${workName}/guard.sql --file=/backup/${workName}/restore.sql --file=/backup/${workName}/verify.sql`
    await run(
      'docker',
      [
        'run',
        '--rm',
        '-i',
        '--mount',
        `${mount},readonly`,
        'postgres:17-alpine',
        'sh',
        '-c',
        shell,
      ],
      { input },
    )
    const counts = await tableCounts(client)
    const result = {
      restoredAt: new Date().toISOString(),
      tableCount: counts.length,
      rows: counts.reduce((total, table) => total + Number(table.count), 0),
      userSessionsCopied: false,
      tables: counts,
      sourceUnchanged: true,
    }
    await writeFile(
      join(work, 'result.json'),
      `${JSON.stringify(result, null, 2)}\n`,
      { mode: 0o600 },
    )
    return result
  } finally {
    await client.end()
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--backup') {
    console.error(
      'Uso: node scripts/hosting/restore-hosted-database.mjs --backup <carpeta>',
    )
    process.exitCode = 1
  } else {
    restoreHostedDatabase(args[1])
      .then((result) => {
        console.log(
          `Copia remota verificada: ${result.tableCount} tablas y ${result.rows} filas. Sesiones de acceso locales excluidas. Origen intacto.`,
        )
      })
      .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
  }
}
