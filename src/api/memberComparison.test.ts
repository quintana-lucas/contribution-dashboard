import { describe, expect, it } from 'vitest'
import type { RepoEntry } from './dashboard.ts'
import { kpiComparison } from './kpiComparison.ts'
import { memberComparison } from './memberComparison.ts'
import type { StoredPullRequest, StoredReview } from './types.ts'

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

function fixture(): RepoEntry {
  return repoEntry(
    'o/a',
    [
      // alice: current merged x2 (+30/-5, +10/-5), previous merged x1 (+20/-10)
      // (additions/deletions count by createdAt, merges by mergedAt)
      mergedPr('2026-06-28T00:00:00Z', { number: 1, createdAt: '2026-06-28T00:00:00Z', additions: 30, deletions: 5 }),
      mergedPr('2026-06-25T00:00:00Z', { number: 2, createdAt: '2026-06-25T00:00:00Z', additions: 10, deletions: 5 }),
      mergedPr('2026-06-20T00:00:00Z', { number: 3, createdAt: '2026-06-20T00:00:00Z', additions: 20, deletions: 10 }),
      // carol: other member
      mergedPr('2026-06-27T00:00:00Z', { number: 4, author: 'carol', createdAt: '2026-06-27T00:00:00Z', additions: 99, deletions: 99 }),
      mergedPr('2026-06-21T00:00:00Z', { number: 5, author: 'carol', createdAt: '2026-06-21T00:00:00Z', additions: 1, deletions: 1 }),
      mergedPr('2026-06-22T00:00:00Z', { number: 6, author: 'carol', createdAt: '2026-06-22T00:00:00Z', additions: 1, deletions: 1 }),
    ],
    [
      // bob reviews alice's and carol's PRs
      review({ id: 'a', pullRequestNumber: 1, submittedAt: '2026-06-27T00:00:00Z' }),
      review({ id: 'b', pullRequestNumber: 2, submittedAt: '2026-06-26T00:00:00Z' }),
      review({ id: 'c', pullRequestNumber: 3, submittedAt: '2026-06-20T00:00:00Z' }),
      review({ id: 'd', pullRequestNumber: 4, reviewer: 'dave', submittedAt: '2026-06-27T00:00:00Z' }),
    ],
  )
}

describe('memberComparison', () => {
  it('AC1: returns current, previous and delta for the four metrics of one member', () => {
    const r = memberComparison([fixture()], 'all', 7, NOW, 'alice')
    if (r.status !== 'available') throw new Error('expected available')
    expect(r.metrics.mergedPrs).toEqual({ current: 2, previous: 1, delta: 1, deltaPct: 100 })
    expect(r.metrics.additions).toEqual({ current: 40, previous: 20, delta: 20, deltaPct: 100 })
    expect(r.metrics.deletions).toEqual({ current: 10, previous: 10, delta: 0, deltaPct: 0 })
    const b = memberComparison([fixture()], 'all', 7, NOW, 'bob')
    if (b.status !== 'available') throw new Error('expected available')
    expect(b.metrics.reviews).toEqual({ current: 2, previous: 1, delta: 1, deltaPct: 100 })
  })

  it('AC2: equals kpiComparison with that member as team filter, with (start, end] boundaries', () => {
    const e = repoEntry('o/a', [
      mergedPr('2026-06-16T12:00:00Z', { number: 1 }), // excluded from both
      mergedPr('2026-06-16T12:00:01Z', { number: 2 }), // previous
      mergedPr('2026-06-23T12:00:00Z', { number: 3 }), // boundary: previous only
      mergedPr('2026-06-23T12:00:01Z', { number: 4 }), // current
      mergedPr('2026-06-30T12:00:00Z', { number: 5 }), // end of current: included
    ])
    const r = memberComparison([e], 'all', 7, NOW, 'alice')
    expect(r).toEqual(kpiComparison([e], 'all', 7, NOW, new Set(['alice'])))
    if (r.status !== 'available') throw new Error('expected available')
    expect(r.metrics.mergedPrs.current).toBe(2)
    expect(r.metrics.mergedPrs.previous).toBe(2)
    const f = fixture()
    expect(memberComparison([f], 'all', 7, NOW, 'bob')).toEqual(kpiComparison([f], 'all', 7, NOW, new Set(['bob'])))
  })

  it('AC3: insufficient history is signalled; previous 0 gives deltaPct undefined', () => {
    expect(memberComparison([fixture()], 'all', 90, NOW, 'alice')).toEqual({ status: 'insufficient_history' })
    const e = repoEntry('o/a', [mergedPr('2026-06-28T00:00:00Z', { number: 1 })])
    const r = memberComparison([e], 'all', 7, NOW, 'alice')
    if (r.status !== 'available') throw new Error('expected available')
    expect(r.metrics.mergedPrs).toEqual({ current: 1, previous: 0, delta: 1, deltaPct: undefined })
  })

  it('AC4: a member with no activity returns zeros without error', () => {
    const r = memberComparison([fixture()], 'all', 7, NOW, 'nobody')
    if (r.status !== 'available') throw new Error('expected available')
    for (const m of [r.metrics.mergedPrs, r.metrics.reviews, r.metrics.additions, r.metrics.deletions]) {
      expect(m).toEqual({ current: 0, previous: 0, delta: 0, deltaPct: undefined })
    }
  })

  it('AC5: different member, period or repo gives figures for that selection only; login is case-insensitive', () => {
    const a = fixture()
    const b = repoEntry('o/b', [mergedPr('2026-06-28T00:00:00Z', { number: 1 })])
    const alice = memberComparison([a, b], 'all', 7, NOW, 'alice')
    const carol = memberComparison([a, b], 'all', 7, NOW, 'carol')
    if (alice.status !== 'available' || carol.status !== 'available') throw new Error('expected available')
    expect(alice.metrics.mergedPrs.current).toBe(3) // 2 in o/a + 1 in o/b
    expect(carol.metrics.mergedPrs.current).toBe(1)
    expect(carol.metrics.additions.current).toBe(99)
    const onlyA = memberComparison([a, b], 'o/a', 7, NOW, 'alice')
    if (onlyA.status !== 'available') throw new Error('expected available')
    expect(onlyA.metrics.mergedPrs.current).toBe(2)
    const p30 = memberComparison([a, b], 'all', 30, NOW, 'alice')
    if (p30.status !== 'available') throw new Error('expected available')
    expect(p30.metrics.mergedPrs.current).toBe(4)
    expect(memberComparison([a, b], 'all', 7, NOW, 'ALICE')).toEqual(alice)
  })

  it('AC6: a member call does not alter the team-level comparison output', () => {
    const e = fixture()
    const before = kpiComparison([e], 'all', 7, NOW)
    memberComparison([e], 'all', 7, NOW, 'alice')
    expect(kpiComparison([e], 'all', 7, NOW)).toEqual(before)
    const team = kpiComparison([e], 'all', 7, NOW, new Set(['alice', 'carol']))
    memberComparison([e], 'all', 7, NOW, 'carol')
    expect(kpiComparison([e], 'all', 7, NOW, new Set(['alice', 'carol']))).toEqual(team)
  })
})
