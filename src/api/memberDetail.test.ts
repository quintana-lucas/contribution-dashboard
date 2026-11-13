import { describe, expect, it } from 'vitest'
import { buckets } from './dashboard.ts'
import type { RepoEntry } from './dashboard.ts'
import { memberDetail } from './memberDetail.ts'
import { teamStats } from './teamStats.ts'
import type { StoredPullRequest, StoredReview } from './types.ts'

const NOW = new Date('2026-06-30T12:00:00Z')
const NOW_ISO = '2026-06-30T12:00:00.000Z'
const START_30 = '2026-05-31T12:00:00.000Z'
const TWO_DAYS_AGO = '2026-06-28T12:00:00.000Z'

function pr(over: Partial<StoredPullRequest>): StoredPullRequest {
  return {
    number: 1,
    title: 'Fake title',
    author: 'alice',
    authorIsBot: false,
    state: 'merged',
    createdAt: '2026-06-20T10:00:00Z',
    updatedAt: '2026-06-25T10:00:00Z',
    mergedAt: '2026-06-25T10:00:00Z',
    closedAt: '2026-06-25T10:00:00Z',
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
    reviewer: 'alice',
    reviewerIsBot: false,
    outcome: 'approved',
    submittedAt: '2026-06-26T10:00:00Z',
    ...over,
  }
}

function entry(repo: string, prs: StoredPullRequest[], reviews: StoredReview[] = []): RepoEntry {
  return {
    repo,
    syncedAt: '2026-06-30T11:00:00Z',
    data: { schemaVersion: 3, repo, syncedAt: '2026-06-30T11:00:00Z', pullRequests: prs, reviews },
  }
}

