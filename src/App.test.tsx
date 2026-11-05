import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  // Superseded by #14: the two tabs are now the only focusable elements.
  it('AC6: only the two tabs are focusable', () => {
    const { container } = render(<App />)
    const focusable = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]',
    )
    expect(focusable).toHaveLength(2)
    focusable.forEach((el) => expect(el).toHaveAttribute('role', 'tab'))
  })

  it('AC1: shows Overview and Team tabs, Overview selected with the grid', () => {
    render(<App />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Team'])
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByRole('region', { name: 'Widget 1' })).toBeVisible()
  })

  it('AC3: selecting Team shows the placeholder and hides the grid', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
    expect(screen.getByTestId('team-placeholder')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Widget 1' })).toBeNull()
  })

  it('AC4: switching tabs makes no request and does not navigate', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const before = window.location.href
    render(<App />)
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
    expect(window.location.href).toBe(before)
    vi.unstubAllGlobals()
    xhrSpy.mockRestore()
  })
})
