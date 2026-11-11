const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { createPackage } = require('@electron/asar')
const {
  releaseIdentity,
  createReleaseConfig,
  serializeReleaseConfig,
  configSha256,
  validatePackagedConfig,
  resolveRuntimeChannel,
  channelDataPaths,
} = require('./release-channel.cjs')
const { DEFAULT_API_BASE_URL } = require('./api-url.cjs')
const {
  releaseConfigForEnvironment,
  prepareReleaseConfig,
} = require('../scripts/prepare-release-config.cjs')
const { developmentLaunchOptions } = require('../scripts/run-development.cjs')
const {
  parseBuildArguments,
  builderConfigForChannel,
} = require('../scripts/build-release.cjs')
const {
  verifyPackagedReleaseConfig,
  writeInstallerChecksums,
} = require('../scripts/verify-release.cjs')

function preparedConfig(channel, apiBaseUrl) {
  const config = createReleaseConfig(channel, apiBaseUrl)
  const source = serializeReleaseConfig(config)
  return {
    config,
    source,
    metadata: { schemaVersion: 1, channel, configSha256: configSha256(source) },
  }
}

function temporaryDirectory(context) {
  const directory = mkdtempSync(path.join(tmpdir(), 'konea-release-channel-'))
  context.after(() => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()))
    assert.match(path.basename(directory), /^konea-release-channel-/)
    rmSync(directory, { recursive: true, force: true })
  })
  return directory
}

