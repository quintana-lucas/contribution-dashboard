import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Modal from './Modal'

let root: HTMLDivElement

beforeEach(() => {
  root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
})

afterEach(() => {
  cleanup()
  root.remove()
})

function Harness({
  onClose = () => {},
  removeOpener = false,
  initialFocus,
  autoFocusField = false,
}: {
  onClose?: () => void
  removeOpener?: boolean
  initialFocus?: () => HTMLElement | null
  autoFocusField?: boolean
  focusOpener?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [showOpener, setShowOpener] = useState(true)
  return (
    <>
      {showOpener && <button onClick={() => setOpen(true)}>Opener</button>}
      <button>Fallback</button>
      <Modal
        open={open}
        titleId="t"
        onClose={() => {
          onClose()
          if (removeOpener) setShowOpener(false)
          setOpen(false)
        }}
        initialFocus={initialFocus}
        fallbackFocus={() =>
          Array.from(document.querySelectorAll('button')).find(
            (b) => b.textContent === 'Fallback',
          ) ?? null
        }
      >
        <h2 id="t">Settings</h2>
        <button>First</button>
        <input aria-label="Field" autoFocus={autoFocusField} />
        <button>Last</button>
      </Modal>
    </>
  )
}

function open(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props} />, { container: root })
  const opener = screen.getByRole('button', { name: 'Opener' })
  if (props.focusOpener !== false) opener.focus()
  fireEvent.click(opener)
  return opener
}

describe('Modal', () => {
  it('#8 AC6: the dialog is labelled by its title', () => {
    open()
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 't')
  })

  it('#8 AC11: renders through a portal into document.body', () => {
    open()
    const dialog = screen.getByRole('dialog')
    expect(root.contains(dialog)).toBe(false)
    expect(document.body.contains(dialog)).toBe(true)
  })

  it('#8 AC11: focus moves inside on open, first focusable by default', () => {
    open()
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('#8 AC11: initialFocus overrides the first focusable', () => {
    open({ initialFocus: () => screen.getByLabelText('Field') })
    expect(screen.getByLabelText('Field')).toHaveFocus()
  })

  it('#8 AC11: Tab from the last element wraps to the first', () => {
    open()
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
  })

  it('#8 AC11: Shift+Tab from the first element wraps to the last', () => {
    open()
    const first = screen.getByRole('button', { name: 'First' })
    first.focus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
  })

  it('#8 AC11: Esc closes', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('#8 AC11: a child can intercept Esc with stopPropagation', () => {
    const onClose = vi.fn()
    open({ onClose })
    const field = screen.getByLabelText('Field')
    // Stop the native event before it reaches React's root listener.
    field.addEventListener('keydown', (e) => e.stopPropagation())
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('#8 AC11: clicking the backdrop closes, clicking the panel does not', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.mouseDown(screen.getByRole('dialog'))
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(screen.getByTestId('modal-backdrop'))
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('#8 AC11: a drag that starts in the panel and ends on the backdrop does not close', () => {
    const onClose = vi.fn()
    open({ onClose })
    fireEvent.mouseDown(screen.getByLabelText('Field'))
    fireEvent.click(screen.getByTestId('modal-backdrop'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('#8 AC11: an autofocused child is not recorded as the opener', () => {
    const opener = open({ autoFocusField: true })
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement)
    fireEvent.keyDown(screen.getByLabelText('Field'), { key: 'Escape' })
    expect(opener).toHaveFocus()
  })

  it('#8 AC11: when the opener is document.body, focus goes to the fallback', () => {
    open({ focusOpener: false })
    expect(document.activeElement).not.toBe(document.body)
    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Fallback' })).toHaveFocus()
  })

  it('#8 AC11: focus returns to the opener on close', () => {
    const opener = open()
    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'Escape' })
    expect(opener).toHaveFocus()
  })

  it('#8 AC11: focus goes to the fallback when the opener is gone', () => {
    open({ removeOpener: true })
    act(() => {
      fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'Escape' })
    })
    expect(screen.queryByRole('button', { name: 'Opener' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Fallback' })).toHaveFocus()
  })

  it('#8 AC11: the app root is inert only while open', () => {
    open()
    expect(root).toHaveAttribute('inert')
    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'Escape' })
    expect(root).not.toHaveAttribute('inert')
  })
})
