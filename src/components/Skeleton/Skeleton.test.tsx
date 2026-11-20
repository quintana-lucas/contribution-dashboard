/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Skeleton from '.'

// Vitest blanks CSS imports, so read the source directly.
const css = readFileSync('src/components/Skeleton/Skeleton.module.css', 'utf8')

describe('Skeleton', () => {
  it('AC3: is exported from the component index and renders without text', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstElementChild).not.toBeNull()
    expect(container.textContent).toBe('')
  })

  it('AC4: is decorative (aria-hidden)', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  })

  it('AC3: applies width and height', () => {
    const { container } = render(
      <Skeleton width={120} height="2rem" shape="block" />,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.width).toBe('120px')
    expect(el.style.height).toBe('2rem')
  })

  it('AC3: default line has a valid non-zero height rule', () => {
    const rule = /\.line\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    const height = /height:\s*([^;]+);/.exec(rule)?.[1].trim()
    expect(height).toBeDefined()
    // Must not be a bare unitless token (e.g. var(--text-sm-line)).
    expect(height).toMatch(/calc\(|\d+(px|rem|em)\b/)
    expect(height).not.toMatch(/^var\(/)
  })

  it('AC5: disables the animation under prefers-reduced-motion', () => {
    const idx = css.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(idx).toBeGreaterThan(-1)
    expect(css.slice(idx)).toContain('animation: none;')
  })
})
