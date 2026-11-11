const { writeFileSync } = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const packageConfig = require('../package.json')
const { releaseIdentity } = require('../electron/release-channel.cjs')
const { prepareReleaseConfig } = require('./prepare-release-config.cjs')
const { environmentForBuilder } = require('./run-electron-builder.cjs')

function parseBuildArguments(argumentsFromCommandLine) {
  const values = { channel: 'local', target: 'nsis' }
  const seen = new Set()
  for (const argument of argumentsFromCommandLine) {
    const match = /^--(channel|target|api-url)=(.+)$/.exec(argument)
    if (!match || seen.has(match[1]))
      throw new TypeError('Argumentos de compilación de FocusBuddy no válidos.')
    seen.add(match[1])
    values[match[1] === 'api-url' ? 'apiUrl' : match[1]] = match[2]
  }
  releaseIdentity(values.channel)
  if (!['dir', 'nsis'].includes(values.target))
    throw new TypeError('El destino de FocusBuddy debe ser dir o nsis.')
  return values
}

function builderConfigForChannel(channel, prepared) {
  const identity = releaseIdentity(channel)
  return {
    ...packageConfig.build,
    appId: identity.appId,
    productName: identity.productName,
    artifactName: identity.artifactName,
    protocols: [{ name: identity.productName, schemes: [identity.protocol] }],
    directories: {
      ...packageConfig.build.directories,
      output: `release/${channel}`,
    },
    extraMetadata: { focusbuddyRelease: prepared.metadata },
    extraResources: [
      {
        from: `build/${channel}/focusbuddy.config.json`,
        to: 'focusbuddy.config.json',
      },
      ...packageConfig.build.extraResources.filter(
        (resource) => resource.to !== 'focusbuddy.config.json',
      ),
    ],
  }
}

async function buildRelease(argumentsFromCommandLine = process.argv.slice(2)) {
  const options = parseBuildArguments(argumentsFromCommandLine)
  const prepared = prepareReleaseConfig(options.channel, options)
  const applicationDirectory = path.resolve(__dirname, '..')
  const configPath = path.join(
    applicationDirectory,
    'build',
    options.channel,
    'electron-builder.config.json',
  )
  const builderConfig = builderConfigForChannel(options.channel, prepared)
  // npm ya descargó y verificó esta versión exacta de Electron. Reutilizarla
  // evita otra descarga de 150 MB y mantiene separadas la copia de desarrollo y la empaquetada.
  builderConfig.electronDist = path.dirname(require('electron'))
  writeFileSync(
    configPath,
    `${JSON.stringify(builderConfig, null, 2)}\n`,
    'utf8',
  )
  const result = spawnSync(
    process.execPath,
    [
      '--no-maglev',
      require.resolve('electron-builder/out/cli/cli.js'),
      '--config',
      configPath,
      '--win',
      options.target,
      '--x64',
      '--publish',
      'never',
    ],
    {
      cwd: applicationDirectory,
      env: environmentForBuilder(),
      stdio: 'inherit',
    },
  )
  if (result.error || result.status !== 0)
    throw new Error(
      `No se pudo construir el instalador de FocusBuddy (código ${result.status ?? 'sin salida'}${result.signal ? `, señal ${result.signal}` : ''}).`,
    )
  await require('./verify-release.cjs').verifyRelease({
    channel: options.channel,
    requireInstaller: options.target === 'nsis',
  })
}

if (require.main === module) {
  buildRelease().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { parseBuildArguments, builderConfigForChannel, buildRelease }
