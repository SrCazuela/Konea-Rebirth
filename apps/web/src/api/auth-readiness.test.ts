import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { login, register } from './auth'
import { MAX_SERVER_STARTUP_WAIT_MS } from './server-readiness'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', {
    location: { hostname: 'demo.chatgpt.site' },
    dispatchEvent: vi.fn(),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const credentials = { identifier: 'demo', password: 'test-password' }
const registration = {
  email: 'demo@example.test',
  username: 'demo',
  displayName: 'Demo',
  password: 'test-password',
}

describe('authentication after server readiness', () => {
  it('sends a healthy local login immediately after one safe health check', async () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
      dispatchEvent: vi.fn(),
    })
    const transport = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'ok' }))
      .mockResolvedValueOnce(Response.json({ user: { id: 'account' } }))
    vi.stubGlobal('fetch', transport)
    const onWaiting = vi.fn()
    const onReady = vi.fn()
    await expect(login(credentials, { onWaiting, onReady })).resolves.toEqual({
      id: 'account',
    })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/health',
      '/api/v1/auth/login',
    ])
    expect(transport.mock.calls[1]?.[1]?.method).toBe('POST')
    expect(onWaiting).not.toHaveBeenCalled()
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('waits through cold-start GET failures and sends the login POST only once', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>Starting service</html>', { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: { code: 'BACKEND_STARTING' } }, { status: 503 }),
      )
      .mockResolvedValueOnce(Response.json({ status: 'ok' }))
      .mockResolvedValueOnce(
        Response.json(
          { error: { code: 'INVALID_CREDENTIALS' } },
          { status: 401 },
        ),
      )
    vi.stubGlobal('fetch', transport)
    const onWaiting = vi.fn()
    const failure = expect(
      login(credentials, { onWaiting }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    await vi.advanceTimersByTimeAsync(10_000)
    await failure
    await vi.advanceTimersByTimeAsync(100_000)
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/health',
      '/api/v1/health',
      '/api/v1/health',
      '/api/v1/auth/login',
    ])
    expect(onWaiting).toHaveBeenCalledTimes(1)
  })

  it('bounds an unavailable hosted server to ninety seconds and never sends credentials', async () => {
    const transport = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json(
            { error: { code: 'BACKEND_STARTING' } },
            { status: 503 },
          ),
        ),
      )
    vi.stubGlobal('fetch', transport)
    const failure = expect(
      login(credentials, { timeoutMs: MAX_SERVER_STARTUP_WAIT_MS * 10 }),
    ).rejects.toMatchObject({ code: 'BACKEND_STARTING', status: 503 })
    await vi.advanceTimersByTimeAsync(MAX_SERVER_STARTUP_WAIT_MS)
    await failure
    expect(transport.mock.calls.length).toBeGreaterThan(1)
    expect(transport.mock.calls.length).toBeLessThanOrEqual(20)
    expect(
      transport.mock.calls.every(([url]) => url === '/api/v1/health'),
    ).toBe(true)
  })

  it('cancels between readiness checks without sending a registration', async () => {
    const transport = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          Response.json(
            { error: { code: 'BACKEND_STARTING' } },
            { status: 503 },
          ),
        ),
      )
    vi.stubGlobal('fetch', transport)
    const controller = new AbortController()
    const failure = expect(
      register(registration, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(0)
    expect(transport).toHaveBeenCalledTimes(1)
    controller.abort()
    await failure
    await vi.advanceTimersByTimeAsync(100_000)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[0]).toBe('/api/v1/health')
  })

  it('cancels even if a health response body never settles', async () => {
    const transport = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: () => new Promise(() => {}),
    })
    vi.stubGlobal('fetch', transport)
    const controller = new AbortController()
    const failure = expect(
      login(credentials, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await failure
    expect(transport.mock.calls[0]?.[1]?.signal.aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(100_000)
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it('registers once after successful readiness without retrying the POST', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: 'ok' }))
      .mockResolvedValueOnce(Response.json({ user: { id: 'created-account' } }))
    vi.stubGlobal('fetch', transport)
    await expect(register(registration)).resolves.toEqual({
      id: 'created-account',
    })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/health',
      '/api/v1/auth/register',
    ])
    expect(transport.mock.calls[1]?.[1]?.method).toBe('POST')
  })

  it('preserves an application rate limit and stops without issuing a login POST', async () => {
    const transport = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { error: { code: 'TOO_MANY_ATTEMPTS' } },
          { status: 429 },
        ),
      )
    vi.stubGlobal('fetch', transport)
    await expect(login(credentials)).rejects.toMatchObject({
      code: 'TOO_MANY_ATTEMPTS',
    })
    expect(transport).toHaveBeenCalledTimes(1)
  })
})
