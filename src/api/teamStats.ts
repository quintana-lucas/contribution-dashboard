// Pure selector for the Team table (#19). No React, no fetch, no clock reads: `now` is always
// passed in. Inputs are never mutated. Windows are (start, end]; bots and null logins are excluded;
// login matching is case-insensitive.
import { periodWindow } from './dashboard.ts'
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'
import { average, cycleDuration, firstReviewDurations, median } from './reviewMetrics.ts'

export interface TeamStatsRow {
  login: string
  opened: number
  merged: number
  closed: number
  open: number
  reviewsGiven: number
  reviewsReceived: number
  additions: number
  deletions: number
  /** Average lines changed (additions + deletions) over PRs opened in the window; null when none. */
  avgPrSize: number | null
  /** Median ms from opening to first review, over PRs opened in the window; null when none qualify. */
  medianFirstReviewMs: number | null
  /** Median ms from opening to merge, over PRs merged in the window; null when none. */
  medianCycleMs: number | null
}

/** One row per member, in the order of `members` (display casing kept). Does not sort. */
export function teamStats(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  members: readonly string[],
): TeamStatsRow[] {
  const { start, end } = periodWindow(period, now)
  const s = start.getTime()
  const e = end.getTime()
  const inWindow = (iso: string | null | undefined): boolean => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t > s && t <= e
  }

  const rows = members.map<TeamStatsRow>((login) => ({
    login,
    opened: 0,
    merged: 0,
    closed: 0,
    open: 0,
    reviewsGiven: 0,
    reviewsReceived: 0,
    additions: 0,
    deletions: 0,
    avgPrSize: null,
    medianFirstReviewMs: null,
    medianCycleMs: null,
  }))
  const byKey = new Map<string, TeamStatsRow>()
  for (const row of rows) byKey.set(row.login.toLowerCase(), row)
  const sizes = new Map<string, number[]>()
  const firstReviews = new Map<string, number[]>()
  const cycles = new Map<string, number[]>()
  const push = (map: Map<string, number[]>, key: string, value: number) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }

  const selected = selection === 'all' ? entries : entries.filter((x) => x.repo === selection)
  for (const entry of selected) {
    if (!entry.data) continue
    const authorByNumber = new Map<number, string>()
    const firstReviewMs = firstReviewDurations(entry.data.pullRequests, entry.data.reviews)
    for (const pr of entry.data.pullRequests) {
      if (pr.authorIsBot || pr.author === null) continue
      const key = pr.author.toLowerCase()
      authorByNumber.set(pr.number, key)
      const row = byKey.get(key)
      if (!row) continue
      if (inWindow(pr.createdAt)) {
        row.opened += 1
        if (pr.state === 'open') row.open += 1
        push(sizes, key, pr.additions + pr.deletions)
        const first = firstReviewMs.get(pr.number)
        if (first !== undefined) push(firstReviews, key, first)
      }
      if (pr.state === 'merged' && inWindow(pr.mergedAt)) {
        const cycle = cycleDuration(pr)
        if (cycle !== null) push(cycles, key, cycle)
        row.merged += 1
        row.additions += pr.additions
        row.deletions += pr.deletions
      }
      if (pr.state === 'closed' && inWindow(pr.closedAt)) row.closed += 1
    }
    for (const review of entry.data.reviews) {
      // Dismissed reviews are not counted anywhere (#20).
      if (review.outcome === 'dismissed') continue
      if (review.reviewerIsBot || review.reviewer === null || !inWindow(review.submittedAt)) continue
      const reviewer = review.reviewer.toLowerCase()
      const given = byKey.get(reviewer)
      if (given) given.reviewsGiven += 1
      const authorKey = authorByNumber.get(review.pullRequestNumber)
      if (authorKey === undefined || authorKey === reviewer) continue
      const received = byKey.get(authorKey)
      if (received) received.reviewsReceived += 1
    }
  }
  for (const [key, row] of byKey) {
    row.avgPrSize = average(sizes.get(key) ?? [])
    row.medianFirstReviewMs = median(firstReviews.get(key) ?? [])
    row.medianCycleMs = median(cycles.get(key) ?? [])
  }
  return rows
}
