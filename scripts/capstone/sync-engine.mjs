import * as fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'

const VERSION = 1
const HASH = /^[a-f0-9]{64}$/
const ignoredNames = new Set([
  'desktop.ini',
  '.desktop.ini',
  'thumbs.db',
  '.ds_store',
])
const ignoredExtensions =
  /\.(?:tmp|temp|part|crdownload|gdoc|gsheet|gslides|gdraw|gform|gsite|gmap|gshortcut|gtable|gscript|glink)$/i
const fold = (value) =>
  process.platform === 'win32' ? value.toLowerCase() : value
const keyFor = (value) => fold(value.replaceAll('\\', '/'))
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const record = (value = {}) => Object.assign(Object.create(null), value)

function fail(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined)
  error.code = code
  return error
}

function inside(parent, child) {
  const relative = path.relative(fold(parent), fold(child))
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  )
}

function relativePath(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\0') ||
    /^[A-Za-z]:/.test(value)
  )
    throw fail('EPATH', 'Invalid relative synchronization path.')
  const portable = value.replaceAll('\\', '/')
  if (
    portable.startsWith('/') ||
    portable.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw fail('EPATH', `Unsafe relative synchronization path: ${value}`)
  return portable
}

function within(root, relative) {
  const result = path.resolve(root, ...relativePath(relative).split('/'))
  if (!inside(root, result) || fold(result) === fold(root))
    throw fail('EPATH', 'Path escaped its authorized directory.')
  return result
}

async function maybeStat(file) {
  try {
    return await fs.lstat(file)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function noLinks(file, allowMissing = false) {
  const absolute = path.resolve(file)
  const parsed = path.parse(absolute)
  let current = parsed.root
  for (const part of absolute
    .slice(parsed.root.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part)
    const stat = await maybeStat(current)
    if (!stat) {
      if (allowMissing) return
      throw fail('ENOENT', `Required path is missing: ${current}`)
    }
    if (stat.isSymbolicLink())
      throw fail('ESYMLINK', `Symbolic links are not synchronized: ${current}`)
  }
}

async function directoryIdentity(directory) {
  await noLinks(directory)
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory())
    throw fail('ENOTDIR', `Expected a directory: ${directory}`)
  return { real: await fs.realpath(directory), dev: stat.dev, ino: stat.ino }
}

async function assertRoot(root, identity) {
  const current = await directoryIdentity(root)
  if (
    fold(current.real) !== fold(identity.real) ||
    current.dev !== identity.dev ||
    current.ino !== identity.ino
  )
    throw fail('ESTALE', `A synchronization root was replaced: ${root}`)
}

function signature(stat) {
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
    dev: stat.dev,
    ino: stat.ino,
  }
}

function sameSignature(first, second) {
  return Object.keys(first).every((key) => first[key] === second[key])
}

async function inspect(file, relative) {
  await noLinks(file)
  const before = await fs.lstat(file)
  if (!before.isFile())
    throw fail('EFILETYPE', `Only regular files can be synchronized: ${file}`)
  const handle = await fs.open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  )
  const hash = createHash('sha256')
  try {
    if (!sameSignature(signature(before), signature(await handle.stat())))
      throw fail('EUNSTABLE', `File changed before reading: ${file}`)
    const buffer = Buffer.allocUnsafe(128 * 1024)
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null)
      if (!bytesRead) break
      hash.update(buffer.subarray(0, bytesRead))
    }
    const after = await handle.stat()
    const named = await fs.lstat(file)
    if (
      named.isSymbolicLink() ||
      !sameSignature(signature(before), signature(after)) ||
      !sameSignature(signature(before), signature(named))
    )
      throw fail('EUNSTABLE', `File changed while reading: ${file}`)
  } finally {
    await handle.close()
  }
  return {
    relative,
    hash: hash.digest('hex'),
    ...signature(before),
    atimeMs: before.atimeMs,
  }
}

function ignored(name) {
  return (
    ignoredNames.has(name.toLowerCase()) ||
    name.startsWith('~$') ||
    name.startsWith('.~lock.') ||
    ignoredExtensions.test(name)
  )
}

