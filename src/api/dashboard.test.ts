import { describe, expect, it } from 'vitest'
import {
  baseBranch,
  buckets,
  periodWindow,
  selectActivity,
  syncText,
  toolbarSubline,
  type RepoEntry,
} from './dashboard'
import type { StoredPullRequest, StoredRepo, StoredReview } from './types'

const NOW = new Date(2026, 5, 15, 12, 0, 0) // local time
const DAY = 24 * 60 * 60 * 1000
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()

function pr(over: Partial<StoredPullRequest> = {}): StoredPullRequest {
  return {
    number: 1,
    title: 'Fake title',
    author: 'ana',
    authorIsBot: false,
    state: 'open',
    createdAt: ago(DAY),
    updatedAt: ago(DAY),
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
    submittedAt: ago(DAY),
    ...over,
  }
}

function entry(repo: string, syncedAt: string | null, pullRequests: StoredPullRequest[] = [], reviews: StoredReview[] = []): RepoEntry {
  const data: StoredRepo | null = syncedAt
    ? { schemaVersion: 3, repo, syncedAt, pullRequests, reviews }
    : null
  return { repo, syncedAt, data }
}

describe('periodWindow and period filter', () => {
  it('#16 AC2: window is (now - N days, now]: start exclusive, end inclusive', () => {
    const w = periodWindow(30, NOW)
    expect(w.end.getTime()).toBe(NOW.getTime())
    expect(w.start.getTime()).toBe(NOW.getTime() - 30 * DAY)

    const e = entry('a/x', ago(0), [
      pr({ number: 1, createdAt: ago(30 * DAY) }), // exactly at start: out
      pr({ number: 2, createdAt: ago(30 * DAY - 1) }), // just inside
      pr({ number: 3, createdAt: new Date(NOW.getTime()).toISOString() }), // at now: in
      pr({ number: 4, createdAt: new Date(NOW.getTime() + 1).toISOString() }), // future: out
    ])
    const nums = selectActivity([e], 'all', 30, NOW).pullRequests.map((p) => p.number)
    expect(nums).toEqual([2, 3])
  })

  it('#16 AC2: a PR counts through createdAt, mergedAt or closedAt', () => {
    const old = ago(200 * DAY)
    const e = entry('a/x', ago(0), [
      pr({ number: 1, createdAt: old, updatedAt: old }),
      pr({ number: 2, createdAt: old, mergedAt: ago(DAY) }),
      pr({ number: 3, createdAt: old, closedAt: ago(DAY) }),
      pr({ number: 4, createdAt: ago(DAY) }),
    ])
    const nums = selectActivity([e], 'all', 7, NOW).pullRequests.map((p) => p.number)
    expect(nums).toEqual([2, 3, 4])
  })

  it('#16 AC2: reviews are filtered by submittedAt and the period changes the result', () => {
    const e = entry('a/x', ago(0), [], [
      review({ id: 'a', submittedAt: ago(2 * DAY) }),
      review({ id: 'b', submittedAt: ago(20 * DAY) }),
    ])
    expect(selectActivity([e], 'all', 7, NOW).reviews.map((r) => r.id)).toEqual(['a'])
    expect(selectActivity([e], 'all', 30, NOW).reviews.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('#16 AC2: selecting a single repo filters to it; unsynced entries contribute nothing', () => {
    const a = entry('a/x', ago(0), [pr({ number: 1 })])
    const b = entry('b/y', ago(0), [pr({ number: 2 })])
    const c = entry('c/z', null)
    expect(selectActivity([a, b, c], 'all', 30, NOW).pullRequests.map((p) => p.number)).toEqual([1, 2])
    expect(selectActivity([a, b, c], 'b/y', 30, NOW).pullRequests.map((p) => p.number)).toEqual([2])
    expect(selectActivity([a, b, c], 'c/z', 30, NOW).pullRequests).toEqual([])
  })

  it('#16 AC2: does not mutate its inputs', () => {
    const e = entry('a/x', ago(0), [pr()], [review()])
    const snapshot = JSON.stringify([e])
    selectActivity([e], 'all', 30, NOW)
    toolbarSubline([e], 'all', 30, NOW)
    expect(JSON.stringify([e])).toBe(snapshot)
  })
})

describe('buckets', () => {
  it('#16 AC2: 7 days gives 7 daily buckets, the last one being today', () => {
    const b = buckets(7, NOW)
    expect(b).toHaveLength(7)
    expect(b[6].start).toEqual(new Date(2026, 5, 15))
    expect(b[6].end).toEqual(new Date(2026, 5, 16))
    expect(b[0].start).toEqual(new Date(2026, 5, 9))
    for (let i = 1; i < b.length; i++) expect(b[i].start).toEqual(b[i - 1].end)
  })

  it('#16 AC2: 30 days gives 5 weekly buckets with the first clipped to the window start', () => {
    const b = buckets(30, NOW)
    expect(b).toHaveLength(5)
    expect(b[4].end).toEqual(new Date(2026, 5, 16))
    expect(b[4].start).toEqual(new Date(2026, 5, 9))
    expect(b[0].start.getTime()).toBe(periodWindow(30, NOW).start.getTime())
    expect(b[0].end).toEqual(new Date(2026, 4, 19))
    for (let i = 1; i < b.length; i++) expect(b[i].start).toEqual(b[i - 1].end)
  })

  it('#16 AC2: 90 days gives 13 weekly buckets with the first clipped', () => {
    const b = buckets(90, NOW)
    expect(b).toHaveLength(13)
    expect(b[0].start.getTime()).toBe(periodWindow(90, NOW).start.getTime())
    expect(b[12].end).toEqual(new Date(2026, 5, 16))
  })

  it('#16 AC2: selectActivity returns the buckets for the period', () => {
    expect(selectActivity([], 'all', 7, NOW).buckets).toHaveLength(7)
  })
})

describe('member count, base branch and subline', () => {
  it('#16 AC1: member count is the distinct authors and reviewers in the period', () => {
    const e = entry(
      'a/x',
      ago(0),
      [
        pr({ number: 1, author: 'ana' }),
        pr({ number: 2, author: 'ana' }),
        pr({ number: 3, author: null }),
        pr({ number: 4, author: 'old', createdAt: ago(100 * DAY) }),
      ],
      [
        review({ id: 'a', reviewer: 'bob' }),
        review({ id: 'b', reviewer: 'ana' }),
        review({ id: 'c', reviewer: null }),
        review({ id: 'd', reviewer: 'late', submittedAt: ago(100 * DAY) }),
      ],
    )
    expect(selectActivity([e], 'all', 30, NOW).teamMemberCount).toBe(2)
  })

  it('#16 AC1: base branch is the most common, ties alphabetical, null with no PRs', () => {
    const mk = (branches: string[]): StoredRepo => ({
      schemaVersion: 3,
      repo: 'a/x',
      syncedAt: ago(0),
      pullRequests: branches.map((baseBranch, i) => pr({ number: i, baseBranch })),
      reviews: [],
    })
    expect(baseBranch(mk(['dev', 'main', 'main']))).toBe('main')
    expect(baseBranch(mk(['main', 'dev']))).toBe('dev')
    expect(baseBranch(mk([]))).toBeNull()
    expect(baseBranch(null)).toBeNull()
  })

  it('#16 AC1: subline for all repositories, with plural and singular forms', () => {
    const a = entry('a/x', ago(5 * 60000), [pr({ author: 'ana' })], [review({ reviewer: 'bob' })])
    const b = entry('b/y', ago(10 * 60000))
    expect(toolbarSubline([a, b], 'all', 30, NOW)).toBe('2 repositories · 2 members · synced 10 min ago')
    const one = entry('a/x', ago(5 * 60000), [pr({ author: 'ana' })])
    expect(toolbarSubline([one], 'all', 30, NOW)).toBe('1 repository · 1 member · synced 5 min ago')
  })

  it('#16 AC1: subline for a single repo shows base branch, members and sync', () => {
    const a = entry('a/x', ago(5 * 60000), [pr({ author: 'ana' }), pr({ number: 2, author: 'cy' })])
    expect(toolbarSubline([a], 'a/x', 30, NOW)).toBe('Base branch main · 2 members · synced 5 min ago')
  })

  it('#16 AC1: a single repo with no PRs omits the branch segment', () => {
    const a = entry('a/x', ago(5 * 60000))
    expect(toolbarSubline([a], 'a/x', 30, NOW)).toBe('0 members · synced 5 min ago')
  })

  it('#16 AC1: sync text thresholds', () => {
    const t = (ms: number) => syncText([entry('a/x', ago(ms))], 'a/x', NOW)
    expect(t(0)).toBe('synced less than 1 min ago')
    expect(t(59 * 1000)).toBe('synced less than 1 min ago')
    expect(t(60 * 1000)).toBe('synced 1 min ago')
    expect(t(59 * 60000)).toBe('synced 59 min ago')
    expect(t(60 * 60000)).toBe('synced 1 h ago')
    expect(t(23 * 60 * 60000)).toBe('synced 23 h ago')
    expect(t(24 * 60 * 60000)).toBe('synced 1 d ago')
    expect(t(3 * DAY)).toBe('synced 3 d ago')
  })

  it('#16 AC1: all repos uses the oldest syncedAt plus the not-synced count', () => {
    const entries = [entry('a/x', ago(5 * 60000)), entry('b/y', ago(2 * 60 * 60000)), entry('c/z', null), entry('d/w', null)]
    expect(syncText(entries, 'all', NOW)).toBe('synced 2 h ago (2 not synced yet)')
  })
})

describe('never-synced repos', () => {
  it('#16 AC3: a single never-synced repo gives only "not synced yet"', () => {
    const entries = [entry('a/x', ago(60000)), entry('c/z', null)]
    expect(syncText(entries, 'c/z', NOW)).toBe('not synced yet')
    expect(toolbarSubline(entries, 'c/z', 30, NOW)).toBe('not synced yet')
  })

  it('#16 AC3: with no repo synced, all repositories gives "not synced yet"', () => {
    const entries = [entry('a/x', null), entry('c/z', null)]
    expect(syncText(entries, 'all', NOW)).toBe('not synced yet')
    expect(toolbarSubline(entries, 'all', 30, NOW)).toBe('2 repositories · not synced yet')
  })
})

describe('team members filter', () => {
  const e = entry(
    'a/x',
    ago(0),
    [pr({ number: 1, author: 'ana' }), pr({ number: 2, author: 'Bob' }), pr({ number: 3, author: null })],
    [review({ id: 'r1', reviewer: 'bob' }), review({ id: 'r2', reviewer: 'cy' })],
  )

  it('#15 AC4: selectActivity keeps only PRs and reviews of members and the count follows', () => {
    const a = selectActivity([e], 'all', 30, NOW, new Set(['ana', 'bob']))
    expect(a.pullRequests.map((p) => p.number)).toEqual([1, 2])
    expect(a.reviews.map((r) => r.id)).toEqual(['r1'])
    expect(a.teamMemberCount).toBe(2)
  })

  it('#15 AC4: an empty set filters everything; null or undefined means no filter', () => {
    expect(selectActivity([e], 'all', 30, NOW, new Set()).pullRequests).toEqual([])
    expect(selectActivity([e], 'all', 30, NOW, null).teamMemberCount).toBe(3)
    expect(selectActivity([e], 'all', 30, NOW).teamMemberCount).toBe(3)
  })

  it('#15 AC4: toolbarSubline member count follows the filter', () => {
    expect(toolbarSubline([e], 'all', 30, NOW, new Set(['ana']))).toContain('1 member')
    expect(toolbarSubline([e], 'a/x', 30, NOW, new Set(['ana']))).toContain('1 member')
    expect(toolbarSubline([e], 'all', 30, NOW)).toContain('3 members')
  })
})
