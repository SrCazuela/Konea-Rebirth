import { describe, expect, it } from 'vitest'
import {
  assertPublicDemoDatabase,
  assertPublicDemoPasswords,
} from './public-demo-safety.js'

describe('public demo database guard', () => {
  it.each([
    ['postgres://demo:secret@localhost/konea_public_demo', 'konea_public_demo'],
    [
      'postgresql://demo:secret@127.0.0.1:55435/konea_public_demo_20261021',
      'konea_public_demo_20261021',
    ],
    ['postgres://demo:secret@[::1]/konea_public_demo', 'konea_public_demo'],
  ])('allows the dedicated local database: %s', (url, expected) => {
    expect(assertPublicDemoDatabase(url)).toBe(expected)
  })

  it.each([
    'not a URL',
    'postgres://demo:secret@localhost/konea',
    'postgres://demo:secret@localhost/konea_public_demo_personal/other',
    'postgres://demo:secret@remote.example/konea_public_demo',
    'postgres://demo:secret@127.0.0.1.example.com/konea_public_demo',
    'https://localhost/konea_public_demo',
    'postgres://localhost/konea_public_demo?host=remote.example',
    'postgres://localhost/konea_public_demo?database=konea',
    'postgres://localhost/konea_public_demo#personal',
    'postgres://localhost/konea_public_demo_%ZZ',
  ])('refuses personal, remote or ambiguous targets: %s', (url) => {
    expect(() => assertPublicDemoDatabase(url)).toThrow()
  })
})

describe('public demo credentials guard', () => {
  const safe = {
    adminPassword: 'Unique-Admin-Password-2026',
    studentPassword: 'Unique-Student-Password-2026',
  }

  it('accepts separate long credentials without generating or logging them', () => {
    expect(assertPublicDemoPasswords(safe)).toEqual(safe)
  })

  it.each([undefined, '', 'admin', '123456789', ' LeadingWhitespace2026'])(
    'refuses missing or weak credentials',
    (adminPassword) => {
      expect(() =>
        assertPublicDemoPasswords({ ...safe, adminPassword }),
      ).toThrow()
    },
  )

  it('refuses using the same password for both roles', () => {
    expect(() =>
      assertPublicDemoPasswords({
        ...safe,
        studentPassword: safe.adminPassword,
      }),
    ).toThrow()
  })
})
