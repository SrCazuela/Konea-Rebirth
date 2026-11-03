import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, changePassword, logout, updateAccount } from './auth'

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('account settings API', () => {
  it('updates the authenticated account using its session cookie', async () => {
    const user = {
      id: 'user-1',
      username: 'updated.user',
      email: 'updated@example.test',
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user }))
    vi.stubGlobal('fetch', fetchMock)
    const input = {
      displayName: 'Updated User',
      username: 'updated.user',
      email: 'updated@example.test',
      currentPassword: 'current-secret',
    }
    expect(await updateAccount(input)).toEqual(user)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/account',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify(input),
      }),
    )
  })

  it('changes the password through an authenticated POST without a user id or confirmation field', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ message: 'Contraseña actualizada.' }))
    vi.stubGlobal('fetch', fetchMock)
    const input = {
      currentPassword: 'current-secret',
      newPassword: 'new-secret-password',
    }
    expect(await changePassword(input)).toEqual({
      message: 'Contraseña actualizada.',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/password',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(input),
      }),
    )
  })

  it('reports an incorrect current password without expiring the valid login', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'CURRENT_PASSWORD_INCORRECT',
              message: 'La contraseña actual no es correcta.',
            },
          },
          400,
        ),
      ),
    )
    await expect(
      changePassword({
        currentPassword: 'wrong-secret',
        newPassword: 'new-secret-password',
      }),
    ).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 400,
      code: 'CURRENT_PASSWORD_INCORRECT',
    })
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('preserves account uniqueness errors for an actionable form message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'ACCOUNT_ALREADY_EXISTS',
              message: 'Correo o usuario en uso.',
            },
          },
          409,
        ),
      ),
    )
    await expect(
      updateAccount({
        displayName: 'Updated User',
        username: 'taken',
        email: 'taken@example.test',
        currentPassword: 'current-secret',
      }),
    ).rejects.toBeInstanceOf(ApiClientError)
  })

  it('closes the current session through the server before the UI clears it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(logout()).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )
  })
})
