import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path'
import { fileURLToPath } from 'node:url'
import { synchronize } from './sync-engine.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const repositoryRoot = resolve(dirname(scriptPath), '../..')
const defaultConfig = join(repositoryRoot, '.local/capstone-sync/config.json')
const sleep = (milliseconds) =>
  new Promise((done) => setTimeout(done, milliseconds))

function parseArguments(args) {
  const options = { resolutions: Object.create(null) }
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (
      [
        '--once',
        '--watch',
        '--stop',
        '--status',
        '--json',
        '--dry-run',
        '--setup',
        '--help',
      ].includes(argument)
    ) {
      options[argument.slice(2)] = true
      continue
    }
    if (
      ![
        '--config',
        '--drive',
        '--project',
        '--backup',
        '--interval',
        '--resolve',
      ].includes(argument)
    )
      throw new Error(`Opción desconocida: ${argument}. Usa --help.`)
    const value = args[++index]
    if (!value || value.startsWith('--'))
      throw new Error(`Falta un valor para ${argument}.`)
    if (argument === '--resolve') {
      const split = value.lastIndexOf('=')
      const side = value.slice(split + 1)
      if (split < 1 || !['project', 'drive'].includes(side))
        throw new Error(
          '--resolve requiere ruta/relativa=project o ruta/relativa=drive.',
        )
      options.resolutions[value.slice(0, split)] = side
    } else options[argument.slice(2)] = value
  }
  if (
    [options.watch, options.stop, options.status, options.setup].filter(Boolean)
      .length > 1 ||
    (options.watch && options['dry-run'])
  )
    throw new Error(
      'Elige una sola operación. --watch no puede combinarse con --dry-run.',
    )
  if (options.watch && Object.keys(options.resolutions).length)
    throw new Error(
      'Resuelve archivos con una ejecución puntual, antes de iniciar --watch.',
    )
  return options
}

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback
  return JSON.parse(readFileSync(file, 'utf8'))
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2), {
    encoding: 'utf8',
    flag: 'wx',
  })
  renameSync(temporary, file)
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === 'EPERM'
  }
}

function validateConfiguration(config) {
  if (config.version !== 1)
    throw new Error('La versión de configuración no es compatible.')
  for (const key of [
    'projectRoot',
    'driveRoot',
    'stateDirectory',
    'backupDirectory',
  ])
    if (typeof config[key] !== 'string' || !isAbsolute(config[key]))
      throw new Error(`La ruta ${key} debe ser absoluta.`)
  if (
    !Number.isInteger(config.intervalSeconds) ||
    config.intervalSeconds < 10 ||
    config.intervalSeconds > 3600
  )
    throw new Error('El intervalo debe estar entre 10 y 3600 segundos.')
  const inside = (parent, child) => {
    const segment = relative(
      resolve(parent).toLowerCase(),
      resolve(child).toLowerCase(),
    )
    return (
      segment === '' ||
      (!isAbsolute(segment) &&
        segment !== '..' &&
        !segment.startsWith('..' + sep))
    )
  }
  for (const root of [config.projectRoot, config.driveRoot]) {
    if (resolve(root) === parse(resolve(root)).root)
      throw new Error('No se puede sincronizar una unidad completa.')
    for (const external of [config.stateDirectory, config.backupDirectory])
      if (inside(root, external) || inside(external, root))
        throw new Error(
          'El estado y los respaldos deben estar fuera de las carpetas sincronizadas.',
        )
  }
  if (
    inside(config.projectRoot, config.driveRoot) ||
    inside(config.driveRoot, config.projectRoot)
  )
    throw new Error(
      'Las carpetas de proyecto y Drive deben ser independientes.',
    )
  if (
    inside(config.stateDirectory, config.backupDirectory) ||
    inside(config.backupDirectory, config.stateDirectory)
  )
    throw new Error(
      'Las carpetas de estado y respaldo deben ser independientes.',
    )
  return config
}

