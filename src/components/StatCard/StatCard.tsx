import type { ReactNode } from 'react'
import styles from './StatCard.module.css'

type StatCardProps = {
  label: string
  /** Text or a node (e.g. LinesDelta); never empty. */
  value: ReactNode
  subline?: string
  /** Screen-reader alternative for the value; the visible value is then aria-hidden. */
  srText?: string
  /** Smaller value type, for text values such as "No data yet". */
  compact?: boolean
}

function StatCard({ label, value, subline, srText, compact }: StatCardProps) {
  const shown = value === '' ? '…' : value
  return (
    <div className={styles.card}>
      <div className={styles.label}>{label}</div>
      <div className={compact ? `${styles.value} ${styles.compact}` : styles.value}>
        {srText === undefined ? (
          shown
        ) : (
          <>
            <span aria-hidden="true">{shown}</span>
            <span className={styles.srOnly}>{srText}</span>
          </>
        )}
      </div>
      {subline ? <div className={styles.subline}>{subline}</div> : null}
    </div>
  )
}

export default StatCard
