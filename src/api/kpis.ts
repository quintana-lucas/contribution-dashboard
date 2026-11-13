// Pure selector for the Overview KPI cards (#17). No React, no fetch, no clock reads: `now` is
// always passed in. Inputs are never mutated. Windows are (start, end]; bots and null logins are
// excluded; login matching is case-insensitive.
import { periodWindow } from './dashboard.ts'
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'

export interface Kpis {
  /** True when at least one repo in scope has synced data. */
  hasData: boolean
  /** PRs open now (any age); ignores the period. */
  openPrs: number
  /** Of openPrs: created over 24 h ago and never reviewed by someone other than the author. */
  waitingOver24h: number
  mergedPrs: number
  closedWithoutMerge: number
  /** Reviews in the window by team members, self-reviews excluded. */
  reviews: number
  /** Whole-number percent of reviews that requested changes; null when there are no reviews. */
  changesRequestedPercent: number | null
  additions: number
  deletions: number
  /** PRs created in the window. */
  prsOpened: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function kpis(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  teamFilter?: ReadonlySet<string> | null,
): Kpis {
  const { start, end } = periodWindow(period, now)
  const s = start.getTime()
  const e = end.getTime()
  const inWindow = (iso: string | null | undefined): boolean => {
    if (!iso) return false
    const t = new Date(iso).getTime()
    return t > s && t <= e
  }
  const inTeam = (login: string): boolean => !teamFilter || teamFilter.has(login.toLowerCase())

  const out: Kpis = {
    hasData: false,
    openPrs: 0,
    waitingOver24h: 0,
    mergedPrs: 0,
    closedWithoutMerge: 0,
    reviews: 0,
    changesRequestedPercent: null,
    additions: 0,
    deletions: 0,
    prsOpened: 0,
  }
  let changesRequested = 0

  const selected = selection === 'all' ? entries : entries.filter((x) => x.repo === selection)
  for (const entry of selected) {
    if (!entry.data) continue
    out.hasData = true
    const authorByNumber = new Map<number, string>()
    const botPrs = new Set<number>()
    for (const pr of entry.data.pullRequests) {
      if (pr.authorIsBot || pr.author === null) {
        botPrs.add(pr.number)
        continue
      }
      authorByNumber.set(pr.number, pr.author.toLowerCase())
    }
    // PRs reviewed at least once by someone other than their author.
    const reviewedByOther = new Set<number>()
    for (const review of entry.data.reviews) {
      if (review.reviewerIsBot || review.reviewer === null) continue
      const author = authorByNumber.get(review.pullRequestNumber)
      if (author !== undefined && author !== review.reviewer.toLowerCase()) {
        reviewedByOther.add(review.pullRequestNumber)
      }
    }

    for (const pr of entry.data.pullRequests) {
      if (pr.authorIsBot || pr.author === null || !inTeam(pr.author)) continue
      if (pr.state === 'open') {
        out.openPrs += 1
        if (
          new Date(pr.createdAt).getTime() < e - DAY_MS &&
          !reviewedByOther.has(pr.number)
        ) {
          out.waitingOver24h += 1
        }
      }
      if (pr.state === 'merged' && inWindow(pr.mergedAt)) out.mergedPrs += 1
      if (pr.state === 'closed' && inWindow(pr.closedAt)) out.closedWithoutMerge += 1
      if (inWindow(pr.createdAt)) {
        out.prsOpened += 1
        out.additions += pr.additions
        out.deletions += pr.deletions
      }
    }

    for (const review of entry.data.reviews) {
      if (review.reviewerIsBot || review.reviewer === null || !inWindow(review.submittedAt)) continue
      if (botPrs.has(review.pullRequestNumber) || !inTeam(review.reviewer)) continue
      if (authorByNumber.get(review.pullRequestNumber) === review.reviewer.toLowerCase()) continue
      out.reviews += 1
      if (review.outcome === 'changes_requested') changesRequested += 1
    }
  }
  if (out.reviews > 0) out.changesRequestedPercent = Math.round((100 * changesRequested) / out.reviews)
  return out
}
