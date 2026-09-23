import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let bodyLockCount = 0
let bodyOverflowBeforeLock = ''
const modalStack: symbol[] = []

function lockBodyScroll() {
  if (bodyLockCount === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  bodyLockCount += 1
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount === 0) {
    document.body.style.overflow = bodyOverflowBeforeLock
  }
}

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => element.getClientRects().length > 0)
}

export function useModalDialog<TElement extends HTMLElement>({
  open,
  onClose,
  closeDisabled = false,
}: {
  open: boolean
  onClose: () => void
  closeDisabled?: boolean
}): RefObject<TElement | null> {
  const dialogRef = useRef<TElement>(null)
  const onCloseRef = useRef(onClose)
  const closeDisabledRef = useRef(closeDisabled)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    closeDisabledRef.current = closeDisabled
  }, [closeDisabled])

  useEffect(() => {
    if (!open) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const modalToken = Symbol('modal')
    modalStack.push(modalToken)
    lockBodyScroll()

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog) return
      const preferred = dialog.querySelector<HTMLElement>('[autofocus]')
      const target = preferred ?? focusableElements(dialog)[0] ?? dialog
      target.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== modalToken) return
      const dialog = dialogRef.current
      if (!dialog) return

      if (event.key === 'Escape') {
        if (closeDisabledRef.current) return
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const elements = focusableElements(dialog)
      if (elements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = elements[0]!
      const last = elements.at(-1)!
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      const stackIndex = modalStack.lastIndexOf(modalToken)
      if (stackIndex >= 0) modalStack.splice(stackIndex, 1)
      unlockBodyScroll()
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [open])

  return dialogRef
}