function loadConfiguration(file) {
  const config = readJson(file)
  if (!config)
    throw new Error(
      'Falta la configuración local. Ejecuta --setup --drive "ruta de Capstone en Drive".',
    )
  return validateConfiguration(config)
}

function watcherStatus(config) {
  const watcher = readJson(join(config.stateDirectory, 'watch.json'))
  const watching = Boolean(
    watcher &&
    watcher.script === scriptPath &&
    processIsAlive(watcher.pid) &&
    Date.now() - Date.parse(watcher.heartbeatAt ?? watcher.startedAt) < 60_000,
  )
  return {
    configured: true,
    watching,
    pid: watching ? watcher.pid : null,
    intervalSeconds: config.intervalSeconds,
    lastRun: readJson(join(config.stateDirectory, 'last-run.json')),
  }
}

function summarize(report) {
  const actions = report.actions ?? []
  return {
    copies: actions.filter((action) => action.type === 'copy').length,
    conflicts: (report.conflicts ?? []).length,
    pendingDeletions: actions.filter(
      (action) => action.type === 'pending-deletion',
    ).length,
  }
}

async function runOnce(config, options, forceHash = true) {
  let report
  const deadline = Date.now() + 20_000
  for (;;) {
    try {
      report = await synchronize({
        ...config,
        dryRun: Boolean(options['dry-run']),
        resolutions: options.resolutions,
        forceHash,
      })
      break
    } catch (error) {
      if (error.code !== 'ELOCKED' || Date.now() >= deadline) throw error
      await sleep(1000)
    }
  }
  const summary = summarize(report)
  const record = {
    finishedAt: new Date().toISOString(),
    success: true,
    dryRun: Boolean(options['dry-run']),
    ...summary,
    report,
  }
  if (!options['dry-run']) {
    writeJson(join(config.stateDirectory, 'last-run.json'), record)
    const text = [
      `Última sincronización: ${record.finishedAt}`,
      `Copias: ${summary.copies}; conflictos: ${summary.conflicts}; borrados pendientes: ${summary.pendingDeletions}.`,
      `Respaldo: ${config.backupDirectory}`,
      'Los conflictos y borrados pendientes requieren revisión; consulta last-run.json.',
    ].join('\r\n')
    writeFileSync(join(config.stateDirectory, 'estado.txt'), text, 'utf8')
  }
  console.log(
    JSON.stringify(
      options.json
        ? record
        : {
            status: options['dry-run']
              ? 'Vista previa'
              : 'Sincronización terminada',
            ...summary,
            backupDirectory: config.backupDirectory,
          },
    ),
  )
  return summary
}

