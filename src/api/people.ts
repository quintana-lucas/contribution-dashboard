import { excludeBots } from './excludeBots.ts'
import type { StoredRepo } from './types.ts'

/** Distinct non-null PR authors plus reviewers over all stored data, bots excluded. */
export function people(data: StoredRepo): number {
  const clean = excludeBots(data)
  const logins = new Set<string>()
  for (const pr of clean.pullRequests) if (pr.author) logins.add(pr.author)
  for (const review of clean.reviews) if (review.reviewer) logins.add(review.reviewer)
  return logins.size
}
