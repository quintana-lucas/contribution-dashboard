import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeDeps } from './test/fakeDeps'

async function renderApp() {
  const utils = render(<App {...makeDeps()} />)
  await screen.findByLabelText('Repository')
  return utils
}

describe('App', () => {
  it('AC2: renders the placeholder heading', async () => {
    await renderApp()
    expect(
      screen.getByRole('heading', { name: 'Contribution Dashboard' }),
    ).toBeInTheDocument()
  })

  it('AC1: renders banner, main and contentinfo once each', async () => {
    await renderApp()
    expect(screen.getAllByRole('banner')).toHaveLength(1)
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1)
  })

  it('AC8: renders the intro line inside main', async () => {
    await renderApp()
    expect(screen.getByRole('main')).toHaveTextContent(
      'Widgets for GitHub team collaboration will appear here.',
    )
  })

  it('AC3: renders the four widget regions inside main', async () => {
    await renderApp()
    // The toolbar group is not a region, so only the widgets count.
    expect(within(screen.getByRole('main')).getAllByRole('region')).toHaveLength(
      4,
    )
  })

  it('AC6: landmarks are in DOM order banner, main, contentinfo', async () => {
    await renderApp()
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

  // Superseded by #16: besides the two tabs, the only focusable elements are the toolbar
  // controls (the repository select and the three period radios).
  it('AC6: only the two tabs and the toolbar controls are focusable', async () => {
    const { container } = await renderApp()
    const focusable = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]',
    )
    expect(focusable).toHaveLength(6)
    const tabs = [...focusable].filter((el) => el.getAttribute('role') === 'tab')
    expect(tabs).toHaveLength(2)
    const others = [...focusable].filter((el) => el.getAttribute('role') !== 'tab')
    expect(others.map((el) => el.tagName)).toEqual(['SELECT', 'INPUT', 'INPUT', 'INPUT'])
  })

  it('AC1: shows Overview and Team tabs, Overview selected with the grid', async () => {
    await renderApp()
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

  it('AC3: selecting Team shows the placeholder and hides the grid', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
    expect(screen.getByTestId('team-placeholder')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Widget 1' })).toBeNull()
  })

  it('AC4: switching tabs makes no request and does not navigate', async () => {
    await renderApp()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const before = window.location.href
    try {
      fireEvent.click(screen.getByRole('tab', { name: 'Team' }))
      fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
      expect(fetchSpy).not.toHaveBeenCalled()
      expect(xhrSpy).not.toHaveBeenCalled()
      expect(window.location.href).toBe(before)
    } finally {
      vi.unstubAllGlobals()
      xhrSpy.mockRestore()
    }
  })

  it('AC5: Widget 1..4 regions keep their names inside the Overview panel', async () => {
    await renderApp()
    const panel = screen.getByRole('tabpanel')
    for (const n of [1, 2, 3, 4]) {
      expect(
        within(panel).getByRole('region', { name: `Widget ${n}` }),
      ).toBeInTheDocument()
    }
    expect(within(panel).getAllByRole('region')).toHaveLength(4)
  })
})
