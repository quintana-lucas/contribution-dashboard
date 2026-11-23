import { useState } from 'react'
import type { ReviewsGiven } from '../../api/reviews.ts'
import { Bar } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import ChartTooltip, { useChartTooltip } from '../ChartTooltip'
import { CHART_MIN_MARK, useWidth } from '../ChartFrame'
import styles from './ReviewsChart.module.css'

interface ReviewsChartProps {
  rows: ReviewsGiven[]
}

type View = 'chart' | 'table'

const LABEL = 'Reviews given per person'

const OUTCOMES = [
  { key: 'approved', label: 'Approved', color: 'var(--color-good)' },
  { key: 'changesRequested', label: 'Changes requested', color: 'var(--color-caution)' },
  { key: 'commented', label: 'Commented', color: 'var(--color-bar-muted)' },
] as const

const BAR_HEIGHT = 20
/** Empty space between adjacent segments, in px. */
const GAP = 1
/** Track width used when the real one cannot be measured (no layout engine). */
const FALLBACK_WIDTH = 100

/**
 * Lays out one row in real px. The stack is total * scale wide, but never
 * narrower than a min mark per non-zero segment (plus gaps) nor wider than the
 * track. Segments below the min mark are pinned to it and the rest share what
 * remains, so everything fits and every non-zero count stays visible.
 */
function segments(r: ReviewsGiven, scale: (value: number) => number, trackWidth: number) {
  const present = OUTCOMES.filter((o) => r[o.key] > 0)
  const gaps = Math.max(0, present.length - 1) * GAP
  const target = Math.min(
    trackWidth,
    Math.max(scale(r.total) + gaps, present.length * CHART_MIN_MARK + gaps),
  )
  const widths = new Map<string, number>()
  let free = present.slice()
  let budget = target - gaps
  for (;;) {
    const raw = free.reduce((sum, o) => sum + r[o.key], 0)
    const k = raw > 0 ? Math.max(0, budget) / raw : 0
    const small = free.filter((o) => r[o.key] * k < CHART_MIN_MARK)
    if (small.length === 0) {
      for (const o of free) widths.set(o.key, r[o.key] * k)
      break
    }
    for (const o of small) {
      widths.set(o.key, CHART_MIN_MARK)
      budget -= CHART_MIN_MARK
    }
    free = free.filter((o) => !small.includes(o))
  }
  let x = 0
  return present.map((o) => {
    const width = widths.get(o.key) ?? 0
    const seg = { key: o.key, color: o.color, x, width }
    x += width + GAP
    return seg
  })
}

function ReviewsRowTrack({ row, scale }: { row: ReviewsGiven; scale: (v: number) => number }) {
  const [ref, width] = useWidth<HTMLSpanElement>(FALLBACK_WIDTH)
  return (
    <span ref={ref} className={styles.track} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox={`0 0 ${width} ${BAR_HEIGHT}`}
        aria-hidden="true"
        focusable="false"
      >
        {segments(row, (v) => scale(v) * width, width).map((s) => (
          <Bar
            key={s.key}
            data-outcome={s.key}
            x={s.x}
            y={0}
            width={s.width}
            height={BAR_HEIGHT}
            fill={s.color}
          />
        ))}
      </svg>
    </span>
  )
}

function ReviewsChart({ rows }: ReviewsChartProps) {
  const [view, setView] = useState<View>('chart')
  const { open, bind } = useChartTooltip<ReviewsGiven>()
  const max = Math.max(0, ...rows.map((r) => r.total))
  // Domain 0..max maps to 0..1 of the track; each row scales it by its width.
  const unit = scaleLinear<number>({ domain: [0, max || 1], range: [0, 1] })

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.toggle}>
          {(['chart', 'table'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={styles.toggleButton}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <ol className={styles.list} aria-label={LABEL}>
          {rows.map((r) => (
            <li
              key={r.login.toLowerCase()}
              className={styles.row}
              tabIndex={0}
              {...bind(r)}
            >
              <span className={styles.srOnly}>
                {`${r.login}: ${r.total} reviews: ${r.approved} approved, ${r.changesRequested} changes requested, ${r.commented} commented`}
              </span>
              <span className={styles.name} title={r.login} aria-hidden="true">
                {r.login}
              </span>
              <ReviewsRowTrack row={r} scale={unit} />
              <span className={styles.count} aria-hidden="true">
                {r.total}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{LABEL}</caption>
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col" className={styles.num}>Approved</th>
                <th scope="col" className={styles.num}>Changes requested</th>
                <th scope="col" className={styles.num}>Commented</th>
                <th scope="col" className={styles.num}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.login.toLowerCase()}>
                  <th scope="row">{r.login}</th>
                  <td className={styles.num}>{r.approved}</td>
                  <td className={styles.num}>{r.changesRequested}</td>
                  <td className={styles.num}>{r.commented}</td>
                  <td className={styles.num}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ul className={styles.legend} aria-label="Legend">
        {OUTCOMES.map((o) => (
          <li key={o.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: o.color }} aria-hidden="true" />
            {o.label}
          </li>
        ))}
      </ul>

      {open && (
        <ChartTooltip
          anchor={open.anchor}
          title={open.data.login}
          rows={OUTCOMES.map((o) => ({
            color: o.color,
            name: o.label,
            value: open.data[o.key],
          }))}
          footer={`Total: ${open.data.total} reviews`}
        />
      )}
    </div>
  )
}

export default ReviewsChart
