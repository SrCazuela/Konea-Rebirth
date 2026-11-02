import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, realpath } from 'node:fs/promises'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'dotenv'

export const projectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
)
export const privateBackupRoot = resolve(projectRoot, '.local/hosting')

export async function readEnvironment(fileName) {
  try {
    return parse(await readFile(resolve(projectRoot, fileName)))
  } catch (error) {
    if (error.code === 'ENOENT') return {}
    throw new Error(`No se pudo leer ${fileName}.`, { cause: error })
  }
}

export function connectionIdentity(value) {
  const url = new URL(value)
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('La conexion debe ser PostgreSQL.')
  }
  return {
    host: url.hostname.toLowerCase().replace(/^\[|\]$/g, ''),
    port: url.port || '5432',
    name: decodeURIComponent(url.pathname.slice(1)),
  }
}

export function isLocalAddress(host) {
  const lower = host.toLowerCase().replace(/^\[|\]$/g, '')
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true
  if (lower === 'host.docker.internal' || lower === 'gateway.docker.internal')
    return true
  if (isIP(lower) === 4) {
    const [a, b] = lower.split('.').map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  if (isIP(lower) === 6) {
    if (lower.startsWith('::ffff:')) return isLocalAddress(lower.slice(7))
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      /^fe[89ab]/.test(lower)
    )
  }
  return false
}

export function validateHostedTarget(targetValue, sourceValue) {
  const url = new URL(targetValue)
  const target = connectionIdentity(targetValue)
  const source = connectionIdentity(sourceValue)
  if (!target.host || !target.name || !url.username || !url.password) {
    throw new Error(
      'HOSTED_DATABASE_URL debe contener servidor, base, usuario y clave.',
    )
  }
  if (
    isLocalAddress(target.host) ||
    !target.host.includes('.') ||
    isIP(target.host)
  ) {
    throw new Error(
      'Se rechazo el destino: debe ser un servidor remoto, nunca la base local.',
    )
  }
  if (
    target.host === source.host &&
    target.port === source.port &&
    target.name === source.name
  ) {
    throw new Error('El destino coincide con la base de origen.')
  }
  if (
    !['require', 'verify-ca', 'verify-full'].includes(
      url.searchParams.get('sslmode'),
    )
  ) {
    throw new Error(
      'El destino remoto debe exigir TLS mediante sslmode=require o verify-full.',
    )
  }
  const supported = new Set(['sslmode', 'channel_binding'])
  for (const key of url.searchParams.keys()) {
    if (!supported.has(key))
      throw new Error('La conexion remota contiene parametros no admitidos.')
  }
  for (const value of [
    target.host,
    target.port,
    target.name,
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
  ]) {
    if (/[\r\n\0]/.test(value))
      throw new Error('La conexion contiene caracteres no admitidos.')
  }
  return target
}

export async function validateHostedDns(host) {
  const addresses = await lookup(host, { all: true })
  if (
    !addresses.length ||
    addresses.some(({ address }) => isLocalAddress(address))
  ) {
    throw new Error(
      'Se rechazo el destino: DNS resuelve a una direccion local o privada.',
    )
  }
}

export async function sha256(file) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}

export function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`
}

export function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`
}

export async function privateBackupPath(value) {
  const result = await realpath(resolve(value))
  const root = await realpath(privateBackupRoot)
  const suffix = relative(root, result)
  if (
    !suffix ||
    suffix.startsWith(`..${sep}`) ||
    suffix === '..' ||
    suffix.includes(`:${sep}`)
  ) {
    throw new Error('El respaldo debe ser una subcarpeta de .local/hosting.')
  }
  return result
}

export async function run(command, args, options = {}) {
  return await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', () => reject(new Error(`No se pudo iniciar ${command}.`)))
    child.on('close', (code) => {
      if (code !== 0) {
        // PostgreSQL diagnostics can contain connection strings or row values.
        // Keep them in memory only; the public error deliberately contains neither.
        reject(
          new Error(
            `${command} termino con codigo ${code}; no se modifico el origen.`,
          ),
        )
      } else resolveRun({ stdout, stderr })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(options.input)
  })
}

export function validateStoredName(value) {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(value) ||
    value.includes('..')
  )
    throw new Error('Nombre de archivo de carga no admitido.')
  return value
}

export function validateSessionPolicy(sessionPolicy) {
  if (!['include', 'exclude'].includes(sessionPolicy)) {
    throw new Error(
      'Debes elegir explicitamente --sessions include o --sessions exclude.',
    )
  }
  return sessionPolicy
}

export function sessionSafeRestoreList(contents, { sessionPolicy } = {}) {
  validateSessionPolicy(sessionPolicy)
  if (sessionPolicy === 'include') return contents
  return contents
    .split('\n')
    .filter(
      (line) =>
        !/^\d+;\s+\d+\s+\d+\s+TABLE DATA public user_sessions(?:\s|$)/.test(
          line,
        ),
    )
    .join('\n')
}

export async function tableCounts(client) {
  const tables = await client.query(`
    SELECT n.nspname AS schema, c.relname AS name
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema'
    ORDER BY n.nspname, c.relname
  `)
  const result = []
  for (const table of tables.rows) {
    const count = await client.query(
      `SELECT count(*)::text AS count FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`,
    )
    result.push({ ...table, count: count.rows[0].count })
  }
  return result
}
