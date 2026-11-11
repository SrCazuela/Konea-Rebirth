import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import {
  access,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { it } from 'node:test'

const execute = promisify(execFile)
const script = fileURLToPath(new URL('./sync.mjs', import.meta.url))
const fixtures = fileURLToPath(
  new URL('../../.local/capstone-sync/', import.meta.url),
)
const wait = (milliseconds) =>
  new Promise((done) => setTimeout(done, milliseconds))

async function exists(file) {
  try {
    await access(file)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function fixture(context) {
  await mkdir(fixtures, { recursive: true })
  const parent = await realpath(fixtures)
  const directory = path.join(parent, `cli-tests-${randomUUID()}`)
  const project = path.join(directory, 'proyecto con espacios')
  const drive = path.join(directory, 'Drive á')
  const backup = path.join(directory, 'respaldo')
  const config = path.join(directory, 'config.json')
  await mkdir(project, { recursive: true })
  await mkdir(drive)
  context.after(async () => {
    assert.equal(await realpath(fixtures), parent)
    const target = await realpath(directory)
    assert.equal(target, directory)
    assert.equal(path.dirname(target), parent)
    assert.match(path.basename(target), /^cli-tests-[a-f0-9-]{36}$/)
    await rm(target, { recursive: true, force: true })
  })
  const run = async (...args) => {
    const result = await execute(
      process.execPath,
      [script, '--config', config, ...args],
      { windowsHide: true, timeout: 25000 },
    )
    return result.stdout.trim()
  }
  const setup = (...extra) =>
    run(
      '--setup',
      '--project',
      project,
      '--drive',
      drive,
      '--backup',
      backup,
      ...extra,
    )
  return { directory, project, drive, backup, config, run, setup }
}

async function until(predicate, timeout = 18000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await wait(120)
  }
  throw new Error(
    'El vigilante no alcanzó el estado esperado dentro del plazo.',
  )
}

it('CLI validates setup before writing configuration and refuses watch with dry-run', async (context) => {
  const f = await fixture(context)
  const initial = JSON.parse(await f.run('--status', '--json'))
  assert.equal(initial.configured, false)
  await assert.rejects(f.setup('--interval', '0'))
  assert.equal(await exists(f.config), false)
  await assert.rejects(f.run('--watch', '--dry-run'))
  assert.equal(await exists(f.config), false)
  await assert.rejects(
    f.run(
      '--setup',
      '--drive',
      f.project,
      '--project',
      f.project,
      '--backup',
      f.backup,
    ),
  )
  assert.equal(await exists(f.config), false)
})

it('CLI preview preserves documents and resolution only changes the chosen version', async (context) => {
  const f = await fixture(context)
  await f.setup()
  await writeFile(
    path.join(f.project, 'guía [2.4].docx'),
    'Versión del proyecto',
  )
  await writeFile(path.join(f.drive, 'guía [2.4].docx'), 'Versión de Drive')
  await assert.rejects(f.run('--dry-run'), (error) => error.code === 2)
  assert.equal(
    await readFile(path.join(f.drive, 'guía [2.4].docx'), 'utf8'),
    'Versión de Drive',
  )
  assert.equal(
    await exists(path.join(f.directory, 'state', 'baseline.json')),
    false,
  )
  await f.run('--once', '--resolve', 'guía [2.4].docx=project')
  assert.equal(
    await readFile(path.join(f.drive, 'guía [2.4].docx'), 'utf8'),
    'Versión del proyecto',
  )
  const status = JSON.parse(await f.run('--status', '--json'))
  assert.equal(status.watching, false)
  assert.equal(status.lastRun.success, true)
  assert.equal(status.lastRun.conflicts, 0)
})

it(
  'watch automatically propagates both directions, rejects duplicates and stops without killing another process',
  { timeout: 45000 },
  async (context) => {
    const f = await fixture(context)
    await f.setup('--interval', '10')
    await writeFile(path.join(f.project, 'proyecto.txt'), 'Inicial')
    const child = spawn(
      process.execPath,
      [script, '--config', f.config, '--watch'],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let exited = false
    let errors = ''
    child.stderr.on('data', (chunk) => {
      errors += chunk
    })
    child.stdout.resume()
    child.once('exit', () => {
      exited = true
    })
    context.after(async () => {
      if (!exited) {
        await f.run('--stop').catch(() => {})
        for (let index = 0; index < 40 && !exited; index++) await wait(100)
        if (!exited) child.kill() // Only the child process created by this test.
      }
    })
    await until(async () => exists(path.join(f.drive, 'proyecto.txt')))
    const before = JSON.parse(await f.run('--status', '--json'))
    assert.equal(before.watching, true)
    assert.equal(before.pid, child.pid)
    await f.run('--watch')
    const same = JSON.parse(await f.run('--status', '--json'))
    assert.equal(same.pid, child.pid)
    await writeFile(path.join(f.drive, 'nuevo-drive.txt'), 'Desde Drive')
    await until(async () => exists(path.join(f.project, 'nuevo-drive.txt')))
    await writeFile(path.join(f.project, 'proyecto.txt'), 'Cambio del proyecto')
    await until(
      async () =>
        (await readFile(path.join(f.drive, 'proyecto.txt'), 'utf8')) ===
        'Cambio del proyecto',
    )
    await f.run('--stop')
    await until(async () => exited, 8000)
    assert.equal(JSON.parse(await f.run('--status', '--json')).watching, false)
    assert.equal(errors, '')
  },
)
