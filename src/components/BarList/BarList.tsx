import styles from './BarList.module.css'

export interface BarListItem {
  key: string
  label: string
  value: number
  muted?: boolean
  srText: string
}

interface BarListProps {
  label: string
  items: BarListItem[]
}

function BarList({ label, items }: BarListProps) {
  const max = Math.max(0, ...items.filter((i) => !i.muted).map((i) => i.value))

  return (
    <ol className={styles.list} aria-label={label}>
      {items.map((item) => {
        const pct = max > 0 ? Math.min(100, (item.value / max) * 100) : 0
        return (
          <li key={item.key} className={styles.row}>
            <span className={styles.srOnly}>{item.srText}</span>
            <span className={styles.name} title={item.label} aria-hidden="true">
              {item.label}
            </span>
            <span className={styles.track} aria-hidden="true">
              <span
                className={item.muted ? styles.fillMuted : styles.fill}
                data-muted={item.muted ? 'true' : 'false'}
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
