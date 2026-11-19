const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const assert = require('node:assert/strict')
const { spawn, spawnSync, execFileSync } = require('node:child_process')
const { randomUUID, createHash } = require('node:crypto')

const root = path.resolve(__dirname, '../..')
const date = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const defaultOutput = path.resolve(
  root,
  '..',
  'evidencias sistema',
  `Validacion_Calidad_${date}`,
)
const args = process.argv.slice(2)
let output = defaultOutput
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  if (arg === '--help' || arg === '-h') {
    console.log(
      `Usage: npm run quality:local -- [--output <folder>]\n\nRuns all checks and T07-T16 against a disposable PostgreSQL container and loopback-only services.\nRequires Node/npm, Git, Docker on PATH, Microsoft Edge, and playwright-core/axe-core installed under .local/browser-tools.\nKONEA_BROWSER_TOOLS may override that tools folder; KONEA_EDGE_PATH may override the Edge executable.\nNo database credentials or .env file are required. Production is never accessed.\nDefault output: ${defaultOutput}\nExisting evidence is preserved: select another --output folder to run again.\nHuman screen-reader and physical Android testing remain separate manual checks.`,
    )
    process.exit(0)
  }
  if (arg === '--output') {
    assert.ok(
      args[index + 1] && !args[index + 1].startsWith('--'),
      '--output requires a folder',
    )
    output = path.resolve(args[++index])
  } else if (arg.startsWith('--output=')) {
    assert.ok(arg.slice('--output='.length), '--output requires a folder')
    output = path.resolve(arg.slice('--output='.length))
  } else throw Error(`Unknown option: ${arg}. Use --help.`)
}

const npmCandidates = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  path.resolve(
    path.dirname(process.execPath),
    '../lib/node_modules/npm/bin/npm-cli.js',
  ),
].filter(Boolean)
const npm = npmCandidates.find((file) => fs.existsSync(file))
assert.ok(
  npm,
  'npm-cli.js not found beside Node. Run through npm run quality:local.',
)
const docker = process.platform === 'win32' ? 'docker.exe' : 'docker'
const { Client } = require(path.join(root, 'node_modules/pg'))
const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
const runId = `quality-${date.replaceAll('-', '')}-${suffix}`
const containerName = `konea-${runId}`
const database = `quality_${suffix}`
const password = `qa-${randomUUID()}`
const labelKey = 'cl.konea.validation.run'
const qaFolder = path.join(output, '_qa', runId)
const reportFile = path.join(output, 'ejecucion-local.json')
assert.ok(
  !fs.existsSync(reportFile),
  'Evidence already exists in this folder. Preserve it and choose a different --output.',
)
fs.mkdirSync(path.join(output, 'Logs'), { recursive: true })
fs.mkdirSync(qaFolder, { recursive: true })
let baseCommit = null
let uncommittedChanges = null
try {
  baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  }).trim()
} catch {}
try {
  uncommittedChanges =
    execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    }).trim().length > 0
} catch {}
const sourceHashes = Object.fromEntries(
  [
    'package.json',
    'package-lock.json',
    'scripts/quality/validate-local.cjs',
    'scripts/quality/web-cases.cjs',
  ].map((file) => [
    file,
    createHash('sha256')
      .update(fs.readFileSync(path.join(root, file)))
      .digest('hex'),
  ]),
)
const report = {
  date: new Date().toISOString(),
  runId,
  environment: `${process.platform}/${process.arch}, Node ${process.versions.node}, PostgreSQL 17 in a disposable container`,
  database,
  baseCommit,
  sourceHashes,
  uncommittedChanges,
  commands: [],
  cleanup: { processesStopped: false, containerRemoved: false },
}
const save = () => fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const children = []
let containerId, environment, apiOrigin, origin

