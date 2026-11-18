import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StartSyncResult, SyncRunState } from '../../api/client'
import DashboardProvider, { useDashboard } from '../DashboardProvider'
import { makeDeps } from '../../test/fakeDeps'
import Toolbar from './Toolbar'

function Probe() {
  const { period, selection, selectActivity } = useDashboard()
  const a = selectActivity()
  return (
    <p data-testid="probe">
      {`${selection}|${period}|${a.buckets.length}|${a.teamMemberCount}`}
    </p>
  )
}

async function renderToolbar(deps = makeDeps()) {
  render(
    <DashboardProvider {...deps}>
      <Toolbar />
      <Probe />
    </DashboardProvider>,
  )
  await screen.findByLabelText('Repository')
  return deps
}

describe('Toolbar', () => {
  it('#16 AC1: the selector lists All repositories plus each repo', async () => {
    await renderToolbar()
    const select = screen.getByLabelText('Repository')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'All repositories',
      'acme/api',
      'acme/web',
      'acme/new',
    ])
  })

  it('#16 AC1: the subline changes when one repo is picked', async () => {
    await renderToolbar()
    expect(screen.getByRole('status')).toHaveTextContent(
      '3 repositories · 4 members · synced 3 h ago (1 not synced yet)',
    )
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/api' } })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Base branch develop · 2 members · synced 3 h ago',
    )
  })

  it('#16 AC1: shows the loading text before data arrives', () => {
    const deps = { ...makeDeps(), listRepos: vi.fn(() => new Promise<never>(() => {})) }
    render(
      <DashboardProvider {...deps}>
        <Toolbar />
      </DashboardProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading repository data…')
    expect(screen.queryByLabelText('Repository')).toBeNull()
  })

  it('#16 AC2: 30 days is checked by default', async () => {
    await renderToolbar()
    expect(screen.getByRole('radio', { name: '30 days' })).toBeChecked()
    expect(screen.getByTestId('probe')).toHaveTextContent('all|30|5|')
  })

  it('#16 AC2: changing the period updates useDashboard values', async () => {
    await renderToolbar()
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('all|7|7|4')
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(screen.getByTestId('probe')).toHaveTextContent('all|90|13|4')
  })

  it('#16 AC3: a never-synced repo shows only "not synced yet"', async () => {
    await renderToolbar()
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/new' } })
    expect(screen.getByRole('status')).toHaveTextContent(/^not synced yet$/)
  })

  it('#16 AC5: controls have accessible names', async () => {
    await renderToolbar()
    expect(screen.getByRole('group', { name: 'Dashboard filters' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Repository' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Period' })).toBeInTheDocument()
    for (const name of ['7 days', '30 days', '90 days']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
  })

  // jsdom does not implement Tab order or arrow-key movement in radio groups, and the
  // project has no user-event. So this checks the native structure those behaviors need:
  // select before the period group in DOM order, one shared radio name, no tabindex
  // overrides, a fieldset/legend, and that selecting a radio changes the period.
  it('#16 AC5: select comes before the native period radio group; selecting changes the period', async () => {
    await renderToolbar()
    const select = screen.getByLabelText('Repository')
    const radios = screen.getAllByRole('radio')
    expect(
      select.compareDocumentPosition(radios[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(new Set(radios.map((r) => r.getAttribute('name'))).size).toBe(1)
    for (const el of [select, ...radios]) expect(el).not.toHaveAttribute('tabindex')
    expect(screen.getByRole('group', { name: 'Period' }).tagName).toBe('FIELDSET')
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(['7', '30', '90'])
    fireEvent.click(radios[2])
    expect(radios[2]).toBeChecked()
    expect(screen.getByTestId('probe')).toHaveTextContent('all|90|')
    fireEvent.click(radios[0])
    expect(radios[0]).toBeChecked()
  })

  it('#16 AC6: the error state shows the message and no controls', async () => {
    const deps = {
      ...makeDeps(),
      listRepos: vi.fn(async () => ({ ok: false as const, error: 'request_failed' as const })),
    }
    render(
      <DashboardProvider {...deps}>
        <Toolbar />
      </DashboardProvider>,
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Could not load repository data. Check that the local server is running, then reload the page.',
    )
    expect(screen.queryByLabelText('Repository')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})

describe('Toolbar Sync now (#65)', () => {
  const run = (over: Partial<SyncRunState>): SyncRunState => ({
    running: false,
    total: 0,
    index: 0,
    current: null,
    results: [],
    ...over,
  })
  const syncButton = () => screen.getByRole('button', { name: /^Sync(ing…| now)$/ })

  /** Starts a sync whose polled state is driven by the `states` queue (last one repeats). */
  function depsWith(states: SyncRunState[], start?: StartSyncResult) {
    const deps = makeDeps()
    let i = 0
    // Mount reads idle first (AC11); then the run states.
    deps.getSyncState.mockImplementation(async () => {
      const state = i === 0 ? run({}) : states[Math.min(i - 1, states.length - 1)]
      i += 1
      return { ok: true as const, state }
    })
    if (start) deps.startSync.mockImplementation(async () => start)
    return deps
  }

  async function clickSync(deps: ReturnType<typeof makeDeps>) {
    await renderToolbar(deps)
    fireEvent.click(syncButton())
  }

  it('#65 AC2: the idle button reads "Sync now" and is the last control of the row', async () => {
    await renderToolbar()
    const button = screen.getByRole('button', { name: 'Sync now' })
    expect(button).not.toHaveAttribute('aria-disabled', 'true')
    const radios = screen.getAllByRole('radio')
    expect(
      radios[2].compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('#65 AC2: shows "Starting sync…" and then the current repo and position', async () => {
    const deps = depsWith(
      [run({ running: true, total: 5, index: 2, current: 'acme/api' })],
      { ok: true, state: run({ running: true, total: 5 }) },
    )
    await clickSync(deps)
    expect(await screen.findByText('Starting sync…')).toBeInTheDocument()
    expect(await screen.findByText('Syncing acme/api, 2 of 5', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Syncing…' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('#65 AC3: a click while running does nothing', async () => {
    const deps = depsWith([], { ok: true, state: run({ running: true, total: 2 }) })
    await clickSync(deps)
    const button = await screen.findByRole('button', { name: 'Syncing…' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(deps.startSync).toHaveBeenCalledTimes(1)
  })

  it('#65 AC4: success shows a polite status with the count', async () => {
    const results = [
      { repo: 'acme/api', ok: true },
      { repo: 'acme/web', ok: true },
    ]
    const deps = depsWith([run({ total: 2, index: 2, current: 'acme/web', results })], {
      ok: true,
      state: run({ running: true, total: 2 }),
    })
    await clickSync(deps)
    expect(await screen.findByText('Synced 2 repositories.', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(syncButton()).toHaveTextContent('Sync now')
  })

  it('#65 AC4: singular success copy', async () => {
    const deps = depsWith([run({ total: 1, index: 1, results: [{ repo: 'acme/api', ok: true }] })], {
      ok: true,
      state: run({ running: true, total: 1 }),
    })
    await clickSync(deps)
    expect(await screen.findByText('Synced 1 repository.', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('#65 AC5 AC9: partial failure is an alert with fixed reasons and the kept-data line', async () => {
    const results = [
      { repo: 'acme/api', ok: true },
      { repo: 'acme/web', ok: false, code: 'forbidden' },
      { repo: 'acme/new', ok: false, code: 'raw GitHub body secret' },
    ]
    const deps = depsWith([run({ total: 3, index: 3, results })], {
      ok: true,
      state: run({ running: true, total: 3 }),
    })
    await clickSync(deps)
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert).toHaveTextContent('Synced 1 of 3 repositories. 2 failed:')
    expect(alert).toHaveTextContent(
      'acme/web: access denied. Grant the token read access to Pull requests and Metadata.',
    )
    expect(alert).toHaveTextContent('acme/new: unexpected response from GitHub. Try again later.')
    expect(alert).not.toHaveTextContent('secret')
    expect(alert).toHaveTextContent('Previously stored data is kept.')
    expect(syncButton()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('#65 AC5: total failure of one repo names it', async () => {
    const deps = depsWith(
      [run({ total: 1, index: 1, results: [{ repo: 'acme/api', ok: false, code: 'unauthorized' }] })],
      { ok: true, state: run({ running: true, total: 1 }) },
    )
    await clickSync(deps)
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert).toHaveTextContent('Could not sync acme/api.')
    expect(alert).toHaveTextContent('acme/api: GitHub rejected the token. Update GITHUB_TOKEN and restart.')
  })

  it('#65 AC5: total failure of several repos', async () => {
    const results = [
      { repo: 'acme/api', ok: false, code: 'network' },
      { repo: 'acme/web', ok: false, code: 'rate_limited' },
    ]
    const deps = depsWith([run({ total: 2, index: 2, results })], {
      ok: true,
      state: run({ running: true, total: 2 }),
    })
    await clickSync(deps)
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert).toHaveTextContent('Could not sync any repository.')
  })

  it('#65 AC5: a request error shows the server-unreachable alert', async () => {
    const deps = makeDeps()
    deps.startSync.mockImplementation(async () => ({ ok: false as const, error: 'request_failed' as const }))
    await clickSync(deps)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not start the sync. Check that the local server is running, then try again.',
    )
    expect(syncButton()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('#65 AC7 AC9: with no token the alert shows the fix and no token value', async () => {
    const deps = makeDeps()
    deps.startSync.mockImplementation(async () => ({
      ok: false as const,
      error: 'missing_token' as const,
      message: 'ghp_FAKE_should_not_render',
    }))
    await clickSync(deps)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'No GitHub token configured. Copy .env.example to .env, set GITHUB_TOKEN, see the README "GitHub token" section, then restart.',
    )
    expect(alert).not.toHaveTextContent('ghp_')
    expect(syncButton()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('#65 AC5: Dismiss clears the result and returns focus to Sync now', async () => {
    const deps = makeDeps()
    deps.startSync.mockImplementation(async () => ({ ok: false as const, error: 'request_failed' as const }))
    await clickSync(deps)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss sync result' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(syncButton()).toHaveFocus()
  })

  it('#65 AC8: no repos renders no Toolbar and no button', async () => {
    const deps = {
      ...makeDeps(),
      listRepos: vi.fn(async () => ({ ok: true as const, repos: [] })),
    }
    const { container } = render(
      <DashboardProvider {...deps}>
        <Toolbar />
      </DashboardProvider>,
    )
    await waitFor(() => expect(deps.listRepos).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: /Sync/ })).toBeNull()
  })
})