async function scan(root) {
  const files = new Map()
  async function visit(directory, prefix = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    entries.sort((first, second) => first.name.localeCompare(second.name, 'en'))
    for (const item of entries) {
      const relative = prefix ? `${prefix}/${item.name}` : item.name
      const file = within(root, relative)
      const stat = await fs.lstat(file)
      if (stat.isSymbolicLink())
        throw fail('ESYMLINK', `Symbolic links are not synchronized: ${file}`)
      if (ignored(item.name)) continue
      if (stat.isDirectory()) await visit(file, relative)
      else {
        if (files.has(keyFor(relative)))
          throw fail('EPATH', `Ambiguous file paths: ${relative}`)
        files.set(keyFor(relative), await inspect(file, relative))
      }
    }
  }
  await visit(root)
  return files
}

function assertSnapshots(first, second) {
  if (first.size !== second.size)
    throw fail('EUNSTABLE', 'The file list changed during synchronization.')
  for (const [key, entry] of first) {
    const current = second.get(key)
    if (
      !current ||
      current.hash !== entry.hash ||
      !sameSignature(signature(entry), signature(current))
    )
      throw fail(
        'EUNSTABLE',
        `File changed during synchronization: ${entry.relative}`,
      )
  }
}

async function assertFile(file, expected) {
  const stat = await maybeStat(file)
  if (!expected) {
    if (stat)
      throw fail('ESTALE', `A destination appeared unexpectedly: ${file}`)
    return
  }
  if (!stat) throw fail('ESTALE', `A file disappeared unexpectedly: ${file}`)
  const current = await inspect(file, expected.relative)
  if (
    current.hash !== expected.hash ||
    !sameSignature(signature(current), signature(expected))
  )
    throw fail('EUNSTABLE', `A file changed before copying: ${file}`)
}

async function makeDirectory(directory) {
  await noLinks(directory, true)
  await fs.mkdir(directory, { recursive: true })
  await directoryIdentity(directory)
}

async function verifiedStage(source, expected, destination) {
  await assertFile(source, expected)
  await makeDirectory(path.dirname(destination))
  const temporary = path.join(
    path.dirname(destination),
    `.capstone-sync-${randomUUID()}.tmp`,
  )
  try {
    await fs.copyFile(source, temporary, constants.COPYFILE_EXCL)
    const copied = await inspect(temporary, expected.relative)
    if (copied.hash !== expected.hash || copied.size !== expected.size)
      throw fail('EVERIFY', `Copy verification failed: ${source}`)
    await assertFile(source, expected)
    await fs.utimes(
      temporary,
      new Date(expected.atimeMs),
      new Date(expected.mtimeMs),
    )
    return temporary
  } catch (error) {
    await fs.unlink(temporary).catch((cleanup) => {
      if (cleanup.code !== 'ENOENT') throw cleanup
    })
    throw error
  }
}

async function finalizeStage(temporary, destination, expected) {
  await noLinks(destination, true)
  await fs.rename(temporary, destination)
  const result = await inspect(destination, expected.relative)
  if (
    result.hash !== expected.hash ||
    result.size !== expected.size ||
    Math.abs(result.mtimeMs - expected.mtimeMs) > 2
  )
    throw fail('EVERIFY', `Destination verification failed: ${destination}`)
  return result
}

async function overwriteHandle(handle, source, expected) {
  const input = await fs.open(
    source,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  )
  try {
    await handle.truncate(0)
    const buffer = Buffer.allocUnsafe(128 * 1024)
    let position = 0
    for (;;) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, null)
      if (!bytesRead) break
      let written = 0
      while (written < bytesRead) {
        const result = await handle.write(
          buffer,
          written,
          bytesRead - written,
          position + written,
        )
        if (!result.bytesWritten)
          throw fail('EIO', 'A file write made no progress.')
        written += result.bytesWritten
      }
      position += bytesRead
    }
    await handle.truncate(position)
    await handle.utimes(new Date(expected.atimeMs), new Date(expected.mtimeMs))
    await handle.sync()
  } finally {
    await input.close()
  }
}

