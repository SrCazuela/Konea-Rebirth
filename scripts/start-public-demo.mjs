import { spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, openSync } from 'node:fs'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { get as httpGet } from 'node:http'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LOCAL = join(ROOT, '.local', 'public-demo')
const STATUS_FILE = join(LOCAL, 'status.json')
const STOP_FILE = join(LOCAL, 'stop-request.json')
const CONFIG_FILE = join(LOCAL, 'credentials.json')
const LOCK_FILE = join(LOCAL, 'launcher.lock')
const CONTAINER = 'konea-public-demo-postgres'
const PURPOSE = 'konea-public-demo'
const DATABASE_PORT = 55435
const APP_PORT = 4310
const CLOUDFLARED_VERSION = '2026.10.3'
const CLOUDFLARED_SHA256 =
  '76b2805253d0d6ffacb092a7acfbee99e7af6917835c0c5410e23f3ef5052da2'
const CLOUDFLARED_URL = `https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`
const args = new Set(process.argv.slice(2))
const pause = (ms) => new Promise((done) => setTimeout(done, ms))
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))
const saveJson = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
const runId = randomUUID()
let stage = 'Comprobando herramientas'
let apiProcess
let tunnelProcess
let stopping = false
let lockHandle
let shutdownPromise
let stopWatcher
let apiSpawnError = false
const cancellation = new AbortController()
let state = { runId, supervisorPid: process.pid, running: false, stage }

function assertContinuing() {
  if (stopping) throw new Error('Se cancelo la preparacion de la demostracion.')
}

function isExited(child) {
  return child.exitCode !== null || child.signalCode !== null
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sanitizeError(error) {
  // Errors may contain command output: never print connection URLs, headers or credentials.
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[conexion privada]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[clave privada]')
    .split(/\r?\n/)[0]
}

async function progress(message) {
  assertContinuing()
  stage = message
  state = { ...state, stage, updatedAt: new Date().toISOString() }
  await saveJson(STATUS_FILE, state)
  console.log(message)
}

function command(binary, commandArgs, options = {}) {
  assertContinuing()
  return new Promise((done, fail) => {
    const child = spawn(binary, commandArgs, {
      cwd: ROOT,
      env: process.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: cancellation.signal,
      ...options,
    })
    let output = ''
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr?.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.once('error', () =>
      fail(new Error(`No se pudo ejecutar ${binary}. Revisa su instalacion.`)),
    )
    child.once('exit', (code) => {
      if (code !== 0)
        void writeFile(join(LOCAL, 'last-command.log'), output, {
          mode: 0o600,
        })
          .catch(() => {})
          .finally(() =>
            fail(
              new Error(
                `Fallo el paso '${stage}' (codigo ${code}). Consulta .local/public-demo/last-command.log.`,
              ),
            ),
          )
      else done(output)
    })
  })
}

function node(commandArgs, options = {}) {
  return command(process.execPath, ['--no-maglev', ...commandArgs], options)
}

function npm(commandArgs, environment) {
  const npmCli = join(
    dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  )
  if (!existsSync(npmCli))
    throw new Error(
      'No se encontro npm junto a Node.js. Reinstala Node con npm incluido.',
    )
  return node([npmCli, ...commandArgs], { env: environment })
}

async function ensureDatabase(settings) {
  await progress(
    'Preparando PostgreSQL exclusivo de demostracion (sin tocar tu base actual)',
  )
  try {
    await command('docker', ['info', '--format', '{{.ServerVersion}}'])
  } catch {
    assertContinuing()
    const desktop = [
      process.env.ProgramFiles &&
        join(
          process.env.ProgramFiles,
          'Docker',
          'Docker',
          'Docker Desktop.exe',
        ),
      process.env.LOCALAPPDATA &&
        join(
          process.env.LOCALAPPDATA,
          'Programs',
          'DockerDesktop',
          'Docker Desktop.exe',
        ),
    ].find((path) => path && existsSync(path))
    if (!desktop)
      throw new Error(
        'Instala Docker Desktop y comprueba que este disponible antes de iniciar la demo.',
      )
    const starting = spawn(desktop, [], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    })
    starting.once('error', () => {})
    starting.unref()
    let available = false
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await command('docker', ['info', '--format', '{{.ServerVersion}}'])
        available = true
        break
      } catch {
        assertContinuing()
      }
      await pause(2000)
    }
    if (!available)
      throw new Error('Docker Desktop no respondio en 120 segundos.')
  }
  let existing
  try {
    existing = JSON.parse(await command('docker', ['inspect', CONTAINER]))[0]
  } catch {
    /* New container. */
  }
  if (existing) {
    const bindings = existing.HostConfig.PortBindings?.['5432/tcp'] ?? []
    if (
      existing.Config.Labels?.['com.konea.purpose'] !== PURPOSE ||
      bindings.length !== 1 ||
      bindings[0].HostIp !== '127.0.0.1' ||
      bindings[0].HostPort !== String(DATABASE_PORT)
    ) {
      throw new Error(
        'El nombre del contenedor de demo pertenece a otra configuracion. No se modifico.',
      )
    }
    const expected = `POSTGRES_PASSWORD=${settings.databasePassword}`
    if (!existing.Config.Env.includes(expected))
      throw new Error(
        'Las credenciales locales no coinciden con el contenedor de demo. No se modifico la base.',
      )
    if (!existing.State.Running) await command('docker', ['start', CONTAINER])
  } else {
    await command(
      'docker',
      [
        'run',
        '-d',
        '--name',
        CONTAINER,
        '--label',
        `com.konea.purpose=${PURPOSE}`,
        '-e',
        'POSTGRES_DB=konea_public_demo',
        '-e',
        'POSTGRES_USER=konea_demo',
        '-e',
        'POSTGRES_PASSWORD',
        '-p',
        `127.0.0.1:${DATABASE_PORT}:5432`,
        '-v',
        'konea_public_demo_postgres_data:/var/lib/postgresql/data',
        '--health-cmd',
        'pg_isready -U konea_demo -d konea_public_demo',
        '--health-interval',
        '3s',
        '--health-timeout',
        '3s',
        '--health-retries',
        '20',
        'postgres:17-alpine',
      ],
      { env: { ...process.env, POSTGRES_PASSWORD: settings.databasePassword } },
    )
  }
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = JSON.parse(
      await command('docker', ['inspect', CONTAINER]),
    )[0]
    if (current.State.Health?.Status === 'healthy') return
    await pause(1000)
  }
  throw new Error(
    'PostgreSQL de demo no respondio. La base de desarrollo no fue modificada.',
  )
}

