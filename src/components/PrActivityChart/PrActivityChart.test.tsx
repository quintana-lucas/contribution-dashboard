import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PrActivityBucket } from '../../api/prActivity'
import PrActivityChart from './PrActivityChart'

const buckets: PrActivityBucket[] = [
  { label: 'Jun 1', fullLabel: 'Jun 1', opened: 3, merged: 2, closed: 1 },
  { label: 'Jun 2', fullLabel: 'Jun 2', opened: 0, merged: 0, closed: 0 },
]

describe('PrActivityChart', () => {
  it('AC2: series are labeled by text in a legend', () => {
    render(<PrActivityChart buckets={buckets} unit="day" />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    for (const name of ['Opened', 'Merged', 'Closed']) {
      expect(within(legend).getByText(name)).toBeInTheDocument()
    }
  })

  it('AC2: has a text alternative and a table with every value', () => {
    render(<PrActivityChart buckets={buckets} unit="day" />)
    expect(screen.getByText('Pull requests per day: 3 opened, 2 merged, 1 closed.')).toBeInTheDocument()
    const table = screen.getByRole('table', { hidden: true })
    const rows = within(table).getAllByRole('row', { hidden: true })
    expect(rows).toHaveLength(3)
    expect(rows[1]).toHaveTextContent('Jun 1321')
  })

  it('AC4: an empty bucket stays in the chart and the table as zeros', () => {
    render(<PrActivityChart buckets={buckets} unit="week" />)
    expect(screen.getAllByTestId('group')).toHaveLength(2)
    const rows = within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true })
    expect(rows[2]).toHaveTextContent('Jun 2000')
  })

  it('AC2: shows values above non-empty columns', () => {
    const { container } = render(<PrActivityChart buckets={buckets} unit="day" />)
    const opened = container.querySelector('[data-series="opened"]')
    expect(opened).toHaveTextContent('3')
  })
})
