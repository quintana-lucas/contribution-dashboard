import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { StartSyncResult, SyncRunState } from '../../api/client'
import DashboardProvider from '../DashboardProvider'
import { makeDeps } from '../../test/fakeDeps'
import SyncControl from './SyncControl'

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

function renderControl(deps = makeDeps(), ref = createRef<HTMLButtonElement>()) {
  render(
    <DashboardProvider {...deps}>
      <SyncControl syncRef={ref} />
    </DashboardProvider>,
  )
  return { deps, ref }
}

const syncButton = () => screen.findByRole('button', { name: /^Sync(ing…| now)$/ })

describe('SyncControl', () => {
  it('#143 AC3: the idle button reads "Sync now" and forwards its ref', async () => {
    const { ref } = renderControl()
    const button = await screen.findByRole('button', { name: 'Sync now' })
    expect(button).not.toHaveAttribute('aria-disabled', 'true')
    expect(ref.current).toBe(button)
  })

  it('#143 AC3: shows "Starting sync…" and then the current repo and position', async () => {
    const deps = depsWith(
      [run({ running: true, total: 5, index: 2, current: 'acme/api' })],
      { ok: true, state: run({ running: true, total: 5 }) },
    )
    renderControl(deps)
    fireEvent.click(await syncButton())
    expect(await screen.findByText('Starting sync…')).toBeInTheDocument()
    expect(screen.getByText('Starting sync…')).toHaveAttribute('role', 'status')
    expect(await screen.findByText('Syncing acme/api, 2 of 5', {}, { timeout: 3000 })).toBeInTheDocument()
  })

  it('#143 AC3: while running the button is aria-disabled, keeps focus and ignores clicks', async () => {
    const deps = depsWith([], { ok: true, state: run({ running: true, total: 2 }) })
    renderControl(deps)
    const idle = await syncButton()
    idle.focus()
    fireEvent.click(idle)
    const button = await screen.findByRole('button', { name: 'Syncing…' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveFocus()
    fireEvent.click(button)
    fireEvent.click(button)
    expect(deps.startSync).toHaveBeenCalledTimes(1)
  })

  it('#143 AC3: back to "Sync now" and no progress line when the run ends', async () => {
    const deps = depsWith([run({ total: 1, index: 1, results: [{ repo: 'acme/api', ok: true }] })], {
      ok: true,
      state: run({ running: true, total: 1 }),
    })
    renderControl(deps)
    fireEvent.click(await syncButton())
    expect(await screen.findByRole('button', { name: 'Syncing…' })).toBeInTheDocument()
    expect(await screen.findByRole('status')).toBeInTheDocument()
    await waitFor(
      () => {
        expect(screen.getByRole('button')).toHaveTextContent('Sync now')
        expect(screen.queryByRole('status')).toBeNull()
      },
      { timeout: 3000 },
    )
  })

  it('#143 AC3: shows a skeleton while loading', () => {
    const deps = { ...makeDeps(), listRepos: vi.fn(() => new Promise<never>(() => {})) }
    renderControl(deps)
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('#143 AC4: renders nothing with no linked repos', async () => {
    const deps = {
      ...makeDeps(),
      listRepos: vi.fn(async () => ({ ok: true as const, repos: [] })),
    }
    renderControl(deps)
    await waitFor(() => expect(deps.listRepos).toHaveBeenCalled())
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })

  it('#143 AC4: renders nothing when the data failed to load', async () => {
    const deps = {
      ...makeDeps(),
      listRepos: vi.fn(async () => ({ ok: false as const, error: 'request_failed' as const })),
    }
    renderControl(deps)
    await waitFor(() => expect(deps.listRepos).toHaveBeenCalled())
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByTestId('skeleton')).toBeNull()
  })
})
