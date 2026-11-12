// Pure selector for the contributions-per-person widget (#9). No React, no fetch, no clock reads:
// `now` is always passed in. Inputs are never mutated.
import { periodWindow } from './dashboard.ts'
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'

/** Max people shown as their own row; the rest collapse into one "Others" row. */
export const TOP_N = 8

export interface PersonContribution {
  login: string
  count: number
}

export interface Contributions {
  people: PersonContribution[]
  others: { count: number; people: number } | null
  total: number
}

/** Contribution = merged PR with `mergedAt` in (start, end]. Bots and null authors are excluded. */
export function contributionsPerPerson(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  teamFilter?: ReadonlySet<string> | null,
): Contributions {
  const { start, end } = periodWindow(period, now)
  const byLogin = new Map<string, PersonContribution>()
  const selected = selection === 'all' ? entries : entries.filter((e) => e.repo === selection)
  for (const entry of selected) {
    if (!entry.data) continue
    for (const pr of entry.data.pullRequests) {
      if (pr.state !== 'merged' || pr.authorIsBot || pr.author === null || !pr.mergedAt) continue
      const key = pr.author.toLowerCase()
      if (teamFilter && !teamFilter.has(key)) continue
      const t = new Date(pr.mergedAt).getTime()
      if (!(t > start.getTime() && t <= end.getTime())) continue
      const existing = byLogin.get(key)
      if (existing) existing.count += 1
      else byLogin.set(key, { login: pr.author, count: 1 })
    }
  }
  const sorted = [...byLogin.values()].sort(
    (a, b) => b.count - a.count || a.login.toLowerCase().localeCompare(b.login.toLowerCase()),
  )
  const total = sorted.reduce((sum, p) => sum + p.count, 0)
  if (sorted.length <= TOP_N + 1) return { people: sorted, others: null, total }
  const rest = sorted.slice(TOP_N)
  return {
    people: sorted.slice(0, TOP_N),
    others: { count: rest.reduce((sum, p) => sum + p.count, 0), people: rest.length },
    total,
  }
}
