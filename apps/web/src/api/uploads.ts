import { ApiClientError } from './auth'

const apiBaseUrl = (import.meta.env.VITE_API_URL || '/api/v1').replace(
  /\/$/,
  '',
)

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export type UploadedFile = {
  name: string
  originalName: string
  mimeType: string
  size: number
  url: string
}

type ErrorEnvelope = {
  error?: {
    code?: string
    message?: string
    details?: {
      fields?: Record<string, string[] | undefined>
    }
  }
}

function uploadError(xhr: XMLHttpRequest) {
  let body: ErrorEnvelope = {}
  if (xhr.response && typeof xhr.response === 'object') {
    body = xhr.response as ErrorEnvelope
  } else {
    try {
      body = JSON.parse(xhr.responseText) as ErrorEnvelope
    } catch {
      // La respuesta puede no ser JSON si se interrumpe el servidor.
    }
  }

  return new ApiClientError(
    xhr.status,
    body.error?.code ?? 'UPLOAD_FAILED',
    body.error?.message ?? 'No pudimos subir la imagen.',
    body.error?.details?.fields,
  )
}

export function validateImage(file: File) {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Usa una imagen JPEG, PNG, WebP o GIF.'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'La imagen no puede superar los 5 MB.'
  }
  return null
}

export function uploadImage(
  file: File,
  onProgress?: (progress: number) => void,
) {
  const validationError = validateImage(file)
  if (validationError) return Promise.reject(new Error(validationError))

  return new Promise<UploadedFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${apiBaseUrl}/uploads/files`)
    xhr.withCredentials = true
    xhr.responseType = 'json'

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status === 401) {
        window.dispatchEvent(new Event('konea:session-expired'))
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(uploadError(xhr))
        return
      }

      const response = xhr.response as {
        file?: UploadedFile
      }
      if (!response.file) {
        reject(new Error('El servidor no devolvió la imagen subida.'))
        return
      }
      onProgress?.(100)
      resolve(response.file)
    })
    xhr.addEventListener('error', () =>
      reject(new Error('No pudimos conectar con el servicio de archivos.')),
    )
    xhr.addEventListener('abort', () =>
      reject(new Error('La carga de la imagen fue cancelada.')),
    )

    const data = new FormData()
    data.append('file', file)
    xhr.send(data)
  })
}

export function absoluteUploadUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url
  const apiOrigin = /^https?:\/\//i.test(apiBaseUrl)
    ? new URL(apiBaseUrl).origin
    : window.location.origin
  return new URL(url, apiOrigin).toString()
}
