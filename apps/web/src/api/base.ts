export const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export type ErrorEnvelope = {
  error?: {
    code?: string
    message?: string
    details?: {
      fields?: Record<string, string[] | undefined>
    }
  }
}

export class ApiClientError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string[] | undefined>

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[] | undefined>,
  ) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit) {
  const hasJsonBody = init?.body && !(init.body instanceof FormData)
  const method = init?.method?.toUpperCase() ?? 'GET'
  const timeoutMs =
    path === '/kuco/messages' && method === 'POST'
      ? 150_000
      : method === 'GET' || method === 'HEAD'
        ? 20_000
        : 30_000
  const controller = new AbortController()
  const cancel = () => controller.abort(init?.signal?.reason)
  if (init?.signal?.aborted) cancel()
  else init?.signal?.addEventListener('abort', cancel, { once: true })
  let timeout: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(
        new ApiClientError(
          0,
          'REQUEST_TIMEOUT',
          'El servidor tardó demasiado en responder. Actualiza para comprobar el estado antes de reintentar.',
        ),
      )
      controller.abort()
    }, timeoutMs)
  })
  const request = async () => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: 'include',
      headers: {
        ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })

    if (response.status === 401) {
      window.dispatchEvent(new Event('konea:session-expired'))
    }

    if (response.status === 204) return undefined as T

    const body = (await response.json().catch(() => ({}))) as T & ErrorEnvelope

    if (!response.ok) {
      throw new ApiClientError(
        response.status,
        body.error?.code ?? 'REQUEST_FAILED',
        body.error?.message ?? 'No pudimos completar la solicitud.',
        body.error?.details?.fields,
      )
    }

    return body
  }
  try {
    return await Promise.race([request(), deadline])
  } finally {
    clearTimeout(timeout!)
    init?.signal?.removeEventListener('abort', cancel)
  }
}
