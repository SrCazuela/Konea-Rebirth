import { KONEA_BRANDING } from '../config/branding'

export function KoneaLogo({
  className,
  width,
  compact = false,
  decorative = false,
}: {
  className?: string
  width?: number
  compact?: boolean
  decorative?: boolean
}) {
  const artwork = compact ? KONEA_BRANDING.mark : KONEA_BRANDING.logo
  const displayWidth = width ?? artwork.width

  return (
    <img
      className={className}
      src={artwork.src}
      alt={decorative ? '' : 'Konea'}
      aria-hidden={decorative || undefined}
      width={displayWidth}
      height={Math.round((displayWidth * artwork.height) / artwork.width)}
    />
  )
}
