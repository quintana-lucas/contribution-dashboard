import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

interface ModalProps {
  open: boolean
  onClose: () => void
  /** id of the element inside `children` that titles the dialog. */
  titleId: string
  children: ReactNode
  /** Element to focus on open. Defaults to the first focusable element. */
  initialFocus?: () => HTMLElement | null
  /** Focus target on close when the opener is no longer in the DOM. */
  fallbackFocus?: () => HTMLElement | null
  /** The app root that is made inert while open. Defaults to #root. */
  appRoot?: () => HTMLElement | null
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]'

function focusableIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.hasAttribute('disabled') &&
      !el.closest('[hidden]'),
  )
}

export default function Modal({
  open,
  onClose,
  titleId,
  children,
  initialFocus,
  fallbackFocus,
  appRoot,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const latest = useRef({ initialFocus, fallbackFocus, appRoot })

  useEffect(() => {
    latest.current = { initialFocus, fallbackFocus, appRoot }
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const root = (latest.current.appRoot ?? (() => document.getElementById('root')))()
    root?.setAttribute('inert', '')

    const target =
      latest.current.initialFocus?.() ??
      (panelRef.current ? focusableIn(panelRef.current)[0] : null) ??
      panelRef.current
    target?.focus()

    return () => {
      root?.removeAttribute('inert')
      if (opener && opener.isConnected) {
        opener.focus()
      } else {
        latest.current.fallbackFocus?.()?.focus()
      }
    }
  }, [open])

  if (!open) return null

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panelRef.current) return
    const items = focusableIn(panelRef.current)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className={styles.backdrop}
      data-testid="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.panel}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