async function finalizeExistingDrive(
  temporary,
  destination,
  source,
  previous,
  backupFile,
) {
  await assertFile(destination, previous)
  const staged = await inspect(temporary, source.relative)
  if (staged.hash !== source.hash)
    throw fail('EVERIFY', 'Staged Drive copy changed.')
  const saved = await inspect(backupFile, previous.relative)
  if (saved.hash !== previous.hash)
    throw fail('EVERIFY', 'Drive rollback backup is invalid.')
  const handle = await fs.open(
    destination,
    constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
  )
  let changed = false
  try {
    if (!sameSignature(signature(previous), signature(await handle.stat())))
      throw fail('EUNSTABLE', 'Drive destination changed before opening.')
    await assertFile(destination, previous)
    changed = true
    // Keep the existing file handle/inode: a rename on Google Drive can create
    // a different cloud object and lose its sharing metadata or comments.
    await overwriteHandle(handle, temporary, source)
    const result = await inspect(destination, source.relative)
    if (
      result.dev !== previous.dev ||
      result.ino !== previous.ino ||
      result.hash !== source.hash ||
      result.size !== source.size ||
      Math.abs(result.mtimeMs - source.mtimeMs) > 2
    )
      throw fail(
        'EVERIFY',
        'Existing Drive file failed verification after writing.',
      )
    return result
  } catch (error) {
    if (changed) {
      try {
        await noLinks(destination)
        const current = await fs.lstat(destination)
        if (current.dev !== previous.dev || current.ino !== previous.ino)
          throw fail(
            'ESTALE',
            'Drive file identity changed; rollback backup was retained.',
          )
        await overwriteHandle(handle, backupFile, previous)
        const restored = await inspect(destination, previous.relative)
        if (
          restored.hash !== previous.hash ||
          restored.dev !== previous.dev ||
          restored.ino !== previous.ino
        )
          throw fail('EVERIFY', 'Drive rollback verification failed.')
      } catch (rollback) {
        const failure = new AggregateError(
          [error, rollback],
          `Drive write and rollback failed. Restore the preserved backup: ${backupFile}`,
        )
        failure.code = 'EROLLBACK'
        failure.backup = backupFile
        throw failure
      }
      const failure = fail(
        'ECOPY',
        `Drive write failed; the previous version was restored from ${backupFile}`,
        error,
      )
      failure.rollback = 'restored'
      failure.backup = backupFile
      throw failure
    }
    throw error
  } finally {
    await handle.close()
  }
}

function liveProcess(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code !== 'ESRCH'
  }
}

async function lockRecord(file) {
  const entry = await inspect(file, 'sync.lock')
  let value
  try {
    value = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    throw fail(
      'ELOCKED',
      'The synchronization lock cannot be safely interpreted.',
      error,
    )
  }
  await assertFile(file, entry)
  return { entry, value }
}

async function acquireLock(lockFile, roots, token) {
  const open = () => fs.open(lockFile, 'wx', 0o600)
  let result
  try {
    result = await open()
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const old = await lockRecord(lockFile)
    const valid = (value) =>
      Number.isSafeInteger(value?.pid) &&
      value.pid > 0 &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value?.token ?? '',
      ) &&
      value.roots &&
      typeof value.roots.project === 'string' &&
      typeof value.roots.drive === 'string' &&
      fold(value.roots.project) === fold(roots.project) &&
      fold(value.roots.drive) === fold(roots.drive)
    if (!valid(old.value) || liveProcess(old.value.pid))
      throw fail(
        'ELOCKED',
        'Another live process holds the synchronization lock, or its ownership is uncertain.',
      )
    const recoveryFile = `${lockFile}.recovery`
    let recovery
    try {
      recovery = await fs.open(recoveryFile, 'wx', 0o600)
    } catch (error) {
      if (error.code === 'EEXIST')
        throw fail(
          'ELOCKED',
          'Lock recovery is already claimed; no recovery lock was removed.',
          error,
        )
      throw error
    }
    try {
      await recovery.writeFile(JSON.stringify({ token, pid: process.pid }))
      await recovery.sync()
      const current = await lockRecord(lockFile)
      if (
        !valid(current.value) ||
        current.value.token !== old.value.token ||
        current.entry.hash !== old.entry.hash ||
        !sameSignature(signature(current.entry), signature(old.entry)) ||
        liveProcess(current.value.pid)
      )
        throw fail(
          'ELOCKED',
          'Synchronization lock ownership changed during recovery.',
        )
      await fs.unlink(lockFile)
      try {
        result = await open()
      } catch (error) {
        if (error.code === 'EEXIST')
          throw fail(
            'ELOCKED',
            'Another synchronization acquired the released lock.',
            error,
          )
        throw error
      }
    } finally {
      await recovery.close()
      await noLinks(recoveryFile)
      const current = JSON.parse(await fs.readFile(recoveryFile, 'utf8'))
      if (current.token === token) await fs.unlink(recoveryFile)
    }
  }
  try {
    await result.writeFile(
      JSON.stringify({
        token,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        roots,
      }),
    )
    await result.sync()
    return result
  } catch (error) {
    await result.close()
    // A partially written lock is retained rather than guessing its owner.
    throw error
  }
}

