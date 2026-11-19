import { describe, expect, it } from 'vitest'
import type { RepoEntry } from './dashboard.ts'
import { HISTORY_DAYS, hasPreviousWindowHistory, kpiComparison } from './kpiComparison.ts'
import { kpis } from './kpis.ts'
import type { StoredPullRequest, StoredReview } from './types.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const SYNCED = new Date('2026-06-15T12:00:00.000Z')

function entry(repo: string, syncedAt: Date | null): RepoEntry {
  if (syncedAt === null) return { repo, syncedAt: null, data: null }
  const iso = syncedAt.toISOString()
  return { repo, syncedAt: iso, data: { schemaVersion: 3, repo, syncedAt: iso, pullRequests: [], reviews: [] } }
}

describe('hasPreviousWindowHistory', () => {
  it('AC6: with about 90 days of history, 90d is insufficient and 7d is available', () => {
    const entries = [entry('acme/api', SYNCED)]
    expect(hasPreviousWindowHistory(entries, 'all', 90, SYNCED)).toBe(false)
    expect(hasPreviousWindowHistory(entries, 'all', 7, SYNCED)).toBe(true)
  })

  it('AC6: 30d is available only when the history covers 60 days', () => {
    const entries = [entry('acme/api', SYNCED)]
    expect(HISTORY_DAYS).toBe(90)
    expect(hasPreviousWindowHistory(entries, 'all', 30, SYNCED)).toBe(true)
    // now = syncedAt - 30d: previous window starts exactly at the history start -> covered.
    const edge = new Date(SYNCED.getTime() - 30 * DAY_MS)
    expect(hasPreviousWindowHistory(entries, 'all', 30, edge)).toBe(true)
    // Just outside: one ms before the edge, the previous window starts before the history does.
    const outside = new Date(edge.getTime() - 1)
    expect(hasPreviousWindowHistory(entries, 'all', 30, outside)).toBe(false)
  })

  it('AC5: history reaching back less than 2 periods is insufficient', () => {
    // Synced 20 days after "now": history starts 70 days before now, enough for 30d (60) not 90d.
    const entries = [entry('acme/api', new Date(SYNCED.getTime() + 20 * DAY_MS))]
    expect(hasPreviousWindowHistory(entries, 'all', 30, SYNCED)).toBe(true)
    const later = [entry('acme/api', new Date(SYNCED.getTime() + 31 * DAY_MS))]
    expect(hasPreviousWindowHistory(later, 'all', 30, SYNCED)).toBe(false)
  })

  it('AC7: a selected repo with short history makes it false; an unselected one does not', () => {
    const entries = [
      entry('acme/api', new Date(SYNCED.getTime() - 60 * DAY_MS)),
      entry('acme/web', SYNCED),
    ]
    const now = SYNCED
    expect(hasPreviousWindowHistory(entries, 'all', 30, now)).toBe(true)
    const short = [entry('acme/api', SYNCED), entry('acme/web', new Date(SYNCED.getTime() + 60 * DAY_MS))]
    // acme/web (synced later) has a later history start, so 30d is not covered for it.
    expect(hasPreviousWindowHistory(short, 'all', 30, now)).toBe(false)
    expect(hasPreviousWindowHistory(short, 'acme/api', 30, now)).toBe(true)
    expect(hasPreviousWindowHistory(short, 'acme/web', 30, now)).toBe(false)
  })

  it('AC5: repos without data are ignored, and no data at all is insufficient', () => {
    const none = [entry('acme/new', null)]
    expect(hasPreviousWindowHistory(none, 'all', 7, SYNCED)).toBe(false)
    expect(hasPreviousWindowHistory([], 'all', 7, SYNCED)).toBe(false)
    const mixed = [entry('acme/new', null), entry('acme/api', SYNCED)]
    expect(hasPreviousWindowHistory(mixed, 'all', 7, SYNCED)).toBe(true)
    expect(hasPreviousWindowHistory(mixed, 'acme/new', 7, SYNCED)).toBe(false)
  })
})

const NOW = new Date('2026-06-30T12:00:00Z')
const SYNC_ISO = '2026-06-30T11:00:00Z'

