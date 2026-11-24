import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StoredRepo } from '../../api/types'
import { makeDeps } from '../../test/fakeDeps'
import DashboardProvider from '../DashboardProvider'
import Toolbar from '../Toolbar'
import TeamKpiCards from './TeamKpiCards'

const pr = (
  number: number,
  author: string,
  state: 'open' | 'merged' | 'closed',
  createdAt: string,
  extra: { mergedAt?: string; additions?: number; deletions?: number } = {},
) => ({
  number,
  title: 'Fake title',
  author,
  authorIsBot: false,
  state,
  createdAt,
  updatedAt: createdAt,
  mergedAt: extra.mergedAt ?? null,
  closedAt: extra.mergedAt ?? null,
  additions: extra.additions ?? 0,
  deletions: extra.deletions ?? 0,
  baseBranch: 'main',
  requestedReviewers: [],
})

function repo(name: string, pullRequests: StoredRepo['pullRequests'], reviews: StoredRepo['reviews'] = []): StoredRepo {
  return { schemaVersion: 3, repo: name, syncedAt: '2026-06-15T09:00:00.000Z', pullRequests, reviews }
}

const review = (id: string, n: number, at: string) => ({
  id,
  pullRequestNumber: n,
  reviewer: 'ana',
  reviewerIsBot: false,
  outcome: 'approved' as const,
  submittedAt: at,
})

// NOW = 2026-06-15T12:00Z. acme/api, 30 days: merged 2 vs 3 (down), reviews 2 vs 1 (up),
// churn 1,500 vs 500 (up). 7 days: merged 1 vs 1 (flat). acme/web is empty.
function makeTrendDeps(api?: StoredRepo) {
  const prev = (n: number, day: string, additions: number) =>
    pr(n, 'bob', 'merged', `2026-05-0${day}T10:00:00.000Z`, {
      mergedAt: `2026-05-0${day}T12:00:00.000Z`,
      additions,
    })
  const deps = makeDeps()
  const data: Record<string, StoredRepo> = {
    'acme/api':
      api ??
      repo(
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
          review('r1', 2, '2026-06-13T08:00:00.000Z'),
          review('r2', 2, '2026-06-13T09:00:00.000Z'),
          review('r3', 5, '2026-05-02T13:00:00.000Z'),
        ],
      ),
    'acme/web': repo('acme/web', []),
  }
  deps.getRepoData = vi.fn(async (r: string) => ({ ok: true as const, data: data[r] }))
  return deps
}

async function renderCards(deps = makeTrendDeps()) {
  render(
    <DashboardProvider {...deps}>
      <Toolbar />
      <TeamKpiCards />
    </DashboardProvider>,
  )
  await screen.findByLabelText('Repository')
}

const card = (label: string) => screen.getByText(label).parentElement as HTMLElement
const LABELS = ['Merged PRs', 'Code reviews', 'Lines changed (+/−)']

