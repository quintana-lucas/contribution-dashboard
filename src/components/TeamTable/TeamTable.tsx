import { useCallback, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { NOT_AVAILABLE, formatDuration, formatSizeNumber } from '../../api/reviewMetrics'
import type { TeamStatsRow } from '../../api/teamStats'
import { useDashboard } from '../DashboardProvider'
import LinesDelta from '../LinesDelta'
import Skeleton from '../Skeleton'
import styles from './TeamTable.module.css'

interface TeamTableProps {
  onChooseTeam: () => void
}

type SortKey =
  | 'login'
  | 'opened'
  | 'merged'
  | 'closed'
  | 'open'
  | 'reviewsGiven'
  | 'reviewsReceived'
  | 'lines'
  | 'avgPrSize'
  | 'medianFirstReviewMs'
type SortDir = 'asc' | 'desc'

interface Column {
  key: SortKey
  label: string
  /** Unit shown muted in the header, so cells hold only the bare number. */
  unit?: string
  numeric: boolean
  /** Raw value used for sorting and for the n/a check; null means missing. */
  value: (r: TeamStatsRow) => number | null
  /** Cell text for a present value (bare number, no unit). */
  format: (v: number, r: TeamStatsRow) => string
  /** Optional rich cell renderer; replaces `format` for the cell content. */
  render?: (v: number, r: TeamStatsRow) => ReactNode
}

type CountKey = 'opened' | 'merged' | 'closed' | 'open' | 'reviewsGiven' | 'reviewsReceived'

const count = (key: CountKey) => ({
  value: (r: TeamStatsRow) => r[key],
  format: (v: number) => String(v),
})

const COLUMNS: Column[] = [
  { key: 'login', label: 'Member', numeric: false, value: () => 0, format: () => '' },
  { key: 'opened', label: 'Opened', numeric: true, ...count('opened') },
  { key: 'merged', label: 'Merged', numeric: true, ...count('merged') },
  { key: 'closed', label: 'Closed', numeric: true, ...count('closed') },
  { key: 'open', label: 'Open', numeric: true, ...count('open') },
  { key: 'reviewsGiven', label: 'Reviews given', numeric: true, ...count('reviewsGiven') },
  { key: 'reviewsReceived', label: 'Reviews received', numeric: true, ...count('reviewsReceived') },
  {
    key: 'lines',
    label: 'Lines (+/−)',
    numeric: true,
    value: (r) => r.additions + r.deletions,
    format: (_v, r) => `+${r.additions} −${r.deletions}`,
    render: (_v, r) => <LinesDelta additions={r.additions} deletions={r.deletions} layout="columns" />,
  },
  {
    key: 'avgPrSize',
    label: 'PR size',
    unit: 'lines',
    numeric: true,
    value: (r) => r.avgPrSize,
    format: (v) => formatSizeNumber(v),
  },
  {
    // Documented deviation from AC7: durations mix min, h and days, so each cell keeps its unit
    // and the header has none.
    key: 'medianFirstReviewMs',
    label: '1st review',
    numeric: true,
    value: (r) => r.medianFirstReviewMs,
    format: (v) => formatDuration(v),
  },
]

/** Body rows in the loading skeleton (plus one header row). */
const SKELETON_ROWS = 5

function sortValue(row: TeamStatsRow, key: SortKey): number | null {
  const col = COLUMNS.find((c) => c.key === key)
  return col ? col.value(row) : null
}

function compareLogin(a: TeamStatsRow, b: TeamStatsRow): number {
  return a.login.localeCompare(b.login, undefined, { sensitivity: 'base' })
}

function sortRows(rows: TeamStatsRow[], key: SortKey, dir: SortDir): TeamStatsRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (key === 'login') return sign * compareLogin(a, b)
    const va = sortValue(a, key)
    const vb = sortValue(b, key)
    // "n/a" rows go last in either direction.
    if (va === null || vb === null) {
      if (va === vb) return compareLogin(a, b)
      return va === null ? 1 : -1
    }
    const diff = va - vb
    return diff !== 0 ? sign * diff : compareLogin(a, b)
  })
}

