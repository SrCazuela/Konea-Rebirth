import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './base'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('bounded API requests', () => {
  it('ends an unresponsive read and aborts its transport without expiring the account', async () => {
    vi.useFakeTimers()
    const dispatchEvent = vi.fn()
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('window', { dispatchEvent })
    const failure = expect(apiRequest('/academic')).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    })
    await vi.advanceTimersByTimeAsync(20_000)
    await failure
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })

  it('also bounds a response whose body never finishes downloading', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () => new Promise(() => {}),
      }),
    )
    const failure = expect(apiRequest('/study/overview')).rejects.toMatchObject(
      { code: 'REQUEST_TIMEOUT' },
    )
    await vi.advanceTimersByTimeAsync(20_000)
    await failure
  })

  it('gives assistant generation its longer deadline while keeping writes bounded', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    let ended = false
    const request = apiRequest('/kuco/messages', { method: 'POST', body: '{}' })
    const failure = expect(
      request.finally(() => {
        ended = true
      }),
    ).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(ended).toBe(false)
    await vi.advanceTimersByTimeAsync(120_000)
    await failure
  })
})
