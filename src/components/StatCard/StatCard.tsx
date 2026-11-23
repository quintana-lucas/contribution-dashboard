import type { ReactNode } from 'react'
import styles from './StatCard.module.css'

type StatCardProps = {
  label: string
  /** Text or a node (e.g. LinesDelta); never empty. */
  value: ReactNode
  subline?: ReactNode
  /** Caution colour for the sub-line (never the only signal: pair with text and an icon). */
  sublineTone?: 'caution'
  /** Decorative icon rendered before the sub-line text. */
  sublineIcon?: ReactNode
  /** Screen-reader alternative for the value; the visible value is then aria-hidden. */
  srText?: string
  /** Smaller value type, for text values such as "No data yet". */
  compact?: boolean
  /** Optional trend row (e.g. TrendIndicator), rendered directly under the value. */
  trend?: ReactNode
}

function StatCard({ label, value, subline, sublineTone, sublineIcon, srText, compact, trend }:StatCardProps) {
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
      {trend ?? null}
      {subline ? (
        <div className={sublineTone === 'caution' ? `${styles.subline} ${styles.sublineCaution}` : styles.subline}>
          {sublineIcon ? <span className={styles.sublineIcon}>{sublineIcon}</span> : null}
          {subline}
        </div>
      ) : null}
    </div>
  )
}

export default StatCard