async function cloudflared() {
  if (process.platform !== 'win32' || process.arch !== 'x64')
    throw new Error('Este iniciador de demo requiere Windows x64.')
  const binary = join(LOCAL, 'tools', 'cloudflared.exe')
  await mkdir(dirname(binary), { recursive: true })
  if (existsSync(binary)) {
    const hash = createHash('sha256')
      .update(await readFile(binary))
      .digest('hex')
    if (hash === CLOUDFLARED_SHA256) return binary
    throw new Error(
      'El ejecutable local cloudflared no coincide con la version verificada. No se ejecuto.',
    )
  }
  await progress(
    'Descargando cloudflared desde Cloudflare/GitHub y comprobando SHA256',
  )
  const response = await fetch(CLOUDFLARED_URL, {
    signal: AbortSignal.any([
      cancellation.signal,
      AbortSignal.timeout(120_000),
    ]),
  })
  if (!response.ok)
    throw new Error(
      'No se pudo descargar cloudflared desde su repositorio oficial.',
    )
  const buffer = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(buffer).digest('hex') !== CLOUDFLARED_SHA256)
    throw new Error('La descarga no paso la verificacion SHA256.')
  await writeFile(binary, buffer)
  return binary
}

async function startTunnel(binary) {
  await progress(
    'Creando enlace temporal de Cloudflare (el servidor permanece cerrado hasta validar su configuracion)',
  )
  const config = join(LOCAL, 'cloudflared-config.yml')
  await writeFile(
    config,
    '# Isolated Quick Tunnel; does not use your personal Cloudflare configuration.\n',
  )
  const log = openSync(join(LOCAL, 'cloudflared.log'), 'a')
  assertContinuing()
  tunnelProcess = spawn(
    binary,
    [
      'tunnel',
      '--config',
      config,
      '--url',
      `http://127.0.0.1:${APP_PORT}`,
      '--no-autoupdate',
      '--protocol',
      'http2',
      '--metrics',
      '127.0.0.1:4311',
    ],
    {
      cwd: ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const origin = await new Promise((done, fail) => {
    const timeout = setTimeout(
      () =>
        fail(
          new Error(
            'Cloudflare no entrego un enlace en 60 segundos. Revisa la conexion.',
          ),
        ),
      60_000,
    )
    let received = ''
    const inspect = (chunk) => {
      // Cloudflared output has no application credentials. Keep it outside Git.
      received += chunk.toString()
      const found = received.match(
        /https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com\b/,
      )
      if (found) {
        clearTimeout(timeout)
        done(found[0])
      }
    }
    tunnelProcess.stdout.on('data', inspect)
    tunnelProcess.stderr.on('data', inspect)
    tunnelProcess.once('error', () => {
      clearTimeout(timeout)
      fail(new Error('No se pudo iniciar cloudflared.'))
    })
    tunnelProcess.once('exit', () => {
      clearTimeout(timeout)
      fail(new Error('Cloudflare termino antes de estar disponible.'))
    })
  })
  // Drain output into a private diagnostic log; do not retain an unbounded buffer.
  tunnelProcess.stdout.removeAllListeners('data')
  tunnelProcess.stderr.removeAllListeners('data')
  const fs = await import('node:fs')
  const stream = fs.createWriteStream('', { fd: log })
  tunnelProcess.stdout.pipe(stream, { end: false })
  tunnelProcess.stderr.pipe(stream, { end: false })
  return origin
}

async function stopChild(child) {
  if (!child || isExited(child)) return
  child.kill('SIGTERM')
  for (let attempt = 0; attempt < 20 && !isExited(child); attempt += 1)
    await pause(100)
  if (!isExited(child)) child.kill('SIGKILL')
}

function localHealth(origin, authorization) {
  // Node fetch intentionally ignores a custom Host header. Use HTTP directly
  // for this loopback-only probe without weakening the public host allowlist.
  return new Promise((done) => {
    const request = httpGet(
      `http://127.0.0.1:${APP_PORT}/api/v1/health`,
      {
        headers: {
          Authorization: authorization,
          Host: new URL(origin).host,
          'X-Forwarded-Proto': 'https',
        },
        timeout: 2000,
      },
      (response) => {
        response.resume()
        done(response.statusCode === 200)
      },
    )
    request.once('error', () => done(false))
    request.once('timeout', () => {
      request.destroy()
      done(false)
    })
  })
}

async function shutdown() {
  if (shutdownPromise) return shutdownPromise
  stopping = true
  cancellation.abort()
  if (stopWatcher) clearInterval(stopWatcher)
  shutdownPromise = (async () => {
    await stopChild(tunnelProcess)
    await stopChild(apiProcess)
    state = {
      ...state,
      running: false,
      stage: 'Detenido; enlace publico cerrado',
      stoppedAt: new Date().toISOString(),
    }
    await saveJson(STATUS_FILE, state)
  })()
  return shutdownPromise
}

async function run() {
  const version = process.versions.node.split('.').map(Number)
  if (version[0] < 22 || (version[0] === 22 && version[1] < 12))
    throw new Error('Se necesita Node.js 22.12 o superior.')
  await mkdir(LOCAL, { recursive: true })
  if (existsSync(LOCK_FILE)) {
    const oldLock = await readJson(LOCK_FILE)
    if (processExists(oldLock.pid))
      throw new Error(
        'Ya existe un iniciador de demo activo. Usa detener-demo.bat antes de reiniciarlo.',
      )
    // Recover only our exact lock after a confirmed dead supervisor; never kill a stale PID.
    await unlink(LOCK_FILE)
  }
  try {
    lockHandle = openSync(LOCK_FILE, 'wx')
    await writeFile(LOCK_FILE, JSON.stringify({ pid: process.pid, runId }))
  } catch {
    throw new Error(
      'Ya existe un iniciador de demo. Usa detener-demo.bat antes de volver a iniciarlo. Si Windows se reinicio, revisa el bloqueo local launcher.lock.',
    )
  }
  process.on('SIGINT', () => {
    void shutdown()
  })
  process.on('SIGTERM', () => {
    void shutdown()
  })
  stopWatcher = setInterval(async () => {
    try {
      const request = await readJson(STOP_FILE)
      if (request.runId === runId) await shutdown()
    } catch {
      /* No request yet. */
    }
  }, 1000)
  stopWatcher.unref()
  try {
    if (
      !existsSync(join(ROOT, 'node_modules', 'dotenv', 'package.json')) ||
      !existsSync(join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'))
    ) {
      await progress('Instalando dependencias del proyecto')
      await npm(['ci', '--include=dev', '--no-audit', '--no-fund'], {
        ...process.env,
        NODE_ENV: 'development',
      })
    }
    const { config: loadDotEnv } = await import('dotenv')
    loadDotEnv({ path: join(ROOT, '.env'), quiet: true })
    let settings
    if (existsSync(CONFIG_FILE)) settings = await readJson(CONFIG_FILE)
    else {
      const secret = () => randomBytes(24).toString('base64url')
      settings = {
        databasePassword: secret(),
        gateUser: 'konea',
        gatePassword: secret(),
        adminPassword: secret(),
        studentPassword: secret(),
      }
      await saveJson(CONFIG_FILE, settings)
    }
    for (const field of [
      'databasePassword',
      'gatePassword',
      'adminPassword',
      'studentPassword',
    ]) {
      if (typeof settings[field] !== 'string' || settings[field].length < 20)
        throw new Error('Las credenciales de demostracion no son validas.')
    }
    const databaseUrl = `postgresql://konea_demo:${settings.databasePassword}@127.0.0.1:${DATABASE_PORT}/konea_public_demo`
    const useAi = !args.has('--basic-ai')
    const aiProvider = useAi
      ? (process.env.KUCO_AI_PROVIDER ?? 'local')
      : 'local'
    if (aiProvider === 'openai' && !process.env.OPENAI_API_KEY)
      throw new Error(
        'La IA configurada requiere una clave en tu .env local. No se publico nada.',
      )
    const environment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      UPLOAD_DIRECTORY: join(LOCAL, 'uploads'),
      NODE_ENV: 'development',
      PUBLIC_DEMO_ADMIN_PASSWORD: settings.adminPassword,
      PUBLIC_DEMO_STUDENT_PASSWORD: settings.studentPassword,
      CAPSTONE_DEMO_USERNAME: 'demo.estudiante',
      KUCO_AI_PROVIDER: aiProvider,
    }
    await ensureDatabase(settings)
    await progress('Aplicando migraciones unicamente a la base de demostracion')
    await npm(['run', 'db:migrate', '--workspace', '@konea/api'], environment)
    await progress(
      'Preparando cuentas seguras y contenido ficticio de demostracion',
    )
    await node(
      [
        'node_modules/tsx/dist/cli.mjs',
        'apps/api/src/scripts/prepare-public-demo.ts',
      ],
      { env: environment },
    )
    await progress(
      'Compilando API y web (no se expone el servidor de desarrollo Vite)',
    )
    await npm(['run', 'build', '--workspace', '@konea/api'], environment)
    await npm(['run', 'build', '--workspace', '@konea/web'], {
      ...environment,
      NODE_ENV: 'production',
      VITE_API_URL: '/api/v1',
      OPENAI_API_KEY: '',
    })
    const binary = await cloudflared()
    const { createServer } = await import('node:net')
    await new Promise((done, fail) => {
      const probe = createServer()
      probe.once('error', () =>
        fail(
          new Error(
            `El puerto privado ${APP_PORT} esta ocupado. No se abrira ningun tunel.`,
          ),
        ),
      )
      probe.listen(APP_PORT, '127.0.0.1', () => probe.close(done))
    })
    const origin = await startTunnel(binary)
    state = { ...state, url: origin }
    await progress('Iniciando servidor protegido y verificando login publico')
    const basicAuth =
      'Basic ' +
      Buffer.from(`${settings.gateUser}:${settings.gatePassword}`).toString(
        'base64',
      )
    const apiOut = openSync(join(LOCAL, 'api.log'), 'a')
    assertContinuing()
    apiProcess = spawn(
      process.execPath,
      ['--no-maglev', 'apps/api/dist/demo-server.js'],
      {
        cwd: ROOT,
        windowsHide: true,
        stdio: ['ignore', apiOut, apiOut],
        env: {
          ...environment,
          NODE_ENV: 'production',
          API_HOST: '127.0.0.1',
          API_PORT: String(APP_PORT),
          TRUST_PROXY_HOPS: '1',
          CORS_ORIGIN: origin,
          DEMO_PUBLIC_ORIGIN: origin,
          DEMO_GATE_USER: settings.gateUser,
          DEMO_GATE_PASSWORD: settings.gatePassword,
        },
      },
    )
    apiProcess.once('error', () => {
      apiSpawnError = true
    })
    for (let attempt = 0; ; attempt += 1) {
      assertContinuing()
      if (apiSpawnError || isExited(apiProcess))
        throw new Error(
          'El servidor de demo se detuvo. Revisa .local/public-demo/api.log; el tunel sera cerrado.',
        )
      try {
        if (await localHealth(origin, basicAuth)) break
      } catch {
        /* Process still starting. */
      }
      if (attempt >= 60)
        throw new Error(
          'El servidor de demo no respondio a la comprobacion de salud.',
        )
      await pause(500)
    }
    // Fail closed if the public route bypasses the outer gate or the SPA cannot load.
    await progress('Esperando la publicacion DNS del enlace de Cloudflare')
    const dnsDeadline = Date.now() + 45_000
    while (Date.now() < dnsDeadline) {
      assertContinuing()
      try {
        const dnsUrl = new URL('https://cloudflare-dns.com/dns-query')
        dnsUrl.searchParams.set('name', new URL(origin).hostname)
        dnsUrl.searchParams.set('type', 'A')
        const dnsResponse = await fetch(dnsUrl, {
          headers: { Accept: 'application/dns-json' },
          signal: AbortSignal.timeout(4000),
        })
        const answer = await dnsResponse.json()
        if (
          answer.Status === 0 &&
          answer.Answer?.some((record) => record.type === 1)
        )
          break
      } catch {
        /* New hostnames may need time to propagate. */
      }
      await pause(1000)
    }
    // A blocked DNS-over-HTTPS service must not prevent the normal HTTPS probe.
    let publicReady = false
    for (let attempt = 0; attempt < 90; attempt += 1) {
      assertContinuing()
      try {
        const blocked = await fetch(origin, {
          signal: AbortSignal.timeout(5000),
        })
        const allowed = await fetch(origin, {
          headers: { Authorization: basicAuth },
          signal: AbortSignal.timeout(5000),
        })
        if (
          blocked.status === 401 &&
          allowed.ok &&
          (await allowed.text()).includes('<div id="root">')
        ) {
          publicReady = true
          break
        }
      } catch {
        /* DNS/edge warm-up. */
      }
      await pause(1000)
    }
    if (!publicReady)
      throw new Error(
        'La comprobacion HTTPS publica no paso. El enlace se cerrara por seguridad.',
      )
    const accessFile = join(LOCAL, 'accesos.txt')
    await writeFile(
      accessFile,
      [
        'KONEA - DEMOSTRACION TEMPORAL (PRIVADO, NO SUBIR A GITHUB)',
        `Enlace: ${origin}`,
        '',
        '1. Acceso al enlace (dialogo del navegador)',
        `Usuario: ${settings.gateUser}`,
        `Clave: ${settings.gatePassword}`,
        '',
        '2. Inicio de sesion dentro de Konea',
        `Estudiante: demo.estudiante`,
        `Clave estudiante: ${settings.studentPassword}`,
        '',
        `Administrador: demo.admin`,
        `Clave administrador: ${settings.adminPassword}`,
        '',
        `KUCO: ${aiProvider}${aiProvider === 'openai' ? ' (usa tus creditos; la clave de API solo esta en el servidor)' : ''}`,
        'Cerrar: ejecutar detener-demo.bat. La laptop debe permanecer encendida y conectada.',
        'La base y los archivos de esta demo estan separados de tu proyecto personal.',
      ].join('\r\n'),
      { mode: 0o600 },
    )
    state = {
      ...state,
      running: true,
      url: origin,
      aiProvider,
      apiPid: apiProcess.pid,
      tunnelPid: tunnelProcess.pid,
      credentialsFile: accessFile,
    }
    await progress(
      'Demo lista. Comparte el enlace y las credenciales demo solo con tus invitados.',
    )
    console.log(`Enlace: ${origin}`)
    console.log(`Credenciales locales: ${accessFile}`)
    console.log('Para cerrar: detener-demo.bat o Ctrl+C en esta ventana.')
    while (!stopping) {
      if (apiSpawnError || isExited(apiProcess) || isExited(tunnelProcess))
        throw new Error(
          'Un servicio de la demo termino; se cerrara el enlace publico.',
        )
      try {
        const request = await readJson(STOP_FILE)
        if (request.runId === runId) {
          await shutdown()
          break
        }
      } catch {
        /* No stop requested. */
      }
      await pause(1000)
    }
  } catch (error) {
    state = { ...state, error: sanitizeError(error), failedStage: stage }
    throw error
  } finally {
    await shutdown()
    const fs = await import('node:fs')
    if (lockHandle !== undefined) fs.closeSync(lockHandle)
    await unlink(LOCK_FILE).catch(() => {})
  }
}

async function main() {
  if (args.has('--stop')) {
    if (!existsSync(STATUS_FILE)) {
      console.log('No hay demo registrada.')
      return
    }
    const current = await readJson(STATUS_FILE)
    if (!processExists(current.supervisorPid)) {
      console.log(
        'El supervisor ya no esta activo. No se modifico ningun otro proceso. Revisa si el puerto de demo sigue ocupado antes de reiniciar.',
      )
      return
    }
    if (!current.running && current.stage?.startsWith('Detenido')) {
      console.log('El enlace ya esta cerrado.')
      return
    }
    await saveJson(STOP_FILE, { runId: current.runId })
    console.log(
      'Cierre solicitado. Se detendran el tunel y el servidor de demo; tus datos locales se conservan.',
    )
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const updated = await readJson(STATUS_FILE)
      if (
        updated.runId === current.runId &&
        updated.stage?.startsWith('Detenido')
      ) {
        console.log(
          'Enlace publico cerrado. Los datos de la demo se conservaron.',
        )
        return
      }
      await pause(500)
    }
    throw new Error(
      'No se pudo confirmar el cierre. Revisa el estado local de la demo antes de darla por detenida.',
    )
  }
  if (existsSync(LOCK_FILE) && existsSync(STATUS_FILE)) {
    const [lock, current] = await Promise.all([
      readJson(LOCK_FILE),
      readJson(STATUS_FILE),
    ])
    if (processExists(lock.pid) && current.runId === lock.runId) {
      console.log(
        current.running
          ? `La demo ya esta activa: ${current.url}`
          : 'La demo ya se esta preparando. Consulta .local/public-demo/status.json.',
      )
      if (current.running)
        console.log(`Credenciales locales: ${join(LOCAL, 'accesos.txt')}`)
      return
    }
  }
  if (args.has('--background')) {
    await mkdir(LOCAL, { recursive: true })
    const log = openSync(join(LOCAL, 'launcher.log'), 'a')
    const child = spawn(
      process.execPath,
      [
        '--no-maglev',
        fileURLToPath(import.meta.url),
        ...process.argv
          .slice(2)
          .filter((argument) => argument !== '--background'),
      ],
      {
        cwd: ROOT,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log, log],
      },
    )
    child.unref()
    console.log(
      'Preparacion iniciada en segundo plano. Estado: .local/public-demo/status.json',
    )
    return
  }
  await run()
}

main().catch((error) => {
  console.error(sanitizeError(error))
  process.exitCode = 1
})
