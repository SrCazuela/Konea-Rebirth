const { createHash } = require('node:crypto')
const path = require('node:path')
const { normalizeChannelApiUrl, selectApiBaseUrl } = require('./api-url.cjs')

const RELEASE_CHANNELS = Object.freeze({
  local: Object.freeze({
    channel: 'local',
    label: 'Local',
    appId: 'cl.konea.focusbuddy.local',
    productName: 'Konea FocusBuddy Local',
    dataDirectoryName: 'Konea FocusBuddy Local',
    partition: 'persist:konea-focusbuddy-local',
    protocol: 'konea-focusbuddy-local',
    artifactName: 'Konea-FocusBuddy-Local-${version}-${arch}.${ext}',
  }),
  production: Object.freeze({
    channel: 'production',
    label: 'Oficial',
    appId: 'cl.konea.focusbuddy.official',
    productName: 'Konea FocusBuddy Oficial',
    // Evita reutilizar cookies o preferencias de antiguos instaladores locales.
    dataDirectoryName: 'Konea FocusBuddy Official',
    partition: 'persist:konea-focusbuddy-production',
    protocol: 'konea-focusbuddy',
    artifactName: 'Konea-FocusBuddy-${version}-${arch}.${ext}',
  }),
})

function releaseIdentity(channel) {
  if (!Object.hasOwn(RELEASE_CHANNELS, channel)) {
    throw new TypeError('El canal de FocusBuddy debe ser local o production.')
  }
  return RELEASE_CHANNELS[channel]
}

function createReleaseConfig(channel, apiBaseUrl) {
  releaseIdentity(channel)
  return {
    schemaVersion: 1,
    channel,
    apiBaseUrl: normalizeChannelApiUrl(apiBaseUrl, channel),
  }
}

function serializeReleaseConfig(config) {
  return `${JSON.stringify(createReleaseConfig(config.channel, config.apiBaseUrl), null, 2)}\n`
}

function configSha256(source) {
  return createHash('sha256').update(source).digest('hex')
}

function validatePackagedConfig(source, metadata) {
  if (
    !metadata ||
    metadata.schemaVersion !== 1 ||
    typeof metadata.configSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(metadata.configSha256)
  ) {
    throw new TypeError(
      'El instalador no incluye una identidad de canal verificable.',
    )
  }
  releaseIdentity(metadata.channel)
  if (
    typeof source !== 'string' ||
    configSha256(source) !== metadata.configSha256
  ) {
    throw new TypeError(
      'La configuración de FocusBuddy no coincide con el instalador.',
    )
  }
  let config
  try {
    config = JSON.parse(source)
  } catch {
    throw new TypeError('La configuración pública de FocusBuddy está dañada.')
  }
  if (
    !config ||
    config.schemaVersion !== 1 ||
    config.channel !== metadata.channel ||
    Object.keys(config).sort().join(',') !== 'apiBaseUrl,channel,schemaVersion'
  ) {
    throw new TypeError(
      'La configuración pública no corresponde al canal del instalador.',
    )
  }
  const validated = createReleaseConfig(config.channel, config.apiBaseUrl)
  if (serializeReleaseConfig(validated) !== source) {
    throw new TypeError(
      'La configuración pública de FocusBuddy no tiene el formato esperado.',
    )
  }
  return validated
}

function resolveRuntimeChannel({
  isPackaged = false,
  packagedConfigSource,
  packagedMetadata,
  commandLineValue,
  environmentValue,
} = {}) {
  const config = isPackaged
    ? validatePackagedConfig(packagedConfigSource, packagedMetadata)
    : {
        channel: 'local',
        apiBaseUrl: selectApiBaseUrl({ commandLineValue, environmentValue }),
      }
  return {
    ...releaseIdentity(config.channel),
    apiBaseUrl: config.apiBaseUrl,
    isDevelopment: !isPackaged,
  }
}

function channelDataPaths(
  identity,
  appDataDirectory,
  customDevelopmentDirectory,
) {
  const userData = customDevelopmentDirectory
    ? path.resolve(customDevelopmentDirectory)
    : path.join(
        appDataDirectory,
        `${identity.dataDirectoryName}${identity.isDevelopment ? ' Development' : ''}`,
      )
  return { userData, sessionData: path.join(userData, 'session') }
}

module.exports = {
  RELEASE_CHANNELS,
  releaseIdentity,
  createReleaseConfig,
  serializeReleaseConfig,
  configSha256,
  validatePackagedConfig,
  resolveRuntimeChannel,
  channelDataPaths,
}
