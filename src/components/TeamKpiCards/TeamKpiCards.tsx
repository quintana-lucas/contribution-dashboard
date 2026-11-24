import { combineComparisons, metricOf, trendView } from '../../api/trendView'
import { useDashboard } from '../DashboardProvider'
import LinesDelta from '../LinesDelta'
import Skeleton from '../Skeleton'
import StatCard from '../StatCard'
import TrendIndicator from '../TrendIndicator'
import styles from './TeamKpiCards.module.css'

const fmt = new Intl.NumberFormat('en-US')
const LABELS = ['Merged PRs', 'Code reviews', 'Lines changed (+/−)'] as const

// Team-total stat cards with period-over-period trends (#123). Reads only the dashboard context.
function TeamKpiCards() {
  const { status, selection, period, kpis, comparison, teamChosen, teamMembers } = useDashboard()
  if (status === 'error' || !teamChosen || teamMembers.length === 0) return null
  const scope = selection === 'all' ? 'All repositories' : selection
  const label = `Team key figures, ${scope}, last ${period} days`

  let cards
  if (status === 'loading') {
    cards = LABELS.map((l) => (
      <StatCard
        key={l}
        label={l}
        value={<Skeleton width="50%" height="calc(var(--text-xl) * var(--text-xl-line))" />}
        subline={<Skeleton width="80%" />}
        trend={<TrendIndicator loading />}
      />
    ))
  } else {
    const k = kpis()
    if (!k.hasData) {
      cards = LABELS.map((l) => <StatCard key={l} label={l} value="No data yet" compact />)
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
          key="merged"
          label="Merged PRs"
          value={fmt.format(k.mergedPrs)}
          subline={`${fmt.format(k.closedWithoutMerge)} closed without merge`}
          trend={<TrendIndicator view={trendView(metricOf(cmp, 'mergedPrs'), period)} />}
        />,
        <StatCard
          key="reviews"
          label="Code reviews"
          value={fmt.format(k.reviews)}
          subline={percent}
          trend={<TrendIndicator view={trendView(metricOf(cmp, 'reviews'), period)} />}
        />,
        <StatCard
          key="lines"
          label="Lines changed (+/−)"
          value={<LinesDelta additions={k.additions} deletions={k.deletions} layout="inline" />}
          subline={`across ${fmt.format(k.prsOpened)} PR${k.prsOpened === 1 ? '' : 's'} opened`}
          trend={<TrendIndicator view={trendView(churn, period)} />}
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

export default TeamKpiCards
