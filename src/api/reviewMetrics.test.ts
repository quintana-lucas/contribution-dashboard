import { describe, expect, it } from 'vitest'
import type { RepoEntry } from './dashboard.ts'
import { kpis } from './kpis.ts'
import {
  average,
  cycleDuration,
  firstReviewDurations,
  formatDuration,
  formatSize,
  median,
} from './reviewMetrics.ts'
import { teamStats } from './teamStats.ts'
import type { StoredPullRequest, StoredReview } from './types.ts'

const NOW = new Date('2026-06-30T12:00:00Z')
const HOUR = 60 * 60 * 1000

function pr(over: Partial<StoredPullRequest>): StoredPullRequest {
  return {
    number: 1,
    title: 'Fake title',
    author: 'alice',
    authorIsBot: false,
    state: 'merged',
    createdAt: '2026-06-20T10:00:00Z',
    updatedAt: '2026-06-25T10:00:00Z',
    mergedAt: '2026-06-22T10:00:00Z',
    closedAt: '2026-06-22T10:00:00Z',
    additions: 10,
    deletions: 4,
    baseBranch: 'main',
    requestedReviewers: [],
    ...over,
  }
}

function review(over: Partial<StoredReview>): StoredReview {
  return {
    id: 'r1',
    pullRequestNumber: 1,
    reviewer: 'bob',
    reviewerIsBot: false,
    outcome: 'approved',
    submittedAt: '2026-06-20T12:00:00Z',
    ...over,
  }
}

function entry(prs: StoredPullRequest[], reviews: StoredReview[] = []): RepoEntry {
  return {
    repo: 'o/a',
    syncedAt: '2026-06-30T11:00:00Z',
    data: { schemaVersion: 3, repo: 'o/a', syncedAt: '2026-06-30T11:00:00Z', pullRequests: prs, reviews },
  }
}

describe('median and average', () => {
  it('AC1: median of odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(median([])).toBeNull()
    expect(average([2, 4])).toBe(3)
    expect(average([])).toBeNull()
  })
})

describe('formatDuration and formatSize', () => {
  it('AC4: null renders n/a, never 0 or NaN', () => {
    expect(formatDuration(null)).toBe('n/a')
    expect(formatDuration(Number.NaN)).toBe('n/a')
    expect(formatSize(null)).toBe('n/a')
    expect(formatSize(Number.NaN)).toBe('n/a')
  })

  it('AC5: durations carry a unit', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(45 * 60 * 1000)).toBe('45 min')
    expect(formatDuration(5.5 * HOUR)).toBe('5.5 h')
    expect(formatDuration(24 * HOUR)).toBe('24 h')
    expect(formatDuration(72 * HOUR)).toBe('3 days')
    expect(formatDuration(60 * HOUR)).toBe('2.5 days')
  })

  it('AC5: sizes carry a unit', () => {
    expect(formatSize(1)).toBe('1 line')
    expect(formatSize(1234.4)).toBe('1,234 lines')
    expect(formatSize(0)).toBe('0 lines')
  })
})

describe('firstReviewDurations and cycleDuration', () => {
  it('AC1: uses the earliest qualifying review', () => {
    const map = firstReviewDurations(
      [pr({})],
      [
        review({ id: 'a', submittedAt: '2026-06-20T15:00:00Z' }),
        review({ id: 'b', reviewer: 'cy', submittedAt: '2026-06-20T12:00:00Z' }),
      ],
    )
    expect(map.get(1)).toBe(2 * HOUR)
  })

  it('AC5: ignores bots, self-reviews, dismissed reviews and reviews before opening', () => {
    const map = firstReviewDurations(
      [pr({}), pr({ number: 2, authorIsBot: true }), pr({ number: 3, author: null })],
      [
        review({ id: 'a', reviewer: 'Alice' }),
        review({ id: 'b', reviewerIsBot: true }),
        review({ id: 'c', reviewer: null }),
        review({ id: 'd', outcome: 'dismissed' }),
        review({ id: 'e', submittedAt: '2026-06-20T09:00:00Z' }),
        review({ id: 'f', pullRequestNumber: 2 }),
        review({ id: 'g', pullRequestNumber: 3 }),
      ],
    )
    expect(map.size).toBe(0)
  })

  it('AC1: cycle time is opened to merged, null for unmerged PRs', () => {
    expect(cycleDuration(pr({}))).toBe(48 * HOUR)
    expect(cycleDuration(pr({ state: 'open', mergedAt: null }))).toBeNull()
    expect(cycleDuration(pr({ state: 'closed', mergedAt: null }))).toBeNull()
  })
})

