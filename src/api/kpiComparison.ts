// Pure helpers for the period-over-period KPI comparison (#86). No React, no fetch, no clock
// reads: `now` is always passed in. Inputs are never mutated.
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'
import { kpis } from './kpis.ts'

/** Days of history a sync keeps. Mirrors `WINDOW_DAYS` in `server/fetchRepo.ts`; keep in sync. */
export const HISTORY_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

export interface MetricComparison {
  current: number
  previous: number
  /** current - previous. */
  delta: number
  /** delta / previous * 100, unrounded; undefined when previous is 0. */
  deltaPct: number | undefined
}

export interface KpiComparisonMetrics {
  mergedPrs: MetricComparison
  reviews: MetricComparison
  prsOpened: MetricComparison
  additions: MetricComparison
  deletions: MetricComparison
}

export type KpiComparison =
  | { status: 'available'; metrics: KpiComparisonMetrics }
  | { status: 'insufficient_history' }

function compare(current: number, previous: number): MetricComparison {
  const delta = current - previous
  return { current, previous, delta, deltaPct: previous === 0 ? undefined : (delta / previous) * 100 }
}

/**
 * Compares the current window (now-P, now] with the previous one (now-2P, now-P], reusing `kpis()`
 * on a shifted clock so the numbers cannot diverge from the Overview cards. Open PRs and Waiting
 * ignore the period and are not compared. Without full coverage of the previous window nothing
 * about it is returned.
 */
export function kpiComparison(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  teamFilter?: ReadonlySet<string> | null,
): KpiComparison {
  if (!hasPreviousWindowHistory(entries, selection, period, now)) return { status: 'insufficient_history' }
  const cur = kpis(entries, selection, period, now, teamFilter)
  const prev = kpis(entries, selection, period, new Date(now.getTime() - period * DAY_MS), teamFilter)
  return {
    status: 'available',
    metrics: {
      mergedPrs: compare(cur.mergedPrs, prev.mergedPrs),
      reviews: compare(cur.reviews, prev.reviews),
      prsOpened: compare(cur.prsOpened, prev.prsOpened),
      additions: compare(cur.additions, prev.additions),
      deletions: compare(cur.deletions, prev.deletions),
    },
  }
}

/**
 * True when the previous window (now-2P, now-P] is fully covered by synced history: at least one
 * selected repo has data and, for every selected repo with data, its history start
 * (`syncedAt - HISTORY_DAYS`) is at or before `now - 2P`. Repos without data are ignored; repos
 * outside the selection are not checked.
 */
export function hasPreviousWindowHistory(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
): boolean {
  const needed = now.getTime() - 2 * period * DAY_MS
  const selected = selection === 'all' ? entries : entries.filter((x) => x.repo === selection)
  let anyData = false
  for (const entry of selected) {
    if (!entry.data) continue
    anyData = true
    const historyStart = new Date(entry.data.syncedAt).getTime() - HISTORY_DAYS * DAY_MS
    if (!(historyStart <= needed)) return false
  }
  return anyData
}