function command(name, arguments_, cwd = root, env = environment) {
  console.log(`START ${name}`)
  const started = new Date().toISOString()
  const result = spawnSync(
    process.execPath,
    ['--no-maglev', npm, ...arguments_],
    {
      cwd,
      env,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 240000,
      maxBuffer: 8 * 1024 * 1024,
    },
  )
  const log = `${name}.log`
  fs.writeFileSync(
    path.join(output, 'Logs', log),
    `${result.stdout || ''}\n${result.stderr || ''}`,
  )
  report.commands.push({
    name,
    command: ['npm', ...arguments_].join(' '),
    started,
    finished: new Date().toISOString(),
    exitCode: result.status,
    log: `Logs/${log}`,
  })
  save()
  assert.equal(result.status, 0, `${name} failed; inspect ${log}`)
  console.log(`PASS ${name}`)
}
function service(label, arguments_) {
  const fd = fs.openSync(path.join(output, 'Logs', `${label}.log`), 'w')
  const child = spawn(process.execPath, ['--no-maglev', ...arguments_], {
    cwd: root,
    env: environment,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  })
  fs.closeSync(fd)
  child.on('error', (error) => {
    report.serviceError = `${label}: ${error.message}`
  })
  children.push(child)
  return child
}
async function ready(url, child) {
  for (let i = 0; i < 150; i++) {
    assert.equal(child.exitCode, null, 'Private QA service exited')
    assert.ok(!report.serviceError, report.serviceError)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {}
    await pause(200)
  }
  throw Error('Private QA service did not become ready')
}
async function freePort(excluded = []) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port
        server.close((error) => (error ? reject(error) : resolve(port)))
      })
    })
    if (!excluded.includes(port)) return port
  }
  throw Error('Unable to allocate a private loopback port')
}
async function stopOwnedChild(child) {
  const stopped = () =>
    child.exitCode !== null || child.signalCode !== null || !child.pid
  if (stopped()) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    pause(5000),
  ])
  if (!stopped()) {
    child.kill('SIGKILL')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      pause(5000),
    ])
  }
  assert.ok(stopped(), 'An owned QA process did not stop')
}
async function main() {
  try {
    execFileSync(docker, ['version', '--format', '{{.Server.Version}}'], {
      windowsHide: true,
      stdio: 'pipe',
    })
    const apiPort = await freePort()
    const webPort = await freePort([apiPort])
    apiOrigin = `http://127.0.0.1:${apiPort}`
    origin = `http://127.0.0.1:${webPort}`
    containerId = execFileSync(
      docker,
      [
        'run',
        '--detach',
        '--rm',
        '--name',
        containerName,
        '--label',
        `${labelKey}=${runId}`,
        '--env',
        'POSTGRES_USER=konea_qa',
        '--env',
        `POSTGRES_PASSWORD=${password}`,
        '--env',
        `POSTGRES_DB=${database}`,
        '--publish',
        '127.0.0.1::5432',
        'postgres:17-alpine',
      ],
      { encoding: 'utf8', windowsHide: true },
    ).trim()
    assert.match(containerId, /^[a-f0-9]{64}$/)
    const details = JSON.parse(
      execFileSync(docker, ['inspect', containerId], {
        encoding: 'utf8',
        windowsHide: true,
      }),
    )[0]
    assert.equal(details.Id, containerId)
    assert.equal(details.Name, `/${containerName}`)
    assert.equal(details.Config.Labels[labelKey], runId)
    const binding = details.NetworkSettings.Ports['5432/tcp']
    assert.equal(binding.length, 1)
    assert.equal(binding[0].HostIp, '127.0.0.1')
    const dbPort = Number(binding[0].HostPort)
    assert.ok(Number.isInteger(dbPort) && dbPort > 0)
    const databaseUrl = `postgresql://konea_qa:${encodeURIComponent(password)}@127.0.0.1:${dbPort}/${database}`
    environment = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      API_PORT: String(apiPort),
      API_HOST: '127.0.0.1',
      CORS_ORIGIN: origin,
      KUCO_AI_PROVIDER: 'local',
      OPENAI_API_KEY: 'not-a-real-key-tests-offline',
      UPLOAD_STORAGE: 'filesystem',
      UPLOAD_DIRECTORY: path.join(qaFolder, 'uploads'),
      npm_config_cache: path.join(root, '.npm-cache'),
    }
    Object.assign(report, {
      origin,
      apiOrigin,
      ports: { database: dbPort, api: apiPort, web: webPort },
      containerName,
      createdContainerId: containerId,
    })
    save()
    for (let i = 0; i < 100; i++) {
      const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 1000,
      })
      try {
        await client.connect()
        assert.equal(
          (await client.query('SELECT current_database() AS name')).rows[0]
            .name,
          database,
        )
        break
      } catch (error) {
        if (i === 99) throw error
        await pause(300)
      } finally {
        await client.end().catch(() => {})
      }
    }
    command('01-migration-consistency', ['run', 'db:check'])
    command('02-migration-apply', ['run', 'db:migrate'])
    command('03-migration-idempotency', ['run', 'db:migrate'])
    command('04-lint', ['run', 'lint'])
    command('05-types', ['run', 'typecheck'])
    command('06-tests', ['run', 'test'])
    command('07-build', ['run', 'build'], root, {
      ...environment,
      NODE_ENV: 'production',
      VITE_API_URL: '/api/v1',
    })
    command('08-format', ['run', 'format:check'])
    const api = service('private-api', [
      path.join(root, 'apps/api/dist/server.js'),
    ])
    const web = service('private-preview', [
      path.join(root, 'node_modules/vite/bin/vite.js'),
      'preview',
      '--config',
      path.join(root, 'apps/web/vite.config.ts'),
      '--outDir',
      path.join(root, 'apps/web/dist'),
      '--host',
      '127.0.0.1',
      '--port',
      String(webPort),
      '--strictPort',
    ])
    await Promise.all([
      ready(`${apiOrigin}/api/v1/health`, api),
      ready(origin, web),
    ])
    report.browser = await require('./web-cases.cjs')({ root, output, origin })
    report.passed = report.browser.passed
    if (!report.passed) process.exitCode = 1
  } catch (error) {
    report.passed = false
    report.error = error.message
    console.error(error.message)
    process.exitCode = 1
  } finally {
    const cleanupErrors = []
    for (const child of children.reverse()) {
      try {
        await stopOwnedChild(child)
      } catch (error) {
        cleanupErrors.push(error.message)
      }
    }
    report.cleanup.processesStopped = children.every(
      (child) =>
        child.exitCode !== null || child.signalCode !== null || !child.pid,
    )
    if (containerId) {
      try {
        const details = JSON.parse(
          execFileSync(docker, ['inspect', containerId], {
            encoding: 'utf8',
            windowsHide: true,
          }),
        )[0]
        assert.equal(details.Id, containerId)
        assert.equal(details.Name, `/${containerName}`)
        assert.equal(details.Config.Labels[labelKey], runId)
        execFileSync(docker, ['stop', '--time', '5', containerId], {
          windowsHide: true,
          stdio: 'ignore',
        })
        const remaining = execFileSync(
          docker,
          [
            'ps',
            '--all',
            '--no-trunc',
            '--filter',
            `id=${containerId}`,
            '--format',
            '{{.ID}}',
          ],
          { encoding: 'utf8', windowsHide: true },
        ).trim()
        assert.equal(remaining, '', 'The owned --rm container is still present')
        report.cleanup.containerRemoved = true
      } catch (error) {
        cleanupErrors.push(error.message)
      }
    }
    if (cleanupErrors.length) {
      report.cleanup.errors = cleanupErrors
      report.passed = false
      process.exitCode = 1
    }
    report.finishedAt = new Date().toISOString()
    save()
    console.log(
      JSON.stringify({
        passed: report.passed,
        commands: report.commands.length,
        cleanup: report.cleanup,
        report: reportFile,
      }),
    )
  }
}
main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
