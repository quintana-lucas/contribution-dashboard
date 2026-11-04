import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('AC4: renders the root component with the placeholder heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Contribution Dashboard' }),
    ).toBeInTheDocument()
  })
})
