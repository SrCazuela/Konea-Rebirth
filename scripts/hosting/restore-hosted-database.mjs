import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  connectionIdentity,
  privateBackupPath,
  quoteIdentifier,
  readEnvironment,
  run,
  sessionSafeRestoreList,
  sha256,
  tableCounts,
  validateHostedDns,
  validateHostedTarget,
  validateSessionPolicy,
} from './database-transfer-common.mjs'

const RESTORE_USAGE =
  'Uso: node scripts/hosting/restore-hosted-database.mjs --backup <carpeta> --sessions include|exclude'

export function parseRestoreArguments(args) {
  if (args.length !== 4) throw new Error(RESTORE_USAGE)
  const options = new Map()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (
      !['--backup', '--sessions'].includes(flag) ||
      options.has(flag) ||
      typeof value !== 'string' ||
      !value.trim() ||
      value.startsWith('--')
    ) {
      throw new Error(RESTORE_USAGE)
    }
    options.set(flag, value)
  }
  const sessionPolicy = validateSessionPolicy(options.get('--sessions'))
  return { backupArgument: options.get('--backup'), sessionPolicy }
}

export function verificationSql(tables, { sessionPolicy } = {}) {
  validateSessionPolicy(sessionPolicy)
  const checks = tables
    .map((table) => {
      const expected =
        sessionPolicy === 'exclude' &&
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

function pgToolPaths(directory, platform = process.platform) {
  if (typeof directory !== 'string' || !isAbsolute(directory)) {
    throw new Error('PG_TOOLS_DIRECTORY debe ser un directorio absoluto.')
  }
  const extension = platform === 'win32' ? '.exe' : ''
  return {
    pgRestore: join(directory, `pg_restore${extension}`),
    psql: join(directory, `psql${extension}`),
  }
}

export function nativeRestorePlan(
  toolsDirectory,
  workDirectory,
  targetValue,
  { environment = process.env, platform = process.platform } = {},
) {
  const tools = pgToolPaths(toolsDirectory, platform)
  if (!isAbsolute(workDirectory)) {
    throw new Error('El directorio de restauracion debe ser absoluto.')
  }
  const target = connectionIdentity(targetValue)
  const url = new URL(targetValue)
  // Native libpq must not inherit a service, different database or PGOPTIONS.
  const env = Object.fromEntries(
    Object.entries(environment).filter(([key]) => !/^PG/i.test(key)),
  )
  Object.assign(env, {
    PGHOST: target.host,
    PGPORT: target.port,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: target.name,
    PGSSLMODE: url.searchParams.get('sslmode'),
    PGCHANNELBINDING: url.searchParams.get('channel_binding') || 'prefer',
    PGCONNECT_TIMEOUT: '20',
  })
  return {
    pgRestore: {
      command: tools.pgRestore,
      args: [
        '--no-owner',
        '--no-privileges',
        `--use-list=${join(workDirectory, 'archive.list')}`,
        `--file=${join(workDirectory, 'restore.sql')}`,
        join(dirname(workDirectory), 'database.dump'),
      ],
    },
    psql: {
      command: tools.psql,
      args: [
        '--no-password',
        '--no-psqlrc',
        '--set=ON_ERROR_STOP=1',
        '--single-transaction',
        ...['guard.sql', 'restore.sql', 'verify.sql'].map(
          (file) => `--file=${join(workDirectory, file)}`,
        ),
      ],
      env,
    },
  }
}

export async function restoreHostedDatabase(
  backupArgument,
  { sessionPolicy } = {},
) {
  // Require this choice before reading a backup, credentials or any remote state.
  validateSessionPolicy(sessionPolicy)
  if (!backupArgument) throw new Error(RESTORE_USAGE)
  const nativeToolsDirectory = process.env.PG_TOOLS_DIRECTORY
  if (nativeToolsDirectory !== undefined) {
    const tools = pgToolPaths(nativeToolsDirectory)
    try {
      const entries = await Promise.all(
        [nativeToolsDirectory, tools.pgRestore, tools.psql].map((file) =>
          stat(file),
        ),
      )
      if (
        !entries[0].isDirectory() ||
        entries.slice(1).some((entry) => !entry.isFile())
      ) {
        throw new Error('Invalid PostgreSQL tools directory')
      }
    } catch {
      throw new Error(
        'PG_TOOLS_DIRECTORY debe contener pg_restore y psql ejecutables para esta plataforma.',
      )
    }
  }
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
  const sourceValue = process.env.LOCAL_DATABASE_URL || local.DATABASE_URL
  const targetValue =
    process.env.HOSTED_DATABASE_URL || hosted.HOSTED_DATABASE_URL
  if (!targetValue)
    throw new Error(
      'Falta HOSTED_DATABASE_URL en .env.hosting.local; la base local no se usara como destino.',
    )
  if (!sourceValue)
    throw new Error(
      'Falta LOCAL_DATABASE_URL en el entorno o DATABASE_URL en .env para verificar la separacion entre origen y destino.',
    )
  const target = validateHostedTarget(targetValue, sourceValue)
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
      { sessionPolicy },
    )
    await writeFile(join(work, 'archive.list'), list, { mode: 0o600 })
    const tables = manifest.tables
    const emptyGuard = `DO $konea_empty$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r','p','S','v','m','f')) THEN RAISE EXCEPTION 'El destino dejo de estar vacio'; END IF; END $konea_empty$;\n`
    await writeFile(join(work, 'guard.sql'), emptyGuard, { mode: 0o600 })
    await writeFile(
      join(work, 'verify.sql'),
      verificationSql(tables, { sessionPolicy }),
      { mode: 0o600 },
    )
    if (nativeToolsDirectory !== undefined) {
      const plan = nativeRestorePlan(nativeToolsDirectory, work, targetValue)
      await run(plan.pgRestore.command, plan.pgRestore.args)
      // Credentials are passed only in this child's in-memory environment.
      await run(plan.psql.command, plan.psql.args, { env: plan.psql.env })
    } else {
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
    }
    const counts = await tableCounts(client)
    const result = {
      restoredAt: new Date().toISOString(),
      tableCount: counts.length,
      rows: counts.reduce((total, table) => total + Number(table.count), 0),
      sessionPolicy,
      userSessionsCopied: sessionPolicy === 'include',
      userSessionRows: Number(
        counts.find(
          (table) =>
            table.schema === 'public' && table.name === 'user_sessions',
        )?.count ?? 0,
      ),
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
  let options
  try {
    options = parseRestoreArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
  if (options) {
    restoreHostedDatabase(options.backupArgument, {
      sessionPolicy: options.sessionPolicy,
    })
      .then((result) => {
        const sessionSummary =
          result.sessionPolicy === 'include'
            ? `Sesiones de acceso incluidas: ${result.userSessionRows}.`
            : 'Sesiones de acceso locales excluidas por eleccion explicita.'
        console.log(
          `Copia remota verificada: ${result.tableCount} tablas y ${result.rows} filas. ${sessionSummary} Origen intacto.`,
        )
      })
      .catch((error) => {
        console.error(error.message)
        process.exitCode = 1
      })
  }
}
