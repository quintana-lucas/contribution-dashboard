import { useDashboard } from '../DashboardProvider'
import ReviewsChart from '../ReviewsChart'
import Skeleton from '../Skeleton'
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
    body = (
      <div className={styles.skeletonRows}>
        {['90%', '70%', '55%', '40%', '30%'].map((w) => (
          <Skeleton key={w} width={w} height={20} />
        ))}
      </div>
    )
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
    <Widget title="Reviews given per person" hint={hint} busy={status === 'loading'}>
      {body}
    </Widget>
  )
}

export default ReviewsWidget
