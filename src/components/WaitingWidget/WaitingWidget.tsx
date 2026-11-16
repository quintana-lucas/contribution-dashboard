import type { WaitingPr } from '../../api/waiting'
import { useDashboard } from '../DashboardProvider'
import Widget from '../Widget'
import styles from './WaitingWidget.module.css'

interface WaitingWidgetProps {
  onOpenSettings: () => void
}

function formatAge(hours: number): string {
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`
}

function Row({ pr }: { pr: WaitingPr }) {
  const reviewers =
    pr.requestedReviewers.length === 0 ? 'none requested' : pr.requestedReviewers.join(', ')
  return (
    <li className={pr.overdue ? `${styles.item} ${styles.overdueItem}` : styles.item}>
      <p className={styles.title}>
        {pr.title} #{pr.number}
      </p>
      <p className={styles.meta}>
        {pr.repo} · by {pr.author} · +{pr.additions} / -{pr.deletions}
      </p>
      <p className={styles.meta}>
        Reviewers: {reviewers} · Waiting {formatAge(pr.ageHours)}
        {pr.overdue ? <span className={styles.overdue}>Overdue</span> : null}
      </p>
    </li>
  )
}

// Widget 4: open pull requests with no review yet. Reads only the dashboard context (local data).
function WaitingWidget({ onOpenSettings }: WaitingWidgetProps) {
  const { status, entries, selection, waiting } = useDashboard()
  const scope = selection === 'all' ? 'All repositories' : selection
  const hint = `Pull requests waiting for review · ${scope}`

  let body = null
  if (status === 'loading') {
    body = <p className={styles.muted}>Loading…</p>
  } else if (status === 'ready') {
    const inScope = selection === 'all' ? entries : entries.filter((e) => e.repo === selection)
    if (!inScope.some((e) => e.data !== null)) {
      body = (
        <div className={styles.empty}>
          <p className={styles.muted}>No data yet. Sync a linked repository to see pull requests.</p>
          <button type="button" className={styles.button} onClick={onOpenSettings}>
            Open settings
          </button>
        </div>
      )
    } else {
      const rows = waiting()
      body =
        rows.length === 0 ? (
          <p className={styles.muted}>Nothing is waiting for review in this repository.</p>
        ) : (
          <ul className={styles.list} aria-label="Pull requests waiting for review">
            {rows.map((pr) => (
              <Row key={`${pr.repo}#${pr.number}`} pr={pr} />
            ))}
          </ul>
        )
    }
  }

  return (
    <Widget title="Widget 4" hint={hint}>
      {body}
    </Widget>
  )
}

export default WaitingWidget
