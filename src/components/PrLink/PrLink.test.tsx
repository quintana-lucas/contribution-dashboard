/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PrLink, { NEW_TAB_HINT } from '.'

const css = readFileSync('src/components/PrLink/PrLink.module.css', 'utf8')

afterEach(() => vi.restoreAllMocks())

describe('PrLink', () => {
  it('AC1: renders an anchor with the title and an accessible name that says it opens in a new tab', () => {
    render(<PrLink repo="octo/app" number={12}>Fix login bug</PrLink>)
    const link = screen.getByRole('link', { name: `Fix login bug${NEW_TAB_HINT}` })
    expect(link).toHaveAttribute('href')
    expect(link).not.toHaveAttribute('title')
    expect(link.querySelector('svg, img')).toBeNull()
  })

  it('AC2: href is built from repo and number only', () => {
    render(<PrLink repo="octo/app" number={12}>Anything /pull/99</PrLink>)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://github.com/octo/app/pull/12')
  })

  it('AC3: opens in a new tab with noopener noreferrer and no query string', () => {
    render(<PrLink repo="octo/app" number={12}>T</PrLink>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.getAttribute('href')).not.toMatch(/[?#]/)
  })

  it('AC4: invalid repo renders plain text with no link and no hint', () => {
    const { container } = render(<PrLink repo="not-valid" number={12}>Fix login bug</PrLink>)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container).toHaveTextContent('Fix login bug')
    expect(container).not.toHaveTextContent('opens in a new tab')
  })

  it('AC5: a single native focus stop; a focusable anchor with href is activated by Enter', () => {
    const { container } = render(<PrLink repo="octo/app" number={12}>T</PrLink>)
    const link = screen.getByRole('link')
    expect(container.querySelectorAll('a, button, [tabindex]')).toHaveLength(1)
    expect(link).not.toHaveAttribute('tabindex')
    link.focus()
    expect(link).toHaveFocus()
  })

  it('AC6: underlined at rest with muted colour, 1px, offset 2px', () => {
    const link = /^\.link \{([^}]*)\}/m.exec(css)?.[1] ?? ''
    expect(link).toContain('text-decoration-line: underline;')
    expect(link).toContain('text-decoration-color: var(--color-text-muted);')
    expect(link).toContain('text-decoration-thickness: 1px;')
    expect(link).toContain('text-underline-offset: 2px;')
    expect(link).toContain('border-radius: var(--radius-md);')
  })

  it('AC7: hover and focus use tokens only and a thicker underline; no :visited, no outline override', () => {
    const hover = /^\.link:hover,\n\.link:focus-visible \{([^}]*)\}/m.exec(css)?.[1] ?? ''
    expect(hover).toContain('color: var(--color-focus);')
    expect(hover).toContain('text-decoration-thickness: 2px;')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/rgba?\(|hsla?\(/)
    expect(css).not.toContain(':visited')
    expect(css).not.toMatch(/outline/)
    for (const m of css.matchAll(/color:\s*([^;]+);/g)) {
      expect(m[1]).toMatch(/^(var\(--color-|inherit)/)
    }
  })

  it('AC9: hint comes from one exported constant and the visually hidden class exists', () => {
    expect(NEW_TAB_HINT).toBe(' (opens in a new tab)')
    expect(css).toMatch(/^\.srOnly \{/m)
  })

  it('AC11: makes no network request', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<PrLink repo="octo/app" number={12}>T</PrLink>)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
