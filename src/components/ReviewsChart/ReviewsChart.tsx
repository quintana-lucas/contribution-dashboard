import { useState } from 'react'
import type { ReviewsGiven } from '../../api/reviews.ts'
import styles from './ReviewsChart.module.css'

interface ReviewsChartProps {
  rows: ReviewsGiven[]
}

type View = 'chart' | 'table'

const LABEL = 'Reviews given per person'

const OUTCOMES = [
  { key: 'approved', label: 'Approved', className: styles.approved },
  { key: 'changesRequested', label: 'Changes requested', className: styles.changes },
  { key: 'commented', label: 'Commented', className: styles.commented },
] as const

function ReviewsChart({ rows }: ReviewsChartProps) {
  const [view, setView] = useState<View>('chart')
  const max = Math.max(0, ...rows.map((r) => r.total))

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <ul className={styles.legend} aria-label="Legend">
          {OUTCOMES.map((o) => (
            <li key={o.key} className={styles.legendItem}>
              <span className={`${styles.swatch} ${o.className}`} aria-hidden="true" />
              {o.label}
            </li>
          ))}
        </ul>
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
            <li key={r.login.toLowerCase()} className={styles.row}>
              <span className={styles.srOnly}>
                {`${r.login}: ${r.total} reviews: ${r.approved} approved, ${r.changesRequested} changes requested, ${r.commented} commented`}
              </span>
              <span className={styles.name} title={r.login} aria-hidden="true">
                {r.login}
              </span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.stack}
                  style={{ width: `${max > 0 ? (r.total / max) * 100 : 0}%` }}
                >
                  {OUTCOMES.map((o) =>
                    r[o.key] > 0 ? (
                      <span
                        key={o.key}
                        className={`${styles.segment} ${o.className}`}
                        data-outcome={o.key}
                        style={{ flexGrow: r[o.key] }}
                      />
                    ) : null,
                  )}
                </span>
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
    </div>
  )
}

export default ReviewsChart