async function backupVersions(backupDirectory, relative, versions) {
  const id = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}`
  const directory = path.join(backupDirectory, id)
  const backups = {}
  for (const [side, version] of Object.entries(versions)) {
    if (!version) continue
    const destination = within(path.join(directory, side), relative)
    const temporary = await verifiedStage(
      version.file,
      version.entry,
      destination,
    )
    try {
      await finalizeStage(temporary, destination, version.entry)
    } finally {
      await fs.unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error
      })
    }
    backups[side] = path
      .relative(backupDirectory, destination)
      .replaceAll('\\', '/')
  }
  await fs.writeFile(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(
      {
        id,
        path: relative,
        backups,
        hashes: Object.fromEntries(
          Object.entries(versions)
            .filter(([, value]) => value)
            .map(([side, value]) => [side, value.entry.hash]),
        ),
      },
      null,
      2,
    )}\n`,
    { flag: 'wx' },
  )
  return backups
}

async function reusableBackups(directory, previous, project, drive) {
  if (
    !previous ||
    previous.projectHash !== project.hash ||
    previous.driveHash !== drive.hash ||
    !previous.backups
  )
    return false
  for (const [side, entry] of [
    ['project', project],
    ['drive', drive],
  ]) {
    if (!previous.backups[side]) return false
    const file = within(directory, previous.backups[side])
    if (!(await maybeStat(file))) return false
    if ((await inspect(file, entry.relative)).hash !== entry.hash) return false
  }
  return true
}

async function readBaseline(file, roots) {
  const stat = await maybeStat(file)
  if (!stat)
    return {
      value: {
        version: VERSION,
        roots,
        entries: record(),
        conflicts: record(),
      },
      existing: null,
    }
  const existing = await inspect(file, 'baseline.json')
  const value = JSON.parse(await fs.readFile(file, 'utf8'))
  await assertFile(file, existing)
  if (
    value.version !== VERSION ||
    !value.roots ||
    typeof value.roots.project !== 'string' ||
    typeof value.roots.drive !== 'string' ||
    fold(value.roots.project) !== fold(roots.project) ||
    fold(value.roots.drive) !== fold(roots.drive) ||
    !value.entries ||
    typeof value.entries !== 'object' ||
    Array.isArray(value.entries)
  )
    throw fail(
      'ESTATE',
      'The baseline belongs to different roots or has an unsupported format.',
    )
  if (
    value.conflicts !== undefined &&
    (!value.conflicts ||
      typeof value.conflicts !== 'object' ||
      Array.isArray(value.conflicts))
  )
    throw fail('ESTATE', 'Invalid stored conflicts.')
  value.entries = record(value.entries)
  value.conflicts = record(value.conflicts)
  for (const [key, entry] of Object.entries(value.entries)) {
    if (
      !entry ||
      !HASH.test(entry.hash) ||
      keyFor(relativePath(entry.path)) !== key
    )
      throw fail('ESTATE', 'Invalid baseline entry.')
  }
  for (const [key, entry] of Object.entries(value.conflicts)) {
    if (
      !entry ||
      keyFor(relativePath(entry.path)) !== key ||
      !HASH.test(entry.projectHash) ||
      !HASH.test(entry.driveHash)
    )
      throw fail('ESTATE', 'Invalid stored conflict.')
  }
  return { value, existing }
}