function pr(over: Partial<StoredPullRequest>): StoredPullRequest {
  return {
    number: 1,
    title: 'Fake title',
    author: 'alice',
    authorIsBot: false,
    state: 'open',
    createdAt: '2026-06-20T10:00:00Z',
    updatedAt: '2026-06-25T10:00:00Z',
    mergedAt: null,
    closedAt: null,
    additions: 0,
    deletions: 0,
    baseBranch: 'main',
    requestedReviewers: [],
    ...over,
  }
}

function mergedPr(at: string, over: Partial<StoredPullRequest> = {}): StoredPullRequest {
  return pr({ state: 'merged', createdAt: '2026-05-01T00:00:00Z', mergedAt: at, closedAt: at, ...over })
}

function review(over: Partial<StoredReview>): StoredReview {
  return {
    id: 'r1',
    pullRequestNumber: 1,
    reviewer: 'bob',
    reviewerIsBot: false,
    outcome: 'approved',
    submittedAt: '2026-06-26T10:00:00Z',
    ...over,
  } as StoredReview
}

function repoEntry(repo: string, prs: StoredPullRequest[], reviews: StoredReview[] = []): RepoEntry {
  return {
    repo,
    syncedAt: SYNC_ISO,
    data: { schemaVersion: 3, repo, syncedAt: SYNC_ISO, pullRequests: prs, reviews },
  }
}

