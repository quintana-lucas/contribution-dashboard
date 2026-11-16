import { describe, expect, it } from 'vitest'
import { contributionsPerPerson, TOP_N } from './contributions.ts'
import type { RepoEntry } from './dashboard.ts'
import type { StoredPullRequest } from './types.ts'

const NOW = new Date('2026-06-30T12:00:00Z')

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
    additions: 1,
    deletions: 1,
    baseBranch: 'main',
    requestedReviewers: [],
    ...over,
  }
}

function entry(repo: string, prs: StoredPullRequest[]): RepoEntry {
  return {
    repo,
    syncedAt: '2026-06-30T11:00:00Z',
    data: { schemaVersion: 3, repo, syncedAt: '2026-06-30T11:00:00Z', pullRequests: prs, reviews: [] },
  }
}

describe('contributionsPerPerson', () => {
  it('AC1: counts only merged PRs', () => {
    const e = entry('o/a', [
      pr({ number: 1 }),
      pr({ number: 2, state: 'open', mergedAt: null, closedAt: null }),
      pr({ number: 3, state: 'closed', mergedAt: null }),
    ])
    const r = contributionsPerPerson([e], 'all', 30, NOW)
    expect(r.people).toEqual([{ login: 'alice', count: 1 }])
    expect(r.total).toBe(1)
    expect(r.others).toBeNull()
  })

  it('AC1: ignores merged PRs outside the window, even if created inside it', () => {
    const e = entry('o/a', [
      pr({ number: 1, mergedAt: '2026-04-01T10:00:00Z' }),
      pr({ number: 2, createdAt: '2026-06-20T10:00:00Z', mergedAt: '2026-05-01T10:00:00Z' }),
    ])
    expect(contributionsPerPerson([e], 'all', 30, NOW).people).toEqual([])
  })

  it('AC1: window start is exclusive and end inclusive', () => {
    const e = entry('o/a', [
      pr({ number: 1, mergedAt: '2026-05-31T12:00:00Z' }),
      pr({ number: 2, mergedAt: '2026-06-30T12:00:00Z' }),
    ])
    expect(contributionsPerPerson([e], 'all', 30, NOW).total).toBe(1)
  })

  it('AC1: excludes bots and null authors', () => {
    const e = entry('o/a', [
      pr({ number: 1, author: 'dependabot', authorIsBot: true }),
      pr({ number: 2, author: null }),
      pr({ number: 3 }),
    ])
    expect(contributionsPerPerson([e], 'all', 30, NOW).people).toEqual([{ login: 'alice', count: 1 }])
  })

  it('AC1: excludes non-team logins (case-insensitive filter)', () => {
    const e = entry('o/a', [pr({ number: 1, author: 'Alice' }), pr({ number: 2, author: 'bob' })])
    const r = contributionsPerPerson([e], 'all', 30, NOW, new Set(['alice']))
    expect(r.people).toEqual([{ login: 'Alice', count: 1 }])
  })

  it('AC1: sorts by count desc, ties by login A-Z', () => {
    const e = entry('o/a', [
      pr({ number: 1, author: 'zed' }),
      pr({ number: 2, author: 'Bob' }),
      pr({ number: 3, author: 'amy' }),
      pr({ number: 4, author: 'amy' }),
      pr({ number: 5, author: 'zed' }),
      pr({ number: 6, author: 'carl' }),
      pr({ number: 7, author: 'zed' }),
    ])
    expect(contributionsPerPerson([e], 'all', 30, NOW).people.map((p) => p.login)).toEqual([
      'zed',
      'amy',
      'Bob',
      'carl',
    ])
  })

  it('AC3: sums the same login across repos, case-insensitively', () => {
    const a = entry('o/a', [pr({ number: 1, author: 'Alice' })])
    const b = entry('o/b', [pr({ number: 1, author: 'alice' }), pr({ number: 2, author: 'alice' })])
    const r = contributionsPerPerson([a, b], 'all', 30, NOW)
    expect(r.people).toEqual([{ login: 'Alice', count: 3 }])
  })

  it('AC9: a single repo selection excludes the others', () => {
    const a = entry('o/a', [pr({ number: 1, author: 'alice' })])
    const b = entry('o/b', [pr({ number: 1, author: 'bob' })])
    expect(contributionsPerPerson([a, b], 'o/b', 30, NOW).people).toEqual([{ login: 'bob', count: 1 }])
  })

  it('AC9: the period changes the result', () => {
    const e = entry('o/a', [
      pr({ number: 1, mergedAt: '2026-06-28T10:00:00Z' }),
      pr({ number: 2, mergedAt: '2026-06-01T10:00:00Z' }),
    ])
    expect(contributionsPerPerson([e], 'all', 7, NOW).total).toBe(1)
    expect(contributionsPerPerson([e], 'all', 30, NOW).total).toBe(2)
  })

  it('AC8: skips entries without data and does not mutate inputs', () => {
    const e = entry('o/a', [pr({ number: 1 })])
    const snapshot = JSON.stringify(e)
    const r = contributionsPerPerson([{ repo: 'o/x', syncedAt: null, data: null }, e], 'all', 30, NOW)
    expect(r.total).toBe(1)
    expect(JSON.stringify(e)).toBe(snapshot)
  })

  it('AC5: 10 contributors give top 8 plus Others', () => {
    const prs = Array.from({ length: 10 }, (_, i) =>
      pr({ number: i + 1, author: `user${String.fromCharCode(97 + i)}` }),
    )
    // usera gets an extra so counts differ
    prs.push(pr({ number: 99, author: 'usera' }))
    const r = contributionsPerPerson([entry('o/a', prs)], 'all', 30, NOW)
    expect(TOP_N).toBe(8)
    expect(r.people).toHaveLength(8)
    expect(r.people[0]).toEqual({ login: 'usera', count: 2 })
    expect(r.others).toEqual({ count: 2, people: 2 })
    expect(r.total).toBe(11)
  })

  it('AC5: exactly 9 contributors give 9 rows and no Others', () => {
    const prs = Array.from({ length: 9 }, (_, i) =>
      pr({ number: i + 1, author: `user${String.fromCharCode(97 + i)}` }),
    )
    const r = contributionsPerPerson([entry('o/a', prs)], 'all', 30, NOW)
    expect(r.people).toHaveLength(9)
    expect(r.others).toBeNull()
  })
})
