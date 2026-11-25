// Per-member period-over-period comparison (#134). A thin wrapper over `kpiComparison` (#87)
// restricted to one login, so windows, boundaries and the "insufficient history" signal match the
// team-level comparison. Pure: no React, no fetch, no clock reads.
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'
import { hasPreviousWindowHistory, kpiComparison, type KpiComparison, type MetricComparison } from './kpiComparison.ts'
import { teamStats } from './teamStats.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Average PR size of one member, current window versus the previous one (#137). Both averages come
 * from `teamStats` (the figure `memberDetail.avgPrSize` shows), the previous one on a clock shifted
 * by `period` days. Returns null ("No comparison") when the previous window is not covered by synced
 * history or when either average is null (no PRs opened in that window). Previous average 0 gives
 * `deltaPct` undefined. Delta and percentage are computed from the unrounded averages.
 */
export function memberAvgPrSizeComparison(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  login: string,
): MetricComparison | null {
  if (!hasPreviousWindowHistory(entries, selection, period, now)) return null
  const current = teamStats(entries, selection, period, now, [login])[0]?.avgPrSize ?? null
  const previous =
    teamStats(entries, selection, period, new Date(now.getTime() - period * DAY_MS), [login])[0]?.avgPrSize ?? null
  if (current === null || previous === null) return null
  const delta = current - previous
  return { current, previous, delta, deltaPct: previous === 0 ? undefined : (delta / previous) * 100 }
}

/**
 * Compares one member's current window (now-P, now] with the previous one (now-2P, now-P].
 * `mergedPrs`, `reviews`, `additions` and `deletions` follow the #87 semantics. `prsOpened` is
 * present in the shape but out of scope for #134 consumers. The login is matched
 * case-insensitively, like the team filter. Deliberately does not reuse `teamStats` or
 * `memberDetail`, which have different semantics.
 */
export function memberComparison(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  login: string,
): KpiComparison {
  return kpiComparison(entries, selection, period, now, new Set([login.toLowerCase()]))
}