describe('kpiComparison', () => {
  it('AC1: the previous window ends exactly where the current starts, no gap, no overlap', () => {
    // 7d: current (06-23T12, 06-30T12], previous (06-16T12, 06-23T12].
    const e = repoEntry('o/a', [
      mergedPr('2026-06-16T12:00:00Z', { number: 1 }), // start of previous: excluded from both
      mergedPr('2026-06-16T12:00:01Z', { number: 2 }), // previous
      mergedPr('2026-06-23T12:00:00Z', { number: 3 }), // boundary: previous only
      mergedPr('2026-06-23T12:00:01Z', { number: 4 }), // current
      mergedPr('2026-06-30T12:00:00Z', { number: 5 }), // end of current: included
    ])
    const r = kpiComparison([e], 'all', 7, NOW)
    expect(r.status).toBe('available')
    if (r.status !== 'available') return
    expect(r.metrics.mergedPrs.current).toBe(2)
    expect(r.metrics.mergedPrs.previous).toBe(2)
  })

  it('AC2: all five metrics return current, previous, delta, deltaPct; additions and deletions are separate', () => {
    const e = repoEntry(
      'o/a',
      [
        pr({ number: 1, createdAt: '2026-06-28T00:00:00Z', additions: 30, deletions: 5 }),
        pr({ number: 2, createdAt: '2026-06-27T00:00:00Z', additions: 10, deletions: 5 }),
        pr({ number: 3, createdAt: '2026-06-20T00:00:00Z', additions: 20, deletions: 10 }),
        mergedPr('2026-06-26T00:00:00Z', { number: 4 }),
        mergedPr('2026-06-25T00:00:00Z', { number: 5 }),
        mergedPr('2026-06-24T00:00:00Z', { number: 6 }),
        mergedPr('2026-06-20T00:00:00Z', { number: 7 }),
      ],
      [
        review({ id: 'a', pullRequestNumber: 4, submittedAt: '2026-06-26T00:00:00Z' }),
        review({ id: 'b', pullRequestNumber: 5, submittedAt: '2026-06-25T00:00:00Z' }),
        review({ id: 'c', pullRequestNumber: 7, submittedAt: '2026-06-20T00:00:00Z' }),
      ],
    )
    const r = kpiComparison([e], 'all', 7, NOW)
    expect(r.status).toBe('available')
    if (r.status !== 'available') return
    expect(Object.keys(r.metrics).sort()).toEqual(['additions', 'deletions', 'mergedPrs', 'prsOpened', 'reviews'])
    expect(r.metrics.mergedPrs).toEqual({ current: 3, previous: 1, delta: 2, deltaPct: 200 })
    expect(r.metrics.reviews).toEqual({ current: 2, previous: 1, delta: 1, deltaPct: 100 })
    expect(r.metrics.prsOpened).toEqual({ current: 2, previous: 1, delta: 1, deltaPct: 100 })
    expect(r.metrics.additions).toEqual({ current: 40, previous: 20, delta: 20, deltaPct: 100 })
    expect(r.metrics.deletions).toEqual({ current: 10, previous: 10, delta: 0, deltaPct: 0 })
  })

  it('AC3: a previous value of zero gives deltaPct undefined while delta is returned', () => {
    const e = repoEntry('o/a', [mergedPr('2026-06-28T00:00:00Z', { number: 1 })])
    const r = kpiComparison([e], 'all', 7, NOW)
    if (r.status !== 'available') throw new Error('expected available')
    expect(r.metrics.mergedPrs.previous).toBe(0)
    expect(r.metrics.mergedPrs.delta).toBe(1)
    expect(r.metrics.mergedPrs.deltaPct).toBeUndefined()
  })

  it('AC4: both zero gives delta 0 and deltaPct undefined', () => {
    const e = repoEntry('o/a', [])
    const r = kpiComparison([e], 'all', 7, NOW)
    if (r.status !== 'available') throw new Error('expected available')
    expect(r.metrics.reviews).toEqual({ current: 0, previous: 0, delta: 0, deltaPct: undefined })
  })

  it('AC5: insufficient history carries no previous, delta or deltaPct', () => {
    const e = repoEntry('o/a', [mergedPr('2026-06-28T00:00:00Z')])
    const r = kpiComparison([e], 'all', 90, NOW)
    expect(r).toEqual({ status: 'insufficient_history' })
    expect(JSON.stringify(r)).not.toMatch(/previous|delta/)
  })

  it('AC7: current and previous count only the selected repo, and coverage uses only it', () => {
    const a = repoEntry('o/a', [
      mergedPr('2026-06-28T00:00:00Z', { number: 1 }),
      mergedPr('2026-06-20T00:00:00Z', { number: 2 }),
    ])
    const b: RepoEntry = {
      ...repoEntry('o/b', [
        mergedPr('2026-06-28T00:00:00Z', { number: 1 }),
        mergedPr('2026-06-27T00:00:00Z', { number: 2 }),
      ]),
      // Synced much later: its history does not cover the previous 30d window.
    }
    const later = '2026-09-30T00:00:00Z'
    if (b.data) b.data = { ...b.data, syncedAt: later }
    const r = kpiComparison([a, b], 'o/a', 7, NOW)
    if (r.status !== 'available') throw new Error('expected available')
    expect(r.metrics.mergedPrs.current).toBe(1)
    expect(r.metrics.mergedPrs.previous).toBe(1)
    expect(kpiComparison([a, b], 'all', 7, NOW)).toEqual({ status: 'insufficient_history' })
    expect(kpiComparison([a, b], 'o/b', 7, NOW)).toEqual({ status: 'insufficient_history' })
  })

  it('AC8: the result has no open PRs or waiting metrics', () => {
    const e = repoEntry('o/a', [pr({ number: 1, createdAt: '2026-06-01T00:00:00Z' })])
    const r = kpiComparison([e], 'all', 7, NOW)
    if (r.status !== 'available') throw new Error('expected available')
    expect(Object.keys(r)).toEqual(['status', 'metrics'])
    expect(r.metrics).not.toHaveProperty('openPrs')
    expect(r.metrics).not.toHaveProperty('waitingOver24h')
  })

  it('AC9: current values equal kpis() for the same period, selection and team filter', () => {
    const e = repoEntry(
      'o/a',
      [
        pr({ number: 1, createdAt: '2026-06-28T00:00:00Z', additions: 7, deletions: 3 }),
        pr({ number: 2, author: 'carol', createdAt: '2026-06-27T00:00:00Z', additions: 9, deletions: 1 }),
        mergedPr('2026-06-26T00:00:00Z', { number: 3 }),
        mergedPr('2026-06-26T00:00:00Z', { number: 4, author: 'carol' }),
      ],
      [
        review({ id: 'a', pullRequestNumber: 3 }),
        review({ id: 'b', pullRequestNumber: 4, reviewer: 'dave' }),
      ],
    )
    for (const team of [null, new Set(['alice', 'bob'])]) {
      const k = kpis([e], 'all', 7, NOW, team)
      const r = kpiComparison([e], 'all', 7, NOW, team)
      if (r.status !== 'available') throw new Error('expected available')
      expect(r.metrics.mergedPrs.current).toBe(k.mergedPrs)
      expect(r.metrics.reviews.current).toBe(k.reviews)
      expect(r.metrics.prsOpened.current).toBe(k.prsOpened)
      expect(r.metrics.additions.current).toBe(k.additions)
      expect(r.metrics.deletions.current).toBe(k.deletions)
    }
  })
})
