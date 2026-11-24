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
    expect(container.firstElementChild?.children).toHaveLength(1)
  })

  // AC2
  it('AC2: the sub-line sits in a footer that is the last child of the card', () => {
    const { container } = render(<StatCard label="Open PRs" value="3" subline="sub" />)
    const card = container.firstElementChild as HTMLElement
    const footer = card.lastElementChild as HTMLElement
    expect(footer).not.toBe(card.firstElementChild)
    expect(footer.className).toMatch(/footer/i)
    expect(footer).toContainElement(screen.getByText('sub'))
  })

  // AC3
  it('AC3: label, value and trend live in the body, the first child of the card', () => {
    const { container } = render(
      <StatCard label="Merged PRs" value="28" trend={<div data-testid="trend" />} subline="sub" />,
    )
    const body = container.firstElementChild?.firstElementChild as HTMLElement
    expect(body.className).toMatch(/body/i)
    expect(body).toContainElement(screen.getByText('Merged PRs'))
    expect(body).toContainElement(screen.getByText('28'))
    expect(body).toContainElement(screen.getByTestId('trend'))
    expect(body).not.toContainElement(screen.getByText('sub'))
  })

  it('AC3: a card without a sub-line has a body and no footer', () => {
    const { container } = render(<StatCard label="Merged PRs" value="1" />)
    const card = container.firstElementChild as HTMLElement
    expect(card.firstElementChild?.className).toMatch(/body/i)
    expect(card.querySelector('[class*="footer"]')).toBeNull()
  })

  // #84 AC3, AC5
  it('#84 AC3: sublineTone caution adds a caution class and renders the icon before the text in one element', () => {
    render(
      <StatCard
        label="Open PRs"
        value="3"
        subline="3 waiting for review over 24 h"
        sublineTone="caution"
        sublineIcon={<svg data-testid="icon" />}
      />,
    )
    const sub = screen.getByText('3 waiting for review over 24 h')
    expect(sub.className).toMatch(/caution/i)
    expect(sub.firstElementChild).toBe(screen.getByTestId('icon').parentElement)
  })

  it('#84 AC4: without tone or icon the sub-line is neutral and has no icon', () => {
    render(<StatCard label="Open PRs" value="0" subline="0 waiting for review over 24 h" />)
    const sub = screen.getByText('0 waiting for review over 24 h')
    expect(sub.className).not.toMatch(/caution/i)
    expect(sub.querySelector('svg')).toBeNull()
  })

  // #87 AC1
  it('#87 AC1: renders the trend slot between the value and the sub-line', () => {
    render(<StatCard label="Merged PRs" value="28" trend={<div data-testid="trend" />} subline="sub" />)
    const trend = screen.getByTestId('trend')
    expect(trend.previousElementSibling).toBe(screen.getByText('28'))
    expect(trend.nextElementSibling).toBeNull()
    expect(trend.parentElement?.nextElementSibling).toContainElement(screen.getByText('sub'))
  })

  it('#87 AC7: without a trend the card is unchanged', () => {
    const { container } = render(<StatCard label="Open PRs" value="3" subline="sub" />)
    const card = container.firstElementChild as HTMLElement
    expect(card.children).toHaveLength(2)
    expect(card.firstElementChild?.children).toHaveLength(2)
  })

  it('AC4: value is never empty', () => {
    render(<StatCard label="Merged PRs" value="" />)
    expect(screen.getByText('…')).toBeInTheDocument()
  })
})
