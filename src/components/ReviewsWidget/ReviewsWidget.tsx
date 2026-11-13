import { useDashboard } from '../DashboardProvider'
import ReviewsChart from '../ReviewsChart'
import Widget from '../Widget'
import styles from './ReviewsWidget.module.css'

interface ReviewsWidgetProps {
  onOpenSettings: () => void
}

// Widget 2: reviews given per person. Reads only the dashboard context (local data).
function ReviewsWidget({ onOpenSettings }: ReviewsWidgetProps) {
  const { status, entries, selection, period, reviewsGiven } = useDashboard()
  const scope = selection === 'all' ? 'All repositories' : selection
  const hint = `Reviews given per person · ${scope} · last ${period} days`

  let body = null
  if (status === 'loading') {
    body = <p className={styles.muted}>Loading…</p>
  } else if (status === 'ready') {
    const inScope = selection === 'all' ? entries : entries.filter((e) => e.repo === selection)
    if (!inScope.some((e) => e.data !== null)) {
      body = (
        <div className={styles.empty}>
          <p className={styles.muted}>No data yet. Sync a linked repository to see reviews.</p>
          <button type="button" className={styles.button} onClick={onOpenSettings}>
            Open settings
          </button>
        </div>
      )
    } else {
      const rows = reviewsGiven()
      body =
        rows.length === 0 ? (
          <p className={styles.muted}>No reviews in the last {period} days.</p>
        ) : (
          <ReviewsChart rows={rows} />
        )
    }
  }

  return (
    <Widget title="Widget 2" hint={hint}>
      {body}
    </Widget>
  )
}

export default ReviewsWidget
