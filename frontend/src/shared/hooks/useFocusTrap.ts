import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusTrap<T extends HTMLElement>(active: boolean, containerRef: RefObject<T | null>, onEscape?: () => void): void {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFirst = () => {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(first ?? container).focus()
    }
    focusFirst()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onEscape?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      if (previous?.isConnected) previous.focus()
    }
  }, [active, containerRef, onEscape])
}
