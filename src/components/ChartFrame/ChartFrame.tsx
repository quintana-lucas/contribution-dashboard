import type { ReactNode } from 'react'
import styles from './ChartFrame.module.css'

export interface ChartFrameTable {
  caption: string
  /** First header cell (the row label column). */
  labelHeader: string
  /** One header per value column. */
  columns: string[]
  rows: { key: string; label: string; values: (number | string)[] }[]
}

interface ChartFrameProps {
  /**
   * "figure": a `<figure>` whose sr-only `<figcaption>` is the text alternative.
   * "rows": a plain wrapper; each row of `children` carries its own hidden text
   * (use `ChartRowText`), as BarList and ReviewsChart do.
   */
  variant?: 'figure' | 'rows'
  /** Text alternative for the "figure" variant. */
  description?: string
  /** Visible extras above the plot (legend). Not hidden from assistive tech. */
  legend?: ReactNode
  /** The marks. In the "figure" variant they are wrapped in an `aria-hidden` slot. */
  children: ReactNode
  /** Axis labels etc., also `aria-hidden` (figure variant only). */
  axis?: ReactNode
  table: ChartFrameTable
}

/** Screen-reader-only text for one row of a "rows" chart. */
export function ChartRowText({ children }: { children: ReactNode }) {
  return <span className={styles.srOnly}>{children}</span>
}

function ChartFrame({
  variant = 'figure',
  description,
  legend,
  children,
  axis,
  table,
}: ChartFrameProps) {
  const details = (
    <details className={styles.details}>
      <summary className={styles.summary}>Show as table</summary>
      <table className={styles.table}>
        <caption className={styles.caption}>{table.caption}</caption>
        <thead>
          <tr>
            <th scope="col">{table.labelHeader}</th>
            {table.columns.map((c) => (
              <th key={c} scope="col" className={styles.num}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.label}</th>
              {r.values.map((v, i) => (
                <td key={table.columns[i]} className={styles.num}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )

  if (variant === 'rows') {
    return (
      <div className={styles.frame}>
        {legend}
        {children}
        {details}
      </div>
    )
  }

  return (
    <figure className={styles.frame}>
      <figcaption className={styles.srOnly}>{description}</figcaption>
      {legend}
      <div className={styles.plot} data-testid="chart-plot" aria-hidden="true">
        {children}
      </div>
      {axis ? <div aria-hidden="true">{axis}</div> : null}
      {details}
    </figure>
  )
}

export default ChartFrame
