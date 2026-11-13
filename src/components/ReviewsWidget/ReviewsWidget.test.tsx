import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoredRepo } from '../../api/types'
import { makeDeps, storedRepo } from '../../test/fakeDeps'
import DashboardProvider from '../DashboardProvider'
import Toolbar from '../Toolbar'
import ReviewsWidget from './ReviewsWidget'

function review(id: string, pr: number, reviewer: string, outcome: 'approved' | 'changes_requested' | 'commented', submittedAt: string) {
  return { id, pullRequestNumber: pr, reviewer, reviewerIsBot: false, outcome, submittedAt }
}

// Authors ana, bob (api) and ana, cy, dee (web); PR numbers are 1-based indexes.
// acme/api: cy x2 (6 days ago), dee x1 (13 days ago). acme/web: cy x1 (6 days ago), bob x1 (40 days ago).
function makeReviewDeps() {
  const deps = makeDeps()
  const api: StoredRepo = {
    ...storedRepo('acme/api', '2026-06-15T09:00:00.000Z', ['ana', 'bob']),
    reviews: [
      review('a1', 1, 'cy', 'approved', '2026-06-09T10:00:00.000Z'),
      review('a2', 2, 'cy', 'changes_requested', '2026-06-09T11:00:00.000Z'),
      review('a3', 1, 'dee', 'commented', '2026-06-02T10:00:00.000Z'),
    ],
  }
  const web: StoredRepo = {
    ...storedRepo('acme/web', '2026-06-15T11:30:00.000Z', ['ana', 'cy', 'dee']),
    reviews: [
      review('w1', 1, 'Cy', 'approved', '2026-06-09T10:00:00.000Z'),
      review('w2', 1, 'bob', 'approved', '2026-05-06T10:00:00.000Z'),
    ],
  }
  const data: Record<string, StoredRepo> = { 'acme/api': api, 'acme/web': web }
  deps.getRepoData = vi.fn(async (repo: string) => ({ ok: true as const, data: data[repo] }))
  return deps
}

async function renderWidget(deps = makeReviewDeps(), onOpenSettings = vi.fn()) {
  render(
    <DashboardProvider {...deps}>
      <Toolbar />
      <ReviewsWidget onOpenSettings={onOpenSettings} />
    </DashboardProvider>,
  )
  await screen.findByLabelText('Repository')
  return { deps, onOpenSettings }
}

function rows() {
  return within(screen.getByRole('list', { name: 'Reviews given per person' })).getAllByRole('listitem')
}

describe('ReviewsWidget', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('AC1: renders reviewers sorted by total, aggregated across repos', async () => {
    await renderWidget()
    const items = rows()
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('cy: 3 reviews: 2 approved, 1 changes requested, 0 commented')
    expect(items[1]).toHaveTextContent('dee: 1 reviews')
  })

  it('AC6: is a region named Widget 2 with the scope hint', async () => {
    await renderWidget()
    expect(screen.getByRole('region', { name: 'Widget 2' })).toHaveTextContent(
      'Reviews given per person · All repositories · last 30 days',
    )
  })

  it('AC4: not synced state points to settings', async () => {
    const deps = makeReviewDeps()
    deps.listRepos = vi.fn(async () => ({
      ok: true as const,
      repos: [{ repo: 'acme/new', syncedAt: null, baseBranch: null, people: null }],
    }))
    const { onOpenSettings } = await renderWidget(deps)
    expect(screen.getByText('No data yet. Sync a linked repository to see reviews.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('AC4: zero reviews state names the period', async () => {
    const deps = makeReviewDeps()
    deps.getRepoData = vi.fn(async (repo: string) => ({
      ok: true as const,
      data: storedRepo(repo, '2026-06-15T09:00:00.000Z', ['ana']),
    }))
    await renderWidget(deps)
    expect(screen.getByText('No reviews in the last 30 days.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(screen.getByText('No reviews in the last 7 days.')).toBeInTheDocument()
  })

  it('AC4: shows Loading… while loading and no chart on error', async () => {
    const pending = { ...makeReviewDeps(), listRepos: vi.fn(() => new Promise<never>(() => {})) }
    const first = render(
      <DashboardProvider {...pending}>
        <ReviewsWidget onOpenSettings={() => {}} />
      </DashboardProvider>,
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    first.unmount()

    const base = makeReviewDeps()
    const failing = {
      ...base,
      listRepos: vi.fn(async () => ({ ok: false, error: 'boom' })) as unknown as typeof base.listRepos,
    }
    render(
      <DashboardProvider {...failing}>
        <ReviewsWidget onOpenSettings={() => {}} />
      </DashboardProvider>,
    )
    await vi.waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull()
  })

  it('AC5: rendering and changing filters make no network requests', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, 'open')
    await renderWidget()
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhrSpy).not.toHaveBeenCalled()
  })

  it('AC8: changing repo and period updates the chart and hint without reloading', async () => {
    const { deps } = await renderWidget()
    const region = screen.getByRole('region', { name: 'Widget 2' })
    const calls = deps.getRepoData.mock.calls.length

    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(region).toHaveTextContent('last 7 days')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('cy: 3 reviews')

    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('cy: 3'),
      expect.stringContaining('bob: 1'),
      expect.stringContaining('dee: 1'),
    ])

    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    expect(region).toHaveTextContent('Reviews given per person · acme/web · last 90 days')
    expect(rows()).toHaveLength(2)
    expect(rows()[0]).toHaveTextContent('bob: 1 reviews')
    expect(deps.getRepoData.mock.calls.length).toBe(calls)
  })
})
