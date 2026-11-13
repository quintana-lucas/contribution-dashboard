import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatCard from '.'

describe('StatCard', () => {
  it('AC3: renders label, value and sub-line as text', () => {
    render(<StatCard label="Open PRs" value="12" subline="3 waiting for review over 24 h" />)
    expect(screen.getByText('Open PRs')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('3 waiting for review over 24 h')).toBeInTheDocument()
  })

  it('AC3: exposes srText to screen readers and hides the visible value', () => {
    render(<StatCard label="Lines" value="+5 / −2" srText="5 lines added, 2 lines deleted" />)
    expect(screen.getByText('+5 / −2')).toHaveAttribute('aria-hidden', 'true')
    const sr = screen.getByText('5 lines added, 2 lines deleted')
    expect(sr).toBeInTheDocument()
    expect(sr).not.toHaveAttribute('aria-hidden')
  })

  it('AC4: renders no sub-line when omitted', () => {
    const { container } = render(<StatCard label="Merged PRs" value="No data yet" />)
    expect(container.firstElementChild?.children).toHaveLength(2)
  })

  it('AC4: value is never empty', () => {
    render(<StatCard label="Merged PRs" value="" />)
    expect(screen.getByText('…')).toBeInTheDocument()
  })
})
