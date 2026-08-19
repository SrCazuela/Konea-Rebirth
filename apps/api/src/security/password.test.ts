import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

describe('password security', () => {
  it('hashes and verifies a password without storing the original value', async () => {
    const password = 'CampusSeguro2026!'
    const encodedHash = await hashPassword(password)

    expect(encodedHash).not.toContain(password)
    await expect(verifyPassword(password, encodedHash)).resolves.toBe(true)
  })

  it('rejects an incorrect password and malformed hashes', async () => {
    const encodedHash = await hashPassword('CorrectPassword2026!')

    await expect(
      verifyPassword('IncorrectPassword', encodedHash),
    ).resolves.toBe(false)
    await expect(verifyPassword('anything', 'invalid-hash')).resolves.toBe(
      false,
    )
  })
})
