// Pure team helpers shared by the server and the UI (#15). No React, no fetch, no clock reads.
import { periodWindow } from './dashboard.ts'
import { excludeBots } from './excludeBots.ts'
import type { StoredRepo } from './types.ts'

export interface Candidate {
  login: string
  pullRequests: number
  reviews: number
  repos: string[]
}

const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/

/** Trims, then strips one leading "@". */
export function normalizeLogin(input: string): string {
  const trimmed = input.trim()
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

/** 1-39 chars of letters, digits and single inner hyphens. Brackets (e.g. "[bot]") fail. */
export function isValidLogin(login: unknown): login is string {
  return typeof login === 'string' && LOGIN_RE.test(login)
}

function inWindow(iso: string | null, start: Date, end: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t > start.getTime() && t <= end.getTime()
}

/** Non-bot people with PRs or reviews in the last 90 days, most active first. */
export function candidates(repos: StoredRepo[], now: Date): Candidate[] {
  const { start, end } = periodWindow(90, now)
  const byKey = new Map<string, { login: string; pullRequests: number; reviews: number; repos: Set<string> }>()
  const touch = (login: string, repo: string, kind: 'pullRequests' | 'reviews') => {
    const key = login.toLowerCase()
    let c = byKey.get(key)
    if (!c) {
      c = { login, pullRequests: 0, reviews: 0, repos: new Set() }
      byKey.set(key, c)
    }
    c[kind] += 1
    c.repos.add(repo)
  }
  for (const raw of repos) {
    const repo = excludeBots(raw)
    for (const pr of repo.pullRequests) {
      if (!pr.author) continue
      if (
        inWindow(pr.createdAt, start, end) ||
        inWindow(pr.mergedAt, start, end) ||
        inWindow(pr.closedAt, start, end)
      ) {
        touch(pr.author, repo.repo, 'pullRequests')
      }
    }
    for (const review of repo.reviews) {
      if (!review.reviewer) continue
      if (inWindow(review.submittedAt, start, end)) touch(review.reviewer, repo.repo, 'reviews')
    }
  }
  return [...byKey.values()]
    .map((c) => ({ login: c.login, pullRequests: c.pullRequests, reviews: c.reviews, repos: [...c.repos].sort() }))
    .sort(
      (a, b) =>
        b.pullRequests + b.reviews - (a.pullRequests + a.reviews) ||
        (a.login.toLowerCase() < b.login.toLowerCase() ? -1 : a.login.toLowerCase() > b.login.toLowerCase() ? 1 : 0),
    )
}
