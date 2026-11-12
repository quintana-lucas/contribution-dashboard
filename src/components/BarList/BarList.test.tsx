import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import BarList from './BarList'

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
