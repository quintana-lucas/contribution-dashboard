import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { TeamStatsRow } from '../../api/teamStats'
import { useDashboard } from '../DashboardProvider'
import styles from './TeamTable.module.css'

interface TeamTableProps {
  onChooseTeam: () => void
}

type SortKey = 'login' | 'opened' | 'merged' | 'closed' | 'open' | 'reviewsGiven' | 'reviewsReceived' | 'lines'
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'login', label: 'Member', numeric: false },
  { key: 'opened', label: 'Opened', numeric: true },
  { key: 'merged', label: 'Merged', numeric: true },
  { key: 'closed', label: 'Closed', numeric: true },
  { key: 'open', label: 'Open', numeric: true },
  { key: 'reviewsGiven', label: 'Reviews given', numeric: true },
  { key: 'reviewsReceived', label: 'Reviews received', numeric: true },
  { key: 'lines', label: 'Lines (+/−)', numeric: true },
]

function sortValue(row: TeamStatsRow, key: SortKey): number {
  if (key === 'lines') return row.additions + row.deletions
  if (key === 'login') return 0
  return row[key]
}

function compareLogin(a: TeamStatsRow, b: TeamStatsRow): number {
  return a.login.localeCompare(b.login, undefined, { sensitivity: 'base' })
}

function sortRows(rows: TeamStatsRow[], key: SortKey, dir: SortDir): TeamStatsRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    if (key === 'login') return sign * compareLogin(a, b)
    const diff = sortValue(a, key) - sortValue(b, key)
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

  if (status === 'loading') {
    return <p className={styles.muted}>Loading team data…</p>
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
    setAnnouncement(`Selected ${login}.`)
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
      <div className={styles.scroll} role="region" tabIndex={0} aria-label="Team table, scrollable">
        <table className={styles.table}>
          <caption className={styles.srOnly}>Team activity per member</caption>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key
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
                      <span>{c.label}</span>
                      <span className={styles.arrow} aria-hidden="true">
                        {active ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                      </span>
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
                  aria-label={`${r.login}: select member`}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`${styles.row} ${isSelected ? styles.selected : ''}`}
                  onClick={() => select(r.login)}
                  onKeyDown={(e) => onRowKeyDown(e, r.login)}
                >
                  <th scope="row" className={`${styles.memberCol} ${styles.login}`}>
                    {r.login}
                  </th>
                  <td className={styles.num}>{r.opened}</td>
                  <td className={styles.num}>{r.merged}</td>
                  <td className={styles.num}>{r.closed}</td>
                  <td className={styles.num}>{r.open}</td>
                  <td className={styles.num}>{r.reviewsGiven}</td>
                  <td className={styles.num}>{r.reviewsReceived}</td>
                  <td className={styles.num}>
                    +{r.additions} {'−'}
                    {r.deletions}
                  </td>
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
