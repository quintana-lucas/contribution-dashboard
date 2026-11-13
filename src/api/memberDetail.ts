// Pure selector for the member detail panel (#20). No React, no fetch, no clock reads: `now` is
// always passed in. Inputs are never mutated. Windows are (start, end]; bots and null logins are
// excluded; login matching is case-insensitive; dismissed reviews are never counted.
import { buckets, periodWindow } from './dashboard.ts'
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'
import { teamStats } from './teamStats.ts'

export const RECENT_PR_LIMIT = 10

export interface MergedBucket {
  start: Date
  end: Date
  count: number
}

export interface ReviewOutcomes {
  approved: number
  changesRequested: number
  commented: number
}

export interface RecentPr {
  repo: string
  number: number
  state: 'open' | 'merged' | 'closed'
  title: string
  additions: number
  deletions: number
  /** Merged, closed or created date (ISO), by state. */
  date: string
}

export interface MemberDetail {
  login: string
  merged: number
  reviewsGiven: number
  reviewsReceived: number
  /** One entry per `buckets(period, now)` bucket, zeros kept; counted by merge date. */
  mergedBuckets: MergedBucket[]
  reviewOutcomes: ReviewOutcomes
  /** Newest first, at most RECENT_PR_LIMIT. */
  recentPrs: RecentPr[]
  /** Number of in-window PRs authored by the member (before the limit). */
  recentTotal: number
}

export function memberDetail(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  login: string,
): MemberDetail {
  const { start, end } = periodWindow(period, now)
  const s = start.getTime()
  const e = end.getTime()
  const inWindow = (iso: string | null | undefined): iso is string => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t > s && t <= e
  }
  const key = login.toLowerCase()
  const stats = teamStats(entries, selection, period, now, [login])[0]

  const mergedBuckets: MergedBucket[] = buckets(period, now).map((b) => ({ ...b, count: 0 }))
  const reviewOutcomes: ReviewOutcomes = { approved: 0, changesRequested: 0, commented: 0 }
  const recent: RecentPr[] = []

  const selected = selection === 'all' ? entries : entries.filter((x) => x.repo === selection)
  for (const entry of selected) {
    if (!entry.data) continue
    for (const pr of entry.data.pullRequests) {
      if (pr.authorIsBot || pr.author === null || pr.author.toLowerCase() !== key) continue
      const date = pr.state === 'merged' ? pr.mergedAt : pr.state === 'closed' ? pr.closedAt : pr.createdAt
      if (!inWindow(date)) continue
      recent.push({
        repo: entry.repo,
        number: pr.number,
        state: pr.state,
        title: pr.title,
        additions: pr.additions,
        deletions: pr.deletions,
        date,
      })
      if (pr.state === 'merged') {
        const t = new Date(date).getTime()
        const bucket = mergedBuckets.find((b) => t >= b.start.getTime() && t < b.end.getTime())
        if (bucket) bucket.count += 1
      }
    }
    for (const review of entry.data.reviews) {
      if (review.reviewerIsBot || review.reviewer === null || review.reviewer.toLowerCase() !== key) continue
      if (!inWindow(review.submittedAt)) continue
      if (review.outcome === 'approved') reviewOutcomes.approved += 1
      else if (review.outcome === 'changes_requested') reviewOutcomes.changesRequested += 1
      else if (review.outcome === 'commented') reviewOutcomes.commented += 1
    }
  }

  recent.sort(
    (a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime() ||
      a.repo.localeCompare(b.repo) ||
      b.number - a.number,
  )

  return {
    login,
    merged: stats.merged,
    reviewsGiven: stats.reviewsGiven,
    reviewsReceived: stats.reviewsReceived,
    mergedBuckets,
    reviewOutcomes,
    recentPrs: recent.slice(0, RECENT_PR_LIMIT),
    recentTotal: recent.length,
  }
}