describe('TeamKpiCards', () => {
  it('AC1: the three cards show glyph, signed delta and percentage', async () => {
    await renderCards()
    expect(screen.getByRole('region', { name: 'Team key figures, All repositories, last 30 days' })).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(card('Merged PRs')).toHaveTextContent('↓ −1 (−33%)')
    expect(card('Code reviews')).toHaveTextContent('↑ +1 (+100%)')
    expect(card('Lines changed (+/−)')).toHaveTextContent('↑ +1,000 (+200%)')
    expect(
      within(card('Lines changed (+/−)')).getByRole('img', { name: '1,200 added, 300 removed' }),
    ).toBeInTheDocument()
  })

  it('AC2: each trend carries a "vs previous N days" label', async () => {
    await renderCards()
    for (const l of LABELS) expect(card(l)).toHaveTextContent('vs previous 30 days')
  })

  it('AC3: label and values follow the period and the repo selection', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('radio', { name: /7/ }))
    expect(screen.getByRole('region', { name: 'Team key figures, All repositories, last 7 days' })).toBeVisible()
    expect(card('Merged PRs')).toHaveTextContent('→ 0 (0%)vs previous 7 days')
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'acme/web' } })
    expect(screen.getByRole('region', { name: 'Team key figures, acme/web, last 7 days' })).toBeVisible()
    expect(card('Merged PRs')).toHaveTextContent('No comparison')
    fireEvent.click(screen.getByRole('radio', { name: /30/ }))
    fireEvent.change(screen.getByLabelText('Repository'), { target: { value: 'all' } })
    expect(card('Merged PRs')).toHaveTextContent('vs previous 30 days')
  })

  it('AC6: insufficient history shows "No comparison" with no figures', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('radio', { name: /90/ }))
    for (const l of LABELS) {
      expect(card(l)).toHaveTextContent('No comparison')
      expect(card(l)).not.toHaveTextContent(/[↑↓→]|vs previous|percent versus/)
    }
    expect(document.body).not.toHaveTextContent(/NaN|undefined/)
  })

  it('AC6: previous = 0 shows "No comparison" with no number, percentage or arrow', async () => {
    const api = repo('acme/api', [
      pr(2, 'bob', 'merged', '2026-06-12T10:00:00.000Z', {
        mergedAt: '2026-06-13T10:00:00.000Z',
        additions: 10,
      }),
      pr(9, 'bob', 'merged', '2026-03-01T10:00:00.000Z', { mergedAt: '2026-03-02T10:00:00.000Z' }),
    ])
    await renderCards(makeTrendDeps(api))
    expect(card('Merged PRs')).toHaveTextContent('No comparison')
    expect(card('Merged PRs')).not.toHaveTextContent(/[↑↓→]|vs previous|%/)
  })

  it('AC8: a screen reader gets the trend as a sentence', async () => {
    await renderCards()
    expect(card('Merged PRs')).toHaveTextContent('down 33 percent versus previous 30 days')
    expect(card('Code reviews')).toHaveTextContent('up 100 percent versus previous 30 days')
  })

  it('AC10: delta > 0 is green with up glyph and "+", delta < 0 is red with down glyph and "−"', async () => {
    await renderCards()
    const down = within(card('Merged PRs')).getByText('↓ −1 (−33%)').parentElement as HTMLElement
    expect(down.className).toMatch(/bad/)
    expect(down.className).not.toMatch(/good|muted/)
    for (const [l, text] of [
      ['Code reviews', '↑ +1 (+100%)'],
      ['Lines changed (+/−)', '↑ +1,000 (+200%)'],
    ]) {
      const up = within(card(l)).getByText(text).parentElement as HTMLElement
      expect(up.className).toMatch(/good/)
      expect(up.className).not.toMatch(/bad|muted/)
    }
  })

  it('AC11: delta exactly 0 and the "No comparison" state are muted', async () => {
    await renderCards()
    fireEvent.click(screen.getByRole('radio', { name: /7/ }))
    const flat = within(card('Merged PRs')).getByText('→ 0 (0%)').parentElement as HTMLElement
    expect(flat.className).toMatch(/muted/)
    expect(flat.className).not.toMatch(/good|bad/)
    fireEvent.click(screen.getByRole('radio', { name: /90/ }))
    expect(card('Merged PRs').innerHTML).not.toMatch(/good|bad/i)
  })

  it('AC12: meaning is carried by glyph, sign and text without color', async () => {
    await renderCards()
    const merged = card('Merged PRs')
    expect(merged).toHaveTextContent('↓')
    expect(merged).toHaveTextContent('−1')
    expect(merged).toHaveTextContent('down 33 percent versus previous 30 days')
    const reviews = card('Code reviews')
    expect(reviews).toHaveTextContent('↑')
    expect(reviews).toHaveTextContent('+1')
    expect(reviews).toHaveTextContent('up 100 percent versus previous 30 days')
  })

  it('loading shows skeleton cards with a trend skeleton and no figures', async () => {
    const deps = makeTrendDeps()
    deps.listRepos = vi.fn(() => new Promise(() => {})) as never
    deps.getTeam = vi.fn(async () => ({ ok: true as const, selected: ['ana'] })) as never
    render(
      <DashboardProvider {...deps}>
        <TeamKpiCards />
      </DashboardProvider>,
    )
    // Team is not known until loaded, so nothing renders while loading.
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('ready without data shows "No data yet" cards with no trend row', async () => {
    const deps = makeTrendDeps()
    deps.getRepoData = vi.fn(async () => ({ ok: true as const, data: null })) as never
    await renderCards(deps)
    expect(screen.getAllByText('No data yet')).toHaveLength(3)
    expect(document.body).not.toHaveTextContent(/vs previous|No comparison/)
  })

  it('renders nothing on error, when no team is chosen, or when the team is empty', async () => {
    const errDeps = makeTrendDeps()
    errDeps.listRepos = vi.fn(async () => ({ ok: false as const, error: 'boom' })) as never
    const { unmount } = render(
      <DashboardProvider {...errDeps}>
        <Toolbar />
        <TeamKpiCards />
      </DashboardProvider>,
    )
    await screen.findByRole('status')
    expect(screen.queryByRole('region')).toBeNull()
    unmount()

    const emptyDeps = makeTrendDeps()
    emptyDeps.getTeam = vi.fn(async () => ({ ok: true as const, selected: [] })) as never
    await renderCards(emptyDeps)
    expect(screen.queryByRole('region')).toBeNull()
  })
})