describe('memberDetail', () => {
  it('AC1: numbers equal the Team table row, login matched case-insensitively', () => {
    const e = entry(
      'o/a',
      [pr({ number: 1 }), pr({ number: 2, author: 'bob' }), pr({ number: 3, author: 'ALICE' })],
      [
        review({ id: 'a', reviewer: 'ALICE', pullRequestNumber: 2 }),
        review({ id: 'b', reviewer: 'bob', pullRequestNumber: 1 }),
        review({ id: 'c', reviewer: 'bob', pullRequestNumber: 3, outcome: 'dismissed' }),
      ],
    )
    const detail = memberDetail([e], 'all', 30, NOW, 'Alice')
    const [row] = teamStats([e], 'all', 30, NOW, ['Alice'])
    expect(detail.login).toBe('Alice')
    expect(detail.merged).toBe(row.merged)
    expect(detail.merged).toBe(2)
    expect(detail.reviewsGiven).toBe(row.reviewsGiven)
    expect(detail.reviewsReceived).toBe(row.reviewsReceived)
    expect(detail.reviewsReceived).toBe(1)
  })

  it('AC1: the repo selection and the window (start, end] apply', () => {
    const a = entry('o/a', [pr({ number: 1, mergedAt: START_30 }), pr({ number: 2, mergedAt: NOW_ISO })])
    const b = entry('o/b', [pr({ number: 1 })])
    expect(memberDetail([a, b], 'all', 30, NOW, 'alice').merged).toBe(2)
    expect(memberDetail([a, b], 'o/b', 30, NOW, 'alice').merged).toBe(1)
    expect(memberDetail([a, b], 'o/a', 30, NOW, 'alice').recentTotal).toBe(1)
  })

  it('AC1: bot authors and bot reviewers are excluded', () => {
    const e = entry(
      'o/a',
      [pr({ number: 1, author: 'dependabot', authorIsBot: true })],
      [review({ reviewer: 'dependabot', reviewerIsBot: true })],
    )
    const detail = memberDetail([e], 'all', 30, NOW, 'dependabot')
    expect(detail.merged).toBe(0)
    expect(detail.recentPrs).toEqual([])
    expect(detail.reviewOutcomes).toEqual({ approved: 0, changesRequested: 0, commented: 0 })
  })

  it('AC2: 7 days gives 7 day buckets with zeros kept, counted by merge date', () => {
    const e = entry('o/a', [
      pr({ number: 1, mergedAt: NOW_ISO }),
      pr({ number: 2, mergedAt: TWO_DAYS_AGO }),
      pr({ number: 3, mergedAt: TWO_DAYS_AGO }),
      pr({ number: 4, mergedAt: '2026-06-01T10:00:00Z', createdAt: '2026-06-28T10:00:00Z' }), // outside window
    ])
    const detail = memberDetail([e], 'all', 7, NOW, 'alice')
    const expected = buckets(7, NOW)
    expect(detail.mergedBuckets).toHaveLength(7)
    expect(detail.mergedBuckets.map((b) => b.start.getTime())).toEqual(expected.map((b) => b.start.getTime()))
    expect(detail.mergedBuckets.map((b) => b.count)).toEqual([0, 0, 0, 0, 2, 0, 1])
    expect(detail.mergedBuckets.reduce((n, b) => n + b.count, 0)).toBe(detail.merged)
  })

  it('AC2: 30 and 90 days give week buckets whose counts sum to merged', () => {
    const e = entry('o/a', [
      pr({ number: 1, mergedAt: NOW_ISO }),
      pr({ number: 2, mergedAt: '2026-06-02T10:00:00Z' }),
      pr({ number: 3, mergedAt: '2026-04-15T10:00:00Z' }),
    ])
    const d30 = memberDetail([e], 'all', 30, NOW, 'alice')
    const d90 = memberDetail([e], 'all', 90, NOW, 'alice')
    expect(d30.mergedBuckets).toHaveLength(buckets(30, NOW).length)
    expect(d90.mergedBuckets).toHaveLength(buckets(90, NOW).length)
    expect(d30.mergedBuckets.reduce((n, b) => n + b.count, 0)).toBe(2)
    expect(d90.mergedBuckets.reduce((n, b) => n + b.count, 0)).toBe(3)
    expect(d90.mergedBuckets.some((b) => b.count === 0)).toBe(true)
  })

  it('AC3: outcomes split by type, dismissed excluded, sum matches reviewsGiven', () => {
    const e = entry(
      'o/a',
      [pr({ number: 1, author: 'bob' })],
      [
        review({ id: 'a', outcome: 'approved' }),
        review({ id: 'b', outcome: 'approved' }),
        review({ id: 'c', outcome: 'changes_requested' }),
        review({ id: 'd', outcome: 'commented' }),
        review({ id: 'e', outcome: 'dismissed' }),
        review({ id: 'f', outcome: 'approved', submittedAt: '2026-01-01T00:00:00Z' }), // outside window
        review({ id: 'g', outcome: 'approved', reviewer: 'bob' }),
      ],
    )
    const detail = memberDetail([e], 'all', 30, NOW, 'alice')
    expect(detail.reviewOutcomes).toEqual({ approved: 2, changesRequested: 1, commented: 1 })
    const { approved, changesRequested, commented } = detail.reviewOutcomes
    expect(approved + changesRequested + commented).toBe(detail.reviewsGiven)
  })

  it('AC4: recent PRs are newest first by the date of their state, with repo and total', () => {
    const e = entry('o/a', [
      pr({ number: 1, title: 'merged old', mergedAt: '2026-06-10T10:00:00Z' }),
      pr({ number: 2, title: 'open', state: 'open', mergedAt: null, closedAt: null, createdAt: '2026-06-29T10:00:00Z' }),
      pr({ number: 3, title: 'closed', state: 'closed', mergedAt: null, closedAt: '2026-06-20T10:00:00Z' }),
      pr({ number: 4, title: 'open ancient', state: 'open', mergedAt: null, closedAt: null, createdAt: '2026-01-01T10:00:00Z' }),
      pr({ number: 5, title: 'not mine', author: 'bob' }),
    ])
    const detail = memberDetail([e], 'all', 30, NOW, 'alice')
    expect(detail.recentTotal).toBe(3)
    expect(detail.recentPrs.map((p) => p.title)).toEqual(['open', 'closed', 'merged old'])
    expect(detail.recentPrs[0]).toEqual({
      repo: 'o/a',
      number: 2,
      state: 'open',
      title: 'open',
      additions: 10,
      deletions: 4,
      date: '2026-06-29T10:00:00Z',
    })
    expect(detail.recentPrs[1].date).toBe('2026-06-20T10:00:00Z')
  })

  it('AC4: limited to 10 with the full count in recentTotal', () => {
    const prs = Array.from({ length: 12 }, (_, i) =>
      pr({ number: i + 1, mergedAt: `2026-06-${String(10 + i).padStart(2, '0')}T10:00:00Z` }),
    )
    const detail = memberDetail([entry('o/a', prs)], 'all', 30, NOW, 'alice')
    expect(detail.recentPrs).toHaveLength(10)
    expect(detail.recentTotal).toBe(12)
    expect(detail.recentPrs[0].number).toBe(12)
    expect(detail.recentPrs[9].number).toBe(3)
  })

  it('AC6: a member without activity gets zeros and empty lists', () => {
    const detail = memberDetail([entry('o/a', [pr({})])], 'all', 30, NOW, 'zed')
    expect(detail.merged).toBe(0)
    expect(detail.reviewsGiven).toBe(0)
    expect(detail.reviewsReceived).toBe(0)
    expect(detail.reviewOutcomes).toEqual({ approved: 0, changesRequested: 0, commented: 0 })
    expect(detail.recentPrs).toEqual([])
    expect(detail.recentTotal).toBe(0)
    expect(detail.mergedBuckets.length).toBeGreaterThan(0)
    expect(detail.mergedBuckets.every((b) => b.count === 0)).toBe(true)
  })

  it('AC6: skips entries without data and does not mutate inputs', () => {
    const e = entry('o/a', [pr({})], [review({})])
    const empty: RepoEntry = { repo: 'o/z', syncedAt: null, data: null }
    const entries = [e, empty]
    const snapshot = JSON.stringify(entries)
    memberDetail(entries, 'all', 30, NOW, 'alice')
    expect(JSON.stringify(entries)).toBe(snapshot)
  })
})
