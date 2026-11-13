import { describe, expect, it } from 'vitest'
import { kpis } from './kpis.ts'
import type { RepoEntry } from './dashboard.ts'
import type { StoredPullRequest, StoredReview } from './types.ts'

const NOW = new Date('2026-06-30T12:00:00Z')
const START_30 = '2026-05-31T12:00:00.000Z' // NOW - 30 days
const NOW_ISO = '2026-06-30T12:00:00.000Z'

function pr(over: Partial<StoredPullRequest>): StoredPullRequest {
  return {
    number: 1,
    author: 'alice',
    authorIsBot: false,
    state: 'open',
    createdAt: '2026-06-20T10:00:00Z',
    updatedAt: '2026-06-25T10:00:00Z',
    mergedAt: null,
    closedAt: null,
    additions: 10,
    deletions: 4,
    baseBranch: 'main',
    requestedReviewers: [],
    ...over,
  }
}

function merged(over: Partial<StoredPullRequest>): StoredPullRequest {
  return pr({ state: 'merged', mergedAt: '2026-06-25T10:00:00Z', closedAt: '2026-06-25T10:00:00Z', ...over })
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

function entry(repo: string, prs: StoredPullRequest[], reviews: StoredReview[] = []): RepoEntry {
  return {
    repo,
    syncedAt: '2026-06-30T11:00:00Z',
    data: { schemaVersion: 2, repo, syncedAt: '2026-06-30T11:00:00Z', pullRequests: prs, reviews },
  }
}

describe('kpis', () => {
  it('AC2: open PRs count any age and ignore the period', () => {
    const e = entry('o/a', [
      pr({ number: 1, createdAt: '2020-01-01T00:00:00Z' }),
      pr({ number: 2 }),
      merged({ number: 3 }),
    ])
    expect(kpis([e], 'all', 7, NOW).openPrs).toBe(2)
    expect(kpis([e], 'all', 30, NOW).openPrs).toBe(2)
  })

  it('AC2: waiting over 24 h boundary is strict and counts only unreviewed PRs', () => {
    const e = entry(
      'o/a',
      [
        pr({ number: 1, createdAt: '2026-06-29T11:59:59Z' }), // just over 24 h, unreviewed
        pr({ number: 2, createdAt: '2026-06-29T12:00:00Z' }), // exactly 24 h
        pr({ number: 3, createdAt: '2026-06-29T13:00:00Z' }), // 23 h
        pr({ number: 4, createdAt: '2026-06-01T00:00:00Z' }), // old but reviewed
        pr({ number: 5, createdAt: '2026-06-01T00:00:00Z' }), // old, only self-reviewed
      ],
      [
        review({ id: 'a', pullRequestNumber: 4, reviewer: 'bob', submittedAt: '2025-01-01T00:00:00Z' }),
        review({ id: 'b', pullRequestNumber: 5, reviewer: 'alice' }),
      ],
    )
    const k = kpis([e], 'all', 30, NOW)
    expect(k.openPrs).toBe(5)
    expect(k.waitingOver24h).toBe(2) // PRs 1 and 5
  })

  it('AC2: merged and closed-without-merge use their own window dates, start exclusive, end inclusive', () => {
    const e = entry('o/a', [
      merged({ number: 1, mergedAt: START_30 }),
      merged({ number: 2, mergedAt: '2026-05-31T12:00:00.001Z' }),
      merged({ number: 3, mergedAt: NOW_ISO }),
      pr({ number: 4, state: 'closed', closedAt: START_30 }),
      pr({ number: 5, state: 'closed', closedAt: '2026-06-10T00:00:00Z' }),
      pr({ number: 6, state: 'closed', closedAt: NOW_ISO }),
    ])
    const k = kpis([e], 'all', 30, NOW)
    expect(k.mergedPrs).toBe(2)
    expect(k.closedWithoutMerge).toBe(2)
  })

  it('AC2: reviews exclude self-reviews and compute a rounded changes-requested percent', () => {
    const e = entry(
      'o/a',
      [pr({ number: 1, author: 'alice' })],
      [
        review({ id: '1', reviewer: 'bob', outcome: 'changes_requested' }),
        review({ id: '2', reviewer: 'carol', outcome: 'approved' }),
        review({ id: '3', reviewer: 'dave', outcome: 'approved' }),
        review({ id: '4', reviewer: 'alice', outcome: 'changes_requested' }), // self
        review({ id: '5', reviewer: 'bob', submittedAt: START_30 }), // start exclusive
        review({ id: '6', reviewer: 'bob', submittedAt: NOW_ISO }), // end inclusive
      ],
    )
    const k = kpis([e], 'all', 30, NOW)
    expect(k.reviews).toBe(4)
    expect(k.changesRequestedPercent).toBe(25)
    const e2 = entry(
      'o/a',
      [pr({ number: 1 })],
      [
        review({ id: '1', outcome: 'changes_requested' }),
        review({ id: '2', outcome: 'approved' }),
        review({ id: '3', outcome: 'approved' }),
      ],
    )
    expect(kpis([e2], 'all', 30, NOW).changesRequestedPercent).toBe(33)
  })

  it('AC2: lines and PRs opened sum over PRs created in the window', () => {
    const e = entry('o/a', [
      pr({ number: 1, additions: 5, deletions: 2 }),
      merged({ number: 2, additions: 7, deletions: 1 }),
      pr({ number: 3, createdAt: START_30, additions: 100, deletions: 100 }),
      pr({ number: 4, createdAt: '2026-01-01T00:00:00Z', additions: 100, deletions: 100 }),
    ])
    const k = kpis([e], 'all', 30, NOW)
    expect(k.prsOpened).toBe(2)
    expect(k.additions).toBe(12)
    expect(k.deletions).toBe(3)
  })

  it('AC3: bots, null logins and non-members are excluded from every figure', () => {
    const e = entry(
      'o/a',
      [
        pr({ number: 1, author: 'alice' }),
        pr({ number: 2, author: 'dependabot', authorIsBot: true, createdAt: '2026-06-01T00:00:00Z' }),
        pr({ number: 3, author: null }),
        pr({ number: 4, author: 'mallory' }),
        merged({ number: 5, author: 'mallory' }),
        merged({ number: 6, author: 'ALICE' }),
      ],
      [
        review({ id: '1', pullRequestNumber: 1, reviewer: 'BOB' }),
        review({ id: '2', pullRequestNumber: 1, reviewer: 'robot', reviewerIsBot: true }),
        review({ id: '3', pullRequestNumber: 1, reviewer: null }),
        review({ id: '4', pullRequestNumber: 1, reviewer: 'mallory' }),
        review({ id: '5', pullRequestNumber: 2, reviewer: 'bob' }), // on a bot PR
      ],
    )
    const k = kpis([e], 'all', 30, NOW, new Set(['alice', 'bob']))
    expect(k.openPrs).toBe(1)
    expect(k.mergedPrs).toBe(1)
    expect(k.prsOpened).toBe(2)
    expect(k.additions).toBe(20)
    expect(k.reviews).toBe(1)
    expect(k.waitingOver24h).toBe(0)
  })

  it('AC4: no data gives hasData false, zeros and a null percent', () => {
    const none: RepoEntry = { repo: 'o/a', syncedAt: null, data: null }
    expect(kpis([none], 'all', 30, NOW)).toEqual({
      hasData: false,
      openPrs: 0,
      waitingOver24h: 0,
      mergedPrs: 0,
      closedWithoutMerge: 0,
      reviews: 0,
      changesRequestedPercent: null,
      additions: 0,
      deletions: 0,
      prsOpened: 0,
    })
    expect(kpis([], 'all', 30, NOW).hasData).toBe(false)
  })

  it('AC4: synced repo with an empty window has hasData true, zeros and no NaN', () => {
    const k = kpis([entry('o/a', [])], 'all', 30, NOW)
    expect(k.hasData).toBe(true)
    expect(k.reviews).toBe(0)
    expect(k.changesRequestedPercent).toBeNull()
    expect(Object.values(k).some((v) => typeof v === 'number' && Number.isNaN(v))).toBe(false)
  })

  it('AC5: repo selection and period change the figures', () => {
    const a = entry('o/a', [merged({ number: 1, mergedAt: '2026-06-28T00:00:00Z' })])
    const b = entry('o/b', [
      merged({ number: 1, mergedAt: '2026-06-10T00:00:00Z' }),
      pr({ number: 2, createdAt: '2026-06-10T00:00:00Z' }),
    ])
    expect(kpis([a, b], 'all', 30, NOW).mergedPrs).toBe(2)
    expect(kpis([a, b], 'o/a', 30, NOW).mergedPrs).toBe(1)
    expect(kpis([a, b], 'o/b', 30, NOW).mergedPrs).toBe(1)
    expect(kpis([a, b], 'o/b', 7, NOW).mergedPrs).toBe(0)
    expect(kpis([a, b], 'o/b', 7, NOW).openPrs).toBe(1) // open PRs ignore the period
    expect(kpis([a, b], 'o/a', 7, NOW).hasData).toBe(true)
  })

  it('does not mutate its inputs', () => {
    const e = entry('o/a', [pr({ number: 1 })], [review({})])
    const snapshot = JSON.stringify(e)
    kpis([e], 'all', 30, NOW, new Set(['alice']))
    expect(JSON.stringify(e)).toBe(snapshot)
  })
})
