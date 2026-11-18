import { useDashboard } from '../DashboardProvider'
import PrActivityChart from '../PrActivityChart'
import Widget from '../Widget'
import styles from './PrActivityWidget.module.css'

interface PrActivityWidgetProps {
  onOpenSettings: () => void
}

// Widget 3: pull requests opened, merged and closed over time. Reads only the dashboard context.
function PrActivityWidget({ onOpenSettings }: PrActivityWidgetProps) {
  const { status, selection, period, prActivity } = useDashboard()
  const scope = selection === 'all' ? 'All repositories' : selection
  const hint = `Pull request activity · ${scope} · last ${period} days`

  let body = null
  if (status === 'loading') {
    body = <p className={styles.muted}>Loading…</p>
  } else if (status === 'ready') {
    const activity = prActivity()
    body = activity.hasData ? (
      <PrActivityChart buckets={activity.buckets} unit={period === 7 ? 'day' : 'week'} />
    ) : (
      <div className={styles.empty}>
        <p className={styles.muted}>No data yet. Sync a linked repository to see pull request activity.</p>
        <button type="button" className={styles.button} onClick={onOpenSettings}>
          Open settings
        </button>
      </div>
    )
  }

  return (
    <Widget title="PRs opened, merged and closed" hint={hint}>
      {body}
    </Widget>
  )
}

export default PrActivityWidget
