import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Widget from './Widget'

describe('Widget', () => {
  it('AC8: renders a region named after its title with hint and placeholder', () => {
    render(<Widget title="Widget 9" hint="Future: something" />)
    const region = screen.getByRole('region', { name: 'Widget 9' })
    expect(region).toHaveTextContent('Future: something')
    expect(region).toHaveTextContent('Placeholder. No data yet.')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Widget 9' }),
    ).toBeInTheDocument()
  })
})
