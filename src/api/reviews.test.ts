import { describe, expect, it } from 'vitest'
import { reviewsPerPerson } from './reviews.ts'
import type { RepoEntry } from './dashboard.ts'
import type { StoredPullRequest, StoredReview } from './types.ts'
import { NOW } from '../test/fakeDeps.ts'

const DAY = 24 * 60 * 60 * 1000
const at = (msAgo: number): string => new Date(NOW.getTime() - msAgo).toISOString()

function pr(over: Partial<StoredPullRequest>): StoredPullRequest {
  return {
    number: 1,
    author: 'alice',
    authorIsBot: false,
    state: 'open',
    createdAt: at(2 * DAY),
    updatedAt: at(DAY),
    mergedAt: null,
    closedAt: null,
    additions: 1,
    deletions: 1,
    baseBranch: 'main',
    requestedReviewers: [],
    ...over,
  }
}

let seq = 0
function review(over: Partial<StoredReview>): StoredReview {
  seq += 1
  return {
    id: `r${seq}`,
    pullRequestNumber: 1,
    reviewer: 'bob',
    reviewerIsBot: false,
    outcome: 'approved',
    submittedAt: at(DAY),
    ...over,
  } as StoredReview
}

function entry(repo: string, reviews: StoredReview[], prs: StoredPullRequest[] = [pr({})]): RepoEntry {
  return {
    repo,
    syncedAt: at(0),
    data: { schemaVersion: 2, repo, syncedAt: at(0), pullRequests: prs, reviews },
  }
}

describe('reviewsPerPerson', () => {
  it('AC1: sorts by total desc then login asc, case-insensitive', () => {
    const e = entry('o/a', [
      review({ reviewer: 'zed' }),
      review({ reviewer: 'Carl' }),
      review({ reviewer: 'bob' }),
      review({ reviewer: 'bob' }),
      review({ reviewer: 'amy' }),
    ])
    const rows = reviewsPerPerson([e], 'all', 30, NOW)
    expect(rows.map((r) => [r.login, r.total])).toEqual([
      ['bob', 2],
      ['amy', 1],
      ['Carl', 1],
      ['zed', 1],
    ])
  })

  it('AC1: merges casing variants, keeps first-seen casing, and works for a single-person filter', () => {
    const e = entry('o/a', [review({ reviewer: 'Bob' }), review({ reviewer: 'bob' }), review({ reviewer: 'amy' })])
    expect(reviewsPerPerson([e], 'all', 30, NOW)[0]).toMatchObject({ login: 'Bob', total: 2 })
    expect(reviewsPerPerson([e], 'all', 30, NOW, new Set(['amy'])).map((r) => r.login)).toEqual(['amy'])
  })

  it('AC1: ignores entries without data and combines repos for "all"', () => {
    const empty: RepoEntry = { repo: 'o/none', syncedAt: null, data: null }
    const rows = reviewsPerPerson([empty, entry('o/a', [review({})]), entry('o/b', [review({})])], 'all', 30, NOW)
    expect(rows).toEqual([{ login: 'bob', approved: 2, changesRequested: 0, commented: 0, total: 2 }])
    expect(reviewsPerPerson([empty], 'all', 30, NOW)).toEqual([])
  })

  it('AC3: splits outcomes per person', () => {
    const e = entry('o/a', [
      review({ outcome: 'approved' }),
      review({ outcome: 'approved' }),
      review({ outcome: 'changes_requested' }),
      review({ outcome: 'commented' }),
    ])
    expect(reviewsPerPerson([e], 'all', 30, NOW)).toEqual([
      { login: 'bob', approved: 2, changesRequested: 1, commented: 1, total: 4 },
    ])
  })

  it('AC8: filters by repo selection', () => {
    const a = entry('o/a', [review({ reviewer: 'bob' })])
    const b = entry('o/b', [review({ reviewer: 'amy' })])
    expect(reviewsPerPerson([a, b], 'o/b', 30, NOW).map((r) => r.login)).toEqual(['amy'])
  })

  it('AC8: period windows (7/30/90) with exclusive start and inclusive end', () => {
    const e = entry('o/a', [
      review({ reviewer: 'in7', submittedAt: at(7 * DAY - 1) }),
      review({ reviewer: 'edge7', submittedAt: at(7 * DAY) }), // exactly start: excluded
      review({ reviewer: 'in30', submittedAt: at(20 * DAY) }),
      review({ reviewer: 'in90', submittedAt: at(60 * DAY) }),
      review({ reviewer: 'old', submittedAt: at(91 * DAY) }),
      review({ reviewer: 'now', submittedAt: at(0) }), // exactly end: included
      review({ reviewer: 'future', submittedAt: at(-1) }),
    ])
    const names = (p: 7 | 30 | 90): string[] =>
      reviewsPerPerson([e], 'all', p, NOW)
        .map((r) => r.login)
        .sort()
    expect(names(7)).toEqual(['in7', 'now'])
    expect(names(30)).toEqual(['edge7', 'in30', 'in7', 'now'])
    expect(names(90)).toEqual(['edge7', 'in30', 'in7', 'in90', 'now'])
  })

  it('AC8: team filter is matched on the lowercased login', () => {
    const e = entry('o/a', [review({ reviewer: 'Bob' }), review({ reviewer: 'amy' })])
    expect(reviewsPerPerson([e], 'all', 30, NOW, new Set(['bob'])).map((r) => r.login)).toEqual(['Bob'])
  })

  it('AC8: excludes bots, null reviewers, dismissed reviews and self-reviews', () => {
    const e = entry(
      'o/a',
      [
        review({ reviewer: 'ci-bot', reviewerIsBot: true }),
        review({ reviewer: null }),
        review({ reviewer: 'bob', outcome: 'dismissed' }),
        review({ reviewer: 'ALICE' }), // self-review on alice's PR 1
        review({ reviewer: 'amy' }),
      ],
      [pr({ number: 1, author: 'alice' })],
    )
    expect(reviewsPerPerson([e], 'all', 30, NOW).map((r) => r.login)).toEqual(['amy'])
  })

  it('AC8: excludes reviews on bot-authored pull requests, like the KPI cards', () => {
    const e = entry('o/a', [review({ reviewer: 'bob' })], [pr({ number: 1, author: 'dependabot', authorIsBot: true })])
    expect(reviewsPerPerson([e], 'all', 30, NOW)).toEqual([])
  })
})
