import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StoredRepo } from '../../api/types'
import { makeDeps } from '../../test/fakeDeps'
import DashboardProvider from '../DashboardProvider'
import Toolbar from '../Toolbar'
import ContributionsWidget from './ContributionsWidget'

function merged(number: number, author: string, mergedAt: string) {
  return {
    number,
    author,
    authorIsBot: false,
    state: 'merged' as const,
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: mergedAt,
    mergedAt,
    closedAt: mergedAt,
    additions: 1,
    deletions: 1,
    baseBranch: 'main',
    requestedReviewers: [],
  }
}

function repoData(repo: string, prs: ReturnType<typeof merged>[]): StoredRepo {
  return {
    schemaVersion: 2,
    repo,
    syncedAt: '2026-06-15T09:00:00.000Z',
    pullRequests: prs,
    reviews: [],
  }
}

// acme/api: ana x2 (6 days ago), bob x1 (13 days ago). acme/web: ana x1, cy x1 (36 days ago).
function makeMergedDeps() {
  const deps = makeDeps()
  const data: Record<string, StoredRepo> = {
    'acme/api': repoData('acme/api', [
      merged(1, 'ana', '2026-06-10T10:00:00.000Z'),
      merged(2, 'ana', '2026-06-10T11:00:00.000Z'),
      merged(3, 'bob', '2026-06-02T10:00:00.000Z'),
    ]),
    'acme/web': repoData('acme/web', [
      merged(1, 'Ana', '2026-06-11T10:00:00.000Z'),
      merged(2, 'cy', '2026-05-10T10:00:00.000Z'),
    ]),
  }
  deps.getRepoData = vi.fn(async (repo: string) => ({ ok: true as const, data: data[repo] }))
  return deps
}

async function renderWidget(deps = makeMergedDeps(), onOpenSettings = vi.fn()) {
  render(
    <DashboardProvider {...deps}>
      <Toolbar />
      <ContributionsWidget onOpenSettings={onOpenSettings} />
    </DashboardProvider>,
  )
  await screen.findByLabelText('Repository')
  return { deps, onOpenSettings }
}

function rows() {
  return within(screen.getByRole('list')).getAllByRole('listitem')
}

describe('ContributionsWidget', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('AC1: renders people sorted by merged count, aggregated across repos', async () => {
    await renderWidget()
    const items = rows()
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('ana: 3 merged pull requests')
    expect(items[1]).toHaveTextContent('bob: 1 merged pull request')
    expect(items[0]).toHaveTextContent(/3$/)
    expect(screen.getByRole('region', { name: 'Widget 1' })).toBeVisible()
  })

  it('AC2: the list has an accessible name and per-row text', async () => {
    await renderWidget()
    expect(
      screen.getByRole('list', {
        name: 'Merged pull requests per person, All repositories, last 30 days',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('bob: 1 merged pull request')).toBeInTheDocument()
  })

  it('AC4: not synced state points to settings', async () => {
    const deps = makeMergedDeps()
    deps.listRepos = vi.fn(async () => ({
      ok: true as const,
      repos: [{ repo: 'acme/new', syncedAt: null, baseBranch: null, people: null }],
    }))
    const { onOpenSettings } = await renderWidget(deps)
    expect(
      screen.getByText('No data yet. Sync a linked repository to see contributions.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('AC4: no merged PRs state names the period', async () => {
    const deps = makeMergedDeps()
    deps.getRepoData = vi.fn(async (repo: string) => ({
      ok: true as const,
      data: repoData(repo, []),
    }))
    await renderWidget(deps)
    expect(
      screen.getByText('No merged pull requests in the last 30 days.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(screen.getByText('No merged pull requests in the last 7 days.')).toBeInTheDocument()
  })

  it('AC4: shows Loading… while loading and no chart on error', async () => {
    const pending = { ...makeMergedDeps(), listRepos: vi.fn(() => new Promise<never>(() => {})) }
    const first = render(
      <DashboardProvider {...pending}>
        <ContributionsWidget onOpenSettings={() => {}} />
      </DashboardProvider>,
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    first.unmount()

    const base = makeMergedDeps()
    const failing = {
      ...base,
      listRepos: vi.fn(async () => ({ ok: false, error: 'boom' })) as unknown as typeof base.listRepos,
    }
    render(
      <DashboardProvider {...failing}>
        <ContributionsWidget onOpenSettings={() => {}} />
      </DashboardProvider>,
    )
    await vi.waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull()
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

  it('AC9: changing repo and period updates the list and hint without reloading', async () => {
    const { deps } = await renderWidget()
    const region = screen.getByRole('region', { name: 'Widget 1' })
    expect(region).toHaveTextContent(
      'Merged pull requests per person · All repositories · last 30 days',
    )
    const calls = deps.getRepoData.mock.calls.length

    fireEvent.click(screen.getByRole('radio', { name: '7 days' }))
    expect(region).toHaveTextContent('last 7 days')
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toHaveTextContent('ana: 3 merged pull requests')

    fireEvent.click(screen.getByRole('radio', { name: '90 days' }))
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringContaining('ana: 3'),
      expect.stringContaining('bob: 1'),
      expect.stringContaining('cy: 1'),
    ])

    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/api' } })
    expect(region).toHaveTextContent(
      'Merged pull requests per person · acme/api · last 90 days',
    )
    expect(rows()).toHaveLength(2)
    expect(rows()[0]).toHaveTextContent('ana: 2 merged pull requests')
    expect(deps.getRepoData.mock.calls.length).toBe(calls)
  })
})
