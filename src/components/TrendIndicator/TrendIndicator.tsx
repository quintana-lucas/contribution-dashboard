import type { TrendView } from '../../api/trendView.ts'
import Skeleton from '../Skeleton'
import styles from './TrendIndicator.module.css'

type TrendIndicatorProps =
  | { loading: true; view?: undefined }
  | { loading?: false; view: TrendView }

/** Trend row for a KPI card (#87): glyph + figure + label, with a screen-reader sentence. */
function TrendIndicator({ view, loading }: TrendIndicatorProps) {
  if (loading || !view) {
    return (
      <div className={styles.row}>
        <Skeleton width="60%" />
      </div>
    )
  }
  if (view.kind === 'none') {
    return (
      <div className={`${styles.row} ${styles.muted}`}>
        <span aria-hidden="true">{view.label}</span>
        <span className={styles.srOnly}>{view.srText}</span>
      </div>
    )
  }
  return (
    <div className={`${styles.row} ${styles[view.tone]}`}>
      <span className={styles.figure} aria-hidden="true">
        {view.glyph} {view.figure}
      </span>
      <span className={styles.label} aria-hidden="true">
        {view.label}
      </span>
      <span className={styles.srOnly}>{view.srText}</span>
    </div>
  )
}

export default TrendIndicator
