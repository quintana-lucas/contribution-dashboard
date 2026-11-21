import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
      expect(within(legend).getByText(new RegExp(`^${name}`))).toBeInTheDocument()
    }
  })

  it('#106 AC6: the legend sits above the plot and shows period totals matching the figcaption', () => {
    const { container } = render(<PrActivityChart buckets={buckets} unit="day" />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getByText('Opened (3)')).toBeInTheDocument()
    expect(within(legend).getByText('Merged (2)')).toBeInTheDocument()
    expect(within(legend).getByText('Closed (1)')).toBeInTheDocument()
    expect(screen.getByText('Pull requests per day: 3 opened, 2 merged, 1 closed.')).toBeInTheDocument()
    const svg = container.querySelector('svg')!
    expect(legend.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('#106 AC5: hover opens the tooltip with the full label and all three rows', async () => {
    render(<PrActivityChart buckets={buckets} unit="day" />)
    const [first] = screen.getAllByTestId('group')
    fireEvent.mouseEnter(first)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Jun 1')
    expect(tip).toHaveTextContent('Opened3')
    expect(tip).toHaveTextContent('Merged2')
    expect(tip).toHaveTextContent('Closed1')
    fireEvent.mouseLeave(first)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#106 AC5: buckets are focusable; focus opens the tooltip with zeros and Escape closes it', () => {
    render(<PrActivityChart buckets={buckets} unit="day" />)
    const [, empty] = screen.getAllByTestId('group')
    expect(empty).toHaveAttribute('tabindex', '0')
    fireEvent.focus(empty)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Jun 2')
    expect(tip).toHaveTextContent('Opened0')
    expect(tip).toHaveTextContent('Merged0')
    expect(tip).toHaveTextContent('Closed0')
    fireEvent.keyDown(empty, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#106 AC5: the focused bucket has a visible focus ring', () => {
    const css = readFileSync(resolve(__dirname, 'PrActivityChart.module.css'), 'utf8')
    expect(css).toMatch(/\.group:focus-visible\s*\{[^}]*var\(--color-focus\)/)
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

  it('#106 AC2: the 16px threshold: just below goes above in text color, just above 16px goes inside in on-accent', () => {
    // Plot height is 120px: value 1 of max 7 is ~17.1px (inside), 1 of max 8 is 15px (above).
    // Both are at least 1px from the 16px threshold, so no float-exactness is involved.
    const at = (max: number): PrActivityBucket[] => [
      { label: 'Jun 1', fullLabel: 'Jun 1', opened: max, merged: 1, closed: 0 },
    ]
    const read = (max: number) => {
      const { container, unmount } = render(<PrActivityChart buckets={at(max)} unit="day" />)
      const bar = container.querySelector('[data-series="merged"]')!
      const num = bar.parentElement!.querySelector('[data-testid="value"]')!
      const out = {
        h: Number(bar.getAttribute('height')),
        placement: num.getAttribute('data-placement'),
        fill: num.getAttribute('fill'),
      }
      unmount()
      return out
    }
    const below = read(8)
    expect(below.h).toBeLessThan(15.5)
    expect(below.placement).toBe('above')
    expect(below.fill).toBe('var(--color-text)')
    const above = read(7)
    expect(above.h).toBeGreaterThan(16.5)
    expect(above.placement).toBe('inside')
    expect(above.fill).toBe('var(--color-on-accent)')
  })

  it('#106 AC5: a bucket is exposed as a named image outside any aria-hidden ancestor', () => {
    render(<PrActivityChart buckets={buckets} unit="day" />)
    const bucket = screen.getByRole('img', { name: /Jun 1: 3 opened/ })
    expect(bucket).toHaveAccessibleName('Jun 1: 3 opened, 2 merged, 1 closed')
    expect(bucket).toHaveAttribute('tabindex', '0')
    for (const g of screen.getAllByTestId('group')) {
      expect(g.closest('[aria-hidden="true"]')).toBeNull()
    }
  })

  it('#106 AC5: non-interactive SVG parts are aria-hidden so nothing is announced twice', () => {
    const { container } = render(<PrActivityChart buckets={buckets} unit="day" />)
    const hidden = (el: Element) => el.closest('[aria-hidden="true"]') !== null
    expect(hidden(screen.getByTestId('baseline'))).toBe(true)
    expect(hidden(screen.getByTestId('max-gridline'))).toBe(true)
    expect(hidden(screen.getByTestId('max-label'))).toBe(true)
    for (const t of container.querySelectorAll('svg text')) expect(hidden(t)).toBe(true)
    for (const r of container.querySelectorAll('svg rect')) expect(hidden(r)).toBe(true)
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
