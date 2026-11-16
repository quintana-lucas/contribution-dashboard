import type { PrActivityBucket } from '../../api/prActivity.ts'
import styles from './PrActivityChart.module.css'

interface PrActivityChartProps {
  buckets: PrActivityBucket[]
  /** "day" or "week": names the bucket size in the text alternative and table. */
  unit: 'day' | 'week'
}

const SERIES = [
  { key: 'opened', label: 'Opened', className: styles.opened },
  { key: 'merged', label: 'Merged', className: styles.merged },
  { key: 'closed', label: 'Closed', className: styles.closed },
] as const

function PrActivityChart({ buckets, unit }: PrActivityChartProps) {
  const max = Math.max(0, ...buckets.flatMap((b) => SERIES.map((s) => b[s.key])))
  const cols = { gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }
  const total = (key: (typeof SERIES)[number]['key']) => buckets.reduce((sum, b) => sum + b[key], 0)
  const description = `Pull requests per ${unit}: ${SERIES.map((s) => `${total(s.key)} ${s.label.toLowerCase()}`).join(', ')}.`

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.srOnly}>{description}</figcaption>
      <ul className={styles.legend} aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className={styles.legendItem}>
            <span className={`${styles.swatch} ${s.className}`} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <div className={styles.plot} style={cols} aria-hidden="true">
        {buckets.map((b) => (
          <div key={b.fullLabel} className={styles.group} data-testid="group">
            {SERIES.map((s) => (
              <div key={s.key} className={styles.slot}>
                <span
                  className={`${styles.column} ${s.className}`}
                  data-series={s.key}
                  style={{ height: `${max > 0 ? (b[s.key] / max) * 100 : 0}%` }}
                >
                  {b[s.key] > 0 ? <span className={styles.value}>{b[s.key]}</span> : null}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.xLabels} style={cols} aria-hidden="true">
        {buckets.map((b, i) => (
          <span key={b.fullLabel} className={styles.xLabel}>
            {buckets.length > 8 && i % 2 === 1 ? '' : b.label}
          </span>
        ))}
      </div>
      <details className={styles.details}>
        <summary className={styles.summary}>Show as table</summary>
        <table className={styles.table}>
          <caption className={styles.caption}>Pull requests per {unit}</caption>
          <thead>
            <tr>
              <th scope="col">{unit === 'day' ? 'Day' : 'Week'}</th>
              {SERIES.map((s) => (
                <th key={s.key} scope="col" className={styles.num}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.fullLabel}>
                <th scope="row">{b.fullLabel}</th>
                {SERIES.map((s) => (
                  <td key={s.key} className={styles.num}>
                    {b[s.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

export default PrActivityChart
