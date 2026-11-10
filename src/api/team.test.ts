import { describe, expect, it } from 'vitest'
import { candidates, isValidLogin, normalizeLogin } from './team'
import type { StoredPullRequest, StoredRepo, StoredReview } from './types'

const NOW = new Date('2026-06-01T00:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString()

function pr(over: Partial<StoredPullRequest> = {}): StoredPullRequest {
  return {
    number: 1,
    author: 'ana',
    authorIsBot: false,
    state: 'open',
    createdAt: ago(1),
    updatedAt: ago(1),
    mergedAt: null,
    closedAt: null,
    additions: 1,
    deletions: 1,
    baseBranch: 'main',
    requestedReviewers: [],
    ...over,
  }
}
function review(over: Partial<StoredReview> = {}): StoredReview {
  return {
    id: 'r1',
    pullRequestNumber: 1,
    reviewer: 'bob',
    reviewerIsBot: false,
    outcome: 'approved',
    submittedAt: ago(1),
    ...over,
  }
}
const repo = (name: string, pullRequests: StoredPullRequest[], reviews: StoredReview[] = []): StoredRepo => ({
  schemaVersion: 2,
  repo: name,
  syncedAt: ago(0),
  pullRequests,
  reviews,
})

describe('login helpers', () => {
  it('#15 AC3: normalizeLogin trims and strips one leading @', () => {
    expect(normalizeLogin('  @ana ')).toBe('ana')
    expect(normalizeLogin('@@ana')).toBe('@ana')
    expect(normalizeLogin('ana')).toBe('ana')
  })

  it('#15 AC3: isValidLogin accepts 1-39 chars with single inner hyphens', () => {
    for (const ok of ['a', 'ana', 'a-b', 'A1-b2', 'a'.repeat(39)]) expect(isValidLogin(ok)).toBe(true)
  })

  it('#15 AC3: isValidLogin rejects empty, long, hyphen edges, doubles, brackets and non-strings', () => {
    for (const bad of ['', 'a'.repeat(40), '-a', 'a-', 'a--b', 'dependabot[bot]', 'a b', '@ana', 'a_b']) {
      expect(isValidLogin(bad)).toBe(false)
    }
    expect(isValidLogin(undefined)).toBe(false)
    expect(isValidLogin(5)).toBe(false)
  })
})

describe('candidates', () => {
  it('#15 AC1: counts PRs and reviews per login with sorted repos, most active first then login', () => {
    const a = repo('acme/a', [pr({ author: 'zed' }), pr({ number: 2, author: 'ana' })], [review({ reviewer: 'ana' })])
    const b = repo('acme/b', [pr({ author: 'ana' })], [review({ reviewer: 'bob' })])
    expect(candidates([b, a], NOW)).toEqual([
      { login: 'ana', pullRequests: 2, reviews: 1, repos: ['acme/a', 'acme/b'] },
      { login: 'bob', pullRequests: 0, reviews: 1, repos: ['acme/b'] },
      { login: 'zed', pullRequests: 1, reviews: 0, repos: ['acme/a'] },
    ])
  })

  it('#15 AC1: bots and null logins are never listed', () => {
    const r = repo(
      'acme/a',
      [pr({ author: 'dependabot[bot]', authorIsBot: true }), pr({ number: 2, author: null })],
      [review({ reviewer: 'ci[bot]', reviewerIsBot: true }), review({ id: 'r2', reviewer: null })],
    )
    expect(candidates([r], NOW)).toEqual([])
  })

  it('#15 AC1: uses a 90-day window, counting created, merged or closed PRs and submitted reviews', () => {
    const r = repo(
      'acme/a',
      [
        pr({ number: 1, author: 'old', createdAt: ago(91), mergedAt: null }),
        pr({ number: 2, author: 'merged', createdAt: ago(120), mergedAt: ago(10) }),
        pr({ number: 3, author: 'closed', createdAt: ago(120), closedAt: ago(89) }),
        pr({ number: 4, author: 'edge', createdAt: ago(90) }),
      ],
      [review({ reviewer: 'late', submittedAt: ago(100) }), review({ id: 'r2', reviewer: 'recent', submittedAt: ago(5) })],
    )
    expect(candidates([r], NOW).map((c) => c.login)).toEqual(['closed', 'merged', 'recent'])
  })

  it('#15 AC1: merges logins case-insensitively', () => {
    const r = repo('acme/a', [pr({ author: 'Ana' })], [review({ reviewer: 'ana' })])
    const out = candidates([r], NOW)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ pullRequests: 1, reviews: 1 })
  })
})
