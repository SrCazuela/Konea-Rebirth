import { useEffect, useRef, useState } from 'react'

type ImageCropDialogProps = {
  file: File
  variant: 'avatar' | 'cover'
  onCancel: () => void
  onConfirm: (file: File) => void
}

type Size = { width: number; height: number }
type Point = { x: number; y: number }

const outputSize = {
  avatar: { width: 800, height: 800 },
  cover: { width: 1500, height: 500 },
} as const

export function ImageCropDialog({
  file,
  variant,
  onCancel,
  onConfirm,
}: ImageCropDialogProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    start: Point
    offset: Point
  } | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [naturalSize, setNaturalSize] = useState<Size>({ width: 0, height: 0 })
  const [viewportSize, setViewportSize] = useState<Size>({
    width: 0,
    height: 0,
  })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const update = () =>
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const baseScale =
    naturalSize.width && viewportSize.width
      ? Math.max(
          viewportSize.width / naturalSize.width,
          viewportSize.height / naturalSize.height,
        )
      : 1
  const scale = baseScale * zoom
  const displayed = {
    width: naturalSize.width * scale,
    height: naturalSize.height * scale,
  }
  const limit = {
    x: Math.max(0, (displayed.width - viewportSize.width) / 2),
    y: Math.max(0, (displayed.height - viewportSize.height) / 2),
  }
  const clamp = (point: Point): Point => ({
    x: Math.max(-limit.x, Math.min(limit.x, point.x)),
    y: Math.max(-limit.y, Math.min(limit.y, point.y)),
  })

  useEffect(() => {
    setOffset((current) => clamp(current))
    // The limits intentionally recalculate when the viewport, image or zoom changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    displayed.width,
    displayed.height,
    viewportSize.width,
    viewportSize.height,
  ])

  const createCroppedFile = async () => {
    const image = imageRef.current
    if (!image || !naturalSize.width || !viewportSize.width) return
    const target = outputSize[variant]
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) return

    const displayedLeft = (viewportSize.width - displayed.width) / 2 + offset.x
    const displayedTop = (viewportSize.height - displayed.height) / 2 + offset.y
    const sourceX = Math.max(0, -displayedLeft / scale)
    const sourceY = Math.max(0, -displayedTop / scale)
    const sourceWidth = Math.min(
      naturalSize.width - sourceX,
      viewportSize.width / scale,
    )
    const sourceHeight = Math.min(
      naturalSize.height - sourceY,
      viewportSize.height / scale,
    )

    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      target.width,
      target.height,
    )
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9),
    )
    if (!blob) return
    const baseName = file.name.replace(/\.[^.]+$/, '') || variant
    onConfirm(
      new File([blob], `${baseName}-${variant}.jpg`, { type: 'image/jpeg' }),
    )
  }

  return (
    <div className="portal-image-crop-backdrop" role="presentation">
      <section
        className="portal-image-crop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-crop-title"
      >
        <div className="portal-image-crop-dialog__heading">
          <div>
            <span className="portal-card-kicker">Ajustar imagen</span>
            <h2 id="profile-crop-title">
              {variant === 'avatar' ? 'Foto de perfil' : 'Imagen de portada'}
            </h2>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onCancel}>
            ×
          </button>
        </div>
        <p>
          Arrastra la imagen para cambiar su posición y usa el control para
          acercarla.
        </p>
        <div
          ref={viewportRef}
          className={`portal-image-crop-viewport portal-image-crop-viewport--${variant}`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = {
              pointerId: event.pointerId,
              start: { x: event.clientX, y: event.clientY },
              offset,
            }
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag || drag.pointerId !== event.pointerId) return
            setOffset(
              clamp({
                x: drag.offset.x + event.clientX - drag.start.x,
                y: drag.offset.y + event.clientY - drag.start.y,
              }),
            )
          }}
          onPointerUp={() => {
            dragRef.current = null
          }}
        >
          {imageUrl && (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Vista previa del recorte"
              draggable={false}
              onLoad={(event) =>
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              style={{
                width: displayed.width || undefined,
                height: displayed.height || undefined,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          )}
          <span className="portal-image-crop-viewport__guide" />
        </div>
        <label className="portal-image-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <output>{Math.round(zoom * 100)}%</output>
        </label>
        <div className="portal-form-actions">
          <button
            className="portal-secondary-button"
            type="button"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="portal-primary-button"
            type="button"
            disabled={!naturalSize.width}
            onClick={() => void createCroppedFile()}
          >
            Usar imagen
          </button>
        </div>
      </section>
    </div>
  )
}
