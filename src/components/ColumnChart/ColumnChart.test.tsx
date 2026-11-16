import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

describe('ColumnChart', () => {
  it('AC6: exposes a text alternative in a figcaption', () => {
    render(<ColumnChart {...common} bars={bars} />)
    const figure = screen.getByRole('figure')
    expect(within(figure).getByText(common.description)).toBeInTheDocument()
    expect(figure.querySelector('figcaption')).toHaveTextContent(common.description)
  })

  it('AC2: zero buckets render as "0" in the table', () => {
    render(<ColumnChart {...common} bars={bars} />)
    const table = screen.getByRole('table', { name: common.tableCaption })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(within(rows[2]).getByText('Tue 2')).toBeInTheDocument()
    expect(within(rows[2]).getByText('0')).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Day' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'PRs merged' })).toBeInTheDocument()
  })

  it('AC6: table sits in a "Show as table" details element', () => {
    render(<ColumnChart {...common} bars={bars} />)
    expect(screen.getByText('Show as table').closest('details')).not.toBeNull()
  })

  it('AC2: zero buckets draw no column; others scale to the max', () => {
    render(<ColumnChart {...common} bars={bars} />)
    const cols = screen.getAllByTestId('column')
    expect(cols).toHaveLength(3)
    expect(cols[0]).toHaveStyle({ height: '50%' })
    expect(cols[1]).toHaveStyle({ height: '0%' })
    expect(cols[2]).toHaveStyle({ height: '100%' })
  })

  it('AC2: plot and x labels are hidden from assistive tech', () => {
    render(<ColumnChart {...common} bars={bars} />)
    for (const col of screen.getAllByTestId('column')) {
      expect(col.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('AC2: shows every x label by default and every 2nd with labelEvery=2', () => {
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
    const table = screen.getByRole('table')
    expect(within(table).getByText('L1')).toBeInTheDocument()
  })
})
