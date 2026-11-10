import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeDeps, storedRepo } from './test/fakeDeps'

const SYNCED_AT = '2026-06-15T09:00:00.000Z'

/** Fake deps backed by a mutable list of linked repos (a tiny in-memory server). */
function statefulDeps(initial: string[]) {
  const linked = [...initial]
  const row = (repo: string) => ({ repo, syncedAt: SYNCED_AT, baseBranch: 'main', people: 1 })
  return {
    ...makeDeps(),
    listRepos: vi.fn(async () => ({ ok: true as const, repos: linked.map(row) })),
    getRepoData: vi.fn(async (repo: string) => ({
      ok: true as const,
      data: storedRepo(repo, SYNCED_AT, ['ana']),
    })),
    addRepo: vi.fn(async (input: string) => {
      linked.push(input)
      return { ok: true as const, repo: input, synced: true as const, people: 1 }
    }),
    removeRepo: vi.fn(async (repo: string) => {
      linked.splice(linked.indexOf(repo), 1)
      return { ok: true as const }
    }),
  }
}

const openSettingsButton = () => screen.getByRole('button', { name: 'Open settings' })

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  // Superseded by #16 and then by #8: besides the two tabs, the only focusable elements are
  // the Header Settings button and the toolbar controls (the repository select and the three
  // period radios).
  it('AC6: only the two tabs, the Settings button and the toolbar controls are focusable', async () => {
    const { container } = await renderApp()
    const focusable = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]',
    )
    expect(focusable).toHaveLength(7)
    const tabs = [...focusable].filter((el) => el.getAttribute('role') === 'tab')
    expect(tabs).toHaveLength(2)
    const others = [...focusable].filter((el) => el.getAttribute('role') !== 'tab')
    expect(others.map((el) => el.tagName)).toEqual(['BUTTON', 'SELECT', 'INPUT', 'INPUT', 'INPUT'])
    expect(others[0]).toHaveAccessibleName('Open settings')
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

describe('App settings', () => {
  it('#8 AC1: the empty-state button opens Settings', async () => {
    render(<App {...statefulDeps([])} />)
    await screen.findByText('Set up your dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Add repositories' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('#8 AC1: the Header Settings button opens Settings', async () => {
    render(<App {...makeDeps()} />)
    await screen.findByLabelText('Repository')
    fireEvent.click(openSettingsButton())
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
  })

  it('#8 AC11: closing without a change returns focus to the opener and does not reload', async () => {
    const deps = makeDeps()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<App {...deps} />)
    await screen.findByLabelText('Repository')
    openSettingsButton().focus()
    fireEvent.click(openSettingsButton())
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    await within(dialog).findByText('acme/api')
    const listCalls = deps.listRepos.mock.calls.length
    const dataCalls = deps.getRepoData.mock.calls.length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(openSettingsButton()).toHaveFocus())
    expect(deps.listRepos).toHaveBeenCalledTimes(listCalls)
    expect(deps.getRepoData).toHaveBeenCalledTimes(dataCalls)
    // The Team members panel (mounted, hidden) reads /api/team on open; nothing else hits the network.
    expect(fetchSpy.mock.calls.filter(([url]) => url !== '/api/team')).toEqual([])
  })

  it('#8 AC11: after an add and close, the empty state is gone and focus lands on the Header button', async () => {
    render(<App {...statefulDeps([])} />)
    await screen.findByText('Set up your dashboard')
    fireEvent.click(screen.getByRole('button', { name: 'Add repositories' }))
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    fireEvent.change(within(dialog).getByLabelText('Repository'), { target: { value: 'acme/new' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
    await within(dialog).findByText('Added acme/new. 1 person found.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    await waitFor(() => expect(screen.queryByText('Set up your dashboard')).toBeNull())
    await waitFor(() => expect(openSettingsButton()).toHaveFocus())
  })

  it('#8 AC1: closing after a change reloads once, so the toolbar lists the new repo set', async () => {
    const deps = statefulDeps(['acme/api'])
    render(<App {...deps} />)
    await screen.findByLabelText('Repository')
    fireEvent.click(openSettingsButton())
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    await within(dialog).findByText('acme/api')
    fireEvent.change(within(dialog).getByLabelText('Repository'), { target: { value: 'acme/new' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
    await within(dialog).findByText('Added acme/new. 1 person found.')
    const before = deps.getRepoData.mock.calls.length
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    await waitFor(() => {
      const options = within(screen.getByLabelText('Repository')).getAllByRole('option')
      expect(options.map((o) => o.textContent)).toEqual(['All repositories', 'acme/api', 'acme/new'])
    })
    // One reload: both synced repos are read again, once.
    expect(deps.getRepoData.mock.calls.length - before).toBe(2)
  })

  it('#8 AC13: the full flow only calls relative /api/ URLs, never GitHub', async () => {
    const linked = ['acme/api']
    const urls: string[] = []
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      urls.push(url)
      const method = init?.method ?? 'GET'
      if (url === '/api/repos' && method === 'GET') {
        return json({
          repos: linked.map((repo) => ({ repo, syncedAt: SYNCED_AT, baseBranch: 'main', people: 1 })),
        })
      }
      if (url === '/api/repos' && method === 'POST') {
        const { input: repo } = JSON.parse(String(init?.body)) as { input: string }
        linked.push(repo)
        return json({ repo, synced: true, people: 2 }, 201)
      }
      if (url === '/api/token-status') return json({ configured: true })
      if (url.startsWith('/api/data?repo=')) {
        const repo = decodeURIComponent(url.split('=')[1])
        return json(storedRepo(repo, SYNCED_AT, ['ana']))
      }
      if (url.endsWith('/sync') && method === 'POST') return json({ ok: true, people: 3 })
      if (method === 'DELETE') {
        linked.pop()
        return json({ ok: true })
      }
      return json({ error: 'unexpected' }, 500)
    })
    vi.stubGlobal('fetch', fetchSpy)

    render(<App />)
    await screen.findByLabelText('Repository')
    fireEvent.click(openSettingsButton())
    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    await within(dialog).findByText('acme/api')
    fireEvent.change(within(dialog).getByLabelText('Repository'), { target: { value: 'acme/new' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }))
    await within(dialog).findByText('Added acme/new. 2 people found.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sync acme/api' }))
    await within(dialog).findByText('Synced just now. 3 people found.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove acme/new' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove repository' }))
    await within(dialog).findByText('Removed acme/new.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close settings' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByLabelText('Repository')).toBeInTheDocument())

    expect(urls.length).toBeGreaterThan(0)
    expect(urls.some((u) => u === '/api/repos/acme/api/sync')).toBe(true)
    for (const url of urls) {
      expect(url.startsWith('/api/')).toBe(true)
      expect(url).not.toContain('api.github.com')
    }
  })
})
