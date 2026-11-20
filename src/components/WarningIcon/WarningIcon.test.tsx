import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import WarningIcon from '.'

describe('WarningIcon', () => {
  it('#84 AC5: is decorative (aria-hidden, no accessible name or text)', () => {
    const { container } = render(<WarningIcon />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('aria-label')).toBeNull()
    expect(svg.querySelector('title')).toBeNull()
    expect(container.textContent).toBe('')
  })

  it('#84 AC6: uses currentColor with no hardcoded colour', () => {
    const { container } = render(<WarningIcon />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i)
  })
})
