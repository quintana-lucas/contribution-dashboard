import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LinesDelta from '.'

describe('LinesDelta', () => {
  it('AC2: renders + then U+2212 with formatted numbers, additions first', () => {
    render(<LinesDelta additions={9571} deletions={2716} />)
    const root = screen.getByRole('img')
    expect(root.textContent).toBe('+9,571−2,716')
    expect(root.children[0].textContent).toBe('+9,571')
    expect(root.children[1].textContent).toBe('−2,716')
  })

  it('AC2: add and del use their own colour classes', () => {
    render(<LinesDelta additions={1} deletions={2} />)
    const [a, d] = Array.from(screen.getByRole('img').children)
    expect(a.className).toMatch(/add/)
    expect(d.className).toMatch(/del/)
  })

  it('AC4: zero figures are muted and still shown', () => {
    render(<LinesDelta additions={0} deletions={5} />)
    const [a, d] = Array.from(screen.getByRole('img').children)
    expect(a.textContent).toBe('+0')
    expect(a.className).toMatch(/zero/)
    expect(a.className).not.toMatch(/add/)
    expect(d.className).not.toMatch(/zero/)
  })

  it('AC4: both zero keeps both figures and label', () => {
    render(<LinesDelta additions={0} deletions={0} />)
    expect(screen.getByRole('img', { name: '0 added, 0 removed' }).textContent).toBe('+0−0')
  })

  it('AC7: aria-label announces formatted numbers', () => {
    render(<LinesDelta additions={120} deletions={1045} />)
    expect(screen.getByRole('img', { name: '120 added, 1,045 removed' })).toBeTruthy()
  })

  it('AC6: separators come from en-US formatting', () => {
    render(<LinesDelta additions={1234567} deletions={0} />)
    expect(screen.getByText('+1,234,567')).toBeTruthy()
  })

  it('AC1: inline layout has no columns class; columns layout does', () => {
    const { rerender } = render(<LinesDelta additions={1} deletions={1} />)
    expect(screen.getByRole('img').className).not.toMatch(/columns/)
    rerender(<LinesDelta additions={1} deletions={1} layout="columns" />)
    expect(screen.getByRole('img').className).toMatch(/columns/)
  })
})
