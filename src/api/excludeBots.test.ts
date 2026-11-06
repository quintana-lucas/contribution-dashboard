import { describe, expect, it } from 'vitest'
import { excludeBots } from './excludeBots.ts'
import type { StoredPullRequest, StoredRepo } from './types.ts'

const pr = (number: number, authorIsBot: boolean, requestedReviewers: StoredPullRequest['requestedReviewers'] = []): StoredPullRequest => ({
  number,
  author: authorIsBot ? 'dependabot[bot]' : 'alice',
  authorIsBot,
  state: 'open',
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-02T00:00:00Z',
  mergedAt: null,
  closedAt: null,
  additions: 1,
  deletions: 2,
  baseBranch: 'main',
  requestedReviewers,
})

const repo: StoredRepo = {
  schemaVersion: 2,
  repo: 'acme/widgets',
  syncedAt: '2026-06-01T00:00:00.000Z',
  pullRequests: [
    pr(1, true),
    pr(2, false, [
      { kind: 'user', login: 'bob', isBot: false },
      { kind: 'user', login: 'copilot[bot]', isBot: true },
      { kind: 'team', slug: 'core' },
    ]),
  ],
  reviews: [
    { id: 'r1', pullRequestNumber: 2, reviewer: 'bob', reviewerIsBot: false, outcome: 'approved', submittedAt: '2026-05-03T00:00:00Z' },
    { id: 'r2', pullRequestNumber: 2, reviewer: 'github-actions[bot]', reviewerIsBot: true, outcome: 'commented', submittedAt: '2026-05-03T00:00:00Z' },
  ],
}

describe('excludeBots', () => {
  it('#13 AC4: removes bot PRs, reviews and requested reviewers, keeps humans and teams', () => {
    const out = excludeBots(repo)
    expect(out.pullRequests.map((p) => p.number)).toEqual([2])
    expect(out.reviews.map((r) => r.id)).toEqual(['r1'])
    expect(out.pullRequests[0].requestedReviewers).toEqual([
      { kind: 'user', login: 'bob', isBot: false },
      { kind: 'team', slug: 'core' },
    ])
    expect(out.syncedAt).toBe(repo.syncedAt)
  })

  it('#13 AC4: does not mutate the input', () => {
    const before = JSON.stringify(repo)
    excludeBots(repo)
    expect(JSON.stringify(repo)).toBe(before)
  })
})
