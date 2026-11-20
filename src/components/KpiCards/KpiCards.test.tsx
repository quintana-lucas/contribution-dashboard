import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StoredRepo } from '../../api/types'
import { makeDeps } from '../../test/fakeDeps'
import DashboardProvider from '../DashboardProvider'
import Toolbar from '../Toolbar'
import KpiCards from './KpiCards'

const pr = (
  number: number,
  author: string,
  state: 'open' | 'merged' | 'closed',
  createdAt: string,
  extra: { mergedAt?: string; closedAt?: string; additions?: number; deletions?: number } = {},
) => ({
  number,
  title: 'Fake title',
  author,
  authorIsBot: false,
  state,
  createdAt,
  updatedAt: createdAt,
  mergedAt: extra.mergedAt ?? null,
  closedAt: extra.closedAt ?? extra.mergedAt ?? null,
  additions: extra.additions ?? 0,
  deletions: extra.deletions ?? 0,
  baseBranch: 'main',
  requestedReviewers: [],
})

function repo(name: string, pullRequests: StoredRepo['pullRequests'], reviews: StoredRepo['reviews'] = []): StoredRepo {
  return { schemaVersion: 3, repo: name, syncedAt: '2026-06-15T09:00:00.000Z', pullRequests, reviews }
}

// NOW = 2026-06-15T12:00Z. acme/api: one stale open PR (waiting), one merged with 1,200/300 lines.
// acme/web: one merged PR long ago (outside 7 days), one open PR.
function makeKpiDeps(overrides: Record<string, StoredRepo> = {}) {
  const deps = makeDeps()
  const data: Record<string, StoredRepo> = {
    'acme/api': repo(
      'acme/api',
      [
        pr(1, 'ana', 'open', '2026-06-10T10:00:00.000Z'),
        pr(2, 'bob', 'merged', '2026-06-12T10:00:00.000Z', {
          mergedAt: '2026-06-13T10:00:00.000Z',
          additions: 1200,
          deletions: 300,
        }),
        pr(3, 'bob', 'closed', '2026-06-12T10:00:00.000Z', { closedAt: '2026-06-13T10:00:00.000Z' }),
      ],
      [
        { id: 'r1', pullRequestNumber: 2, reviewer: 'ana', reviewerIsBot: false, outcome: 'changes_requested', submittedAt: '2026-06-13T08:00:00.000Z' },
        { id: 'r2', pullRequestNumber: 2, reviewer: 'ana', reviewerIsBot: false, outcome: 'approved', submittedAt: '2026-06-13T09:00:00.000Z' },
      ],
    ),
    'acme/web': repo('acme/web', [
      pr(1, 'cy', 'merged', '2026-04-01T10:00:00.000Z', { mergedAt: '2026-04-02T10:00:00.000Z' }),
      pr(2, 'dee', 'open', '2026-06-15T11:00:00.000Z'),
    ]),
    ...overrides,
  }
  deps.getRepoData = vi.fn(async (r: string) => ({ ok: true as const, data: data[r] }))
  return deps
}

async function renderCards(deps = makeKpiDeps()) {
  render(
    <DashboardProvider {...deps}>
      <Toolbar />
      <KpiCards />
    </DashboardProvider>,
  )
  await screen.findByLabelText('Repository')
  return deps
}

const card = (label: string) => screen.getByText(label).parentElement as HTMLElement

