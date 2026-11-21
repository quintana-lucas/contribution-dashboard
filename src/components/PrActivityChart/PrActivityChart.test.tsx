import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PrActivityBucket } from '../../api/prActivity'
import { CHART_MIN_MARK } from '../ChartFrame'
import PrActivityChart from './PrActivityChart'

const buckets: PrActivityBucket[] = [
  { label: 'Jun 1', fullLabel: 'Jun 1', opened: 3, merged: 2, closed: 1 },
  { label: 'Jun 2', fullLabel: 'Jun 2', opened: 0, merged: 0, closed: 0 },
]

describe('PrActivityChart', () => {
  it('#106 AC1: series are labeled by text in a legend', () => {
    render(<PrActivityChart buckets={buckets} unit="day" />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    for (const name of ['Opened', 'Merged', 'Closed']) {
      expect(within(legend).getByText(name)).toBeInTheDocument()
    }
  })

  it('#106 AC1: columns use the token colors and no pattern fills', () => {
    const { container } = render(<PrActivityChart buckets={buckets} unit="day" />)
    const fill = (s: string) => container.querySelector(`[data-series="${s}"]`)?.getAttribute('fill')
    expect(fill('opened')).toBe('var(--color-bar)')
    expect(fill('merged')).toBe('var(--color-good)')
    expect(fill('closed')).toBe('var(--color-caution)')
    expect(container.querySelector('pattern')).toBeNull()
    for (const el of container.querySelectorAll('[fill]')) {
      expect(el.getAttribute('fill')).not.toMatch(/url\(|gradient/)
    }
  })

  it('#106 AC3: has a baseline and a max gridline labeled with the max, scale from 0', () => {
    const { container } = render(<PrActivityChart buckets={buckets} unit="day" />)
    expect(screen.getByTestId('baseline')).toBeInTheDocument()
    expect(screen.getByTestId('max-gridline')).toBeInTheDocument()
    expect(screen.getByTestId('max-label')).toHaveTextContent('3')
    const baselineY = Number(screen.getByTestId('baseline').getAttribute('y1'))
    const maxY = Number(screen.getByTestId('max-gridline').getAttribute('y1'))
    expect(maxY).toBeLessThan(baselineY)
    // The tallest column (3) reaches the max gridline, so the scale starts at 0.
    const opened = container.querySelector('[data-series="opened"]')!
    expect(Number(opened.getAttribute('y'))).toBeCloseTo(maxY)
  })

  it('#106 AC3: all-zero data does not crash', () => {
    const zeros = buckets.map((b) => ({ ...b, opened: 0, merged: 0, closed: 0 }))
    const { container } = render(<PrActivityChart buckets={zeros} unit="day" />)
    expect(screen.getByTestId('max-label')).toHaveTextContent('0')
    expect(container.querySelector('[data-series]')).toBeNull()
  })

  it('#106 AC7: has a text alternative and a table with every value', () => {
    render(<PrActivityChart buckets={buckets} unit="day" />)
    expect(screen.getByText('Pull requests per day: 3 opened, 2 merged, 1 closed.')).toBeInTheDocument()
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getByText('Pull requests per day')).toBeInTheDocument()
    const rows = within(table).getAllByRole('row', { hidden: true })
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('DayOpenedMergedClosed')
    expect(rows[1]).toHaveTextContent('Jun 1321')
  })

  it('#106 AC7: week unit names the week in the caption, header and figcaption', () => {
    render(<PrActivityChart buckets={buckets} unit="week" />)
    expect(screen.getByText('Pull requests per week: 3 opened, 2 merged, 1 closed.')).toBeInTheDocument()
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getByText('Pull requests per week')).toBeInTheDocument()
    expect(within(table).getAllByRole('row', { hidden: true })[0]).toHaveTextContent('Week')
  })

  it('#106 AC8: an empty bucket stays in the chart and the table as zeros', () => {
    render(<PrActivityChart buckets={buckets} unit="week" />)
    expect(screen.getAllByTestId('group')).toHaveLength(2)
    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true })
    expect(rows[2]).toHaveTextContent('Jun 2000')
  })

  it('#106 AC8: shows values for non-empty columns', () => {
    const { container } = render(<PrActivityChart buckets={buckets} unit="day" />)
    const opened = container.querySelector('[data-series="opened"]')
    expect(opened?.parentElement).toHaveTextContent('3')
  })

  const wide: PrActivityBucket[] = [
    { label: 'Jun 1', fullLabel: 'Jun 1', opened: 100, merged: 0, closed: 1 },
  ]

  it('#106 AC2: a small non-zero value gets the minimum height and its number above in text color', () => {
    const { container } = render(<PrActivityChart buckets={wide} unit="day" />)
    const closed = container.querySelector('[data-series="closed"]')!
    expect(Number(closed.getAttribute('height'))).toBe(CHART_MIN_MARK)
    const num = closed.parentElement!.querySelector('[data-testid="value"]')!
    expect(num).toHaveTextContent('1')
    expect(num.getAttribute('data-placement')).toBe('above')
    expect(num.getAttribute('fill')).toBe('var(--color-text)')
    const baselineY = Number(screen.getByTestId('baseline').getAttribute('y1'))
    expect(Number(num.getAttribute('y'))).toBeLessThan(baselineY - CHART_MIN_MARK)
  })

  it('#106 AC2: a tall column carries its number inside in the on-accent color', () => {
    const { container } = render(<PrActivityChart buckets={wide} unit="day" />)
    const opened = container.querySelector('[data-series="opened"]')!
    const h = Number(opened.getAttribute('height'))
    expect(h).toBeGreaterThanOrEqual(16)
    const num = opened.parentElement!.querySelector('[data-testid="value"]')!
    expect(num).toHaveTextContent('100')
    expect(num.getAttribute('data-placement')).toBe('inside')
    expect(num.getAttribute('fill')).toBe('var(--color-on-accent)')
    const y = Number(num.getAttribute('y'))
    expect(y).toBeGreaterThan(Number(opened.getAttribute('y')))
    expect(y).toBeLessThan(Number(opened.getAttribute('y')) + h)
  })

  it('#106 AC2: a zero draws no bar and no number', () => {
    const { container } = render(<PrActivityChart buckets={wide} unit="day" />)
    expect(container.querySelector('[data-series="merged"]')).toBeNull()
    expect(container.querySelectorAll('[data-testid="value"]')).toHaveLength(2)
  })

  const many = (n: number): PrActivityBucket[] =>
    Array.from({ length: n }, (_, i) => ({
      label: `D${i}`,
      fullLabel: `Day ${i}`,
      opened: 1,
      merged: 0,
      closed: 0,
    }))

  it('#106 AC4: more than 8 buckets hide the label of every odd index', () => {
    const { container } = render(<PrActivityChart buckets={many(9)} unit="day" />)
    const shown = [...container.querySelectorAll('svg text')]
      .map((t) => t.textContent)
      .filter((t) => t?.startsWith('D'))
    expect(shown).toEqual(['D0', 'D2', 'D4', 'D6', 'D8'])
  })

  it('#106 AC4: 8 buckets show every label', () => {
    const { container } = render(<PrActivityChart buckets={many(8)} unit="day" />)
    const shown = [...container.querySelectorAll('svg text')]
      .map((t) => t.textContent)
      .filter((t) => t?.startsWith('D'))
    expect(shown).toHaveLength(8)
  })
})
