// Pure selector for Widget 2 (#10): reviews given per person. No React, no fetch, no clock reads:
// `now` is always passed in. Inputs are never mutated. Window is (start, end]; bots, null
// reviewers, dismissed reviews and self-reviews are excluded; login matching is case-insensitive.
import { periodWindow } from './dashboard.ts'
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'

export interface ReviewsGiven {
  /** Display login, using the casing first seen. */
  login: string
  approved: number
  changesRequested: number
  commented: number
  total: number
}

export function reviewsPerPerson(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  teamFilter?: ReadonlySet<string> | null,
): ReviewsGiven[] {
  const { start, end } = periodWindow(period, now)
  const s = start.getTime()
  const e = end.getTime()
  const byLogin = new Map<string, ReviewsGiven>()

  const selected = selection === 'all' ? entries : entries.filter((x) => x.repo === selection)
  for (const entry of selected) {
    if (!entry.data) continue
    const authorByNumber = new Map<number, string>()
    const botPrs = new Set<number>()
    for (const pr of entry.data.pullRequests) {
      if (pr.authorIsBot || pr.author === null) botPrs.add(pr.number)
      else authorByNumber.set(pr.number, pr.author.toLowerCase())
    }

    for (const review of entry.data.reviews) {
      if (review.reviewerIsBot || review.reviewer === null) continue
      if (review.outcome === 'dismissed') continue
      const t = new Date(review.submittedAt).getTime()
      if (!(t > s && t <= e)) continue
      const key = review.reviewer.toLowerCase()
      if (teamFilter && !teamFilter.has(key)) continue
      if (botPrs.has(review.pullRequestNumber)) continue
      if (authorByNumber.get(review.pullRequestNumber) === key) continue

      let row = byLogin.get(key)
      if (!row) {
        row = { login: review.reviewer, approved: 0, changesRequested: 0, commented: 0, total: 0 }
        byLogin.set(key, row)
      }
      if (review.outcome === 'approved') row.approved += 1
      else if (review.outcome === 'changes_requested') row.changesRequested += 1
      else row.commented += 1
      row.total += 1
    }
  }

  return [...byLogin.values()].sort(
    (a, b) => b.total - a.total || a.login.toLowerCase().localeCompare(b.login.toLowerCase()),
  )
}
