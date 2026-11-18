import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ReviewsChart from './ReviewsChart'
import css from './ReviewsChart.module.css?inline'

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

  const stacks = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('ol > li > span:nth-child(3) > span'))

  it('#72 AC1: rows with different digit counts share the same structure', () => {
    const { container } = render(
      <ReviewsChart
        rows={[
          { login: 'a', approved: 5, changesRequested: 0, commented: 0, total: 5 },
          { login: 'b', approved: 12, changesRequested: 0, commented: 0, total: 12 },
        ]}
      />,
    )
    const items = Array.from(container.querySelectorAll('ol > li'))
    expect(items).toHaveLength(2)
    const shape = (li: Element) => Array.from(li.children).map((c) => c.className)
    expect(items[0].className).toBe(items[1].className)
    expect(shape(items[0])).toEqual(shape(items[1]))
    expect(items[0].children).toHaveLength(4)
  })

  it('#72 AC2: CSS gives the count column a fixed width, right-aligned, tabular', () => {
    const cols = /grid-template-columns:\s*([^;]+);/.exec(css)?.[1] ?? ''
    expect(cols).toMatch(/\s\d+ch\s*$/)
    expect(cols).not.toMatch(/auto/)
    expect(css).toMatch(/tabular-nums;\s*text-align:\s*right/)
  })

  it('#72 AC3: each stack width is proportional to total / max', () => {
    const { container } = render(
      <ReviewsChart
        rows={[
          { login: 'a', approved: 5, changesRequested: 0, commented: 0, total: 5 },
          { login: 'b', approved: 12, changesRequested: 0, commented: 0, total: 12 },
        ]}
      />,
    )
    const [a, b] = stacks(container)
    expect(parseFloat(a.style.width)).toBeCloseTo((5 / 12) * 100)
    expect(b).toHaveStyle({ width: '100%' })
  })

  it('#72 AC4: a zero total shows "0" and an empty 0% stack', () => {
    const { container } = render(
      <ReviewsChart
        rows={[
          { login: 'z', approved: 0, changesRequested: 0, commented: 0, total: 0 },
          { login: 'y', approved: 3, changesRequested: 0, commented: 0, total: 3 },
        ]}
      />,
    )
    const items = container.querySelectorAll('ol > li')
    expect(items[0].children[3]).toHaveTextContent('0')
    const [zero] = stacks(container)
    expect(zero).toHaveStyle({ width: '0%' })
    expect(zero.children).toHaveLength(0)
  })

  it('#72 AC4: empty rows render an empty list without crashing', () => {
    render(<ReviewsChart rows={[]} />)
    const list = screen.getByRole('list', { name: 'Reviews given per person' })
    expect(list).toBeEmptyDOMElement()
  })
})
