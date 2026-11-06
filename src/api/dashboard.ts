// Pure shared read interface for the dashboard (#16). No React, no fetch, no clock reads:
// `now` is always passed in. Inputs are never mutated.
import type { StoredPullRequest, StoredRepo, StoredReview } from './types'

export type Period = 7 | 30 | 90
export type RepoSelection = 'all' | string

export interface RepoEntry {
  repo: string
  syncedAt: string | null
  data: StoredRepo | null
}

/** `start` is inclusive, `end` is exclusive. */
export interface Bucket {
  start: Date
  end: Date
}

export interface Activity {
  pullRequests: StoredPullRequest[]
  reviews: StoredReview[]
  buckets: Bucket[]
  teamMemberCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The window is (start, end]: start exclusive, end (= now) inclusive. */
export function periodWindow(period: Period, now: Date): { start: Date; end: Date } {
  return { start: new Date(now.getTime() - period * DAY_MS), end: new Date(now.getTime()) }
}

function startOfNextLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

function addLocalDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds())
}

export function buckets(period: Period, now: Date): Bucket[] {
  const tomorrow = startOfNextLocalDay(now)
  const result: Bucket[] = []
  if (period === 7) {
    for (let i = 6; i >= 0; i--) {
      result.push({ start: addLocalDays(tomorrow, -(i + 1)), end: addLocalDays(tomorrow, -i) })
    }
    return result
  }
  const windowStart = periodWindow(period, now).start
  let end = tomorrow
  while (end.getTime() > windowStart.getTime()) {
    const weekStart = addLocalDays(end, -7)
    const start = weekStart.getTime() < windowStart.getTime() ? new Date(windowStart.getTime()) : weekStart
    result.unshift({ start, end })
    end = weekStart
  }
  return result
}

function inWindow(iso: string | null, start: Date, end: Date): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return t > start.getTime() && t <= end.getTime()
}

function selectedEntries(entries: RepoEntry[], selection: RepoSelection): RepoEntry[] {
  return selection === 'all' ? entries : entries.filter((e) => e.repo === selection)
}

export function selectActivity(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
): Activity {
  const { start, end } = periodWindow(period, now)
  const pullRequests: StoredPullRequest[] = []
  const reviews: StoredReview[] = []
  for (const entry of selectedEntries(entries, selection)) {
    if (!entry.data) continue
    for (const pr of entry.data.pullRequests) {
      if (
        inWindow(pr.createdAt, start, end) ||
        inWindow(pr.mergedAt, start, end) ||
        inWindow(pr.closedAt, start, end)
      ) {
        pullRequests.push(pr)
      }
    }
    for (const review of entry.data.reviews) {
      if (inWindow(review.submittedAt, start, end)) reviews.push(review)
    }
  }
  const members = new Set<string>()
  for (const pr of pullRequests) if (pr.author) members.add(pr.author)
  for (const review of reviews) if (review.reviewer) members.add(review.reviewer)
  return { pullRequests, reviews, buckets: buckets(period, now), teamMemberCount: members.size }
}

/** Most common base branch among stored PRs; ties go to the alphabetically first. */
export function baseBranch(data: StoredRepo | null): string | null {
  if (!data || data.pullRequests.length === 0) return null
  const counts = new Map<string, number>()
  for (const pr of data.pullRequests) counts.set(pr.baseBranch, (counts.get(pr.baseBranch) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [branch, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && branch < best)) {
      best = branch
      bestCount = count
    }
  }
  return best
}

function ago(syncedAt: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(syncedAt).getTime()) / 60000)
  if (minutes < 1) return 'synced less than 1 min ago'
  if (minutes < 60) return `synced ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `synced ${hours} h ago`
  return `synced ${Math.floor(hours / 24)} d ago`
}

export function syncText(entries: RepoEntry[], selection: RepoSelection, now: Date): string {
  const selected = selectedEntries(entries, selection)
  const synced = selected.filter((e) => e.syncedAt !== null)
  if (synced.length === 0) return 'not synced yet'
  const oldest = synced.reduce((a, b) =>
    new Date(a.syncedAt as string).getTime() <= new Date(b.syncedAt as string).getTime() ? a : b,
  )
  const text = ago(oldest.syncedAt as string, now)
  const missing = selected.length - synced.length
  return missing > 0 ? `${text} (${missing} not synced yet)` : text
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

export function toolbarSubline(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
): string {
  const sync = syncText(entries, selection, now)
  const selected = selectedEntries(entries, selection)
  if (selection === 'all') {
    const repos = plural(selected.length, 'repository', 'repositories')
    if (!selected.some((e) => e.syncedAt !== null)) return `${repos} · ${sync}`
    const members = plural(selectActivity(entries, 'all', period, now).teamMemberCount, 'member', 'members')
    return `${repos} · ${members} · ${sync}`
  }
  const entry = selected[0]
  if (!entry || entry.syncedAt === null) return 'not synced yet'
  const members = plural(selectActivity(entries, selection, period, now).teamMemberCount, 'member', 'members')
  const branch = baseBranch(entry.data)
  const prefix = branch === null ? '' : `Base branch ${branch} · `
  return `${prefix}${members} · ${sync}`
}