async function watch(config, options) {
  mkdirSync(config.stateDirectory, { recursive: true })
  const watcherFile = join(config.stateDirectory, 'watch.json')
  const stopFile = join(config.stateDirectory, 'stop.request')
  const existing = readJson(watcherFile)
  if (existing && watcherStatus(config).watching) {
    if (existing.script !== scriptPath)
      throw new Error(
        'El archivo de control pertenece a otro proceso; se conserva para revisión.',
      )
    console.log(
      JSON.stringify({
        status: 'La vigilancia ya está activa',
        pid: existing.pid,
      }),
    )
    return
  }
  if (existing)
    renameSync(
      watcherFile,
      join(config.stateDirectory, `watch.previous.${randomUUID()}.json`),
    )
  if (existsSync(stopFile)) unlinkSync(stopFile)
  const owner = {
    pid: process.pid,
    script: scriptPath,
    token: randomUUID(),
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  }
  const descriptor = openSync(watcherFile, 'wx')
  writeFileSync(descriptor, JSON.stringify(owner, null, 2), 'utf8')
  closeSync(descriptor)
  let stopping = false
  let nextRun = 0
  const stop = () => {
    stopping = true
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  const heartbeat = setInterval(() => {
    try {
      if (readJson(watcherFile)?.token !== owner.token) {
        stopping = true
        return
      }
      owner.heartbeatAt = new Date().toISOString()
      writeJson(watcherFile, owner)
    } catch (error) {
      console.error(error.message)
      stopping = true
    }
  }, 2000)
  console.log(
    JSON.stringify({
      status: 'Vigilancia iniciada',
      pid: process.pid,
      intervalSeconds: config.intervalSeconds,
    }),
  )
  try {
    while (!stopping && !existsSync(stopFile)) {
      if (readJson(watcherFile)?.token !== owner.token) break
      if (Date.now() >= nextRun) {
        try {
          await runOnce(config, { resolutions: {}, json: false }, true)
        } catch (error) {
          const record = {
            finishedAt: new Date().toISOString(),
            success: false,
            message: error.message,
            code: error.code ?? null,
          }
          writeJson(join(config.stateDirectory, 'last-run.json'), record)
          console.error(
            JSON.stringify({
              ...record,
              status: 'Se reintentará; los archivos se conservan',
            }),
          )
        }
        nextRun = Date.now() + config.intervalSeconds * 1000
      }
      const currentOwner = readJson(watcherFile)
      if (currentOwner?.token !== owner.token)
        throw new Error('Cambió el propietario del control de vigilancia.')
      await sleep(1000)
    }
  } finally {
    clearInterval(heartbeat)
    if (readJson(watcherFile)?.token === owner.token) unlinkSync(watcherFile)
    if (existsSync(stopFile)) unlinkSync(stopFile)
    console.log(JSON.stringify({ status: 'Vigilancia detenida' }))
  }
}

export async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args)
  const configFile = resolve(options.config ?? defaultConfig)
  if (options.help) {
    console.log(
      'Sincronización bidireccional de Capstone\n\n--setup --drive "ruta" [--project "ruta"] [--backup "ruta"]\n--once        Sincronizar ahora (predeterminado)\n--dry-run     Revisar el plan sin copiar ni actualizar la base\n--watch       Vigilar ambas carpetas automáticamente\n--status --json  Consultar el estado\n--stop        Detener la vigilancia\n--resolve "ruta/relativa=project|drive"  Elegir una versión tras revisarla\n\nLos cambios simultáneos y los borrados quedan pendientes de revisión.\nLa unidad de Google Drive debe estar montada; su aplicación sube los archivos a la nube.',
    )
    return
  }
  if (options.setup) {
    if (!options.drive) throw new Error('--setup necesita --drive "ruta".')
    if (existsSync(configFile))
      throw new Error(
        'La configuración local ya existe; se conserva sin reemplazar.',
      )
    const config = {
      version: 1,
      projectRoot: resolve(
        options.project ?? join(repositoryRoot, 'docs/Capstone'),
      ),
      driveRoot: resolve(options.drive),
      stateDirectory: join(dirname(configFile), 'state'),
      backupDirectory: resolve(
        options.backup ??
          join(
            dirname(repositoryRoot),
            'evidencias sistema/Respaldos_Sincronizacion_Capstone',
          ),
      ),
      intervalSeconds: Number(options.interval ?? 60),
    }
    validateConfiguration(config)
    writeJson(configFile, config)
    loadConfiguration(configFile)
    console.log(JSON.stringify({ status: 'Configuración creada', configFile }))
    return
  }
  if (options.status && !existsSync(configFile)) {
    console.log(
      JSON.stringify({
        configured: false,
        watching: false,
        pid: null,
        intervalSeconds: null,
        lastRun: null,
      }),
    )
    return
  }
  const config = loadConfiguration(configFile)
  if (options.status) {
    console.log(JSON.stringify(watcherStatus(config)))
    return
  }
  if (options.stop) {
    if (!watcherStatus(config).watching) {
      console.log('No hay una vigilancia activa.')
      return
    }
    writeFileSync(
      join(config.stateDirectory, 'stop.request'),
      new Date().toISOString(),
      'utf8',
    )
    console.log(
      'Se solicitó detener la vigilancia. La copia en curso terminará antes de salir.',
    )
    return
  }
  if (options.watch) {
    await watch(config, options)
    return
  }
  const result = await runOnce(config, options)
  if (result.conflicts || result.pendingDeletions) process.exitCode = 2
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
