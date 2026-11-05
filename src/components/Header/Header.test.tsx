import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Header from './Header'

describe('Header', () => {
  it('AC8: renders the banner landmark', () => {
    render(<Header />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('AC2: renders the product name as the h1', () => {
    render(<Header />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Contribution Dashboard' }),
    ).toBeInTheDocument()
  })

  it('AC2: renders the non-focusable profile slot', () => {
    render(<Header />)
    const slot = screen.getByRole('group', {
      name: 'Placeholder for future header controls',
    })
    expect(slot).toHaveTextContent('Profile (coming soon)')
    expect(slot).not.toHaveAttribute('tabindex')
  })
})
