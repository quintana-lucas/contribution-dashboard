import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CHART_MIN_MARK } from '../ChartFrame'
import ColumnChart from './ColumnChart'

const bars = [
  { key: 'd1', label: 'Mon 1', value: 2 },
  { key: 'd2', label: 'Tue 2', value: 0 },
  { key: 'd3', label: 'Wed 3', value: 4 },
]

const common = {
  description: '6 pull requests merged over 3 days. Busiest: Wed 3, 4.',
  tableCaption: 'PRs merged per day by ada',
  labelHeader: 'Day',
  valueHeader: 'PRs merged',
}

const fills = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="column-bar"]'))

describe('ColumnChart', () => {
  it('#107 AC3: exposes a text alternative in a figcaption', () => {
    render(<ColumnChart {...common} bars={bars} />)
    const figure = screen.getByRole('figure')
    expect(within(figure).getByText(common.description)).toBeInTheDocument()
    expect(figure.querySelector('figcaption')).toHaveTextContent(common.description)
  })

  it('#107 AC3: zero buckets render as "0" in the table', () => {
    render(<ColumnChart {...common} bars={bars} />)
    const table = screen.getByRole('table', { name: common.tableCaption, hidden: true })
    const rows = within(table).getAllByRole('row', { hidden: true })
    expect(rows).toHaveLength(4)
    expect(within(rows[2]).getByText('Tue 2')).toBeInTheDocument()
    expect(within(rows[2]).getByText('0')).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Day', hidden: true })).toBeInTheDocument()
    expect(
      within(table).getByRole('columnheader', { name: 'PRs merged', hidden: true }),
    ).toBeInTheDocument()
  })

  it('#107 AC3: table sits in a "Show as table" details element', () => {
    render(<ColumnChart {...common} bars={bars} />)
    expect(screen.getByText('Show as table').closest('details')).not.toBeNull()
  })

  it('#107 AC4: zero draws no column; others scale from 0 to the max, in the good color', () => {
    const { container } = render(<ColumnChart {...common} bars={bars} />)
    expect(screen.getAllByTestId('column')).toHaveLength(3)
    const marks = fills(container)
    expect(marks).toHaveLength(2)
    const h = marks.map((m) => Number(m.getAttribute('height')))
    expect(h[0]).toBeCloseTo(h[1] / 2)
    for (const m of marks) expect(m.getAttribute('fill')).toBe('var(--color-good)')
    const baselineY = Number(screen.getByTestId('baseline').getAttribute('y1'))
    expect(Number(marks[1].getAttribute('y')) + h[1]).toBeCloseTo(baselineY)
  })

  it('#107 AC4: a small non-zero value still gets the minimum mark size', () => {
    const { container } = render(
      <ColumnChart
        {...common}
        bars={[
          { key: 'a', label: 'A', value: 1 },
          { key: 'b', label: 'B', value: 1000 },
        ]}
      />,
    )
    expect(Number(fills(container)[0].getAttribute('height'))).toBe(CHART_MIN_MARK)
  })

  it('#107 AC4: shows the number above non-zero columns only, in the text color', () => {
    const { container } = render(<ColumnChart {...common} bars={bars} />)
    const nums = Array.from(container.querySelectorAll('[data-testid="value"]'))
    expect(nums.map((n) => n.textContent)).toEqual(['2', '4'])
    const marks = fills(container)
    nums.forEach((n, i) => {
      expect(n.getAttribute('fill')).toBe('var(--color-text)')
      expect(Number(n.getAttribute('y'))).toBeLessThan(Number(marks[i].getAttribute('y')))
    })
  })

  it('#107 AC4: numbers are hidden when the column pitch is under 8px', () => {
    const dense = Array.from({ length: 90 }, (_, i) => ({ key: `k${i}`, label: `L${i}`, value: 1 }))
    const { container } = render(<ColumnChart {...common} bars={dense} />)
    expect(fills(container)).toHaveLength(90)
    expect(container.querySelectorAll('[data-testid="value"]')).toHaveLength(0)
  })

  it('#107 AC3: plot parts are aria-hidden; columns are named images', () => {
    const { container } = render(<ColumnChart {...common} bars={bars} />)
    const hidden = (el: Element) => el.closest('[aria-hidden="true"]') !== null
    for (const m of fills(container)) expect(hidden(m)).toBe(true)
    for (const t of container.querySelectorAll('svg text')) expect(hidden(t)).toBe(true)
    expect(hidden(screen.getByTestId('baseline'))).toBe(true)
    const col = screen.getByRole('img', { name: 'Wed 3: 4' })
    expect(col).toHaveAttribute('tabindex', '0')
    expect(col.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('#107 AC3: shows every x label by default and every 2nd with labelEvery=2', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      key: `k${i}`,
      label: `L${i}`,
      value: i,
    }))
    const { container, rerender } = render(<ColumnChart {...common} bars={many} />)
    const xLabels = () =>
      Array.from(container.querySelectorAll('[data-testid="x-label"]')).map((e) => e.textContent)
    expect(xLabels()).toEqual(['L0', 'L1', 'L2', 'L3', 'L4'])
    rerender(<ColumnChart {...common} bars={many} labelEvery={2} />)
    expect(xLabels()).toEqual(['L0', '', 'L2', '', 'L4'])
    // table still holds all labels
    const table = screen.getByRole('table', { hidden: true })
    expect(within(table).getByText('L1')).toBeInTheDocument()
  })

  it('#107 AC5: hover opens the tooltip with the label as title and one value row', async () => {
    render(<ColumnChart {...common} bars={bars} />)
    const [first] = screen.getAllByTestId('column')
    fireEvent.mouseEnter(first)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Mon 1')
    expect(tip).toHaveTextContent('PRs merged2')
    fireEvent.mouseLeave(first)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#107 AC5: columns are focusable; focus opens the tooltip with zeros and Escape closes it', () => {
    render(<ColumnChart {...common} bars={bars} />)
    const [, empty] = screen.getAllByTestId('column')
    expect(empty).toHaveAttribute('tabindex', '0')
    fireEvent.focus(empty)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Tue 2')
    expect(tip).toHaveTextContent('PRs merged0')
    fireEvent.keyDown(empty, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('#107 AC5: the focused column has a visible focus ring', () => {
    const css = readFileSync(resolve(__dirname, 'ColumnChart.module.css'), 'utf8')
    expect(css).toMatch(/\.column:focus-visible\s*\{[^}]*var\(--color-focus\)/)
  })
})
