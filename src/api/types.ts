// Shared contract between the sync server and the UI. Pure types, no runtime code.

export interface StoredPullRequest {
  number: number
  author: string | null // login; null for deleted users ("ghost")
  state: 'open' | 'merged' | 'closed' // closed = closed without merge
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  closedAt: string | null
}

export interface StoredReview {
  id: string // GraphQL node id
  pullRequestNumber: number
  reviewer: string | null
  state: string // APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED (PENDING excluded)
  submittedAt: string
}

export interface StoredRepo {
  schemaVersion: 1
  repo: string // "owner/name"
  pullRequests: StoredPullRequest[]
  reviews: StoredReview[]
}
