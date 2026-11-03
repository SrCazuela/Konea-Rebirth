import { isAbsolute, resolve } from 'node:path'
import { assertPublicDemoDatabase } from './public-demo-safety.js'

export type DemoConfiguration = {
  publicOrigin: string
  gateUser: string
  gatePassword: string
  apiHost: '127.0.0.1'
  apiPort: number
  uploadsDirectory: string
}

/** This entrypoint must never accidentally publish the normal development DB. */
export function readDemoConfiguration(
  environment: NodeJS.ProcessEnv,
  repositoryRoot: string,
): DemoConfiguration {
  if (environment.NODE_ENV !== 'production') {
    throw new Error('The public demo requires NODE_ENV=production.')
  }

  let publicUrl: URL
  try {
    publicUrl = new URL(environment.DEMO_PUBLIC_ORIGIN ?? '')
  } catch {
    throw new Error('DEMO_PUBLIC_ORIGIN must be an exact HTTPS origin.')
  }
  const isLocalTest =
    environment.DEMO_ALLOW_LOCAL_TEST === 'true' &&
    publicUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(publicUrl.hostname)
  const isCloudflareOrigin =
    publicUrl.protocol === 'https:' &&
    /^[a-z0-9-]+\.trycloudflare\.com$/.test(publicUrl.hostname) &&
    publicUrl.port === ''

  if (
    (!isLocalTest && !isCloudflareOrigin) ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.origin !== environment.DEMO_PUBLIC_ORIGIN
  ) {
    throw new Error(
      'DEMO_PUBLIC_ORIGIN must be an exact Cloudflare HTTPS origin.',
    )
  }
  if (environment.CORS_ORIGIN !== publicUrl.origin) {
    throw new Error('CORS_ORIGIN must match DEMO_PUBLIC_ORIGIN exactly.')
  }
  if (environment.API_HOST !== '127.0.0.1') {
    throw new Error('The public demo must bind only to API_HOST=127.0.0.1.')
  }
  if (environment.TRUST_PROXY_HOPS !== '1') {
    throw new Error('The Cloudflare demo requires TRUST_PROXY_HOPS=1.')
  }

  const apiPort = Number(environment.API_PORT ?? 4310)
  if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65_535) {
    throw new Error(
      'The demo API_PORT must be an integer between 1024 and 65535.',
    )
  }

  assertPublicDemoDatabase(environment.DATABASE_URL ?? '')

  const gateUser = environment.DEMO_GATE_USER ?? 'konea'
  const gatePassword = environment.DEMO_GATE_PASSWORD ?? ''
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(gateUser)) {
    throw new Error('DEMO_GATE_USER contains unsupported characters.')
  }
  if (
    gatePassword.length < 20 ||
    gatePassword.length > 256 ||
    /[\r\n\0]/.test(gatePassword)
  ) {
    throw new Error(
      'DEMO_GATE_PASSWORD must contain between 20 and 256 characters.',
    )
  }

  const uploadsDirectory = environment.UPLOAD_DIRECTORY ?? ''
  const expectedUploadsDirectory = resolve(
    repositoryRoot,
    '.local/public-demo/uploads',
  )
  if (
    !isAbsolute(uploadsDirectory) ||
    resolve(uploadsDirectory) !== expectedUploadsDirectory
  ) {
    throw new Error(
      'UPLOAD_DIRECTORY must be the exclusive .local/public-demo/uploads directory.',
    )
  }

  return {
    publicOrigin: publicUrl.origin,
    gateUser,
    gatePassword,
    apiHost: '127.0.0.1',
    apiPort,
    uploadsDirectory: expectedUploadsDirectory,
  }
}
