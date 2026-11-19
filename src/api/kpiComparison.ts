// Pure helpers for the period-over-period KPI comparison (#86). No React, no fetch, no clock
// reads: `now` is always passed in. Inputs are never mutated.
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'

/** Days of history a sync keeps. Mirrors `WINDOW_DAYS` in `server/fetchRepo.ts`; keep in sync. */
export const HISTORY_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

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
