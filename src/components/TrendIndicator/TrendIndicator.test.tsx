import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { trendView } from '../../api/trendView.ts'
import TrendIndicator from '.'

const cmp = (current: number, previous: number) => {
  const delta = current - previous
  return { current, previous, delta, deltaPct: previous === 0 ? undefined : (delta / previous) * 100 }
}

describe('TrendIndicator', () => {
  it('AC1, AC2, AC4: up on a directional metric shows glyph, figure and label in the good tone', () => {
    render(<TrendIndicator view={trendView(cmp(28, 25), 'directional', 30)} />)
    expect(screen.getByText('↑ +3 (+12%)')).toBeInTheDocument()
    expect(screen.getByText('vs previous 30 days')).toBeInTheDocument()
    expect(screen.getByText('↑ +3 (+12%)').parentElement?.className).toMatch(/good/)
  })

  it('AC1, AC4: down on a directional metric uses another glyph, sign and the bad tone', () => {
    render(<TrendIndicator view={trendView(cmp(22, 25), 'directional', 7)} />)
    expect(screen.getByText('↓ −3 (−12%)')).toBeInTheDocument()
    expect(screen.getByText('vs previous 7 days')).toBeInTheDocument()
    expect(screen.getByText('↓ −3 (−12%)').parentElement?.className).toMatch(/bad/)
  })

  it('AC1: flat shows the arrow and zero figure in the muted tone', () => {
    render(<TrendIndicator view={trendView(cmp(5, 5), 'directional', 30)} />)
    expect(screen.getByText('→ 0 (0%)').parentElement?.className).toMatch(/muted/)
  })

  it('AC1: neutral metrics keep the muted tone for up and down', () => {
    render(<TrendIndicator view={trendView(cmp(30, 25), 'neutral', 30)} />)
    expect(screen.getByText('↑ +5 (+20%)').parentElement?.className).toMatch(/muted/)
  })

  it('AC8: no comparison shows only the quiet text, no glyph or figure', () => {
    const { container } = render(<TrendIndicator view={trendView(undefined, 'directional', 30)} />)
    expect(screen.getByText('No comparison')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[↑↓→%]/)
  })

  it('AC9: glyph and figure are aria-hidden, the meaning is also in text', () => {
    render(<TrendIndicator view={trendView(cmp(28, 25), 'directional', 30)} />)
    expect(screen.getByText('↑ +3 (+12%)')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('up 12 percent versus previous 30 days')).toBeInTheDocument()
  })

  it('AC11: exposes the sr sentence without aria-hidden', () => {
    render(<TrendIndicator view={trendView(cmp(22, 25), 'directional', 30)} />)
    const sr = screen.getByText('down 12 percent versus previous 30 days')
    expect(sr).not.toHaveAttribute('aria-hidden')
  })

  it('AC8, AC11: no-comparison sr sentence is exposed', () => {
    render(<TrendIndicator view={trendView(undefined, 'neutral', 30)} />)
    expect(screen.getByText('No comparison available for the previous period')).toBeInTheDocument()
  })

  it('loading renders a skeleton and no text', () => {
    const { container } = render(<TrendIndicator loading />)
    expect(screen.getByTestId('skeleton')).toHaveStyle({ width: '60%' })
    expect(container.textContent).toBe('')
  })

  it('AC10: styles use tokens only, no hard-coded colors', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/components/TrendIndicator/TrendIndicator.module.css'),
      'utf8',
    )
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
    expect(css).toMatch(/var\(--color-good\)/)
    expect(css).toMatch(/var\(--color-bad\)/)
    expect(css).toMatch(/var\(--color-text-muted\)/)
  })
})
