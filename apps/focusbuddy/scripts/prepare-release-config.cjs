const { mkdirSync, writeFileSync } = require('node:fs')
const path = require('node:path')
const {
  DEFAULT_API_BASE_URL,
  normalizeChannelApiUrl,
} = require('../electron/api-url.cjs')
const {
  releaseIdentity,
  createReleaseConfig,
  serializeReleaseConfig,
  configSha256,
} = require('../electron/release-channel.cjs')

function releaseConfigForEnvironment(
  channel,
  { apiUrl, environment = process.env } = {},
) {
  releaseIdentity(channel)
  if (channel === 'production') {
    return createReleaseConfig(
      channel,
      apiUrl || environment.FOCUSBUDDY_API_URL,
    )
  }
  let candidate = apiUrl || environment.FOCUSBUDDY_LOCAL_API_URL
  if (!candidate && environment.FOCUSBUDDY_API_URL) {
    try {
      candidate = normalizeChannelApiUrl(
        environment.FOCUSBUDDY_API_URL,
        'local',
      )
    } catch {
      // Una variable oficial del shell no convierte el instalador local en remoto.
    }
  }
  return createReleaseConfig('local', candidate || DEFAULT_API_BASE_URL)
}

function prepareReleaseConfig(channel, options = {}) {
  const config = releaseConfigForEnvironment(channel, options)
  const source = serializeReleaseConfig(config)
  const applicationDirectory =
    options.applicationDirectory || path.resolve(__dirname, '..')
  const outputDirectory = path.join(applicationDirectory, 'build', channel)
  const configPath = path.join(outputDirectory, 'focusbuddy.config.json')
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(configPath, source, 'utf8')
  return {
    config,
    configPath,
    metadata: { schemaVersion: 1, channel, configSha256: configSha256(source) },
  }
}

if (require.main === module) {
  try {
    const channel =
      process.argv
        .find((argument) => argument.startsWith('--channel='))
        ?.slice(10) || 'local'
    const apiUrl = process.argv
      .find((argument) => argument.startsWith('--api-url='))
      ?.slice(10)
    const { config } = prepareReleaseConfig(channel, { apiUrl })
    console.log(
      `Configuración pública preparada: FocusBuddy ${releaseIdentity(channel).label} · ${config.apiBaseUrl}`,
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { releaseConfigForEnvironment, prepareReleaseConfig }
