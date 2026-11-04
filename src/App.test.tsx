import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('AC2: renders the placeholder heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'Contribution Dashboard' }),
    ).toBeInTheDocument()
  })

  it('AC1: renders banner, main and contentinfo once each', () => {
    render(<App />)
    expect(screen.getAllByRole('banner')).toHaveLength(1)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
  })

  it('AC8: renders the intro line inside main', () => {
    render(<App />)
    expect(screen.getByRole('main')).toHaveTextContent(
      'Widgets for GitHub team collaboration will appear here.',
    )
  })

  it('AC3: renders the four widget regions inside main', () => {
    render(<App />)
    expect(within(screen.getByRole('main')).getAllByRole('region')).toHaveLength(
      4,
    )
  })

  it('AC6: landmarks are in DOM order banner, main, contentinfo', () => {
    render(<App />)
    const banner = screen.getByRole('banner')
    const main = screen.getByRole('main')
    const footer = screen.getByRole('contentinfo')
    expect(
      banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      main.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('AC6: nothing in the page is focusable', () => {
    const { container } = render(<App />)
    expect(
      container.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]',
      ),
    ).toHaveLength(0)
  })
})
