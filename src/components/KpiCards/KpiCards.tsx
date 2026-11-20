import { formatDuration } from '../../api/reviewMetrics'
import { useDashboard } from '../DashboardProvider'
import LinesDelta from '../LinesDelta'
import StatCard from '../StatCard'
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

// Overview KPI cards. Reads only the dashboard context (local data); no requests of its own.
function KpiCards() {
  const { status, selection, period, kpis } = useDashboard()
  if (status === 'error') return null
  const scope = selection === 'all' ? 'All repositories' : selection
  const label = `Key figures, ${scope}, last ${period} days`

  let cards
  if (status === 'loading') {
    cards = [
      <StatCard key="open" label="Open PRs" value="…" />,
      <StatCard key="merged" label="Merged PRs" value="…" />,
      <StatCard key="reviews" label="Code reviews" value="…" />,
      <StatCard key="lines" label="Lines changed (+/−)" value="…" />,
      <StatCard key="first-review" label="Time to first review" value="…" />,
      <StatCard key="cycle" label="Cycle time" value="…" />,
    ]
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
      cards = [
        <StatCard
          key="open"
          label="Open PRs"
          value={fmt.format(k.openPrs)}
          subline={`${fmt.format(k.waitingOver24h)} waiting for review over 24 h`}
        />,
        <StatCard
          key="merged"
          label="Merged PRs"
          value={fmt.format(k.mergedPrs)}
          subline={`${fmt.format(k.closedWithoutMerge)} closed without merge`}
        />,
        <StatCard key="reviews" label="Code reviews" value={fmt.format(k.reviews)} subline={percent} />,
        <StatCard
          key="lines"
          label="Lines changed (+/−)"
          value={<LinesDelta additions={k.additions} deletions={k.deletions} layout="inline" />}
          subline={`across ${fmt.format(k.prsOpened)} PR${k.prsOpened === 1 ? '' : 's'} opened`}
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
