// Pure selector for Widget 3 (#11): pull requests opened, merged and closed (without merge) per
// bucket. No React, no fetch, no clock reads: `now` is always passed in. Inputs are never mutated.
// Bots and null authors are excluded; every bucket is returned, empty ones as zeros; repos are
// aggregated; events count when they fall in the period window (start, end].
import { buckets, periodWindow } from './dashboard.ts'
import type { Period, RepoEntry, RepoSelection } from './dashboard.ts'

export interface PrActivityBucket {
  /** Short label for the x axis: "Jun 9". */
  label: string
  /** Full label for the table: "Jun 9" for a day, "Jun 3 – Jun 9" for a week. */
  fullLabel: string
  opened: number
  merged: number
  closed: number
}

export interface PrActivity {
  /** True when at least one repo in scope has synced data. */
  hasData: boolean
  buckets: PrActivityBucket[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function fmt(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function prActivity(
  entries: RepoEntry[],
  selection: RepoSelection,
  period: Period,
  now: Date,
  teamFilter?: ReadonlySet<string> | null,
): PrActivity {
  const { start, end } = periodWindow(period, now)
  const s = start.getTime()
  const e = end.getTime()
  const slots = buckets(period, now).map((b) => {
    const lastDay = new Date(b.end.getTime() - 1)
    const sameDay = b.end.getTime() - b.start.getTime() <= DAY_MS
    return {
      from: b.start.getTime(),
      to: b.end.getTime(),
      row: {
        label: fmt(b.start),
        fullLabel: sameDay ? fmt(b.start) : `${fmt(b.start)} – ${fmt(lastDay)}`,
        opened: 0,
        merged: 0,
        closed: 0,
      } as PrActivityBucket,
    }
  })

  const add = (iso: string | null, key: 'opened' | 'merged' | 'closed') => {
    if (!iso) return
    const t = new Date(iso).getTime()
    if (!(t > s && t <= e)) return
    const slot = slots.find((x) => t >= x.from && t < x.to)
    if (slot) slot.row[key] += 1
  }

  let hasData = false
  const selected = selection === 'all' ? entries : entries.filter((x) => x.repo === selection)
  for (const entry of selected) {
    if (!entry.data) continue
    hasData = true
    for (const pr of entry.data.pullRequests) {
      if (pr.authorIsBot || pr.author === null) continue
      if (teamFilter && !teamFilter.has(pr.author.toLowerCase())) continue
      add(pr.createdAt, 'opened')
      if (pr.state === 'merged') add(pr.mergedAt, 'merged')
      if (pr.state === 'closed') add(pr.closedAt, 'closed')
    }
  }
  return { hasData, buckets: slots.map((x) => x.row) }
}
