// Per-member period-over-period comparison (#134). A thin wrapper over `kpiComparison` (#87)
// restricted to one login, so windows, boundaries and the "insufficient history" signal match the
// team-level comparison. Pure: no React, no fetch, no clock reads.
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'
import { kpiComparison, type KpiComparison } from './kpiComparison.ts'

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
