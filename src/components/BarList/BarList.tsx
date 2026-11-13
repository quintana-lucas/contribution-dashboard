import styles from './BarList.module.css'

export interface BarListItem {
  key: string
  label: string
  value: number
  /** Shorthand for `variant: 'muted'`; ignored when `variant` is set. */
  muted?: boolean
  variant?: BarVariant
  srText: string
}

export type BarVariant = 'solid' | 'muted' | 'hatched'

interface BarListProps {
  label: string
  items: BarListItem[]
}

function BarList({ label, items }: BarListProps) {
  // Only legacy `muted` items (e.g. "Others") are excluded from the scale.
  const max = Math.max(0, ...items.filter((i) => !(i.muted && !i.variant)).map((i) => i.value))

  return (
    <ol className={styles.list} aria-label={label}>
      {items.map((item) => {
        const pct = max > 0 ? Math.min(100, (item.value / max) * 100) : 0
        const variant: BarVariant = item.variant ?? (item.muted ? 'muted' : 'solid')
        const fillClass =
          variant === 'muted'
            ? styles.fillMuted
            : variant === 'hatched'
              ? styles.fillHatched
              : styles.fill
        return (
          <li key={item.key} className={styles.row}>
            <span className={styles.srOnly}>{item.srText}</span>
            <span className={styles.name} title={item.label} aria-hidden="true">
              {item.label}
            </span>
            <span className={styles.track} aria-hidden="true">
              <span
                className={fillClass}
                data-muted={variant === 'muted' ? 'true' : 'false'}
                data-variant={variant}
                data-testid="bar-fill"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className={styles.count} aria-hidden="true">
              {item.value}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export default BarList
