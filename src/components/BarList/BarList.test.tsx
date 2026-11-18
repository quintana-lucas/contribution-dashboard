import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BarList from './BarList'
import css from './BarList.module.css?inline'

const items = [
  { key: 'a', label: 'ada', value: 10, srText: 'ada: 10 merged pull requests' },
  { key: 'b', label: 'bob', value: 5, srText: 'bob: 5 merged pull requests' },
  {
    key: 'others',
    label: 'Others (3 people)',
    value: 30,
    muted: true,
    srText: 'Others (3 people): 30 merged pull requests',
  },
]

describe('BarList', () => {
  it('AC2: renders a labeled list exposing srText per item', () => {
    render(<BarList label="Contributions" items={items} />)
    const list = screen.getByRole('list', { name: 'Contributions' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('ada: 10 merged pull requests')
    expect(rows[2]).toHaveTextContent('Others (3 people): 30 merged pull requests')
  })

  it('AC2: shows the count as visible text and hides bars from AT', () => {
    render(<BarList label="Contributions" items={items} />)
    expect(screen.getByText('10')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
    for (const fill of screen.getAllByTestId('bar-fill')) {
      expect(fill.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('AC5: scales widths to the max non-muted value and clamps muted to 100%', () => {
    render(<BarList label="Contributions" items={items} />)
    const fills = screen.getAllByTestId('bar-fill')
    expect(fills[0]).toHaveStyle({ width: '100%' })
    expect(fills[1]).toHaveStyle({ width: '50%' })
    expect(fills[2]).toHaveStyle({ width: '100%' })
    expect(fills[0]).toHaveAttribute('data-muted', 'false')
    expect(fills[2]).toHaveAttribute('data-muted', 'true')
  })

  it('AC3: each outcome shows label and count as text and carries its variant', () => {
    render(
      <BarList
        label="Reviews given by outcome"
        items={[
          { key: 'a', label: 'Approved', value: 4, variant: 'solid', srText: 'Approved: 4 of 7 reviews.' },
          { key: 'c', label: 'Changes requested', value: 2, variant: 'muted', srText: 'Changes requested: 2 of 7 reviews.' },
          { key: 'm', label: 'Commented', value: 1, variant: 'hatched', srText: 'Commented: 1 of 7 reviews.' },
        ]}
      />,
    )
    const rows = within(screen.getByRole('list', { name: 'Reviews given by outcome' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Approved')
    expect(rows[0]).toHaveTextContent('Approved: 4 of 7 reviews.')
    expect(rows[1]).toHaveTextContent('Changes requested: 2 of 7 reviews.')
    expect(rows[2]).toHaveTextContent('Commented: 1 of 7 reviews.')
    expect(within(rows[2]).getByText('1')).toBeVisible()
    const fills = screen.getAllByTestId('bar-fill')
    expect(fills.map((f) => f.getAttribute('data-variant'))).toEqual(['solid', 'muted', 'hatched'])
    // variant bars all scale against the largest value
    expect(fills[0]).toHaveStyle({ width: '100%' })
    expect(fills[1]).toHaveStyle({ width: '50%' })
    expect(fills[2]).toHaveStyle({ width: '25%' })
  })

  it('#68 AC1/AC3: rows with 1- and 2-digit counts share structure and keep proportions', () => {
    render(
      <BarList
        label="Mixed"
        items={[
          { key: 'a', label: 'a', value: 5, srText: 'a: 5' },
          { key: 'b', label: 'b', value: 42, srText: 'b: 42' },
        ]}
      />,
    )
    const rows = within(screen.getByRole('list', { name: 'Mixed' })).getAllByRole('listitem')
    const cls = (row: HTMLElement) =>
      Array.from(row.children).map((c) => c.className)
    expect(rows[0].className).toBe(rows[1].className)
    expect(cls(rows[0])).toEqual(cls(rows[1]))
    const fills = screen.getAllByTestId('bar-fill')
    expect(parseFloat(fills[0].style.width)).toBeCloseTo((5 / 42) * 100)
    expect(fills[1]).toHaveStyle({ width: '100%' })
  })

  it('#68 AC2: CSS gives the count column a fixed width, not auto', () => {
    // Class names may be hashed, so match on declarations (the file has one grid-template-columns).
    const cols = /grid-template-columns:\s*([^;]+);/.exec(css)?.[1] ?? ''
    expect(cols).toMatch(/\s\d+ch\s*$/)
    expect(cols).not.toMatch(/auto/)
    expect(css).toMatch(/tabular-nums;\s*text-align:\s*right/)
  })

  it('#68 AC4: zero value renders a 0% fill', () => {
    render(
      <BarList
        label="Zero"
        items={[
          { key: 'a', label: 'a', value: 0, srText: 'a: 0' },
          { key: 'b', label: 'b', value: 10, srText: 'b: 10' },
        ]}
      />,
    )
    const fills = screen.getAllByTestId('bar-fill')
    expect(fills[0]).toHaveStyle({ width: '0%' })
  })

  it('#68 AC4: empty list renders an empty ol', () => {
    render(<BarList label="Empty" items={[]} />)
    const list = screen.getByRole('list', { name: 'Empty' })
    expect(list.tagName).toBe('OL')
    expect(list.children).toHaveLength(0)
  })

  it('AC5: long labels carry a title with the full text', () => {
    const long = 'a-very-long-login-name-that-will-be-truncated'
    render(
      <BarList
        label="Contributions"
        items={[{ key: 'x', label: long, value: 1, srText: `${long}: 1 merged pull request` }]}
      />,
    )
    expect(screen.getByTitle(long)).toBeInTheDocument()
  })
})