describe('KpiCards', () => {
  it('AC1 (#21): time to first review and cycle time cards show medians with units', async () => {
    await renderCards()
    // PR 2 in acme/api: opened 06-12 10:00, first review 06-13 08:00 (22 h), merged 06-13 10:00 (24 h).
    expect(card('Time to first review')).toHaveTextContent(/^Time to first review22 h/)
    expect(card('Time to first review')).toHaveTextContent('median, opened to first review')
    expect(card('Cycle time')).toHaveTextContent(/^Cycle time24 h/)
    expect(card('Cycle time')).toHaveTextContent('median, opened to merged')
  })

  it('AC1 (#21): the new cards follow the selected repository', async () => {
    await renderCards()
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    expect(card('Time to first review')).toHaveTextContent('n/a')
    expect(card('Cycle time')).toHaveTextContent('n/a')
  })

  it('AC4 (#21): a period with no qualifying PRs shows n/a, never 0 or NaN', async () => {
    await renderCards(makeKpiDeps({ 'acme/api': repo('acme/api', []), 'acme/web': repo('acme/web', []) }))
    expect(card('Time to first review')).toHaveTextContent(/^Time to first reviewn\/a/)
    expect(card('Cycle time')).toHaveTextContent(/^Cycle timen\/a/)
    expect(document.body).not.toHaveTextContent(/NaN|undefined/)
  })

  it('AC5 (#21): bot PRs and PRs by non-selected members are excluded', async () => {
    const deps = makeKpiDeps({
      'acme/api': repo(
        'acme/api',
        [
          { ...pr(7, 'dependabot', 'merged', '2026-06-12T10:00:00.000Z', { mergedAt: '2026-06-12T10:05:00.000Z' }), authorIsBot: true },
          pr(8, 'bob', 'merged', '2026-06-12T10:00:00.000Z', { mergedAt: '2026-06-12T12:00:00.000Z' }),
        ],
        [
          { id: 'r9', pullRequestNumber: 7, reviewer: 'ana', reviewerIsBot: false, outcome: 'approved', submittedAt: '2026-06-12T10:01:00.000Z' },
          { id: 'r10', pullRequestNumber: 8, reviewer: 'ana', reviewerIsBot: false, outcome: 'approved', submittedAt: '2026-06-12T10:30:00.000Z' },
        ],
      ),
      'acme/web': repo('acme/web', []),
    })
    deps.getTeam = vi.fn(async () => ({ ok: true as const, selected: ['ana'] })) as never
    await renderCards(deps)
    expect(card('Time to first review')).toHaveTextContent('n/a')
    expect(card('Cycle time')).toHaveTextContent('n/a')
  })

  it('AC1: six labelled cards with values and sub-lines for the selection', async () => {
    await renderCards()
    const section = screen.getByRole('region', { name: 'Key figures, All repositories, last 30 days' })
    expect(within(section).getAllByRole('listitem')).toHaveLength(6)
    expect(card('Open PRs')).toHaveTextContent(/^Open PRs2/)
    expect(card('Open PRs')).toHaveTextContent('1 waiting for review over 24 h')
    expect(card('Merged PRs')).toHaveTextContent(/^Merged PRs1/)
    expect(card('Merged PRs')).toHaveTextContent('1 closed without merge')
    expect(card('Code reviews')).toHaveTextContent(/^Code reviews2/)
    expect(card('Code reviews')).toHaveTextContent('50% requested changes')
    // AC1, AC7
    expect(card('Lines changed (+/−)')).toHaveTextContent('+1,200−300')
    expect(
      within(card('Lines changed (+/−)')).getByRole('img', { name: '1,200 added, 300 removed' }),
    ).toBeInTheDocument()
    expect(card('Lines changed (+/−)')).toHaveTextContent('across 4 PRs opened')
  })

  it('AC5: changing repository or period updates figures and the label', async () => {
    await renderCards()
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    expect(screen.getByRole('region', { name: 'Key figures, acme/web, last 30 days' })).toBeVisible()
    expect(card('Open PRs')).toHaveTextContent('1')
    expect(card('Merged PRs')).toHaveTextContent('0')
    fireEvent.click(screen.getByRole('radio', { name: /7/ }))
    expect(screen.getByRole('region', { name: 'Key figures, acme/web, last 7 days' })).toBeVisible()
    expect(card('Lines changed (+/−)')).toHaveTextContent('across 1 PR opened')
  })

  it('AC4: zero activity shows 0 and "No reviews to measure", never NaN', async () => {
    await renderCards(makeKpiDeps({ 'acme/api': repo('acme/api', []), 'acme/web': repo('acme/web', []) }))
    expect(card('Open PRs')).toHaveTextContent(/^Open PRs0/)
    expect(card('Code reviews')).toHaveTextContent('No reviews to measure')
    expect(card('Lines changed (+/−)')).toHaveTextContent('+0−0')
    expect(card('Lines changed (+/−)')).toHaveTextContent('across 0 PRs opened')
    expect(document.body).not.toHaveTextContent(/NaN|undefined/)
  })

  it('AC4: no synced data shows "No data yet" and no sub-lines', async () => {
    const deps = makeKpiDeps()
    deps.getRepoData = vi.fn(async () => ({ ok: true as const, data: null })) as never
    await renderCards(deps)
    expect(screen.getAllByText('No data yet')).toHaveLength(6)
    expect(document.body).not.toHaveTextContent('waiting for review')
    expect(document.body).not.toHaveTextContent('closed without merge')
  })

  it('AC4: loading shows "…" values without sub-lines; error renders nothing', async () => {
    const deps = makeKpiDeps()
    deps.listRepos = vi.fn(() => new Promise(() => {})) as never
    render(
      <DashboardProvider {...deps}>
        <KpiCards />
      </DashboardProvider>,
    )
    expect(screen.getAllByText('…')).toHaveLength(6)
    // AC5: loading Lines card is neutral, with no add/del figures
    expect(screen.queryByRole('img')).toBeNull()
    expect(card('Lines changed (+/−)')).not.toHaveTextContent(/[+−]\d/)
    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true')
    expect(document.body).not.toHaveTextContent('waiting for review')
  })

  it('AC4: error renders no cards', async () => {
    const deps = makeKpiDeps()
    deps.listRepos = vi.fn(async () => ({ ok: false as const, error: 'boom' })) as never
    render(
      <DashboardProvider {...deps}>
        <Toolbar />
        <KpiCards />
      </DashboardProvider>,
    )
    await screen.findByRole('status')
    await vi.waitFor(() => expect(screen.queryByRole('region')).toBeNull())
  })

  it('AC6: filter changes cause no extra data requests', async () => {
    const deps = await renderCards()
    const listCalls = deps.listRepos.mock.calls.length
    const dataCalls = deps.getRepoData.mock.calls.length
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/api' } })
    fireEvent.click(screen.getByRole('radio', { name: /7/ }))
    expect(deps.listRepos.mock.calls.length).toBe(listCalls)
    expect(deps.getRepoData.mock.calls.length).toBe(dataCalls)
  })

  it('AC7: lines value is announced once, via the LinesDelta accessible name', async () => {
    await renderCards()
    expect(screen.getAllByRole('img', { name: '1,200 added, 300 removed' })).toHaveLength(1)
    expect(document.body).not.toHaveTextContent('lines added')
  })
})
