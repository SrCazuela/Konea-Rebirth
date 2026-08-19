import { useEffect, useRef, useState } from 'react'
import './QrScanner.css'

type QrScannerProps = {
  onDetected: (code: string) => void
  onClose: () => void
}

type DetectedBarcode = { rawValue: string }
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}

function extractKoneaCode(value: string) {
  const normalized = value.trim().toUpperCase()
  const match = normalized.match(/(?:^|KONEA:)([A-Z0-9]{6})$/)
  return match?.[1] ?? null
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'El navegador no tiene permiso para usar la cámara.'
    }
    if (error.name === 'NotFoundError') {
      return 'No encontramos una cámara disponible en este equipo.'
    }
  }
  return 'No pudimos iniciar la cámara. Puedes ingresar el código manualmente.'
}

export function QrScanner({ onDetected, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const detectedRef = useRef(false)
  const onDetectedRef = useRef(onDetected)
  const [status, setStatus] = useState<'starting' | 'scanning' | 'error'>(
    'starting',
  )
  const [error, setError] = useState('')

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    let cancelled = false

    const stop = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    const start = async () => {
      const Detector = (
        window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }
      ).BarcodeDetector

      if (!window.isSecureContext && window.location.hostname !== 'localhost') {
        setStatus('error')
        setError(
          'La cámara requiere HTTPS. Usa el código manual como alternativa.',
        )
        return
      }
      if (!navigator.mediaDevices?.getUserMedia || !Detector) {
        setStatus('error')
        setError(
          'Este navegador no admite lectura QR desde la cámara. Usa el código manual.',
        )
        return
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' } },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setStatus('scanning')

        const detector = new Detector({ formats: ['qr_code'] })
        const scan = async () => {
          if (cancelled || detectedRef.current) return
          try {
            const barcodes = await detector.detect(video)
            for (const barcode of barcodes) {
              const code = extractKoneaCode(barcode.rawValue)
              if (code) {
                detectedRef.current = true
                stop()
                onDetectedRef.current(code)
                return
              }
            }
          } catch {
            // Some browsers throw while the video is warming up; keep scanning.
          }
          timerRef.current = window.setTimeout(() => void scan(), 350)
        }
        void scan()
      } catch (cameraError) {
        if (!cancelled) {
          setStatus('error')
          setError(cameraErrorMessage(cameraError))
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      stop()
    }
  }, [])

  return (
    <div className="qr-scanner-backdrop" role="presentation">
      <section
        className="qr-scanner-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-scanner-title"
      >
        <header>
          <div>
            <span>Conexión Konea</span>
            <h2 id="qr-scanner-title">Escanear código QR</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar escáner">
            ×
          </button>
        </header>

        <div className="qr-scanner-viewport">
          <video
            ref={videoRef}
            muted
            playsInline
            aria-label="Vista de la cámara"
          />
          {status === 'scanning' && (
            <div className="qr-scanner-frame" aria-hidden="true">
              <span />
            </div>
          )}
          {status === 'starting' && (
            <div className="qr-scanner-state" role="status">
              <span className="qr-scanner-spinner" aria-hidden="true" />
              Iniciando cámara…
            </div>
          )}
          {status === 'error' && (
            <div
              className="qr-scanner-state qr-scanner-state--error"
              role="alert"
            >
              <strong>Cámara no disponible</strong>
              <p>{error}</p>
            </div>
          )}
        </div>

        <p className="qr-scanner-help">
          Centra el código de seis caracteres dentro del recuadro. La cámara se
          apaga automáticamente al cerrar esta ventana.
        </p>
        <button className="qr-scanner-cancel" type="button" onClick={onClose}>
          Usar código manual
        </button>
      </section>
    </div>
  )
}
