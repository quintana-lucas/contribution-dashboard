import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TeamPlaceholder from './TeamPlaceholder'

describe('TeamPlaceholder', () => {
  it('AC3: shows an empty placeholder that is not a named region', () => {
    render(<TeamPlaceholder />)
    expect(screen.getByTestId('team-placeholder')).toHaveTextContent(
      'The team table is not available yet.',
    )
    expect(screen.queryAllByRole('region')).toHaveLength(0)
  })
})
