import { readFileSync } from 'node:fs'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ChartFrame, { ChartRowText, CHART_MIN_MARK, markSize } from '.'

const table = {
  caption: 'PRs per week',
  labelHeader: 'Week',
  columns: ['Opened', 'Merged'],
  rows: [
    { key: 'a', label: 'Jan 1', values: [3, 0] },
    { key: 'b', label: 'Jan 8', values: [0, 12] },
  ],
}

describe('ChartFrame', () => {
  it('AC4: figure has an sr-only figcaption as the text alternative', () => {
    render(
      <ChartFrame description="3 opened, 12 merged." table={table}>
        <span>marks</span>
      </ChartFrame>,
    )
    const figure = screen.getByRole('figure')
    expect(within(figure).getByText('3 opened, 12 merged.').tagName).toBe('FIGCAPTION')
  })

  it('AC4: marks and axis are aria-hidden', () => {
    render(
      <ChartFrame description="d" table={table} axis={<span>axis</span>}>
        <span>marks</span>
      </ChartFrame>,
    )
    expect(screen.getByText('marks').closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByText('axis').closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC4: table fallback holds every value, zeros included', () => {
    render(
      <ChartFrame description="d" table={table}>
        <span>marks</span>
      </ChartFrame>,
    )
    expect(screen.getByText('Show as table').tagName).toBe('SUMMARY')
    const rows = screen.getAllByRole('row', { hidden: true })
    const cells = rows.slice(1).map((r) => within(r).getAllByRole('cell', { hidden: true }).map((c) => c.textContent))
    expect(cells).toEqual([
      ['3', '0'],
      ['0', '12'],
    ])
    expect(screen.getByText('PRs per week')).toBeTruthy()
  })

  it('AC4: rows variant has no figure and keeps per-row hidden text plus the table', () => {
    render(
      <ChartFrame variant="rows" table={table}>
        <div aria-hidden="true">bar</div>
        <ChartRowText>Alice: 3 reviews</ChartRowText>
      </ChartFrame>,
    )
    expect(screen.queryByRole('figure')).toBeNull()
    expect(screen.getByText('Alice: 3 reviews')).toBeTruthy()
    expect(screen.getByText('Show as table')).toBeTruthy()
  })

  it('AC6: the value is readable outside the tooltip (table and text)', () => {
    render(
      <ChartFrame description="d" table={table}>
        <span>marks</span>
      </ChartFrame>,
    )
    expect(screen.getByText('12')).toBeTruthy()
  })
})

describe('markSize', () => {
  const scale = (v: number) => v * 0.1

  it('AC6: zero draws nothing', () => {
    expect(markSize(0, scale)).toBe(0)
  })

  it('AC6: a small non-zero value is at least the minimum mark', () => {
    expect(markSize(1, scale)).toBe(CHART_MIN_MARK)
    expect(markSize(1, scale, { min: 6 })).toBe(6)
  })

  it('AC6: a large value keeps its scaled size', () => {
    expect(markSize(1000, scale)).toBe(100)
  })

  it('AC6: CHART_MIN_MARK equals --chart-min-mark in tokens.css', () => {
    const css = readFileSync('src/styles/tokens.css', 'utf8')
    const match = /--chart-min-mark:\s*(\d+)px/.exec(css)
    expect(Number(match?.[1])).toBe(CHART_MIN_MARK)
  })
})
