import { useEffect, useId, useRef } from 'react'
import type { RecentPr } from '../../api/memberDetail'
import BarList from '../BarList'
import ColumnChart from '../ColumnChart'
import { useDashboard } from '../DashboardProvider'
import { dayLabel, formatFull, formatWhen, weekLabel } from './formatWhen'
import styles from './MemberDetail.module.css'

interface MemberDetailProps {
  /** Injected clock, for the "when" text. */
  now: () => Date
}

const STATE_LABEL: Record<RecentPr['state'], string> = {
  merged: 'Merged',
  open: 'Open',
  closed: 'Closed',
}

const STATE_CLASS: Record<RecentPr['state'], string> = {
  merged: styles.badgeMerged,
  open: styles.badgeOpen,
  closed: styles.badgeClosed,
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

// Detail of the member picked in the Team table. Reads only the dashboard context: no fetch.
function MemberDetail({ now }: MemberDetailProps) {
  const { status, teamChosen, teamMembers, selectedMember, period, selection, memberDetail } =
    useDashboard()
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

  if (status !== 'ready' || !teamChosen || teamMembers.length === 0) return null
  if (selectedMember === null) {
    return <p className={styles.hint}>Select a member to see their detail.</p>
  }
  const selectedLower = selectedMember.toLowerCase()
  if (!detail || !teamMembers.some((m) => m.toLowerCase() === selectedLower)) return null

  const nowDate = now()
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
    { key: 'changes', label: 'Changes requested', value: changesRequested, variant: 'muted' as const },
    { key: 'commented', label: 'Commented', value: commented, variant: 'hatched' as const },
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
        <div className={styles.tile}>
          <span className={styles.number}>{detail.merged}</span>
          <span className={styles.label}>PRs merged</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.number}>{detail.reviewsGiven}</span>
          <span className={styles.label}>Reviews given</span>
        </div>
        <div className={styles.tile}>
          <span className={styles.number}>{detail.reviewsReceived}</span>
          <span className={styles.label}>Reviews received</span>
        </div>
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
            <BarList label="Reviews given by outcome" items={outcomes} />
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
                    <span className={styles.srOnly}>
                      {`${STATE_LABEL[pr.state]} pull request #${pr.number} in ${pr.repo}: ${pr.title}. ${pr.additions} lines added, ${pr.deletions} removed, ${when}.`}
                    </span>
                    <span className={styles.prTop} aria-hidden="true">
                      <span className={`${styles.badge} ${STATE_CLASS[pr.state]}`}>
                        {STATE_LABEL[pr.state]}
                      </span>
                      <span className={styles.prTitle} title={pr.title}>
                        {pr.title}
                      </span>
                    </span>
                    <span className={styles.prMeta} aria-hidden="true">
                      {pr.repo} · +{pr.additions} {'−'}
                      {pr.deletions} ·{' '}
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
