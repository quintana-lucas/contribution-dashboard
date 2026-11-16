import { describe, expect, it } from 'vitest'
import type { RepoEntry } from './dashboard'
import { prActivity } from './prActivity'
import type { StoredPullRequest, StoredRepo } from './types'

// Fake data only. Local noon keeps events away from bucket edges in any timezone.
const NOW = new Date(2026, 5, 15, 12, 0, 0)
const daysAgo = (n: number) => new Date(2026, 5, 15 - n, 12, 0, 0).toISOString()

function pr(over: Partial<StoredPullRequest>): StoredPullRequest {
  return {
    number: 1,
    title: 'Fake',
    author: 'ana',
    authorIsBot: false,
    state: 'open',
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    mergedAt: null,
    closedAt: null,
    additions: 1,
    deletions: 1,
    baseBranch: 'main',
    requestedReviewers: [],
    ...over,
  }
}

function entry(repo: string, prs: StoredPullRequest[]): RepoEntry {
  const data: StoredRepo = { schemaVersion: 3, repo, syncedAt: daysAgo(0), pullRequests: prs, reviews: [] }
  return { repo, syncedAt: data.syncedAt, data }
}

const sum = (rows: { opened: number; merged: number; closed: number }[], k: 'opened' | 'merged' | 'closed') =>
  rows.reduce((t, r) => t + r[k], 0)

describe('prActivity', () => {
  it('AC1: buckets by day for 7 days and by week for 30 and 90 days', () => {
    const entries = [entry('acme/api', [])]
    expect(prActivity(entries, 'all', 7, NOW).buckets).toHaveLength(7)
    expect(prActivity(entries, 'all', 30, NOW).buckets).toHaveLength(5)
    expect(prActivity(entries, 'all', 90, NOW).buckets).toHaveLength(13)
  })

  it('AC1: counts opened, merged and closed by their own dates', () => {
    const entries = [
      entry('acme/api', [
        pr({ number: 1, createdAt: daysAgo(10), state: 'merged', mergedAt: daysAgo(1) }),
        pr({ number: 2, createdAt: daysAgo(2), state: 'closed', closedAt: daysAgo(0) }),
        pr({ number: 3, createdAt: daysAgo(3) }),
      ]),
    ]
    const { buckets } = prActivity(entries, 'all', 7, NOW)
    expect(sum(buckets, 'opened')).toBe(2)
    expect(sum(buckets, 'merged')).toBe(1)
    expect(sum(buckets, 'closed')).toBe(1)
    expect(buckets[6].closed).toBe(1)
    expect(buckets[5].merged).toBe(1)
  })

  it('AC3: aggregates across repos', () => {
    const entries = [
      entry('acme/api', [pr({ createdAt: daysAgo(1) })]),
      entry('acme/web', [pr({ createdAt: daysAgo(1) }), pr({ number: 2, createdAt: daysAgo(1) })]),
    ]
    expect(sum(prActivity(entries, 'all', 7, NOW).buckets, 'opened')).toBe(3)
  })

  it('AC4: buckets without activity are present as zeros', () => {
    const entries = [entry('acme/api', [pr({ createdAt: daysAgo(1) })])]
    const { buckets } = prActivity(entries, 'all', 7, NOW)
    expect(buckets).toHaveLength(7)
    expect(buckets.filter((b) => b.opened === 0 && b.merged === 0 && b.closed === 0)).toHaveLength(6)
  })

  it('AC5: hasData is false without stored data', () => {
    const entries: RepoEntry[] = [{ repo: 'acme/new', syncedAt: null, data: null }]
    expect(prActivity(entries, 'all', 30, NOW).hasData).toBe(false)
    expect(prActivity([entry('acme/api', [])], 'all', 30, NOW).hasData).toBe(true)
  })

  it('AC9: respects the repo selection and the period, and excludes bots', () => {
    const entries = [
      entry('acme/api', [
        pr({ number: 1, createdAt: daysAgo(1) }),
        pr({ number: 2, createdAt: daysAgo(1), author: 'dependabot', authorIsBot: true }),
        pr({ number: 3, createdAt: daysAgo(20) }),
      ]),
      entry('acme/web', [pr({ createdAt: daysAgo(1) })]),
    ]
    expect(sum(prActivity(entries, 'acme/api', 7, NOW).buckets, 'opened')).toBe(1)
    expect(sum(prActivity(entries, 'acme/api', 30, NOW).buckets, 'opened')).toBe(2)
    expect(sum(prActivity(entries, 'all', 30, NOW).buckets, 'opened')).toBe(3)
  })

  it('AC9: only counts team members when a team filter is given', () => {
    const entries = [entry('acme/api', [pr({ author: 'Ana' }), pr({ number: 2, author: 'zed' })])]
    expect(sum(prActivity(entries, 'all', 7, NOW, new Set(['ana'])).buckets, 'opened')).toBe(1)
  })

  it('AC1: does not mutate its input', () => {
    const entries = [entry('acme/api', [pr({})])]
    const copy = JSON.stringify(entries)
    prActivity(entries, 'all', 30, NOW)
    expect(JSON.stringify(entries)).toBe(copy)
  })
})
