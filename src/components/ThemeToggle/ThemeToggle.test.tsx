import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeToggle from '.'

function stubMatchMedia(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query === '(prefers-color-scheme: dark)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    stubMatchMedia(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.documentElement.removeAttribute('data-theme')
  })

  it('AC1: is an icon-only button with an SVG icon and no emoji or text', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Dark theme' })
    const svg = button.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('fill', 'none')
    expect(button.textContent).toBe('')
  })

  it('AC1: shows the sun in light and the moon in dark', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Dark theme' })
    expect(button.querySelector('svg')).toHaveAttribute('data-icon', 'sun')
    fireEvent.click(button)
    expect(button.querySelector('svg')).toHaveAttribute('data-icon', 'moon')
  })

  it('AC2: click switches data-theme both ways', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Dark theme' })
    fireEvent.click(button)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(window.localStorage.getItem('theme')).toBe('dark')
    fireEvent.click(button)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(window.localStorage.getItem('theme')).toBe('light')
  })

  it('AC2: is a native button so Enter and Space activate it, and focus stays', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Dark theme' })
    // jsdom does not synthesize click from keys; native buttons do this in browsers.
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
    button.focus()
    fireEvent.click(button)
    expect(document.activeElement).toBe(button)
  })

  it('AC8: has the fixed accessible name, title and a flipping aria-pressed', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Dark theme' })
    expect(button).toHaveAttribute('title', 'Dark theme')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-label', 'Dark theme')
    expect(button).toHaveAttribute('aria-pressed', 'true')
  })

  it('AC8: is focusable', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Dark theme' })
    button.focus()
    expect(button).toHaveFocus()
  })

  it('AC8: starts pressed when the OS is dark and nothing is stored', () => {
    stubMatchMedia(true)
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('AC8: starts from the stored choice over the OS preference', () => {
    stubMatchMedia(true)
    window.localStorage.setItem('theme', 'light')
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('AC6: still toggles for the session when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'Dark theme' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })
})
