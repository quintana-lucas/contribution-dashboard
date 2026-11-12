import type { StoredRepo } from './types.ts'

/**
 * Returns a copy of the repo without bot-authored PRs, bot reviews and bot requested reviewers. Teams are kept.
 * Reviews on dropped (bot-authored) PRs are dropped too, so no review is left without its pull request.
 */
export function excludeBots(repo: StoredRepo): StoredRepo {
  const pullRequests = repo.pullRequests
    .filter((pr) => !pr.authorIsBot)
    .map((pr) => ({
      ...pr,
      requestedReviewers: pr.requestedReviewers.filter((r) => r.kind === 'team' || !r.isBot),
    }))
  const keptNumbers = new Set(pullRequests.map((pr) => pr.number))
  return {
    ...repo,
    pullRequests,
    reviews: repo.reviews.filter((review) => !review.reviewerIsBot && keptNumbers.has(review.pullRequestNumber)),
  }
}
