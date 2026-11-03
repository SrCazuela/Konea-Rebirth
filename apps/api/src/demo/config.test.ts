import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readDemoConfiguration } from './config.js'

const repositoryRoot = resolve('demo-test-repository')
const configuration: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  DEMO_PUBLIC_ORIGIN: 'https://test-konea-demo.trycloudflare.com',
  CORS_ORIGIN: 'https://test-konea-demo.trycloudflare.com',
  API_HOST: '127.0.0.1',
  API_PORT: '4310',
  TRUST_PROXY_HOPS: '1',
  DATABASE_URL:
    'postgres://demo_user:demo_password@127.0.0.1:5432/konea_public_demo',
  UPLOAD_DIRECTORY: resolve(repositoryRoot, '.local/public-demo/uploads'),
  DEMO_GATE_PASSWORD: 'test-only-access-password-at-least-20',
}

describe('public demo configuration isolation', () => {
  it('accepts an isolated loopback server with an exact Cloudflare origin', () => {
    expect(readDemoConfiguration(configuration, repositoryRoot)).toMatchObject({
      apiPort: 4310,
      apiHost: '127.0.0.1',
      gateUser: 'konea',
      publicOrigin: configuration.DEMO_PUBLIC_ORIGIN,
    })
  })

  it.each([
    ['NODE_ENV', 'development'],
    ['API_HOST', '0.0.0.0'],
    ['API_PORT', '80'],
    ['TRUST_PROXY_HOPS', '0'],
    ['CORS_ORIGIN', '*'],
    ['CORS_ORIGIN', `${configuration.CORS_ORIGIN},https://evil.invalid`],
    ['DEMO_GATE_PASSWORD', 'admin'],
    ['DEMO_GATE_PASSWORD', ''],
    ['DEMO_GATE_USER', 'user:name'],
    ['DEMO_PUBLIC_ORIGIN', 'https://test-konea-demo.trycloudflare.com/'],
    ['DEMO_PUBLIC_ORIGIN', 'https://test-konea-demo.trycloudflare.com/path'],
    [
      'DEMO_PUBLIC_ORIGIN',
      'https://test-konea-demo.trycloudflare.com.evil.invalid',
    ],
    ['DEMO_PUBLIC_ORIGIN', 'http://localhost:4310'],
    ['DATABASE_URL', 'postgres://user:password@127.0.0.1:5432/konea'],
    [
      'DATABASE_URL',
      'postgres://user:password@external.invalid:5432/konea_public_demo',
    ],
    [
      'DATABASE_URL',
      'postgres://user:password@localhost:5432/konea_public_demo?database=konea',
    ],
    [
      'DATABASE_URL',
      'postgres://user:password@localhost:5432/konea_public_demo?host=external.invalid',
    ],
    ['UPLOAD_DIRECTORY', resolve(repositoryRoot, '.local/uploads')],
    ['UPLOAD_DIRECTORY', '.local/public-demo/uploads'],
  ])('rejects an unsafe %s override', (key, value) => {
    expect(() =>
      readDemoConfiguration({ ...configuration, [key]: value }, repositoryRoot),
    ).toThrow()
  })

  it('permits explicit local-only HTTP tests, never a non-loopback HTTP origin', () => {
    expect(
      readDemoConfiguration(
        {
          ...configuration,
          DEMO_ALLOW_LOCAL_TEST: 'true',
          DEMO_PUBLIC_ORIGIN: 'http://localhost:4310',
          CORS_ORIGIN: 'http://localhost:4310',
        },
        repositoryRoot,
      ).publicOrigin,
    ).toBe('http://localhost:4310')
    expect(() =>
      readDemoConfiguration(
        {
          ...configuration,
          DEMO_ALLOW_LOCAL_TEST: 'true',
          DEMO_PUBLIC_ORIGIN: 'http://demo.example.com',
          CORS_ORIGIN: 'http://demo.example.com',
        },
        repositoryRoot,
      ),
    ).toThrow()
  })
})
