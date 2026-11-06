import type { StoredRepo } from './types.ts'

/** Returns a copy of the repo without bot-authored PRs, bot reviews and bot requested reviewers. Teams are kept. */
export function excludeBots(repo: StoredRepo): StoredRepo {
  return {
    ...repo,
    pullRequests: repo.pullRequests
      .filter((pr) => !pr.authorIsBot)
      .map((pr) => ({
        ...pr,
        requestedReviewers: pr.requestedReviewers.filter((r) => r.kind === 'team' || !r.isBot),
      })),
    reviews: repo.reviews.filter((review) => !review.reviewerIsBot),
  }
}
