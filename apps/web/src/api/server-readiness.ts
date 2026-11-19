import { ApiClientError, apiRequest } from './base'

export const MAX_SERVER_STARTUP_WAIT_MS = 90_000
const CHECK_INTERVAL_MS = 5_000

export type ServerReadinessOptions = {
  signal?: AbortSignal
  onWaiting?: () => void
  timeoutMs?: number
}

function cancellationReason(signal: AbortSignal) {
  return signal.reason instanceof ApiClientError
    ? signal.reason
    : new DOMException('La espera fue cancelada.', 'AbortError')
}

function cancellable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(cancellationReason(signal))
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
    pending.then(
      (value) => {
        signal.removeEventListener('abort', cancel)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', cancel)
        reject(error)
      },
    )
  })
}

function waitBetweenChecks(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer)
      reject(cancellationReason(signal))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, CHECK_INTERVAL_MS)
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted) cancel()
  })
}

function canWaitFor(error: unknown) {
  if (error instanceof TypeError) return true
  return (
    error instanceof ApiClientError &&
    [
      'BACKEND_STARTING',
      'BACKEND_BUSY',
      'BACKEND_UNAVAILABLE',
      'INVALID_BACKEND_RESPONSE',
      'REQUEST_TIMEOUT',
    ].includes(error.code)
  )
}

// Only the safe readiness GET is retried. Authentication writes remain outside
// this loop and are sent once after a valid JSON health response.
export async function waitForServerReady(options: ServerReadinessOptions = {}) {
  const controller = new AbortController()
  const externalCancel = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', externalCancel, { once: true })
  if (options.signal?.aborted) externalCancel()
  const hostname = typeof window === 'object' ? window.location?.hostname : ''
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(
    hostname ?? '',
  )
  const budget = Math.min(
    MAX_SERVER_STARTUP_WAIT_MS,
    Math.max(
      1,
      options.timeoutMs ?? (local ? 20_000 : MAX_SERVER_STARTUP_WAIT_MS),
    ),
  )
  const deadline = setTimeout(() => {
    controller.abort(
      new ApiClientError(
        503,
        'BACKEND_STARTING',
        'El servidor sigue iniciando. Espera un momento e inténtalo de nuevo.',
      ),
    )
  }, budget)
  let announcedWait = false

  try {
    while (true) {
      if (controller.signal.aborted) throw cancellationReason(controller.signal)
      try {
        const health = await cancellable(
          apiRequest<{ status: string }>('/health', {
            signal: controller.signal,
          }),
          controller.signal,
        )
        if (health?.status === 'ok') return
        throw new ApiClientError(
          503,
          'BACKEND_STARTING',
          'El servidor está iniciando.',
        )
      } catch (error) {
        if (controller.signal.aborted)
          throw cancellationReason(controller.signal)
        if (!canWaitFor(error)) throw error
        if (!announcedWait) {
          announcedWait = true
          options.onWaiting?.()
        }
        await waitBetweenChecks(controller.signal)
      }
    }
  } finally {
    clearTimeout(deadline)
    options.signal?.removeEventListener('abort', externalCancel)
  }
}
