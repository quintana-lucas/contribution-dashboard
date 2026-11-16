// Pure selector for Widget 4 (#18): open pull requests that have no review yet. No React, no
// fetch, no clock reads: `now` is always passed in. Inputs are never mutated. Bot-authored PRs
// and PRs by authors outside the team are excluded; reviews by bots, null reviewers and the PR
// author do not count as a review. Open PRs are listed regardless of age (no period filter).
import type { RepoEntry, RepoSelection } from './dashboard.ts'

export const OVERDUE_HOURS = 24

export interface WaitingPr {
  repo: string
  number: number
  title: string
  author: string
  additions: number
  deletions: number
  /** Pending requested reviewers: user logins and team slugs. */
  requestedReviewers: string[]
  createdAt: string
  /** Whole hours waited, never negative. */
  ageHours: number
  /** Waiting strictly more than 24 hours. */
  overdue: boolean
}

export function waitingForReview(
  entries: RepoEntry[],
  selection: RepoSelection,
  now: Date,
  teamFilter?: ReadonlySet<string> | null,
): WaitingPr[] {
  const out: WaitingPr[] = []
  const selected = selection === 'all' ? entries : entries.filter((x) => x.repo === selection)
  for (const entry of selected) {
    if (!entry.data) continue
    for (const pr of entry.data.pullRequests) {
      if (pr.state !== 'open' || pr.authorIsBot || pr.author === null) continue
      const author = pr.author.toLowerCase()
      if (teamFilter && !teamFilter.has(author)) continue
      const reviewed = entry.data.reviews.some(
        (r) =>
          r.pullRequestNumber === pr.number &&
          !r.reviewerIsBot &&
          r.reviewer !== null &&
          r.reviewer.toLowerCase() !== author,
      )
      if (reviewed) continue
      const waitedMs = Math.max(0, now.getTime() - new Date(pr.createdAt).getTime())
      out.push({
        repo: entry.repo,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        additions: pr.additions,
        deletions: pr.deletions,
        requestedReviewers: pr.requestedReviewers.map((r) => (r.kind === 'user' ? r.login : r.slug)),
        createdAt: pr.createdAt,
        ageHours: Math.floor(waitedMs / 3_600_000),
        overdue: waitedMs > OVERDUE_HOURS * 3_600_000,
      })
    }
  }
  // Longest waiting first.
  return out.sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.repo.localeCompare(b.repo) ||
      a.number - b.number,
  )
}
