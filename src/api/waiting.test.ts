import { describe, expect, it } from 'vitest'
import type { RepoEntry } from './dashboard'
import type { StoredPullRequest, StoredRepo } from './types'
import { waitingForReview } from './waiting'

const NOW = new Date('2026-06-15T12:00:00.000Z')

function pr(n: number, over: Partial<StoredPullRequest> = {}): StoredPullRequest {
  return {
    number: n,
    title: `Fake PR ${n}`,
    author: 'ana',
    authorIsBot: false,
    state: 'open',
    createdAt: '2026-06-15T10:00:00.000Z',
    updatedAt: '2026-06-15T10:00:00.000Z',
    mergedAt: null,
    closedAt: null,
    additions: 5,
    deletions: 2,
    baseBranch: 'main',
    requestedReviewers: [],
    ...over,
  }
}

function entry(repo: string, pullRequests: StoredPullRequest[], reviews: StoredRepo['reviews'] = []): RepoEntry {
  return {
    repo,
    syncedAt: '2026-06-15T11:00:00.000Z',
    data: { schemaVersion: 3, repo, syncedAt: '2026-06-15T11:00:00.000Z', pullRequests, reviews },
  }
}

const review = (pullRequestNumber: number, reviewer: string | null, reviewerIsBot = false) => ({
  id: `r${pullRequestNumber}${reviewer}`,
  pullRequestNumber,
  reviewer,
  reviewerIsBot,
  outcome: 'commented' as const,
  submittedAt: '2026-06-15T11:00:00.000Z',
})

describe('waitingForReview', () => {
  it('AC1: lists only open PRs without a review, with their fields', () => {
    const rows = waitingForReview(
      [
        entry(
          'acme/api',
          [
            pr(1, { requestedReviewers: [{ kind: 'user', login: 'bob', isBot: false }, { kind: 'team', slug: 'core' }] }),
            pr(2),
            pr(3, { state: 'merged' }),
            pr(4, { state: 'closed' }),
          ],
          [review(2, 'bob')],
        ),
      ],
      'all',
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      repo: 'acme/api',
      number: 1,
      title: 'Fake PR 1',
      author: 'ana',
      additions: 5,
      deletions: 2,
      requestedReviewers: ['bob', 'core'],
      ageHours: 2,
    })
  })

  it('AC1: self-reviews and bot reviews do not count as a review', () => {
    const rows = waitingForReview(
      [entry('acme/api', [pr(1), pr(2)], [review(1, 'ana'), review(2, 'ci-bot', true)])],
      'all',
      NOW,
    )
    expect(rows.map((r) => r.number)).toEqual([1, 2])
  })

  it('AC2: overdue only when waiting strictly more than 24 hours', () => {
    const rows = waitingForReview(
      [
        entry('acme/api', [
          pr(1, { createdAt: '2026-06-14T12:00:00.000Z' }),
          pr(2, { createdAt: '2026-06-14T11:59:00.000Z' }),
        ]),
      ],
      'all',
      NOW,
    )
    const byNumber = Object.fromEntries(rows.map((r) => [r.number, r.overdue]))
    expect(byNumber).toEqual({ 1: false, 2: true })
  })

  it('AC3: filters by repo, drops bots and non-team authors', () => {
    const entries = [
      entry('acme/api', [pr(1), pr(2, { author: 'zed' }), pr(3, { authorIsBot: true, author: 'dependabot' })]),
      entry('acme/web', [pr(1)]),
    ]
    const team = new Set(['ana'])
    expect(waitingForReview(entries, 'acme/api', NOW, team).map((r) => `${r.repo}#${r.number}`)).toEqual([
      'acme/api#1',
    ])
    expect(waitingForReview(entries, 'all', NOW, team)).toHaveLength(2)
  })

  it('AC1: sorts longest waiting first', () => {
    const rows = waitingForReview(
      [entry('acme/api', [pr(1), pr(2, { createdAt: '2026-06-13T10:00:00.000Z' })])],
      'all',
      NOW,
    )
    expect(rows.map((r) => r.number)).toEqual([2, 1])
  })
})
