import type { ComponentPropsWithoutRef } from 'react'
import { safeExternalUrl } from '../api/uploads'

type SafeExternalLinkProps = Omit<
  ComponentPropsWithoutRef<'a'>,
  'href' | 'rel' | 'target'
> & {
  href: string | null | undefined
}

export function SafeExternalLink({
  href,
  children,
  ...props
}: SafeExternalLinkProps) {
  const safeUrl = safeExternalUrl(href)
  if (!safeUrl) return null

  return (
    <a {...props} href={safeUrl} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
