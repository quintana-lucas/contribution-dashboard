import styles from './ColumnChart.module.css'

export interface ColumnChartBar {
  key: string
  label: string
  value: number
}

interface ColumnChartProps {
  bars: ColumnChartBar[]
  /** Text alternative, rendered as a screen-reader-only figcaption. */
  description: string
  tableCaption: string
  labelHeader: string
  valueHeader: string
  /** Show only every Nth x label (the table keeps all of them). */
  labelEvery?: number
}

function ColumnChart({
  bars,
  description,
  tableCaption,
  labelHeader,
  valueHeader,
  labelEvery = 1,
}: ColumnChartProps) {
  const max = Math.max(0, ...bars.map((b) => b.value))
  const cols = { gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.srOnly}>{description}</figcaption>
      <div className={styles.plot} style={cols} aria-hidden="true">
        {bars.map((bar) => {
          const pct = max > 0 ? (bar.value / max) * 100 : 0
          return (
            <div key={bar.key} className={styles.slot}>
              <span className={styles.column} data-testid="column" style={{ height: `${pct}%` }}>
                {bar.value > 0 ? <span className={styles.value}>{bar.value}</span> : null}
              </span>
            </div>
          )
        })}
      </div>
      <div className={styles.xLabels} style={cols} aria-hidden="true">
        {bars.map((bar, i) => (
          <span key={bar.key} className={styles.xLabel} data-testid="x-label">
            {i % labelEvery === 0 ? bar.label : ''}
          </span>
        ))}
      </div>
      <details className={styles.details}>
        <summary className={styles.summary}>Show as table</summary>
        <table className={styles.table}>
          <caption className={styles.caption}>{tableCaption}</caption>
          <thead>
            <tr>
              <th scope="col">{labelHeader}</th>
              <th scope="col">{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.key}>
                <td>{bar.label}</td>
                <td>{bar.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

export default ColumnChart