async function persistBaseline(file, baseline, previous) {
  await assertFile(file, previous)
  await noLinks(file, true)
  const temporary = `${file}.${randomUUID()}.tmp`
  let handle
  try {
    handle = await fs.open(temporary, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await assertFile(file, previous)
    await fs.rename(temporary, file)
  } finally {
    await handle?.close()
    await fs.unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

/** Hash-based, non-destructive two-way synchronization of two authorized trees. */
export async function synchronize({
  projectRoot,
  driveRoot,
  stateDirectory,
  backupDirectory,
  dryRun = false,
  resolutions = {},
  settleMs = 300,
  forceHash = true,
} = {}) {
  for (const value of [
    projectRoot,
    driveRoot,
    stateDirectory,
    backupDirectory,
  ]) {
    if (typeof value !== 'string' || !value.trim())
      throw fail(
        'ECONFIG',
        'Both roots and external state/backup directories are required.',
      )
  }
  if (!Number.isFinite(settleMs) || settleMs < 0 || settleMs > 60_000)
    throw fail('ECONFIG', 'settleMs must be between 0 and 60000.')
  if (
    !resolutions ||
    typeof resolutions !== 'object' ||
    Array.isArray(resolutions)
  )
    throw fail('ECONFIG', 'resolutions must be an object.')
  const resolved = {
    project: path.resolve(projectRoot),
    drive: path.resolve(driveRoot),
  }
  const state = path.resolve(stateDirectory)
  const backups = path.resolve(backupDirectory)
  for (const external of [state, backups]) await noLinks(external, true)
  const identities = {
    project: await directoryIdentity(resolved.project),
    drive: await directoryIdentity(resolved.drive),
  }
  if (
    inside(resolved.project, resolved.drive) ||
    inside(resolved.drive, resolved.project) ||
    inside(identities.project.real, identities.drive.real) ||
    inside(identities.drive.real, identities.project.real) ||
    (identities.project.ino !== 0 &&
      identities.project.dev === identities.drive.dev &&
      identities.project.ino === identities.drive.ino)
  )
    throw fail(
      'EROOTS',
      'Synchronization roots must be separate, non-overlapping trees.',
    )
  for (const external of [state, backups]) {
    for (const root of Object.values(resolved)) {
      if (inside(root, external) || inside(external, root))
        throw fail(
          'EROOTS',
          'State and backups must be outside both synchronization trees.',
        )
    }
  }
  if (fold(state) === fold(backups))
    throw fail('EROOTS', 'State and backup directories must be distinct.')
  const choices = new Map()
  for (const [relative, choice] of Object.entries(resolutions)) {
    if (choice !== 'project' && choice !== 'drive')
      throw fail('ECONFIG', `Invalid conflict resolution: ${relative}`)
    choices.set(keyFor(relativePath(relative)), choice)
  }
  const baselineFile = path.join(state, 'baseline.json')
  const lockFile = path.join(state, 'sync.lock')
  const token = randomUUID()
  let lock
  try {
    if (!dryRun) {
      await makeDirectory(state)
      lock = await acquireLock(lockFile, resolved, token)
    }
    const baseline = await readBaseline(baselineFile, resolved)
    const first = {
      project: await scan(resolved.project),
      drive: await scan(resolved.drive),
    }
    if (settleMs > 0) await pause(settleMs)
    const snapshots = {
      project: await scan(resolved.project),
      drive: await scan(resolved.drive),
    }
    for (const side of ['project', 'drive']) {
      await assertRoot(resolved[side], identities[side])
      assertSnapshots(first[side], snapshots[side])
    }
    const next = structuredClone(baseline.value)
    next.entries = record(next.entries)
    next.conflicts = record(next.conflicts)
    const report = {
      actions: [],
      conflicts: [],
      pendingDeletions: [],
      copied: 0,
      plannedCopies: 0,
      dryRun: Boolean(dryRun),
      forceHash: true,
    }
    // forceHash=false is intentionally conservative: hashes remain authoritative.
    void forceHash
    const plans = []
    const all = new Set([
      ...snapshots.project.keys(),
      ...snapshots.drive.keys(),
      ...Object.keys(next.entries),
      ...Object.keys(next.conflicts),
    ])
    for (const key of [...all].sort()) {
      const project = snapshots.project.get(key)
      const drive = snapshots.drive.get(key)
      const previous = next.entries[key]
      const oldConflict = next.conflicts[key]
      const relative =
        project?.relative ??
        drive?.relative ??
        previous?.path ??
        oldConflict?.path
      const action = {
        path: relative,
        direction: project ? 'project-to-drive' : 'drive-to-project',
      }
      if (!project && !drive) {
        delete next.entries[key]
        delete next.conflicts[key]
        report.actions.push({
          ...action,
          type: 'unchanged',
          reason: 'Both copies are absent; baseline entry removed.',
        })
      } else if ((!project || !drive) && (previous || oldConflict)) {
        const pending = {
          ...action,
          type: 'pending-deletion',
          missingSide: project ? 'drive' : 'project',
        }
        report.actions.push(pending)
        report.pendingDeletions.push(pending)
      } else if (project && drive && project.hash === drive.hash) {
        next.entries[key] = { path: relative, hash: project.hash }
        delete next.conflicts[key]
        report.actions.push({
          ...action,
          type: 'unchanged',
          hash: project.hash,
        })
      } else {
        let source = !project ? 'drive' : !drive ? 'project' : null
        if (!source && previous) {
          if (project.hash === previous.hash) source = 'drive'
          else if (drive.hash === previous.hash) source = 'project'
        }
        const conflict = !source
        if (conflict && choices.has(key)) source = choices.get(key)
        if (source) {
          const target = source === 'project' ? 'drive' : 'project'
          const copy = {
            ...action,
            direction: `${source}-to-${target}`,
            type: 'copy',
            hash: snapshots[source].get(key).hash,
            ...(conflict ? { resolvedBy: source } : {}),
          }
          report.actions.push(copy)
          plans.push({ key, relative, source, target, action: copy })
          report.plannedCopies += 1
        } else {
          const entry = {
            ...action,
            type: 'conflict',
            projectHash: project.hash,
            driveHash: drive.hash,
          }
          report.actions.push(entry)
          report.conflicts.push(entry)
          plans.push({ key, relative, conflict: true, action: entry })
        }
      }
    }

    if (dryRun) return report
    // Preflight every destination before any file is copied or backed up.
    for (const plan of plans) {
      if (!plan.conflict) {
        const target = snapshots[plan.target].get(plan.key)
        const destination = within(
          resolved[plan.target],
          target?.relative ?? plan.relative,
        )
        await noLinks(destination, true)
        const stat = await maybeStat(destination)
        if (stat && !stat.isFile())
          throw fail(
            'EFILETYPE',
            `Destination is not a regular file: ${destination}`,
          )
      }
    }
    for (const plan of plans) {
      for (const side of ['project', 'drive'])
        await assertRoot(resolved[side], identities[side])
      const project = snapshots.project.get(plan.key)
      const drive = snapshots.drive.get(plan.key)
      if (plan.conflict) {
        const previous = next.conflicts[plan.key]
        const retained = await reusableBackups(
          backups,
          previous,
          project,
          drive,
        )
        const saved = retained
          ? previous.backups
          : await backupVersions(backups, plan.relative, {
              project: {
                file: within(resolved.project, project.relative),
                entry: project,
              },
              drive: {
                file: within(resolved.drive, drive.relative),
                entry: drive,
              },
            })
        plan.action.backups = saved
        next.conflicts[plan.key] = {
          path: plan.relative,
          projectHash: project.hash,
          driveHash: drive.hash,
          backups: saved,
        }
        continue
      }
      const sourceEntry = snapshots[plan.source].get(plan.key)
      const targetEntry = snapshots[plan.target].get(plan.key)
      const sourceFile = within(resolved[plan.source], sourceEntry.relative)
      const destination = within(
        resolved[plan.target],
        targetEntry?.relative ?? sourceEntry.relative,
      )
      await assertFile(sourceFile, sourceEntry)
      await assertFile(destination, targetEntry)
      if (targetEntry) {
        plan.action.backups = await backupVersions(backups, plan.relative, {
          [plan.target]: { file: destination, entry: targetEntry },
        })
      }
      const temporary = await verifiedStage(
        sourceFile,
        sourceEntry,
        destination,
      )
      try {
        for (const side of ['project', 'drive'])
          await assertRoot(resolved[side], identities[side])
        await assertFile(sourceFile, sourceEntry)
        await assertFile(destination, targetEntry)
        const existingDrive = plan.target === 'drive' && Boolean(targetEntry)
        const result = existingDrive
          ? await finalizeExistingDrive(
              temporary,
              destination,
              sourceEntry,
              targetEntry,
              within(backups, plan.action.backups.drive),
            )
          : await finalizeStage(temporary, destination, sourceEntry)
        plan.action.writeMode = existingDrive
          ? 'in-place-verified'
          : 'atomic-rename'
        snapshots[plan.target].set(plan.key, result)
      } finally {
        await fs.unlink(temporary).catch((error) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
      next.entries[plan.key] = { path: plan.relative, hash: sourceEntry.hash }
      delete next.conflicts[plan.key]
      report.copied += 1
    }
    for (const side of ['project', 'drive']) {
      await assertRoot(resolved[side], identities[side])
      assertSnapshots(snapshots[side], await scan(resolved[side]))
    }
    next.updatedAt = new Date().toISOString()
    await persistBaseline(baselineFile, next, baseline.existing)
    return report
  } finally {
    if (lock) {
      await lock.close()
      const stat = await maybeStat(lockFile)
      if (stat && !stat.isSymbolicLink()) {
        const current = JSON.parse(await fs.readFile(lockFile, 'utf8'))
        if (current.token === token) await fs.unlink(lockFile)
      }
    }
  }
}
