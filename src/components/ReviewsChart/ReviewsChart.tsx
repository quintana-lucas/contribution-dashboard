import { useState } from 'react'
import type { ReviewsGiven } from '../../api/reviews.ts'
import { Bar } from '@visx/shape'
import { scaleLinear } from '@visx/scale'
import ChartTooltip, { useChartTooltip } from '../ChartTooltip'
import { markSize } from '../ChartFrame'
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

/** Bars are drawn in a 100-unit wide viewBox that stretches to the track. */
const BAR_UNITS = 100
const BAR_HEIGHT = 20

function segments(r: ReviewsGiven, scale: (value: number) => number) {
  let x = 0
  const out: { key: string; color: string; x: number; width: number }[] = []
  for (const o of OUTCOMES) {
    const width = markSize(r[o.key], scale)
    if (width > 0) out.push({ key: o.key, color: o.color, x, width })
    x += width
  }
  return out
}

function ReviewsChart({ rows }: ReviewsChartProps) {
  const [view, setView] = useState<View>('chart')
  const { open, bind } = useChartTooltip<ReviewsGiven>()
  const max = Math.max(0, ...rows.map((r) => r.total))
  const scale = scaleLinear<number>({ domain: [0, max || 1], range: [0, BAR_UNITS] })

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
              <span className={styles.track} aria-hidden="true">
                <svg
                  className={styles.svg}
                  viewBox={`0 0 ${BAR_UNITS} ${BAR_HEIGHT}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  {segments(r, scale).map((s) => (
                    <Bar
                      key={s.key}
                      className={styles.segment}
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
