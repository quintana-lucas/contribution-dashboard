import { fireEvent, render, screen, within } from '@testing-library/react'
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

const barWidth = (el: Element) => parseFloat(el.getAttribute('width') ?? '')

describe('BarList', () => {
  it('#107 AC2: renders a labeled list exposing srText per item', () => {
    render(<BarList label="Contributions" items={items} />)
    const list = screen.getByRole('list', { name: 'Contributions' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('ada: 10 merged pull requests')
    expect(rows[2]).toHaveTextContent('Others (3 people): 30 merged pull requests')
  })

  it('#107 AC2: shows the count as visible text and hides bars from AT', () => {
    render(<BarList label="Contributions" items={items} />)
    expect(screen.getByText('10')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
    for (const fill of screen.getAllByTestId('bar-fill')) {
      expect(fill.closest('[aria-hidden="true"]')).not.toBeNull()
    }
  })

  it('#107 AC2: bars scale to the max non-muted value and the muted row is clamped to the track', () => {
    render(<BarList label="Contributions" items={items} />)
    const fills = screen.getAllByTestId('bar-fill')
    const full = barWidth(fills[0])
    expect(barWidth(fills[1])).toBeCloseTo(full / 2)
    expect(barWidth(fills[2])).toBeCloseTo(full)
    expect(fills[0]).toHaveAttribute('data-muted', 'false')
    expect(fills[2]).toHaveAttribute('data-muted', 'true')
  })

  it('#107 AC6: variants solid, muted and caution use color tokens, no patterns', () => {
    const { container } = render(
      <BarList
        label="Reviews given by outcome"
        items={[
          { key: 'a', label: 'Approved', value: 4, variant: 'solid', srText: 'Approved: 4 of 7 reviews.' },
          { key: 'c', label: 'Changes requested', value: 2, variant: 'caution', srText: 'Changes requested: 2 of 7 reviews.' },
          { key: 'm', label: 'Commented', value: 1, variant: 'muted', srText: 'Commented: 1 of 7 reviews.' },
        ]}
      />,
    )
    const rows = within(screen.getByRole('list', { name: 'Reviews given by outcome' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Approved')
    expect(rows[2]).toHaveTextContent('Commented: 1 of 7 reviews.')
    expect(within(rows[2]).getByText('1')).toBeVisible()
    const fills = screen.getAllByTestId('bar-fill')
    expect(fills.map((f) => f.getAttribute('data-variant'))).toEqual(['solid', 'caution', 'muted'])
    expect(fills.map((f) => f.getAttribute('fill'))).toEqual([
      'var(--color-good)',
      'var(--color-caution)',
      'var(--color-bar-muted)',
    ])
    expect(container.innerHTML).not.toMatch(/url\(|gradient|hatched/)
    expect(css).not.toMatch(/hatched|repeating-linear-gradient/i)
    const full = barWidth(fills[0])
    expect(barWidth(fills[1])).toBeCloseTo(full / 2)
    expect(barWidth(fills[2])).toBeCloseTo(full / 4)
  })

  it('#107 AC4: a small value next to a large one still draws at least the minimum mark', () => {
    render(
      <BarList
        label="Mixed"
        items={[
          { key: 'a', label: 'a', value: 1, srText: 'a: 1' },
          { key: 'b', label: 'b', value: 10000, srText: 'b: 10000' },
        ]}
      />,
    )
    expect(barWidth(screen.getAllByTestId('bar-fill')[0])).toBeGreaterThanOrEqual(4)
  })

  it('#68 AC1/AC3: rows with 1- and 2-digit counts share structure', () => {
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
    const cls = (row: HTMLElement) => Array.from(row.children).map((c) => c.className)
    expect(rows[0].className).toBe(rows[1].className)
    expect(cls(rows[0])).toEqual(cls(rows[1]))
    const fills = screen.getAllByTestId('bar-fill')
    expect(barWidth(fills[0]) / barWidth(fills[1])).toBeCloseTo(5 / 42)
  })

  it('#68 AC2: CSS gives the count column a fixed width, not auto', () => {
    // Class names may be hashed, so match on declarations (the file has one grid-template-columns).
    const cols = /grid-template-columns:\s*([^;]+);/.exec(css)?.[1] ?? ''
    expect(cols).toMatch(/\s\d+ch\s*$/)
    expect(cols).not.toMatch(/auto/)
    expect(css).toMatch(/tabular-nums;\s*text-align:\s*right/)
  })

  it('#107 AC4: a zero value draws no mark but keeps the row and its 0', () => {
    render(
      <BarList
        label="Zero"
        items={[
          { key: 'a', label: 'a', value: 0, srText: 'a: 0' },
          { key: 'b', label: 'b', value: 10, srText: 'b: 10' },
        ]}
      />,
    )
    const rows = within(screen.getByRole('list', { name: 'Zero' })).getAllByRole('listitem')
    expect(within(rows[0]).queryByTestId('bar-fill')).toBeNull()
    expect(within(rows[0]).getByText('0')).toBeVisible()
    expect(within(rows[1]).getByTestId('bar-fill')).toBeInTheDocument()
  })

  it('#68 AC4: empty list renders an empty ol', () => {
    render(<BarList label="Empty" items={[]} />)
    const list = screen.getByRole('list', { name: 'Empty' })
    expect(list.tagName).toBe('OL')
    expect(list.children).toHaveLength(0)
  })

  it('#107 AC2: long labels carry a title with the full text', () => {
    const long = 'a-very-long-login-name-that-will-be-truncated'
    render(
      <BarList
        label="Contributions"
        items={[{ key: 'x', label: long, value: 1, srText: `${long}: 1 merged pull request` }]}
      />,
    )
    expect(screen.getByTitle(long)).toBeInTheDocument()
  })

  it('#107 AC5: focus opens a tooltip with the label as title and one valueLabel row, Escape closes', () => {
    render(<BarList label="Contributions" items={items} valueLabel="Merged PRs" />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveAttribute('tabindex', '0')
    fireEvent.focus(rows[0])
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('ada')).toBeInTheDocument()
    expect(within(tip).getByText('Merged PRs')).toBeInTheDocument()
    expect(within(tip).getByText('10')).toBeInTheDocument()
    expect(within(tip).getAllByRole('listitem')).toHaveLength(1)
    fireEvent.keyDown(rows[0], { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('#107 AC5: valueLabel falls back to "Count"', () => {
    render(<BarList label="Contributions" items={items} />)
    fireEvent.focus(screen.getAllByRole('listitem')[1])
    expect(within(screen.getByRole('tooltip')).getByText('Count')).toBeInTheDocument()
  })
})
