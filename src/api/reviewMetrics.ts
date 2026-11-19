// Shared helpers for the review metrics (#21): time to first review, cycle time and PR size. Pure:
// no React, no fetch, no clock reads. Inputs are never mutated.
import type { StoredPullRequest, StoredReview } from './types.ts'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Shown instead of a value when there are no qualifying pull requests. */
export const NOT_AVAILABLE = 'n/a'

/** Median of the values; null when there are none. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Mean of the values; null when there are none. */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Milliseconds from opening to the first review, per PR number. A review counts when its reviewer is
 * a human other than the PR author, it is not dismissed, and it was not submitted before the PR was
 * opened. PRs by bots or deleted users, and PRs with no qualifying review, are absent from the map.
 */
export function firstReviewDurations(
  pullRequests: readonly StoredPullRequest[],
  reviews: readonly StoredReview[],
): Map<number, number> {
  const created = new Map<number, { at: number; author: string }>()
  for (const pr of pullRequests) {
    if (pr.authorIsBot || pr.author === null) continue
    created.set(pr.number, { at: new Date(pr.createdAt).getTime(), author: pr.author.toLowerCase() })
  }
  const out = new Map<number, number>()
  for (const review of reviews) {
    if (review.reviewerIsBot || review.reviewer === null || review.outcome === 'dismissed') continue
    const pr = created.get(review.pullRequestNumber)
    if (!pr || pr.author === review.reviewer.toLowerCase()) continue
    const ms = new Date(review.submittedAt).getTime() - pr.at
    if (!(ms >= 0)) continue
    const best = out.get(review.pullRequestNumber)
    if (best === undefined || ms < best) out.set(review.pullRequestNumber, ms)
  }
  return out
}

/** Milliseconds from opening to merge; null when the PR is not merged or the dates are unusable. */
export function cycleDuration(pr: StoredPullRequest): number | null {
  if (pr.state !== 'merged' || !pr.mergedAt) return null
  const ms = new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()
  return ms >= 0 ? ms : null
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '')
}

/** Readable duration with a stated unit ("45 min", "<1 min", "5.5 h", "2.5 days"); "n/a" for null. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return NOT_AVAILABLE
  if (ms < MINUTE_MS) return '<1 min'
  // Capped at 59 so a value just under an hour never reads "60 min".
  if (ms < HOUR_MS) return `${Math.min(59, Math.round(ms / MINUTE_MS))} min`
  if (ms < 2 * DAY_MS) return `${trim(ms / HOUR_MS)} h`
  const days = ms / DAY_MS
  return `${trim(days)} ${trim(days) === '1' ? 'day' : 'days'}`
}

/** Average PR size as a bare whole number ("320", no unit: the column header carries it); "n/a" for null. */
export function formatSizeNumber(lines: number | null): string {
  if (lines === null || !Number.isFinite(lines)) return NOT_AVAILABLE
  return new Intl.NumberFormat('en-US').format(Math.round(lines))
}

/** Average PR size as a whole number of lines with its unit ("320 lines"); "n/a" for null. */
export function formatSize(lines: number | null): string {
  if (lines === null || !Number.isFinite(lines)) return NOT_AVAILABLE
  const n = Math.round(lines)
  return `${new Intl.NumberFormat('en-US').format(n)} ${n === 1 ? 'line' : 'lines'}`
}
