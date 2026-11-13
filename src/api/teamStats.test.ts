import { describe, expect, it } from 'vitest'
import { teamStats } from './teamStats.ts'
import type { RepoEntry } from './dashboard.ts'
import type { StoredPullRequest, StoredReview } from './types.ts'

const NOW = new Date('2026-06-30T12:00:00Z')
const START_30 = '2026-05-31T12:00:00.000Z' // NOW - 30 days
const NOW_ISO = '2026-06-30T12:00:00.000Z'

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
    reviewer: 'bob',
    reviewerIsBot: false,
    outcome: 'APPROVED',
    submittedAt: '2026-06-26T10:00:00Z',
    ...over,
  } as StoredReview
}

function entry(repo: string, prs: StoredPullRequest[], reviews: StoredReview[] = []): RepoEntry {
  return {
    repo,
    syncedAt: '2026-06-30T11:00:00Z',
    data: { schemaVersion: 3, repo, syncedAt: '2026-06-30T11:00:00Z', pullRequests: prs, reviews },
  }
}

describe('teamStats', () => {
  it('AC1: window edges for opened, start exclusive and end inclusive', () => {
    const e = entry('o/a', [
      pr({ number: 1, createdAt: START_30, state: 'open', mergedAt: null, closedAt: null }),
      pr({ number: 2, createdAt: '2026-05-31T12:00:00.001Z', state: 'open', mergedAt: null, closedAt: null }),
      pr({ number: 3, createdAt: NOW_ISO, state: 'open', mergedAt: null, closedAt: null }),
    ])
    const [row] = teamStats([e], 'all', 30, NOW, ['alice'])
    expect(row.opened).toBe(2)
    expect(row.open).toBe(2)
  })

  it('AC1: window edges for merged and lines', () => {
    const e = entry('o/a', [
      pr({ number: 1, mergedAt: START_30 }),
      pr({ number: 2, mergedAt: NOW_ISO, additions: 5, deletions: 2 }),
      pr({ number: 3, mergedAt: '2026-06-25T10:00:00Z', additions: 1, deletions: 1 }),
    ])
    const [row] = teamStats([e], 'all', 30, NOW, ['alice'])
    expect(row.merged).toBe(2)
    expect(row.additions).toBe(6)
    expect(row.deletions).toBe(3)
  })

  it('AC1: window edges for closed', () => {
    const closed = { state: 'closed', mergedAt: null } as const
    const e = entry('o/a', [
      pr({ number: 1, ...closed, closedAt: START_30 }),
      pr({ number: 2, ...closed, closedAt: NOW_ISO }),
      pr({ number: 3, ...closed, closedAt: '2026-06-29T10:00:00Z' }),
    ])
    const [row] = teamStats([e], 'all', 30, NOW, ['alice'])
    expect(row.closed).toBe(2)
    expect(row.merged).toBe(0)
  })

  it('AC1: window edges for reviews given', () => {
    const e = entry(
      'o/a',
      [pr({ number: 1 })],
      [
        review({ id: 'a', submittedAt: START_30 }),
        review({ id: 'b', submittedAt: NOW_ISO }),
        review({ id: 'c', submittedAt: '2026-06-27T10:00:00Z' }),
      ],
    )
    const rows = teamStats([e], 'all', 30, NOW, ['bob', 'alice'])
    expect(rows[0].reviewsGiven).toBe(2)
    expect(rows[1].reviewsReceived).toBe(2)
  })

  it('AC1: bot authors and bot reviewers are excluded', () => {
    const e = entry(
      'o/a',
      [pr({ number: 1, author: 'dependabot', authorIsBot: true }), pr({ number: 2 })],
      [
        review({ id: 'a', pullRequestNumber: 2, reviewer: 'ci-bot', reviewerIsBot: true }),
        review({ id: 'b', pullRequestNumber: 1, reviewer: 'bob' }),
      ],
    )
    const rows = teamStats([e], 'all', 30, NOW, ['dependabot', 'ci-bot', 'alice'])
    expect(rows[0].merged).toBe(0)
    expect(rows[1].reviewsGiven).toBe(0)
    expect(rows[2].reviewsReceived).toBe(0)
    expect(rows[2].merged).toBe(1)
  })

  it('AC1: self-reviews are not counted as received but count as given', () => {
    const e = entry('o/a', [pr({ number: 1 })], [review({ reviewer: 'Alice' })])
    const [row] = teamStats([e], 'all', 30, NOW, ['alice'])
    expect(row.reviewsReceived).toBe(0)
    expect(row.reviewsGiven).toBe(1)
  })

  it('AC1: reviews match the PR by repo and number', () => {
    const a = entry('o/a', [pr({ number: 1, author: 'alice' })], [])
    const b = entry('o/b', [pr({ number: 2, author: 'carol' })], [review({ pullRequestNumber: 1 })])
    const rows = teamStats([a, b], 'all', 30, NOW, ['alice', 'carol'])
    expect(rows[0].reviewsReceived).toBe(0)
    expect(rows[1].reviewsReceived).toBe(0)
  })

  it('AC1: zero row for an inactive member, order and casing follow members', () => {
    const e = entry('o/a', [pr({})])
    const rows = teamStats([e], 'all', 30, NOW, ['Zed', 'Alice'])
    expect(rows.map((r) => r.login)).toEqual(['Zed', 'Alice'])
    expect(rows[0]).toEqual({
      login: 'Zed',
      opened: 0,
      merged: 0,
      closed: 0,
      open: 0,
      reviewsGiven: 0,
      reviewsReceived: 0,
      additions: 0,
      deletions: 0,
    })
    expect(rows[1].merged).toBe(1)
  })

  it('AC3: the repo selection changes the figures', () => {
    const a = entry('o/a', [pr({ number: 1 })])
    const b = entry('o/b', [pr({ number: 1 }), pr({ number: 2 })])
    expect(teamStats([a, b], 'all', 30, NOW, ['alice'])[0].merged).toBe(3)
    expect(teamStats([a, b], 'o/b', 30, NOW, ['alice'])[0].merged).toBe(2)
  })

  it('AC3: the period changes the figures', () => {
    const e = entry('o/a', [pr({ number: 1, mergedAt: '2026-06-01T10:00:00Z', createdAt: '2026-05-30T10:00:00Z' })])
    expect(teamStats([e], 'all', 7, NOW, ['alice'])[0].merged).toBe(0)
    expect(teamStats([e], 'all', 30, NOW, ['alice'])[0].merged).toBe(1)
  })

  it('AC1: does not mutate inputs and skips entries without data', () => {
    const e = entry('o/a', [pr({})], [review({})])
    const empty: RepoEntry = { repo: 'o/z', syncedAt: null, data: null }
    const entries = [e, empty]
    const members = ['alice']
    const snapshot = JSON.stringify({ entries, members })
    teamStats(entries, 'all', 30, NOW, members)
    expect(JSON.stringify({ entries, members })).toBe(snapshot)
  })
})
