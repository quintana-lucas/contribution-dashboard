import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Footer from './Footer'

describe('Footer', () => {
  it('AC8: renders the contentinfo landmark with the footer text', () => {
    render(<Footer />)
    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(
      'Contribution Dashboard runs locally on your machine. Placeholder content only.',
    )
  })
})
