import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReviewsChart from './ReviewsChart'

const rows = [
  { login: 'ada', approved: 5, changesRequested: 2, commented: 3, total: 10 },
  { login: 'bob', approved: 1, changesRequested: 0, commented: 1, total: 2 },
]

describe('ReviewsChart', () => {
  it('AC2: shows name, total and counts as text per row, chart view by default', () => {
    render(<ReviewsChart rows={rows} />)
    const list = screen.getByRole('list', { name: 'Reviews given per person' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent(
      'ada: 10 reviews: 5 approved, 2 changes requested, 3 commented',
    )
    expect(items[1]).toHaveTextContent('bob: 2 reviews: 1 approved, 0 changes requested, 1 commented')
    expect(screen.getByRole('button', { name: 'Chart' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('AC2: toggles to a real table with caption and columns', () => {
    render(<ReviewsChart rows={rows} />)
    fireEvent.click(screen.getByRole('button', { name: 'Table' }))
    expect(screen.getByRole('button', { name: 'Table' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('list', { name: 'Reviews given per person' })).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: /reviews given per person/i })
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Person', 'Approved', 'Changes requested', 'Commented', 'Total'])
    const body = within(table).getAllByRole('row').slice(1)
    expect(body).toHaveLength(2)
    expect(within(body[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '5',
      '2',
      '3',
      '10',
    ])
    expect(within(body[0]).getByRole('rowheader')).toHaveTextContent('ada')
    fireEvent.click(screen.getByRole('button', { name: 'Chart' }))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('AC3: legend labels outcomes by text', () => {
    render(<ReviewsChart rows={rows} />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(legend).toHaveTextContent('Approved')
    expect(legend).toHaveTextContent('Changes requested')
    expect(legend).toHaveTextContent('Commented')
  })

  it('AC3: has no region role', () => {
    render(<ReviewsChart rows={rows} />)
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })
})
