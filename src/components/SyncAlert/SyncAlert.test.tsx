import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { StartSyncResult, SyncRunState } from '../../api/client'
import DashboardProvider, { useDashboard } from '../DashboardProvider'
import { makeDeps } from '../../test/fakeDeps'
import SyncAlert from './SyncAlert'

const run = (over: Partial<SyncRunState>): SyncRunState => ({
  running: false,
  total: 0,
  index: 0,
  current: null,
  results: [],
  ...over,
})

/** Starts a sync whose polled state is driven by the `states` queue (last one repeats). */
function depsWith(states: SyncRunState[], start?: StartSyncResult) {
  const deps = makeDeps()
  let i = 0
  // Mount reads idle first; then the run states.
  deps.getSyncState.mockImplementation(async () => {
    const state = i === 0 ? run({}) : states[Math.min(i - 1, states.length - 1)]
    i += 1
    return { ok: true as const, state }
  })
  if (start) deps.startSync.mockImplementation(async () => start)
  return deps
}

function Trigger() {
  const { startSync, status } = useDashboard()
  if (status !== 'ready') return null
  return (
    <button type="button" onClick={() => startSync()}>
      Sync now
    </button>
  )
}

async function setup(deps: ReturnType<typeof makeDeps>, withSync = true) {
  const syncRef = createRef<HTMLButtonElement>()
  const settingsRef = createRef<HTMLButtonElement>()
  render(
    <DashboardProvider {...deps}>
      {withSync && (
        <button ref={syncRef} type="button">
          Sync target
        </button>
      )}
      <button ref={settingsRef} type="button">
        Settings target
      </button>
      <Trigger />
      <SyncAlert syncRef={syncRef} settingsRef={settingsRef} />
    </DashboardProvider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Sync now' }))
}

const startRunning = (total: number) => ({ ok: true as const, state: run({ running: true, total }) })

describe('SyncAlert', () => {
  it('#65 AC4: success shows a polite status with the count', async () => {
    const results = [
      { repo: 'acme/api', ok: true },
      { repo: 'acme/web', ok: true },
    ]
    await setup(depsWith([run({ total: 2, index: 2, results })], startRunning(2)))
    const strip = await screen.findByText('Synced 2 repositories.', {}, { timeout: 3000 })
    expect(strip.closest('[role]')).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('#65 AC4: singular success copy', async () => {
    await setup(
      depsWith([run({ total: 1, index: 1, results: [{ repo: 'acme/api', ok: true }] })], startRunning(1)),
    )
    expect(await screen.findByText('Synced 1 repository.', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('#65 AC5 AC9: partial failure is an alert with fixed reasons and the kept-data line', async () => {
    const results = [
      { repo: 'acme/api', ok: true },
      { repo: 'acme/web', ok: false, code: 'forbidden' },
      { repo: 'acme/new', ok: false, code: 'raw GitHub body secret' },
    ]
    await setup(depsWith([run({ total: 3, index: 3, results })], startRunning(3)))
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert).toHaveTextContent('Synced 1 of 3 repositories. 2 failed:')
    expect(alert).toHaveTextContent(
      'acme/web: access denied. Grant the token read access to Pull requests and Metadata.',
    )
    expect(alert).toHaveTextContent('acme/new: unexpected response from GitHub. Try again later.')
    expect(alert).not.toHaveTextContent('secret')
    expect(alert).toHaveTextContent('Previously stored data is kept.')
    expect(alert).toHaveAttribute('data-tone', 'caution')
  })

  it('#65 AC5: total failure of one repo names it', async () => {
    await setup(
      depsWith(
        [run({ total: 1, index: 1, results: [{ repo: 'acme/api', ok: false, code: 'unauthorized' }] })],
        startRunning(1),
      ),
    )
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert).toHaveTextContent('Could not sync acme/api.')
    expect(alert).toHaveTextContent('acme/api: GitHub rejected the token. Update GITHUB_TOKEN and restart.')
    expect(alert).toHaveAttribute('data-tone', 'bad')
  })

  it('#65 AC5: total failure of several repos', async () => {
    const results = [
      { repo: 'acme/api', ok: false, code: 'network' },
      { repo: 'acme/web', ok: false, code: 'rate_limited' },
    ]
    await setup(depsWith([run({ total: 2, index: 2, results })], startRunning(2)))
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 })
    expect(alert).toHaveTextContent('Could not sync any repository.')
  })

  it('#65 AC5: a request error shows the server-unreachable alert', async () => {
    const deps = makeDeps()
    deps.startSync.mockImplementation(async () => ({ ok: false as const, error: 'request_failed' as const }))
    await setup(deps)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Could not start the sync. Check that the local server is running, then try again.',
    )
    expect(alert).toHaveAttribute('data-tone', 'bad')
  })

  it('#65 AC7 AC9: with no token the alert shows the fix and no token value', async () => {
    const deps = makeDeps()
    deps.startSync.mockImplementation(async () => ({
      ok: false as const,
      error: 'missing_token' as const,
      message: 'ghp_FAKE_should_not_render',
    }))
    await setup(deps)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'No GitHub token configured. Copy .env.example to .env, set GITHUB_TOKEN, see the README "GitHub token" section, then restart.',
    )
    expect(alert).not.toHaveTextContent('ghp_')
  })

  it('#143 AC7: renders nothing before any sync result', async () => {
    const { container } = render(
      <DashboardProvider {...makeDeps()}>
        <SyncAlert syncRef={createRef()} settingsRef={createRef()} />
      </DashboardProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('#148 AC4: Dismiss has the unchanged accessible name and type=button in good, caution and bad strips', async () => {
    const cases: [SyncRunState['results'], string][] = [
      [[{ repo: 'acme/api', ok: true }], 'status'],
      [
        [
          { repo: 'acme/api', ok: true },
          { repo: 'acme/web', ok: false, code: 'forbidden' },
        ],
        'alert',
      ],
      [[{ repo: 'acme/api', ok: false, code: 'unauthorized' }], 'alert'],
    ]
    for (const [results, role] of cases) {
      const deps = depsWith([run({ total: results.length, index: results.length, results })], startRunning(results.length))
      await setup(deps)
      await screen.findByRole(role, {}, { timeout: 3000 })
      const buttons = screen.getAllByRole('button', { name: 'Dismiss sync result' })
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveAttribute('type', 'button')
      expect(buttons[0]).toHaveAccessibleName('Dismiss sync result')
      cleanup()
    }
  })

  it('#143 AC7: Dismiss removes the strip and focuses Sync now', async () => {
    const deps = makeDeps()
    deps.startSync.mockImplementation(async () => ({ ok: false as const, error: 'request_failed' as const }))
    await setup(deps)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss sync result' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sync target' })).toHaveFocus()
  })

  it('#143 AC7: Dismiss focuses Settings when Sync is not rendered', async () => {
    const deps = makeDeps()
    deps.startSync.mockImplementation(async () => ({ ok: false as const, error: 'request_failed' as const }))
    await setup(deps, false)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss sync result' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Settings target' })).toHaveFocus()
  })
})
