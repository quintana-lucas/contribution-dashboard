import { describe, expect, it } from 'vitest'
import { people } from './people'
import type { StoredRepo } from './types'

const pr = (author: string | null, authorIsBot = false) => ({
  number: 1,
  author,
  authorIsBot,
  state: 'merged' as const,
  createdAt: '2026-05-20T00:00:00Z',
  updatedAt: '2026-05-20T00:00:00Z',
  mergedAt: null,
  closedAt: null,
  additions: 0,
  deletions: 0,
  baseBranch: 'main',
  requestedReviewers: [],
})
const review = (reviewer: string | null, reviewerIsBot = false) => ({
  id: Math.random(),
  pullRequestNumber: 1,
  reviewer,
  reviewerIsBot,
  outcome: 'approved' as const,
  submittedAt: '2026-05-21T00:00:00Z',
})

describe('people', () => {
  it('#8 AC12: counts distinct non-null authors and reviewers, excluding bots', () => {
    const data = {
      schemaVersion: 2,
      repo: 'acme/widgets',
      syncedAt: '2026-06-01T00:00:00Z',
      pullRequests: [pr('ana'), pr('ana'), pr(null), pr('dependabot', true)],
      reviews: [review('ben'), review('ana'), review(null), review('ci-bot', true)],
    } as unknown as StoredRepo
    expect(people(data)).toBe(2)
  })
})
