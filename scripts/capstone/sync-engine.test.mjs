import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { synchronize } from './sync-engine.mjs'

const testDirectory = fileURLToPath(
  new URL('../../.local/capstone-sync/', import.meta.url),
)
const fixturePrefix = 'tests-validprefix-'

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function writeDocument(root, relativePath, content) {
  const destination = path.join(root, relativePath)
  await mkdir(path.dirname(destination), { recursive: true })
  await writeFile(destination, content)
}

async function snapshot(directory) {
  if (!(await exists(directory))) return null
  const entries = []
  async function visit(currentDirectory, relative = '') {
    const children = await readdir(currentDirectory)
    for (const name of children.sort()) {
      const absolute = path.join(currentDirectory, name)
      const relativePath = relative ? `${relative}/${name}` : name
      const metadata = await lstat(absolute)
      if (metadata.isSymbolicLink()) {
        entries.push({ path: relativePath, type: 'symlink' })
      } else if (metadata.isDirectory()) {
        entries.push({ path: relativePath, type: 'directory' })
        await visit(absolute, relativePath)
      } else {
        entries.push({
          path: relativePath,
          type: 'file',
          bytes: (await readFile(absolute)).toString('base64'),
        })
      }
    }
  }
  await visit(directory)
  return entries
}

async function fixture(context, { createDrive = true } = {}) {
  await mkdir(testDirectory, { recursive: true })
  const parentRealPath = await realpath(testDirectory)
  const root = path.join(parentRealPath, fixturePrefix + randomUUID())
  await mkdir(root)
  const rootRealPath = await realpath(root)

  context.after(async () => {
    // Recursive cleanup is restricted to this exact, freshly created real directory.
    assert.equal(await realpath(testDirectory), parentRealPath)
    assert.equal(await realpath(root), rootRealPath)
    assert.equal(path.dirname(rootRealPath), parentRealPath)
    assert.match(
      path.basename(rootRealPath),
      /^tests-validprefix-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    assert.equal((await lstat(root)).isSymbolicLink(), false)
    await rm(rootRealPath, { recursive: true, force: true })
  })

  const configuration = {
    projectRoot: path.join(root, 'project'),
    driveRoot: path.join(root, 'drive'),
    stateDirectory: path.join(root, 'state'),
    backupDirectory: path.join(root, 'backups'),
    settleMs: 0,
    forceHash: true,
  }
  await mkdir(configuration.projectRoot)
  if (createDrive) await mkdir(configuration.driveRoot)

  return {
    root,
    ...configuration,
    run: (options = {}) => synchronize({ ...configuration, ...options }),
    project: (relativePath, content) =>
      writeDocument(configuration.projectRoot, relativePath, content),
    drive: (relativePath, content) =>
      writeDocument(configuration.driveRoot, relativePath, content),
    readProject: (relativePath) =>
      readFile(path.join(configuration.projectRoot, relativePath), 'utf8'),
    readDrive: (relativePath) =>
      readFile(path.join(configuration.driveRoot, relativePath), 'utf8'),
  }
}

function expectAction(report, relativePath, type, direction) {
  assert.ok(Array.isArray(report.actions))
  assert.ok(Array.isArray(report.conflicts))
  assert.ok(
    report.actions.some(
      (action) =>
        action.path.replaceAll('\\', '/') === relativePath &&
        action.type === type &&
        (direction === undefined || action.direction === direction),
    ),
    `Expected ${type} ${direction ?? ''} for ${relativePath}`,
  )
}

function expectNoCopy(report) {
  assert.equal(
    report.actions.some((action) => action.type === 'copy'),
    false,
  )
}

async function expectBackup(f, relativePath, side, originalContent) {
  const backups = (await snapshot(f.backupDirectory)) ?? []
  const suffix = `/${side}/${relativePath}`
  assert.ok(
    backups.some(
      (entry) =>
        entry.type === 'file' &&
        `/${entry.path}`.endsWith(suffix) &&
        entry.bytes === Buffer.from(originalContent).toString('base64'),
    ),
    `Missing intact ${side} backup for ${relativePath}`,
  )
}

async function writeOwnerLock(f, pid) {
  await mkdir(f.stateDirectory, { recursive: true })
  const lockFile = path.join(f.stateDirectory, 'sync.lock')
  await writeFile(
    lockFile,
    JSON.stringify({
      token: randomUUID(),
      pid,
      startedAt: '2026-10-06T12:00:00.000Z',
      roots: {
        project: await realpath(f.projectRoot),
        drive: await realpath(f.driveRoot),
      },
    }),
  )
  return lockFile
}

async function waitUntilExists(filePath) {
  const deadline = Date.now() + 2_000
  while (!(await exists(filePath))) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${filePath}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('Capstone bidirectional synchronization', () => {
  it('adopts equal files on bootstrap without copying them', async (context) => {
    const f = await fixture(context)
    await f.project('Fase 2/Informe.docx', 'same original bytes')
    await f.drive('Fase 2/Informe.docx', 'same original bytes')

    const report = await f.run()

    expectAction(report, 'Fase 2/Informe.docx', 'unchanged')
    expectNoCopy(report)
    assert.equal(report.conflicts.length, 0)
    assert.equal(
      await f.readProject('Fase 2/Informe.docx'),
      'same original bytes',
    )
    assert.equal(
      await f.readDrive('Fase 2/Informe.docx'),
      'same original bytes',
    )
    expectNoCopy(await f.run())
  })

  it('copies new files from both sides and preserves Unicode and brackets', async (context) => {
    const f = await fixture(context)
    await f.run()
    const projectPath =
      'Fase 2/Evidencias de documentación/Informe [1.0.0] – Óscar Muñoz.docx'
    const drivePath = 'Fase 3/Presentación [final] de Hilary y Danae.pdf'
    await f.project(projectPath, 'Contenido UTF-8: árbol, sección y pingüino.')
    await f.drive(drivePath, 'Bytes del PDF de demostración.')

    const report = await f.run()

    expectAction(report, projectPath, 'copy', 'project-to-drive')
    expectAction(report, drivePath, 'copy', 'drive-to-project')
    assert.equal(
      await f.readDrive(projectPath),
      await f.readProject(projectPath),
    )
    assert.equal(await f.readProject(drivePath), await f.readDrive(drivePath))
    assert.equal(report.conflicts.length, 0)
  })

  it('preserves both different bootstrap versions and backs them up', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'local original')
    await f.drive('Informe.docx', 'Drive original')

    const report = await f.run()

    expectAction(report, 'Informe.docx', 'conflict')
    expectNoCopy(report)
    assert.equal(report.conflicts.length, 1)
    assert.equal(await f.readProject('Informe.docx'), 'local original')
    assert.equal(await f.readDrive('Informe.docx'), 'Drive original')
    await expectBackup(f, 'Informe.docx', 'project', 'local original')
    await expectBackup(f, 'Informe.docx', 'drive', 'Drive original')
  })

  it('propagates one-sided edits in either direction with receiver backups', async (context) => {
    const f = await fixture(context)
    const document = 'Fase 2/Informe.docx'
    await f.project(document, 'version zero')
    await f.drive(document, 'version zero')
    await f.run()

    await f.project(document, 'local version one')
    const projectReport = await f.run()
    expectAction(projectReport, document, 'copy', 'project-to-drive')
    assert.equal(await f.readDrive(document), 'local version one')
    await expectBackup(f, document, 'drive', 'version zero')

    await f.drive(document, 'Drive version two')
    const driveReport = await f.run()
    expectAction(driveReport, document, 'copy', 'drive-to-project')
    assert.equal(await f.readProject(document), 'Drive version two')
    await expectBackup(f, document, 'project', 'local version one')
  })

  it('keeps both simultaneous edits intact instead of choosing the newer date', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'baseline')
    await f.drive('Informe.docx', 'baseline')
    await f.run()
    await f.project('Informe.docx', 'independent project edit')
    await f.drive('Informe.docx', 'independent Drive edit')

    const report = await f.run()

    expectAction(report, 'Informe.docx', 'conflict')
    expectNoCopy(report)
    assert.equal(report.conflicts.length, 1)
    assert.equal(
      await f.readProject('Informe.docx'),
      'independent project edit',
    )
    assert.equal(await f.readDrive('Informe.docx'), 'independent Drive edit')
    await expectBackup(f, 'Informe.docx', 'project', 'independent project edit')
    await expectBackup(f, 'Informe.docx', 'drive', 'independent Drive edit')
  })

  it('adopts identical edits on both sides as the next baseline', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'baseline')
    await f.drive('Informe.docx', 'baseline')
    await f.run()
    await f.project('Informe.docx', 'matching updated bytes')
    await f.drive('Informe.docx', 'matching updated bytes')

    const matchingReport = await f.run()
    expectNoCopy(matchingReport)
    assert.equal(matchingReport.conflicts.length, 0)

    await f.drive('Informe.docx', 'later Drive edit')
    const laterReport = await f.run()
    expectAction(laterReport, 'Informe.docx', 'copy', 'drive-to-project')
    assert.equal(await f.readProject('Informe.docx'), 'later Drive edit')
  })

  for (const deletedSide of ['project', 'drive']) {
    it(`keeps a ${deletedSide} deletion pending without deleting or resurrecting`, async (context) => {
      const f = await fixture(context)
      await f.project('Informe.docx', 'baseline')
      await f.drive('Informe.docx', 'baseline')
      await f.run()
      const deletedRoot =
        deletedSide === 'project' ? f.projectRoot : f.driveRoot
      const survivingRoot =
        deletedSide === 'project' ? f.driveRoot : f.projectRoot
      await unlink(path.join(deletedRoot, 'Informe.docx'))

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const report = await f.run()
        expectAction(report, 'Informe.docx', 'pending-deletion')
        expectNoCopy(report)
        assert.equal(
          await exists(path.join(deletedRoot, 'Informe.docx')),
          false,
        )
        assert.equal(
          await readFile(path.join(survivingRoot, 'Informe.docx'), 'utf8'),
          'baseline',
        )
      }

      await writeDocument(survivingRoot, 'Informe.docx', 'edited survivor')
      const report = await f.run({
        resolutions: {
          'Informe.docx': deletedSide === 'project' ? 'drive' : 'project',
        },
      })
      expectAction(report, 'Informe.docx', 'pending-deletion')
      expectNoCopy(report)
      assert.equal(await exists(path.join(deletedRoot, 'Informe.docx')), false)
      assert.equal(
        await readFile(path.join(survivingRoot, 'Informe.docx'), 'utf8'),
        'edited survivor',
      )
    })
  }

  it('does not create state or copy documents when a root is initially missing', async (context) => {
    const f = await fixture(context, { createDrive: false })
    await f.project('Informe.docx', 'local only')
    const before = await snapshot(f.root)

    await assert.rejects(f.run())

    assert.deepEqual(await snapshot(f.root), before)
    assert.equal(await exists(f.driveRoot), false)
  })

  it('does not advance state or overwrite documents when an established root goes offline', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'baseline')
    await f.drive('Informe.docx', 'baseline')
    await f.run()
    await f.project('Informe.docx', 'pending local change')
    await rename(f.driveRoot, path.join(f.root, 'offline-drive'))
    const before = await snapshot(f.root)

    await assert.rejects(f.run())

    assert.deepEqual(await snapshot(f.root), before)
  })

  it('performs a bootstrap dry-run without creating copies, backups, or state', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'new local file')
    const before = await snapshot(f.root)

    const report = await f.run({ dryRun: true })

    assert.equal(report.dryRun, true)
    expectAction(report, 'Informe.docx', 'copy', 'project-to-drive')
    assert.deepEqual(await snapshot(f.root), before)
    expectAction(await f.run(), 'Informe.docx', 'copy', 'project-to-drive')
    assert.equal(await f.readDrive('Informe.docx'), 'new local file')
  })

  it('does not consume an edit when dry-running an existing baseline', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'baseline')
    await f.drive('Informe.docx', 'baseline')
    await f.run()
    await f.project('Informe.docx', 'pending local edit')
    const before = await snapshot(f.root)

    await f.run({ dryRun: true })

    assert.deepEqual(await snapshot(f.root), before)
    expectAction(await f.run(), 'Informe.docx', 'copy', 'project-to-drive')
    assert.equal(await f.readDrive('Informe.docx'), 'pending local edit')
    await expectBackup(f, 'Informe.docx', 'drive', 'baseline')
  })

  for (const winner of ['project', 'drive']) {
    it(`resolves a conflict only with an explicit ${winner} winner and a backup`, async (context) => {
      const f = await fixture(context)
      await f.project('Informe.docx', 'project choice')
      await f.drive('Informe.docx', 'Drive choice')

      const report = await f.run({ resolutions: { 'Informe.docx': winner } })

      const winningBytes =
        winner === 'project' ? 'project choice' : 'Drive choice'
      expectAction(
        report,
        'Informe.docx',
        'copy',
        winner === 'project' ? 'project-to-drive' : 'drive-to-project',
      )
      assert.equal(report.conflicts.length, 0)
      assert.equal(await f.readProject('Informe.docx'), winningBytes)
      assert.equal(await f.readDrive('Informe.docx'), winningBytes)
      await expectBackup(
        f,
        'Informe.docx',
        winner === 'project' ? 'drive' : 'project',
        winner === 'project' ? 'Drive choice' : 'project choice',
      )
    })
  }

  it('detects same-length content edits even when modification time is restored', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'AAAA')
    await f.drive('Informe.docx', 'AAAA')
    const projectPath = path.join(f.projectRoot, 'Informe.docx')
    const fixedTime = new Date('2026-10-06T12:00:00.000Z')
    await utimes(projectPath, fixedTime, fixedTime)
    const oldMetadata = await stat(projectPath)
    await f.run()
    await f.project('Informe.docx', 'BBBB')
    await utimes(projectPath, oldMetadata.atime, oldMetadata.mtime)
    const restoredMetadata = await stat(projectPath)
    assert.equal(restoredMetadata.size, oldMetadata.size)
    assert.equal(restoredMetadata.mtimeMs, oldMetadata.mtimeMs)

    const report = await f.run({ forceHash: true })

    expectAction(report, 'Informe.docx', 'copy', 'project-to-drive')
    assert.equal(await f.readDrive('Informe.docx'), 'BBBB')
    await expectBackup(f, 'Informe.docx', 'drive', 'AAAA')
  })

  it('excludes OS metadata, Office lock files, temporary files, and Google pointers', async (context) => {
    const f = await fixture(context)
    const excluded = [
      'desktop.ini',
      '.desktop.ini',
      'Fase 2/Thumbs.db',
      'Fase 2/~$Informe.docx',
      'Fase 2/reporte.tmp',
      'Fase 2/documento.gdoc',
      'Fase 2/planilla.gsheet',
      'Fase 2/diapositivas.gslides',
    ]
    for (const file of excluded) await f.project(file, 'excluded placeholder')
    await f.project('Fase 2/Informe.docx', 'actual document')

    const report = await f.run()

    expectAction(report, 'Fase 2/Informe.docx', 'copy', 'project-to-drive')
    for (const file of excluded) {
      assert.equal(
        await exists(path.join(f.driveRoot, file)),
        false,
        `Excluded file was copied: ${file}`,
      )
      assert.equal(await f.readProject(file), 'excluded placeholder')
      assert.equal(
        report.actions.some((action) => action.path === file),
        false,
      )
    }
  })

  it('rejects a symlink or junction without following it into another directory', async (context) => {
    const f = await fixture(context)
    const outsideRoot = path.join(f.root, 'outside')
    await writeDocument(outsideRoot, 'private.docx', 'outside document')
    try {
      await symlink(outsideRoot, path.join(f.projectRoot, 'link'), 'junction')
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error
      context.skip(`Directory links are unavailable: ${error.code}`)
      return
    }
    const documentRoots = [f.projectRoot, f.driveRoot, outsideRoot]
    const before = await Promise.all(documentRoots.map(snapshot))

    await assert.rejects(f.run())

    assert.deepEqual(await Promise.all(documentRoots.map(snapshot)), before)
    assert.deepEqual((await snapshot(f.stateDirectory)) ?? [], [])
    assert.deepEqual((await snapshot(f.backupDirectory)) ?? [], [])
    assert.equal(await exists(path.join(f.driveRoot, 'link')), false)
    assert.equal(
      await readFile(path.join(outsideRoot, 'private.docx'), 'utf8'),
      'outside document',
    )
  })

  it('rejects equal and nested roots before creating state or copying files', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'must stay here')
    const nestedRoot = path.join(f.projectRoot, 'nested')
    await mkdir(nestedRoot)
    const before = await snapshot(f.root)

    for (const roots of [
      { projectRoot: f.projectRoot, driveRoot: f.projectRoot },
      { projectRoot: f.projectRoot, driveRoot: nestedRoot },
      { projectRoot: nestedRoot, driveRoot: f.projectRoot },
    ]) {
      await assert.rejects(f.run(roots))
      assert.deepEqual(await snapshot(f.root), before)
    }
  })

  it('does not overwrite the receiver if its required backup cannot be written', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'baseline')
    await f.drive('Informe.docx', 'baseline')
    await f.run()
    await f.project('Informe.docx', 'new local content')
    const blockedBackupPath = path.join(f.root, 'not-a-backup-directory')
    await writeFile(blockedBackupPath, 'blocking file')
    const before = await snapshot(f.root)

    await assert.rejects(f.run({ backupDirectory: blockedBackupPath }))

    assert.deepEqual(await snapshot(f.root), before)
    assert.equal(await f.readDrive('Informe.docx'), 'baseline')
  })

  it('rejects a document changing during the settling window without advancing state', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'baseline')
    await f.drive('Informe.docx', 'baseline')
    await f.run()
    const stateBefore = await snapshot(f.stateDirectory)
    const backupBefore = await snapshot(f.backupDirectory)
    let revision = 0
    const writes = []
    const timer = setInterval(() => {
      revision += 1
      writes.push(f.project('Informe.docx', `in-progress revision ${revision}`))
    }, 10)

    try {
      await assert.rejects(f.run({ settleMs: 150 }))
    } finally {
      clearInterval(timer)
      await Promise.all(writes)
    }

    assert.ok(revision > 0)
    assert.equal(await f.readDrive('Informe.docx'), 'baseline')
    assert.deepEqual(await snapshot(f.stateDirectory), stateBefore)
    assert.deepEqual(await snapshot(f.backupDirectory), backupBefore)
  })

  it('recovers a valid lock owned by an exited process without stopping any process', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'recover after an interrupted watch')
    const exited = spawnSync(process.execPath, ['-e', ''], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 5_000,
    })
    assert.ifError(exited.error)
    assert.equal(exited.status, 0)
    assert.ok(Number.isInteger(exited.pid) && exited.pid > 0)
    assert.throws(
      () => process.kill(exited.pid, 0),
      (error) => error.code === 'ESRCH',
    )
    const lockFile = await writeOwnerLock(f, exited.pid)

    const report = await f.run()

    expectAction(report, 'Informe.docx', 'copy', 'project-to-drive')
    assert.equal(
      await f.readDrive('Informe.docx'),
      'recover after an interrupted watch',
    )
    assert.equal(await exists(lockFile), false)
    expectNoCopy(await f.run())
  })

  it('honors a live owner lock and leaves its owner and documents untouched', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'do not copy while another owner is active')
    await writeOwnerLock(f, process.pid)
    const before = await snapshot(f.root)

    await assert.rejects(f.run(), (error) => error.code === 'ELOCKED')

    assert.deepEqual(await snapshot(f.root), before)
    assert.doesNotThrow(() => process.kill(process.pid, 0))
  })

  it('preserves the existing Drive file identity while updating its contents and keeping a backup', async (context) => {
    const f = await fixture(context)
    const document = 'Fase 2/Informe [final].docx'
    await f.project(document, 'original Drive bytes')
    await f.drive(document, 'original Drive bytes')
    await f.run()
    const driveFile = path.join(f.driveRoot, document)
    const before = await stat(driveFile, { bigint: true })
    assert.notEqual(
      before.ino,
      0n,
      'The fixture filesystem must expose file IDs',
    )
    await f.project(
      document,
      'updated document with different contents and length',
    )

    const report = await f.run()

    expectAction(report, document, 'copy', 'project-to-drive')
    const after = await stat(driveFile, { bigint: true })
    assert.equal(after.dev, before.dev)
    assert.equal(after.ino, before.ino)
    assert.equal(
      await f.readDrive(document),
      'updated document with different contents and length',
    )
    await expectBackup(f, document, 'drive', 'original Drive bytes')
  })

  it('restores Drive bytes and identity after an actual write failure and permits a later retry', async (context) => {
    const f = await fixture(context)
    const document = 'Informe.docx'
    const originalContent = 'previous document that must survive a failed write'
    const updatedContent = `unique incoming bytes ${randomUUID()}`
    await f.project(document, originalContent)
    await f.drive(document, originalContent)
    await f.run()
    await f.project(document, updatedContent)
    const driveFile = path.join(f.driveRoot, document)
    const before = await stat(driveFile, { bigint: true })
    const stateBefore = await snapshot(f.stateDirectory)
    const probe = await open(path.join(f.root, 'handle-probe'), 'w')
    const handlePrototype = Object.getPrototypeOf(probe)
    const originalWrite = handlePrototype.write
    await probe.close()
    const marker = Buffer.from(updatedContent)
    let injected = false
    const writeMock = context.mock.method(
      handlePrototype,
      'write',
      async function (...args) {
        const [buffer, offset, length] = args
        if (
          !injected &&
          Buffer.isBuffer(buffer) &&
          buffer.subarray(offset, offset + length).includes(marker)
        ) {
          injected = true
          throw Object.assign(new Error('Injected fixture write failure'), {
            code: 'ENOSPC',
          })
        }
        return originalWrite.apply(this, args)
      },
    )

    try {
      await assert.rejects(
        f.run(),
        (error) => error.code === 'ECOPY' && error.rollback === 'restored',
      )
    } finally {
      writeMock.mock.restore()
    }

    assert.equal(injected, true)
    assert.equal(await f.readDrive(document), originalContent)
    assert.equal(await f.readProject(document), updatedContent)
    const restored = await stat(driveFile, { bigint: true })
    assert.equal(restored.dev, before.dev)
    assert.equal(restored.ino, before.ino)
    assert.deepEqual(await snapshot(f.stateDirectory), stateBefore)
    await expectBackup(f, document, 'drive', originalContent)

    expectAction(await f.run(), document, 'copy', 'project-to-drive')
    assert.equal(await f.readDrive(document), updatedContent)
  })

  it('allows only one concurrent run and releases its lock for the next run', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'one writer')
    const firstRun = f.run({ settleMs: 200 })
    // Attach a rejection observer while waiting for the lock to avoid orphaned promises.
    firstRun.catch(() => {})
    try {
      await waitUntilExists(path.join(f.stateDirectory, 'sync.lock'))
      await assert.rejects(f.run(), (error) => error.code === 'ELOCKED')
    } finally {
      await firstRun
    }

    assert.equal(await exists(path.join(f.stateDirectory, 'sync.lock')), false)
    assert.equal(await f.readDrive('Informe.docx'), 'one writer')
    expectNoCopy(await f.run())
  })

  it('rejects state and backup locations inside either synchronized tree', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'protected document')
    const before = await snapshot(f.root)

    for (const root of [f.projectRoot, f.driveRoot]) {
      for (const options of [
        { stateDirectory: path.join(root, 'sync-state') },
        { backupDirectory: path.join(root, 'sync-backups') },
        { stateDirectory: root },
        { backupDirectory: root },
      ]) {
        await assert.rejects(f.run(options), (error) => error.code === 'EROOTS')
        assert.deepEqual(await snapshot(f.root), before)
      }
    }
  })

  it('accepts a fresh file after both copies of its previous version were removed', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'old version')
    await f.drive('Informe.docx', 'old version')
    await f.run()
    await unlink(path.join(f.projectRoot, 'Informe.docx'))
    await unlink(path.join(f.driveRoot, 'Informe.docx'))

    const deletedReport = await f.run()
    expectNoCopy(deletedReport)
    assert.equal(deletedReport.conflicts.length, 0)
    assert.equal(
      deletedReport.actions.some(
        (action) => action.type === 'pending-deletion',
      ),
      false,
    )
    await f.project('Informe.docx', 'new independent document')

    const recreatedReport = await f.run()

    expectAction(recreatedReport, 'Informe.docx', 'copy', 'project-to-drive')
    assert.equal(await f.readDrive('Informe.docx'), 'new independent document')
  })

  it('does not create duplicate backups for an unchanged unresolved conflict', async (context) => {
    const f = await fixture(context)
    await f.project('Informe.docx', 'project version')
    await f.drive('Informe.docx', 'Drive version')
    await f.run()
    const backups = await snapshot(f.backupDirectory)
    assert.ok(backups?.some((entry) => entry.type === 'file'))

    const repeatedReport = await f.run()

    expectAction(repeatedReport, 'Informe.docx', 'conflict')
    assert.deepEqual(await snapshot(f.backupDirectory), backups)
    assert.equal(await f.readProject('Informe.docx'), 'project version')
    assert.equal(await f.readDrive('Informe.docx'), 'Drive version')
  })

  it('treats inherited JavaScript property names as ordinary file paths', async (context) => {
    const f = await fixture(context)
    const names = ['__proto__', 'constructor', 'toString']
    for (const name of names) await f.project(name, `original ${name}`)
    const initialReport = await f.run()
    for (const name of names) {
      expectAction(initialReport, name, 'copy', 'project-to-drive')
      assert.equal(await f.readDrive(name), `original ${name}`)
      await f.drive(name, `edited from Drive ${name}`)
    }

    const editedReport = await f.run()
    for (const name of names) {
      expectAction(editedReport, name, 'copy', 'drive-to-project')
      assert.equal(await f.readProject(name), `edited from Drive ${name}`)
      await f.project(name, `project conflict ${name}`)
      await f.drive(name, `Drive conflict ${name}`)
    }

    const conflictReport = await f.run()
    assert.equal(conflictReport.conflicts.length, names.length)
    for (const name of names) expectAction(conflictReport, name, 'conflict')
    const resolvedReport = await f.run({
      resolutions: Object.fromEntries(names.map((name) => [name, 'project'])),
    })
    assert.equal(resolvedReport.conflicts.length, 0)
    for (const name of names) {
      assert.equal(await f.readProject(name), `project conflict ${name}`)
      assert.equal(await f.readDrive(name), `project conflict ${name}`)
    }
  })
})
