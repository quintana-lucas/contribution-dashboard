import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoredRepo } from '../../api/types'
import { makeDeps, storedRepo } from '../../test/fakeDeps'
import DashboardProvider from '../DashboardProvider'
import Toolbar from '../Toolbar'
import PrActivityWidget from './PrActivityWidget'

// NOW is 2026-06-15T12:00Z. acme/api: ana opened 5 days ago, bob opened 2 days ago and merged 1 day
// ago, a bot opened 1 day ago. acme/web: cy opened 20 days ago.
function makeActivityDeps() {
  const deps = makeDeps()
  const api = storedRepo('acme/api', '2026-06-15T09:00:00.000Z', ['ana', 'bob', 'dependabot'])
  api.pullRequests[0].createdAt = '2026-06-10T12:00:00.000Z'
  api.pullRequests[1].createdAt = '2026-06-13T12:00:00.000Z'
  api.pullRequests[1].state = 'merged'
  api.pullRequests[1].mergedAt = '2026-06-14T12:00:00.000Z'
  api.pullRequests[2].authorIsBot = true
  api.pullRequests[2].createdAt = '2026-06-14T12:00:00.000Z'
  const web = storedRepo('acme/web', '2026-06-15T11:30:00.000Z', ['cy'])
  web.pullRequests[0].createdAt = '2026-05-26T12:00:00.000Z'
  const data: Record<string, StoredRepo> = { 'acme/api': api, 'acme/web': web }
  deps.getRepoData = vi.fn(async (repo: string) => ({ ok: true as const, data: data[repo] }))
  return deps
}

async function renderWidget(deps = makeActivityDeps(), onOpenSettings = vi.fn()) {
  render(
    <DashboardProvider {...deps}>
      <Toolbar />
      <PrActivityWidget onOpenSettings={onOpenSettings} />
    </DashboardProvider>,
  )
  await screen.findByLabelText('Repository')
  return { deps, onOpenSettings }
}

function tableRows() {
  return within(screen.getByRole('table', { hidden: true })).getAllByRole('row', { hidden: true }).slice(1)
}

function column(rows: HTMLElement[], index: number) {
  return rows.reduce((t, r) => t + Number(within(r).getAllByRole('cell', { hidden: true })[index].textContent), 0)
}

describe('PrActivityWidget', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('#102 AC1, AC4, AC7: loading shows a skeleton, no text, and a busy container', () => {
    const deps = { ...makeActivityDeps(), listRepos: vi.fn(() => new Promise<never>(() => {})) }
    const { container } = render(
      <DashboardProvider {...deps}>
        <PrActivityWidget onOpenSettings={() => {}} />
      </DashboardProvider>,
    )
    const busy = container.querySelector('[aria-busy="true"]')
    expect(busy).not.toBeNull()
    expect(busy!.querySelectorAll('[class*="keleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByText(/loading/i)).toBeNull()
  })

  it('AC1: defaults to weekly buckets for 30 days and daily for 7 days', async () => {
    await renderWidget()
    expect(tableRows()).toHaveLength(5)
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(tableRows()).toHaveLength(7)
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(tableRows()).toHaveLength(13)
  })

  it('AC3: aggregates counts across linked repos, bots excluded', async () => {
    await renderWidget()
    const rows = tableRows()
    expect(column(rows, 0)).toBe(3) // ana, bob, cy opened; bot excluded
    expect(column(rows, 1)).toBe(1)
  })

  it('AC4: empty buckets are rendered as zeros', async () => {
    await renderWidget()
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    const rows = tableRows()
    const zero = rows.filter((r) =>
      within(r)
        .getAllByRole('cell', { hidden: true })
        .every((c) => c.textContent === '0'),
    )
    expect(zero.length).toBeGreaterThanOrEqual(10)
  })

  it('AC5: shows an empty state pointing to settings when nothing is stored', async () => {
    const deps = makeActivityDeps()
    deps.listRepos = vi.fn(async () => ({
      ok: true as const,
      repos: [{ repo: 'acme/new', syncedAt: null, baseBranch: null, people: null }],
    }))
    const { onOpenSettings } = await renderWidget(deps)
    expect(screen.getByText('No data yet. Sync a linked repository to see pull request activity.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('table', { hidden: true })).toBeNull()
  })

  it('AC6: rendering and changing filters make no network requests', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    await renderWidget()
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
  })

  it('AC7: is a region named PRs opened, merged and closed with the scope hint', async () => {
    await renderWidget()
    expect(screen.getByRole('region', { name: 'PRs opened, merged and closed' })).toHaveTextContent(
      'Pull request activity · All repositories · last 30 days',
    )
  })

  it('AC9: reflects the repo and period selection without reloading', async () => {
    const { deps } = await renderWidget()
    const calls = deps.getRepoData.mock.calls.length
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/api' } })
    expect(
      screen.getByRole('region', { name: 'PRs opened, merged and closed' }),
    ).toHaveTextContent('acme/api')
    expect(column(tableRows(), 0)).toBe(2)
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(column(tableRows(), 0)).toBe(2)
    expect(column(tableRows(), 1)).toBe(1)
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    expect(column(tableRows(), 0)).toBe(0)
    expect(deps.getRepoData.mock.calls.length).toBe(calls)
  })
})
