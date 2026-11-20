import { OVERDUE_HOURS, type WaitingPr } from '../../api/waiting'
import { useDashboard } from '../DashboardProvider'
import PrLink from '../PrLink'
import Skeleton from '../Skeleton'
import WarningIcon from '../WarningIcon'
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
    <li className={styles.item}>
      <p className={styles.title}>
        <PrLink repo={pr.repo} number={pr.number}>
          <span className={styles.titleText}>{pr.title}</span>
        </PrLink>{' '}
        <span className={styles.number}>{pr.number}</span>
      </p>
      <p className={styles.meta}>
        {pr.repo} · by {pr.author} ·{' '}
        <span className={styles.lines}>
          +{pr.additions} / -{pr.deletions}
        </span>
      </p>
      <p className={styles.meta}>
        Reviewers: {reviewers} ·{' '}
        <span className={styles.age}>
          <span className={`${styles.ageLabel} ${pr.overdue ? styles.ageOverdue : ''}`.trim()}>Waiting</span>{' '}
          <span className={`${styles.ageValue} ${pr.overdue ? styles.ageOverdue : ''}`.trim()}>
            {formatAge(pr.ageHours)}
          </span>
        </span>
        {pr.overdue ? (
          <>
            {' '}
            <span className={styles.overdue}>
              <WarningIcon />
              Overdue
            </span>
          </>
        ) : null}
      </p>
    </li>
  )
}

// Widget 4: open pull requests with no review yet. Reads only the dashboard context (local data).
function WaitingWidget({ onOpenSettings }: WaitingWidgetProps) {
  const { status, entries, selection, waiting } = useDashboard()
  const scope = selection === 'all' ? 'All repositories' : selection
  const hint = `${scope} · overdue after ${OVERDUE_HOURS} h`

  let body = null
  if (status === 'loading') {
    body = (
      <div>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeletonItem}>
            <Skeleton width="70%" />
            <Skeleton width="55%" />
            <Skeleton width="45%" />
          </div>
        ))}
      </div>
    )
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
    <Widget title="Open PRs waiting for review" hint={hint} busy={status === 'loading'}>
      {body}
    </Widget>
  )
}

export default WaitingWidget
