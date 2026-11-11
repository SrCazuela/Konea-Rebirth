import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, apiRequest } from './base'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('API response failures', () => {
  it('identifies an HTML Cloudflare 429 without retrying a login POST', async () => {
    const transport = vi.fn().mockResolvedValue(
      new Response('<html><title>Just a moment...</title></html>', {
        status: 429,
        headers: { 'Content-Type': 'text/html' },
      }),
    )
    vi.stubGlobal('fetch', transport)
    await expect(
      apiRequest('/auth/login', { method: 'POST', body: '{}' }),
    ).rejects.toMatchObject({
      status: 429,
      code: 'BACKEND_BUSY',
      message: expect.stringContaining('ocupado temporalmente'),
    })
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it.each([502, 503, 504])(
    'identifies a non-JSON upstream %s as backend unavailable',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('<html>Starting service</html>', {
            status,
            headers: { 'Content-Type': 'text/html' },
          }),
        ),
      )
      await expect(apiRequest('/health')).rejects.toMatchObject({
        status,
        code: 'BACKEND_UNAVAILABLE',
        message: expect.stringContaining('iniciando'),
      })
    },
  )

  it('rejects an HTML success page instead of returning an empty API result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>Loading...</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    await expect(apiRequest('/auth/me')).rejects.toMatchObject({
      status: 502,
      code: 'INVALID_BACKEND_RESPONSE',
    })
  })

  it('preserves an application JSON error code, message and field details', async () => {
    const fields = { identifier: ['Use a valid identifier'] }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 'TOO_MANY_ATTEMPTS',
              message: 'Application rate limit',
              details: { fields },
            },
          },
          { status: 429 },
        ),
      ),
    )
    await expect(apiRequest('/auth/login')).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
      message: 'Application rate limit',
      fields,
    })
  })

  it('keeps successful JSON and the session cookie transport', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(Response.json({ user: { id: '1' } }))
    vi.stubGlobal('fetch', transport)
    await expect(apiRequest('/auth/me')).resolves.toEqual({ user: { id: '1' } })
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
    })
  })

  it('accepts an empty 204 logout and retains explicit caller cancellation', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', transport)
    await expect(
      apiRequest('/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined()
    const abort = new AbortController()
    abort.abort()
    await apiRequest('/health', { signal: abort.signal })
    expect(transport.mock.calls[1]?.[1]?.signal.aborted).toBe(true)
  })

  it('still expires a session for an ordinary JSON 401', async () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'AUTHENTICATION_REQUIRED' } },
            { status: 401 },
          ),
        ),
    )
    await expect(apiRequest('/auth/me')).rejects.toBeInstanceOf(ApiClientError)
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0]?.[0]?.type).toBe('konea:session-expired')
  })
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