describe('kpis review metrics', () => {
  it('AC1: medians over the period for the selected repo', () => {
    const e = entry(
      [
        pr({ number: 1 }),
        pr({ number: 2, mergedAt: '2026-06-21T10:00:00Z', createdAt: '2026-06-20T10:00:00Z' }),
        pr({ number: 3, mergedAt: '2026-06-28T10:00:00Z', createdAt: '2026-06-20T10:00:00Z' }),
      ],
      [
        review({ id: 'a', pullRequestNumber: 1, submittedAt: '2026-06-20T11:00:00Z' }),
        review({ id: 'b', pullRequestNumber: 2, submittedAt: '2026-06-20T13:00:00Z' }),
        review({ id: 'c', pullRequestNumber: 3, submittedAt: '2026-06-20T15:00:00Z' }),
      ],
    )
    const k = kpis([e], 'o/a', 30, NOW)
    expect(k.medianFirstReviewMs).toBe(3 * HOUR)
    expect(k.medianCycleMs).toBe(48 * HOUR)
  })

  it('AC4: no qualifying PRs gives null', () => {
    const k = kpis([entry([pr({ state: 'open', mergedAt: null, closedAt: null })])], 'all', 30, NOW)
    expect(k.medianFirstReviewMs).toBeNull()
    expect(k.medianCycleMs).toBeNull()
  })

  it('AC5: bots and non-selected authors are excluded', () => {
    const e = entry(
      [pr({ number: 1, authorIsBot: true }), pr({ number: 2, author: 'zed' })],
      [review({ id: 'a', pullRequestNumber: 1 }), review({ id: 'b', pullRequestNumber: 2 })],
    )
    const k = kpis([e], 'all', 30, NOW, new Set(['alice']))
    expect(k.medianFirstReviewMs).toBeNull()
    expect(k.medianCycleMs).toBeNull()
  })

  it('AC1: PRs opened before the period do not count for first review', () => {
    const e = entry([pr({ createdAt: '2026-04-01T10:00:00Z', mergedAt: '2026-04-02T10:00:00Z' })], [
      review({ submittedAt: '2026-04-01T11:00:00Z' }),
    ])
    const k = kpis([e], 'all', 30, NOW)
    expect(k.medianFirstReviewMs).toBeNull()
    expect(k.medianCycleMs).toBeNull()
  })
})

describe('teamStats review metrics', () => {
  it('AC2: per member average size and median first review, n/a-ready nulls otherwise', () => {
    const e = entry(
      [
        pr({ number: 1, additions: 100, deletions: 0 }),
        pr({ number: 2, additions: 200, deletions: 100 }),
        pr({ number: 3, author: 'carol', additions: 5, deletions: 5 }),
      ],
      [
        review({ id: 'a', pullRequestNumber: 1, submittedAt: '2026-06-20T11:00:00Z' }),
        review({ id: 'b', pullRequestNumber: 2, submittedAt: '2026-06-20T13:00:00Z' }),
      ],
    )
    const [alice, carol, dave] = teamStats([e], 'all', 30, NOW, ['alice', 'carol', 'dave'])
    expect(alice.avgPrSize).toBe(200)
    expect(alice.medianFirstReviewMs).toBe(2 * HOUR)
    expect(alice.medianCycleMs).toBe(48 * HOUR)
    expect(carol.avgPrSize).toBe(10)
    expect(carol.medianFirstReviewMs).toBeNull()
    expect(dave.avgPrSize).toBeNull()
    expect(dave.medianFirstReviewMs).toBeNull()
    expect(dave.medianCycleMs).toBeNull()
  })

  it('AC5: bot PRs are not counted for any member', () => {
    const e = entry([pr({ authorIsBot: true })], [review({})])
    const [alice] = teamStats([e], 'all', 30, NOW, ['alice'])
    expect(alice.avgPrSize).toBeNull()
    expect(alice.medianFirstReviewMs).toBeNull()
  })
})
