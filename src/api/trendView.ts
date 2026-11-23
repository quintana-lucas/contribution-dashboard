// Pure view-model for the period-over-period trend row on the Overview KPI cards (#87). No React,
// no clock. Microcopy is literal from the design spec (MC1-MC8).
import type { Period } from './dashboard.ts'
import type { KpiComparison, KpiComparisonMetrics, MetricComparison } from './kpiComparison.ts'

export type TrendRule = 'directional' | 'neutral'
export type TrendTone = 'good' | 'bad' | 'muted'

export interface TrendView {
  kind: 'trend' | 'none'
  /** Arrow glyph; empty for `none`. */
  glyph: '↑' | '↓' | '→' | ''
  /** Signed delta and percent, e.g. "+3 (+12%)"; empty for `none`. */
  figure: string
  /** Comparison label, or "No comparison" for `none`. */
  label: string
  /** Screen-reader sentence. */
  srText: string
  tone: TrendTone
}

const MINUS = '−'

/** Sums two comparisons into one (total churn: additions + deletions). */
export function combineComparisons(a: MetricComparison, b: MetricComparison): MetricComparison {
  const current = a.current + b.current
  const previous = a.previous + b.previous
  const delta = current - previous
  return { current, previous, delta, deltaPct: previous === 0 ? undefined : (delta / previous) * 100 }
}

/** One metric of a comparison; undefined when the history is insufficient. */
export function metricOf(
  comparison: KpiComparison,
  key: keyof KpiComparisonMetrics,
): MetricComparison | undefined {
  return comparison.status === 'available' ? comparison.metrics[key] : undefined
}

export function trendView(
  comparison: MetricComparison | undefined,
  rule: TrendRule,
  period: Period,
): TrendView {
  if (!comparison || comparison.deltaPct === undefined) {
    return {
      kind: 'none',
      glyph: '',
      figure: '',
      label: 'No comparison',
      srText: 'No comparison available for the previous period',
      tone: 'muted',
    }
  }
  const label = `vs previous ${period} days`
  const { delta, deltaPct } = comparison
  if (delta === 0) {
    return {
      kind: 'trend',
      glyph: '→',
      figure: '0 (0%)',
      label,
      srText: `no change versus previous ${period} days`,
      tone: 'muted',
    }
  }
  const up = delta > 0
  const sign = up ? '+' : MINUS
  const rounded = Math.round(Math.abs(deltaPct))
  const pct = rounded === 0 ? '<1' : rounded.toLocaleString('en-US')
  const abs = Math.abs(delta).toLocaleString('en-US')
  const srPct = rounded === 0 ? 'less than 1' : rounded.toLocaleString('en-US')
  return {
    kind: 'trend',
    glyph: up ? '↑' : '↓',
    figure: `${sign}${abs} (${sign}${pct}%)`,
    label,
    srText: `${up ? 'up' : 'down'} ${srPct} percent versus previous ${period} days`,
    tone: rule === 'neutral' ? 'muted' : up ? 'good' : 'bad',
  }
}
