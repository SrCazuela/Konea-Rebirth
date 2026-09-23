const path = require('node:path')
const { FUSE_POLICY } = require('./fuse-policy.cjs')

module.exports = async function hardenPackagedElectron(context) {
  const { FuseV1Options, FuseVersion, flipFuses } =
    await import('@electron/fuses')
  const extension = {
    darwin: '.app',
    mas: '.app',
    win32: '.exe',
    linux: '',
  }[context.electronPlatformName]
  if (extension === undefined) {
    throw new Error(
      `Plataforma Electron no compatible: ${context.electronPlatformName}`,
    )
  }

  const executableName = context.packager.appInfo.productFilename
  const executablePath = path.join(
    context.appOutDir,
    `${executableName}${extension}`,
  )
  const config = {
    version: FuseVersion.V1,
    strictlyRequireAllFuses: true,
  }

  for (const [name, state] of Object.entries(FUSE_POLICY)) {
    const fuse = FuseV1Options[name]
    if (typeof fuse !== 'number') {
      throw new Error(`@electron/fuses no reconoce ${name}.`)
    }
    config[fuse] = state
  }

  await flipFuses(executablePath, config)
}
