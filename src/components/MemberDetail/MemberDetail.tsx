import { useEffect, useId, useRef } from 'react'
import { formatDuration, formatSize } from '../../api/reviewMetrics'
import { combineComparisons, metricOf, trendView } from '../../api/trendView'
import BarList from '../BarList'
import ColumnChart from '../ColumnChart'
import { useDashboard } from '../DashboardProvider'
import LinesDelta from '../LinesDelta'
import PrLink from '../PrLink'
import PrStateBadge from '../PrStateBadge'
import Skeleton from '../Skeleton'
import StatCard from '../StatCard'
import TrendIndicator from '../TrendIndicator'
import { dayLabel, formatFull, formatWhen, weekLabel } from './formatWhen'
import styles from './MemberDetail.module.css'

interface MemberDetailProps {
  /** Injected clock, for the "when" text. */
  now: () => Date
}

const LABELS = [
  'PRs merged',
  'Reviews given',
  'Reviews received',
  'Median time to first review',
  'Average PR size',
  'Median cycle time',
  'Lines changed (+/−)',
]

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

// Detail of the member picked in the Team table. Reads only the dashboard context: no fetch.
function MemberDetail({ now }: MemberDetailProps) {
  const {
    status,
    teamChosen,
    teamMembers,
    selectedMember,
    period,
    selection,
    memberDetail,
    memberComparison,
  } = useDashboard()
  const headingId = useId()
  const sectionRef = useRef<HTMLElement>(null)
  const detail = status === 'ready' && selectedMember !== null ? memberDetail() : null
  const login = detail?.login ?? null

  // Bring the panel into view only when it starts below the fold; never move focus.
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    if (el.getBoundingClientRect().top > window.innerHeight) el.scrollIntoView({ block: 'nearest' })
  }, [login])

  if (status === 'loading') {
    return (
      <section className={styles.panel} aria-busy="true">
        <header className={styles.header}>
          <div className={styles.headerText}>
            <Skeleton width={160} height={24} />
            <Skeleton width={200} />
          </div>
        </header>
        <div className={styles.tiles}>
          {Array.from({ length: LABELS.length }, (_, i) => (
            <StatCard
              key={i}
              label={LABELS[i]}
              value={<Skeleton width="50%" height="calc(var(--text-xl) * var(--text-xl-line))" />}
              trend={i < 2 || i === 6 ? <TrendIndicator loading /> : undefined}
            />
          ))}
        </div>
        <div className={styles.charts}>
          <div className={styles.block}>
            <Skeleton width={180} />
            <Skeleton shape="block" height={160} />
          </div>
          <div className={styles.block}>
            <Skeleton width={120} />
            <Skeleton shape="block" height={160} />
          </div>
        </div>
        <div className={styles.block}>
          <Skeleton width={180} />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} shape="block" height={44} />
          ))}
        </div>
      </section>
    )
  }
  if (status !== 'ready' || !teamChosen || teamMembers.length === 0) return null
  if (selectedMember === null) {
    return <p className={styles.hint}>Select a member to see their detail.</p>
  }
  const selectedLower = selectedMember.toLowerCase()
  if (!detail || !teamMembers.some((m) => m.toLowerCase() === selectedLower)) return null

  const nowDate = now()
  const cmp = memberComparison()
  const mergedTrend = trendView(cmp ? metricOf(cmp, 'mergedPrs') : undefined, period)
  const reviewsTrend = trendView(cmp ? metricOf(cmp, 'reviews') : undefined, period)
  const additions = cmp ? metricOf(cmp, 'additions') : undefined
  const deletions = cmp ? metricOf(cmp, 'deletions') : undefined
  const churn = additions && deletions ? combineComparisons(additions, deletions) : undefined
  const linesTrend = trendView(churn, period)
  const scope = selection === 'all' ? 'All repositories' : selection
  const weekly = period !== 7
  const unit = weekly ? 'week' : 'day'
  const totalMerged = detail.mergedBuckets.reduce((sum, b) => sum + b.count, 0)
  const bars = detail.mergedBuckets.map((b) => ({
    key: b.start.toISOString(),
    label: weekly ? weekLabel(b.start) : dayLabel(b.start),
    value: b.count,
  }))
  const busiest = bars.reduce((best, b) => (b.value > best.value ? b : best), bars[0])

  const { approved, changesRequested, commented } = detail.reviewOutcomes
  const totalReviews = approved + changesRequested + commented
  const outcomes = [
    { key: 'approved', label: 'Approved', value: approved, variant: 'solid' as const },
    { key: 'changes', label: 'Changes requested', value: changesRequested, variant: 'caution' as const },
    { key: 'commented', label: 'Commented', value: commented, variant: 'muted' as const },
  ].map((o) => ({ ...o, srText: `${o.label}: ${o.value} of ${totalReviews} reviews.` }))

  return (
    <section ref={sectionRef} className={styles.panel} aria-labelledby={headingId}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h2 id={headingId} className={styles.title}>
            {detail.login}
          </h2>
          <p className={styles.scope}>
            {scope} · last {period} days
          </p>
        </div>
        <a
          className={styles.link}
          href={`https://github.com/${encodeURIComponent(detail.login)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open profile of ${detail.login} on GitHub (opens in a new tab)`}
        >
          Open profile on GitHub
        </a>
      </header>

      <div className={styles.tiles}>
        <StatCard label="PRs merged" value={detail.merged} trend={<TrendIndicator view={mergedTrend} />} />
        <StatCard
          label="Reviews given"
          value={detail.reviewsGiven}
          trend={<TrendIndicator view={reviewsTrend} />}
        />
        <StatCard label="Reviews received" value={detail.reviewsReceived} />
        <StatCard label="Median time to first review" value={formatDuration(detail.medianFirstReviewMs)} />
        <StatCard label="Average PR size" value={formatSize(detail.avgPrSize)} />
        <StatCard label="Median cycle time" value={formatDuration(detail.medianCycleMs)} />
        <StatCard
          label="Lines changed (+/−)"
          value={
            additions && deletions ? (
              <LinesDelta additions={additions.current} deletions={deletions.current} layout="inline" />
            ) : (
              '—'
            )
          }
          trend={<TrendIndicator view={linesTrend} />}
        />
      </div>

      <div className={styles.charts}>
        <div className={styles.block}>
          <h3 className={styles.subtitle}>PRs merged per {unit}</h3>
          <p className={styles.hint}>
            {weekly
              ? `Last ${period} days. Weeks with no merges count as 0.`
              : `Last ${period} days. Days with no merges count as 0.`}
          </p>
          {totalMerged === 0 ? (
            <p className={styles.empty}>No pull requests merged by {detail.login} in this period.</p>
          ) : (
            <ColumnChart
              bars={bars}
              labelEvery={period === 90 ? 2 : 1}
              description={`${totalMerged} ${plural(totalMerged, 'pull request', 'pull requests')} merged over ${bars.length} ${unit}s. Busiest: ${busiest.label}, ${busiest.value}.`}
              tableCaption={`PRs merged per ${unit} by ${detail.login}`}
              labelHeader={weekly ? 'Week of' : 'Day'}
              valueHeader="PRs merged"
            />
          )}
        </div>

        <div className={styles.block}>
          <h3 className={styles.subtitle}>Reviews given</h3>
          {totalReviews === 0 ? (
            <p className={styles.empty}>{detail.login} has not given any reviews in this period.</p>
          ) : (
            <BarList label="Reviews given by outcome" items={outcomes} valueLabel="Reviews" />
          )}
        </div>
      </div>

      <div className={styles.block}>
        <h3 className={styles.subtitle}>Recent pull requests</h3>
        <p className={styles.hint}>Newest first, up to 10 authored by {detail.login}.</p>
        {detail.recentPrs.length === 0 ? (
          <p className={styles.empty}>{detail.login} has no pull requests in this period.</p>
        ) : (
          <>
            <ol className={styles.prList}>
              {detail.recentPrs.map((pr) => {
                const when = formatWhen(pr.date, nowDate)
                return (
                  <li key={`${pr.repo}#${pr.number}`} className={styles.pr}>
                    <span className={styles.prTop}>
                      <PrStateBadge state={pr.state} draft={pr.draft} />
                      <span className={styles.prTitle}>
                        <PrLink repo={pr.repo} number={pr.number}>
                          <span className={styles.prTitleText} title={pr.title}>
                            {pr.title}
                          </span>
                        </PrLink>
                      </span>
                    </span>
                    <span className={styles.prMeta}>
                      {pr.repo} ·{' '}
                      <LinesDelta additions={pr.additions} deletions={pr.deletions} layout="inline" /> ·{' '}
                      <time dateTime={pr.date} title={formatFull(pr.date)}>
                        {when}
                      </time>
                    </span>
                  </li>
                )
              })}
            </ol>
            {detail.recentTotal > detail.recentPrs.length ? (
              <p className={styles.hint}>
                Showing the {detail.recentPrs.length} most recent of {detail.recentTotal}.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

export default MemberDetail