describe('FocusBuddy release channels', () => {
  it('isolates installed app identities, protocols, preferences and cookies', () => {
    const local = releaseIdentity('local')
    const official = releaseIdentity('production')
    for (const field of [
      'appId',
      'productName',
      'dataDirectoryName',
      'partition',
      'protocol',
      'artifactName',
    ]) {
      assert.notEqual(local[field], official[field], field)
    }
    assert.equal(local.protocol, 'konea-focusbuddy-local')
    assert.equal(official.protocol, 'konea-focusbuddy')
    const localPaths = channelDataPaths(local, path.resolve('app-data'))
    const officialPaths = channelDataPaths(official, path.resolve('app-data'))
    assert.notEqual(localPaths.userData, officialPaths.userData)
    assert.notEqual(localPaths.sessionData, officialPaths.sessionData)
    assert.notEqual(path.basename(officialPaths.userData), 'Konea FocusBuddy')
    assert.throws(() => releaseIdentity('__proto__'))
    assert.throws(() => releaseIdentity('staging'))
  })

  it('requires an explicit official HTTPS URL and never derives it from a web URL', () => {
    assert.throws(() =>
      releaseConfigForEnvironment('production', { environment: {} }),
    )
    assert.throws(() =>
      releaseConfigForEnvironment('production', {
        environment: { FOCUSBUDDY_APP_URL: 'https://web.example' },
      }),
    )
    assert.throws(() => createReleaseConfig('production', DEFAULT_API_BASE_URL))
    assert.equal(
      releaseConfigForEnvironment('production', {
        environment: {
          FOCUSBUDDY_API_URL: 'https://api.konea.example/api/v1/',
        },
      }).apiBaseUrl,
      'https://api.konea.example/api/v1',
    )
    assert.equal(
      releaseConfigForEnvironment('local', {
        environment: {
          FOCUSBUDDY_API_URL: 'https://previous-build.example/api/v1',
        },
      }).apiBaseUrl,
      DEFAULT_API_BASE_URL,
    )
    assert.throws(() =>
      releaseConfigForEnvironment('local', {
        apiUrl: 'https://remote.example/api/v1',
        environment: {},
      }),
    )
  })

  it('forces development to local and ignores previous packaged configuration and legacy app URLs', () => {
    const official = preparedConfig(
      'production',
      'https://api.konea.example/api/v1',
    )
    const runtime = resolveRuntimeChannel({
      isPackaged: false,
      packagedConfigSource: official.source,
      packagedMetadata: official.metadata,
    })
    assert.equal(runtime.channel, 'local')
    assert.equal(runtime.apiBaseUrl, DEFAULT_API_BASE_URL)
    assert.equal(runtime.isDevelopment, true)
    assert.notEqual(
      channelDataPaths(runtime, path.resolve('app-data')).userData,
      channelDataPaths(releaseIdentity('local'), path.resolve('app-data'))
        .userData,
    )
    const launch = developmentLaunchOptions(
      ['--channel=production', '--app-url=https://remote.example/#focusbuddy'],
      {
        FOCUSBUDDY_API_URL: official.config.apiBaseUrl,
        ELECTRON_RUN_AS_NODE: '1',
        FOCUSBUDDY_APP_URL: 'https://remote.example',
        FOCUSBUDDY_RELEASE_CHANNEL: 'production',
      },
    )
    assert.deepEqual(launch.arguments, [`--api-url=${DEFAULT_API_BASE_URL}`])
    assert.equal(launch.environment.FOCUSBUDDY_API_URL, DEFAULT_API_BASE_URL)
    assert.equal(launch.environment.ELECTRON_RUN_AS_NODE, undefined)
    assert.equal(launch.environment.FOCUSBUDDY_APP_URL, undefined)
    assert.equal(launch.environment.FOCUSBUDDY_RELEASE_CHANNEL, undefined)
    assert.throws(() =>
      developmentLaunchOptions(['--api-url=https://remote.example/api/v1'], {}),
    )
    assert.equal(
      developmentLaunchOptions([], {
        FOCUSBUDDY_API_URL: 'http://localhost:3099/api/v1',
      }).environment.FOCUSBUDDY_API_URL,
      'http://localhost:3099/api/v1',
    )
  })

  it('anchors packaged config to its ASAR hash and ignores runtime overrides', () => {
    for (const [channel, api] of [
      ['local', DEFAULT_API_BASE_URL],
      ['production', 'https://api.konea.example/api/v1'],
    ]) {
      const prepared = preparedConfig(channel, api)
      const runtime = resolveRuntimeChannel({
        isPackaged: true,
        packagedConfigSource: prepared.source,
        packagedMetadata: prepared.metadata,
        commandLineValue: 'https://phishing.example/api/v1',
        environmentValue: DEFAULT_API_BASE_URL,
      })
      assert.equal(runtime.apiBaseUrl, api)
      assert.equal(runtime.channel, channel)
      assert.throws(() =>
        validatePackagedConfig(prepared.source + '\n', prepared.metadata),
      )
      assert.throws(() =>
        validatePackagedConfig(prepared.source, {
          ...prepared.metadata,
          channel: channel === 'local' ? 'production' : 'local',
        }),
      )
      assert.throws(() =>
        resolveRuntimeChannel({
          isPackaged: true,
          environmentValue: DEFAULT_API_BASE_URL,
        }),
      )
    }
    const invalid = JSON.stringify({
      schemaVersion: 1,
      channel: 'production',
      apiBaseUrl: DEFAULT_API_BASE_URL,
    })
    assert.throws(() =>
      validatePackagedConfig(invalid, {
        schemaVersion: 1,
        channel: 'production',
        configSha256: configSha256(invalid),
      }),
    )
  })

  it('writes separate resources and produces deterministic channel build options', (context) => {
    const directory = temporaryDirectory(context)
    const local = prepareReleaseConfig('local', {
      applicationDirectory: directory,
      environment: {},
    })
    const official = prepareReleaseConfig('production', {
      applicationDirectory: directory,
      environment: {},
      apiUrl: 'https://api.konea.example/api/v1',
    })
    assert.notEqual(local.configPath, official.configPath)
    assert.deepEqual(
      JSON.parse(readFileSync(local.configPath, 'utf8')),
      local.config,
    )
    assert.deepEqual(
      JSON.parse(readFileSync(official.configPath, 'utf8')),
      official.config,
    )
    for (const [channel, prepared] of [
      ['local', local],
      ['production', official],
    ]) {
      const config = builderConfigForChannel(channel, prepared)
      const identity = releaseIdentity(channel)
      assert.equal(config.appId, identity.appId)
      assert.equal(config.productName, identity.productName)
      assert.deepEqual(config.protocols[0].schemes, [identity.protocol])
      assert.equal(config.directories.output, `release/${channel}`)
      assert.equal(
        config.extraResources[0].from,
        `build/${channel}/focusbuddy.config.json`,
      )
      assert.equal(
        config.extraMetadata.focusbuddyRelease.configSha256,
        configSha256(readFileSync(prepared.configPath)),
      )
    }
    assert.deepEqual(
      parseBuildArguments([
        '--channel=production',
        '--target=dir',
        '--api-url=https://api.konea.example/api/v1',
      ]),
      {
        channel: 'production',
        target: 'dir',
        apiUrl: 'https://api.konea.example/api/v1',
      },
    )
    assert.throws(() =>
      parseBuildArguments(['--channel=production', '--channel=local']),
    )
    assert.throws(() => parseBuildArguments(['--config=arbitrary.json']))
  })

  it('verifies a real ASAR config against the requested channel and rejects replacements', async (context) => {
    const directory = temporaryDirectory(context)
    const appDirectory = path.join(directory, 'app')
    mkdirSync(appDirectory)
    const prepared = preparedConfig(
      'production',
      'https://api.konea.example/api/v1',
    )
    writeFileSync(
      path.join(appDirectory, 'package.json'),
      JSON.stringify({ focusbuddyRelease: prepared.metadata }),
    )
    const archive = path.join(directory, 'fixture.asar')
    await createPackage(appDirectory, archive)
    const configPath = path.join(directory, 'focusbuddy.config.json')
    const expectedPath = path.join(directory, 'expected.json')
    writeFileSync(configPath, prepared.source)
    writeFileSync(expectedPath, prepared.source)
    assert.deepEqual(
      verifyPackagedReleaseConfig(
        archive,
        configPath,
        'production',
        expectedPath,
      ),
      prepared.config,
    )
    assert.throws(() =>
      verifyPackagedReleaseConfig(archive, configPath, 'local', expectedPath),
    )
    writeFileSync(
      expectedPath,
      serializeReleaseConfig(
        createReleaseConfig('production', 'https://other.example/api/v1'),
      ),
    )
    assert.throws(() =>
      verifyPackagedReleaseConfig(
        archive,
        configPath,
        'production',
        expectedPath,
      ),
    )
    writeFileSync(
      configPath,
      serializeReleaseConfig(
        createReleaseConfig('local', DEFAULT_API_BASE_URL),
      ),
    )
    assert.throws(() =>
      verifyPackagedReleaseConfig(archive, configPath, 'production'),
    )
  })

  it('copies the official stable filename with reproducible checksums only inside its output', (context) => {
    const directory = temporaryDirectory(context)
    const installer = path.join(directory, 'Konea-FocusBuddy-0.1.1-x64.exe')
    const bytes = Buffer.from('installer-checksum-fixture')
    writeFileSync(installer, bytes)
    writeInstallerChecksums(installer, {
      channel: 'production',
      version: '0.1.1',
    })
    const stable = path.join(directory, 'Konea-FocusBuddy-Windows-x64.exe')
    assert.deepEqual(readFileSync(stable), bytes)
    assert.equal(
      readFileSync(`${stable}.sha256`, 'utf8'),
      `${configSha256(bytes)}  Konea-FocusBuddy-Windows-x64.exe\n`,
    )
    assert.match(
      readFileSync(path.join(directory, 'SHA256SUMS.txt'), 'utf8'),
      /Konea-FocusBuddy-0\.1\.1-x64\.exe/,
    )
  })
})
