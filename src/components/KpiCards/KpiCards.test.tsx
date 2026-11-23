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

  it('#84 AC3, AC5: Open PRs subline with waiting PRs is caution-toned with the warning icon; other cards have none', async () => {
    await renderCards()
    const sub = screen.getByText('1 waiting for review over 24 h')
    expect(sub.className).toMatch(/caution/i)
    expect(sub.querySelector('svg[data-icon="warning"]')).not.toBeNull()
    expect(document.querySelectorAll('svg[data-icon="warning"]')).toHaveLength(1)
  })

  it('#84 AC4: zero waiting PRs keep the neutral subline, no icon, no caution class', async () => {
    await renderCards(makeKpiDeps({ 'acme/api': repo('acme/api', []), 'acme/web': repo('acme/web', []) }))
    const sub = screen.getByText('0 waiting for review over 24 h')
    expect(sub.className).not.toMatch(/caution/i)
    expect(sub.querySelector('svg')).toBeNull()
  })

  it('#84 AC3, AC4: loading and empty states have no icon and no caution styling', async () => {
    const deps = makeKpiDeps()
    deps.getRepoData = vi.fn(async () => ({ ok: true as const, data: null })) as never
    await renderCards(deps)
    expect(document.querySelector('svg[data-icon="warning"]')).toBeNull()
    expect(document.querySelector('[class*="aution"]')).toBeNull()
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

  it('#102 AC1, AC2, AC4: loading shows six skeleton cards with labels, no "…" text or figures', async () => {
    const deps = makeKpiDeps()
    deps.listRepos = vi.fn(() => new Promise(() => {})) as never
    render(
      <DashboardProvider {...deps}>
        <KpiCards />
      </DashboardProvider>,
    )
    expect(screen.queryByText('…')).toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(document.querySelectorAll('[class*="keleton"]').length).toBeGreaterThanOrEqual(12)
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

  // #87: acme/api with activity in both the current and the previous window (NOW = 2026-06-15T12:00Z).
  // 30 days: merged 2 vs 3 (down), reviews 2 vs 1 (up), churn 1,500 vs 500 (up, neutral).
  // 7 days: merged 1 vs 1 (flat).
  function makeTrendDeps() {
    const prev = (n: number, day: string, additions: number) =>
      pr(n, 'bob', 'merged', `2026-05-0${day}T10:00:00.000Z`, {
        mergedAt: `2026-05-0${day}T12:00:00.000Z`,
        additions,
      })
    return makeKpiDeps({
      'acme/api': repo(
        'acme/api',
        [
          pr(2, 'bob', 'merged', '2026-06-12T10:00:00.000Z', {
            mergedAt: '2026-06-13T10:00:00.000Z',
            additions: 1200,
            deletions: 300,
          }),
          pr(4, 'bob', 'merged', '2026-06-05T10:00:00.000Z', { mergedAt: '2026-06-05T12:00:00.000Z' }),
          prev(5, '2', 300),
          prev(6, '3', 100),
          prev(7, '4', 100),
        ],
        [
          { id: 'r1', pullRequestNumber: 2, reviewer: 'ana', reviewerIsBot: false, outcome: 'changes_requested', submittedAt: '2026-06-13T08:00:00.000Z' },
          { id: 'r2', pullRequestNumber: 2, reviewer: 'ana', reviewerIsBot: false, outcome: 'approved', submittedAt: '2026-06-13T09:00:00.000Z' },
          { id: 'r3', pullRequestNumber: 5, reviewer: 'ana', reviewerIsBot: false, outcome: 'approved', submittedAt: '2026-05-02T13:00:00.000Z' },
        ],
      ),
      'acme/web': repo('acme/web', []),
    })
  }

  it('#87 AC6: directional trends on merged and reviews, neutral muted trend on lines', async () => {
    await renderCards(makeTrendDeps())
    const merged = card('Merged PRs')
    expect(merged).toHaveTextContent('↓ −1 (−33%)vs previous 30 days')
    expect(merged).toHaveTextContent('down 33 percent versus previous 30 days')
    expect(merged.innerHTML).toMatch(/bad/i)
    const reviews = card('Code reviews')
    expect(reviews).toHaveTextContent('↑ +1 (+100%)vs previous 30 days')
    expect(reviews.innerHTML).toMatch(/good/i)
    const lines = card('Lines changed (+/−)')
    expect(lines).toHaveTextContent('↑ +1,000 (+200%)vs previous 30 days')
    expect(lines.innerHTML).toMatch(/muted/i)
    expect(lines.innerHTML).not.toMatch(/good|bad/i)
  })

  it('#122 AC1, AC2, AC3: merged-PR decline is bad, review increase is good, neutral lines never bad', async () => {
    await renderCards(makeTrendDeps())
    const mergedRow = within(card('Merged PRs')).getByText('↓ −1 (−33%)').parentElement as HTMLElement
    expect(mergedRow.className).toMatch(/bad/)
    expect(mergedRow.className).not.toMatch(/good/)
    const reviewsRow = within(card('Code reviews')).getByText('↑ +1 (+100%)').parentElement as HTMLElement
    expect(reviewsRow.className).toMatch(/good/)
    expect(reviewsRow.className).not.toMatch(/bad/)
    const linesRow = within(card('Lines changed (+/−)')).getByText('↑ +1,000 (+200%)').parentElement as HTMLElement
    expect(linesRow.className).not.toMatch(/good|bad/)
  })

  it('#87 AC3: the label follows the period and the values follow the repo selection', async () => {
    await renderCards(makeTrendDeps())
    fireEvent.click(screen.getByRole('radio', { name: /7/ }))
    expect(card('Merged PRs')).toHaveTextContent('→ 0 (0%)vs previous 7 days')
    expect(card('Merged PRs').innerHTML).not.toMatch(/good|bad/i)
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    expect(card('Merged PRs')).toHaveTextContent('No comparison')
    expect(card('Merged PRs')).not.toHaveTextContent('vs previous')
  })

  it('#87 AC8: insufficient history or a zero previous shows "No comparison" with no figures', async () => {
    await renderCards(makeTrendDeps())
    fireEvent.click(screen.getByRole('radio', { name: /90/ }))
    for (const l of ['Merged PRs', 'Code reviews', 'Lines changed (+/−)']) {
      expect(card(l)).toHaveTextContent('No comparison')
      expect(card(l)).not.toHaveTextContent(/[↑↓→]|vs previous/)
    }
    expect(document.body).not.toHaveTextContent(/NaN|undefined/)
  })

  it('#87 AC7: Open PRs, Time to first review and Cycle time have no trend', async () => {
    await renderCards(makeTrendDeps())
    for (const l of ['Open PRs', 'Time to first review', 'Cycle time']) {
      expect(card(l)).not.toHaveTextContent(/vs previous|No comparison|[↑↓→]/)
    }
  })

  it('#87 AC7: loading shows a trend skeleton only on merged, reviews and lines', async () => {
    const deps = makeKpiDeps()
    deps.listRepos = vi.fn(() => new Promise(() => {})) as never
    render(
      <DashboardProvider {...deps}>
        <KpiCards />
      </DashboardProvider>,
    )
    const skeletons = (l: string) => card(l).querySelectorAll('[class*="keleton"]').length
    for (const l of ['Merged PRs', 'Code reviews', 'Lines changed (+/−)']) expect(skeletons(l)).toBe(3)
    for (const l of ['Open PRs', 'Time to first review', 'Cycle time']) expect(skeletons(l)).toBe(2)
  })

  it('#87 AC7: "No data yet" cards have no trend row', async () => {
    const deps = makeKpiDeps()
    deps.getRepoData = vi.fn(async () => ({ ok: true as const, data: null })) as never
    await renderCards(deps)
    expect(document.body).not.toHaveTextContent(/vs previous|No comparison/)
  })

  it('AC7: lines value is announced once, via the LinesDelta accessible name', async () => {
    await renderCards()
    expect(screen.getAllByRole('img', { name: '1,200 added, 300 removed' })).toHaveLength(1)
    expect(document.body).not.toHaveTextContent('lines added')
  })
})