// Team tab: one row per team member with sortable columns. Reads only the dashboard context.
function TeamTable({ onChooseTeam }: TeamTableProps) {
  const {
    status,
    selection,
    period,
    teamChosen,
    teamMembers,
    teamStats,
    selectedMember,
    setSelectedMember,
  } = useDashboard()
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'merged', dir: 'desc' })
  const [announcement, setAnnouncement] = useState('')
  // True when columns are scrolled beneath the sticky Member column (drives the edge shadow).
  const [scrolled, setScrolled] = useState(false)
  const scrollRef = useCallback((el: HTMLDivElement | null) => {
    if (el) setScrolled(el.scrollLeft > 0)
  }, [])

  if (status === 'loading') {
    return (
      <div className={styles.wrap} aria-busy="true">
        <Skeleton width={220} />
        <div className={styles.skeletonTable}>
          {Array.from({ length: SKELETON_ROWS + 1 }, (_, i) => (
            <div key={i} className={styles.skeletonRow}>
              <Skeleton width={96} />
              <Skeleton width="60%" />
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (status === 'error' || !teamChosen) return null

  if (teamMembers.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.muted}>
          No team members selected. Choose the people to follow to see them here.
        </p>
        <button type="button" className={styles.button} onClick={onChooseTeam}>
          Choose team members
        </button>
      </div>
    )
  }

  const scope = selection === 'all' ? 'All repositories' : selection
  const rows = sortRows(teamStats(), sort.key, sort.dir)

  function onSort(key: SortKey, label: string) {
    const dir: SortDir = sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc'
    setSort({ key, dir })
    setAnnouncement(`Sorted by ${label}, ${dir === 'asc' ? 'ascending' : 'descending'}.`)
  }

  function select(login: string) {
    setSelectedMember(login)
    setAnnouncement(`Selected ${login}. Detail shown below the table.`)
  }

  function onRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, login: string) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      select(login)
    }
  }

  const selectedLower = selectedMember?.toLowerCase() ?? null

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>
        Per member · {scope} · last {period} days
      </p>
      <div
        ref={scrollRef}
        className={styles.scroll}
        role="region"
        tabIndex={0}
        aria-label="Team table, scrollable"
        data-scrolled={scrolled ? 'true' : undefined}
        onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 0)}
      >
        <table className={styles.table}>
          <caption className={styles.srOnly}>
            Team activity per member. Select a member to show their detail below the table.
          </caption>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key
                const arrow = (
                  <span className={styles.arrow} aria-hidden="true">
                    {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                )
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={`${c.numeric ? styles.num : styles.memberCol} ${styles.headCell}`}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    <button
                      type="button"
                      className={styles.sortButton}
                      aria-label={`Sort by ${c.label}`}
                      onClick={() => onSort(c.key, c.label)}
                    >
                      {/* Fixed-width arrow slot: left of the label for numeric columns so the
                          label's right edge matches the digits; after it for Member. */}
                      {c.numeric && arrow}
                      <span className={styles.label}>
                        {c.label}
                        {c.unit && (
                          <>
                            {' '}
                            <span className={styles.unit}>({c.unit})</span>
                          </>
                        )}
                      </span>
                      {!c.numeric && arrow}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelected = selectedLower === r.login.toLowerCase()
              return (
                <tr
                  key={r.login.toLowerCase()}
                  tabIndex={0}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`${styles.row} ${isSelected ? styles.selected : ''}`}
                  onClick={() => select(r.login)}
                  onKeyDown={(e) => onRowKeyDown(e, r.login)}
                >
                  <th scope="row" className={`${styles.memberCol} ${styles.login}`}>
                    {r.login}
                  </th>
                  {COLUMNS.slice(1).map((c) => {
                    const v = c.value(r)
                    return v === null ? (
                      <td key={c.key} className={`${styles.num} ${styles.na}`}>
                        {NOT_AVAILABLE}
                      </td>
                    ) : (
                      <td key={c.key} className={styles.num}>
                        {c.render ? c.render(v, r) : c.format(v, r)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}

export default TeamTable
