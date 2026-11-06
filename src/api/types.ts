// Shared contract between the sync server and the UI. Pure types, no runtime code.

export type ReviewOutcome = 'approved' | 'changes_requested' | 'commented' | 'dismissed'

// Only pending requests exist (GitHub drops a request once the reviewer reviews).
export type StoredRequestedReviewer =
  | { kind: 'user'; login: string; isBot: boolean }
  | { kind: 'team'; slug: string }

export interface StoredPullRequest {
  number: number
  author: string | null // login; null for deleted users ("ghost")
  authorIsBot: boolean
  state: 'open' | 'merged' | 'closed' // closed = closed without merge
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
  additions: number
  deletions: number
  baseBranch: string
  requestedReviewers: StoredRequestedReviewer[]
}

export interface StoredReview {
  id: string // GraphQL node id
  pullRequestNumber: number
  reviewer: string | null
  reviewerIsBot: boolean
  outcome: ReviewOutcome // PENDING excluded
  submittedAt: string
}

/** A linked repo as listed by `GET /api/repos`; `syncedAt` is null if never synced. */
export interface LinkedRepo {
  repo: string // "owner/name"
  syncedAt: string | null
}

export interface StoredRepo {
  schemaVersion: 2
  repo: string // "owner/name"
  syncedAt: string // ISO time of the last successful sync of this repo
  pullRequests: StoredPullRequest[]
  reviews: StoredReview[]
}
