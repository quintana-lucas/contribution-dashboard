import { formatDuration } from '../../api/reviewMetrics'
import { combineComparisons, metricOf, trendView } from '../../api/trendView'
import { useDashboard } from '../DashboardProvider'
import LinesDelta from '../LinesDelta'
import Skeleton from '../Skeleton'
import StatCard from '../StatCard'
import TrendIndicator from '../TrendIndicator'
import WarningIcon from '../WarningIcon'
import styles from './KpiCards.module.css'

const fmt = new Intl.NumberFormat('en-US')
const LABELS = [
  'Open PRs',
  'Merged PRs',
  'Code reviews',
  'Lines changed (+/−)',
  'Time to first review',
  'Cycle time',
] as const
// Cards that show a period-over-period trend (#87); the others are unchanged.
const TRENDED: ReadonlySet<string> = new Set(['Merged PRs', 'Code reviews', 'Lines changed (+/−)'])

// Overview KPI cards. Reads only the dashboard context (local data); no requests of its own.
function KpiCards() {
  const { status, selection, period, kpis, comparison } = useDashboard()
  if (status === 'error') return null
  const scope = selection === 'all' ? 'All repositories' : selection
  const label = `Key figures, ${scope}, last ${period} days`

  let cards
  if (status === 'loading') {
    // Same card structure as the loaded state (label, value, sub-line) so nothing shifts.
    cards = LABELS.map((l) => (
      <StatCard
        key={l}
        label={l}
        value={<Skeleton width="50%" height="calc(var(--text-xl) * var(--text-xl-line))" />}
        subline={<Skeleton width="80%" />}
        trend={TRENDED.has(l) ? <TrendIndicator loading /> : undefined}
      />
    ))
  } else {
    const k = kpis()
    if (!k.hasData) {
      cards = [...LABELS].map((l) => (
        <StatCard key={l} label={l} value="No data yet" compact />
      ))
    } else {
      const percent =
        k.changesRequestedPercent === null
          ? 'No reviews to measure'
          : `${k.changesRequestedPercent}% requested changes`
      const cmp = comparison()
      const additions = metricOf(cmp, 'additions')
      const deletions = metricOf(cmp, 'deletions')
      const churn = additions && deletions ? combineComparisons(additions, deletions) : undefined
      cards = [
        <StatCard
          key="open"
          label="Open PRs"
          value={fmt.format(k.openPrs)}
          subline={`${fmt.format(k.waitingOver24h)} waiting for review over 24 h`}
          sublineTone={k.waitingOver24h > 0 ? 'caution' : undefined}
          sublineIcon={k.waitingOver24h > 0 ? <WarningIcon /> : undefined}
        />,
        <StatCard
          key="merged"
          label="Merged PRs"
          value={fmt.format(k.mergedPrs)}
          subline={`${fmt.format(k.closedWithoutMerge)} closed without merge`}
          trend={<TrendIndicator view={trendView('mergedPrs', metricOf(cmp, 'mergedPrs'), period)} />}
        />,
        <StatCard
          key="reviews"
          label="Code reviews"
          value={fmt.format(k.reviews)}
          subline={percent}
          trend={<TrendIndicator view={trendView('reviews', metricOf(cmp, 'reviews'), period)} />}
        />,
        <StatCard
          key="lines"
          label="Lines changed (+/−)"
          value={<LinesDelta additions={k.additions} deletions={k.deletions} layout="inline" />}
          subline={`across ${fmt.format(k.prsOpened)} PR${k.prsOpened === 1 ? '' : 's'} opened`}
          trend={<TrendIndicator view={trendView('linesChanged', churn, period)} />}
        />,
        <StatCard
          key="first-review"
          label="Time to first review"
          value={formatDuration(k.medianFirstReviewMs)}
          subline="median, opened to first review"
          compact={k.medianFirstReviewMs === null}
        />,
        <StatCard
          key="cycle"
          label="Cycle time"
          value={formatDuration(k.medianCycleMs)}
          subline="median, opened to merged"
          compact={k.medianCycleMs === null}
        />,
      ]
    }
  }

  return (
    <section aria-label={label} aria-busy={status === 'loading'} className={styles.section}>
      <ul className={styles.list}>
        {cards.map((card) => (
          <li key={card.key} className={styles.item}>
            {card}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default KpiCards
