import { createContext, useContext } from 'react'
import type { StartSyncError, SyncRunState } from '../../api/client'
import type { Contributions } from '../../api/contributions'
import type { Activity, Period, RepoEntry, RepoSelection } from '../../api/dashboard'
import type { KpiComparison, MetricComparison } from '../../api/kpiComparison'
import type { Kpis } from '../../api/kpis'
import type { MemberDetail } from '../../api/memberDetail'
import type { PrActivity } from '../../api/prActivity'
import type { ReviewsGiven } from '../../api/reviews'
import type { TeamStatsRow } from '../../api/teamStats'
import type { WaitingPr } from '../../api/waiting'

export type DashboardStatus = 'loading' | 'error' | 'ready'

/**
 * The all-repos sync (#65) as the UI sees it. `null` is idle: nothing to show.
 * `finished` and `error` stay until dismissed or the next run starts.
 */
export type SyncUiState =
  | null
  | { status: 'running'; run: SyncRunState }
  | { status: 'finished'; run: SyncRunState }
  | { status: 'error'; error: StartSyncError; message?: string }

export interface DashboardValue {
  status: DashboardStatus
  entries: RepoEntry[]
  selection: RepoSelection
  setSelection: (selection: RepoSelection) => void
  period: Period
  setPeriod: (period: Period) => void
  /** Sets status loading and re-runs the load; keeps the selection if its repo still exists. */
  reload: () => void
  /** False until the user has chosen the team (first setup); then only selected logins count. */
  teamChosen: boolean
  /** In-period activity for the current selection and period. */
  selectActivity: () => Activity
  subline: string
  /** Merged pull requests per person for the current selection, period and team. */
  contributions: () => Contributions
  /** Reviews given per person for the current selection, period and team. */
  reviewsGiven: () => ReviewsGiven[]
  /** Open pull requests with no review yet for the current selection and team (any age). */
  waiting: () => WaitingPr[]
  /** Pull request activity (opened, merged, closed) per bucket for the current selection, period and team. */
  prActivity: () => PrActivity
  /** Overview KPI figures for the current selection, period and team. */
  kpis: () => Kpis
  /** Period-over-period comparison of the period-based KPIs for the current selection, period and team. */
  comparison: () => KpiComparison
  /** Selected team logins in their original casing; [] while the team is not chosen. */
  teamMembers: string[]
  /** One row per team member for the current selection and period (unsorted). */
  teamStats: () => TeamStatsRow[]
  /** Detail of the selected member for the current selection and period; null when none is selected. */
  memberDetail: () => MemberDetail | null
  /** Period-over-period comparison for the selected member (#134); null when none is selected. */
  memberComparison: () => KpiComparison | null
  /** Average PR size comparison for the selected member (#137); null when none selected or no comparison. */
  memberAvgPrSizeComparison: () => MetricComparison | null
  /** The member picked in the Team table (in memory only), or null. */
  selectedMember: string | null
  setSelectedMember: (login: string | null) => void
  /** All-repos sync state; null when idle. */
  syncState: SyncUiState
  /** True while a sync run is in progress (also reflects a run started before the page loaded). */
  syncRunning: boolean
  /** Starts the all-repos sync; a call while one is running or starting does nothing. */
  startSync: () => void
  /** Clears a finished or failed sync result. */
  dismissSync: () => void
}

export const DashboardContext = createContext<DashboardValue | null>(null)

/** The single shared read interface for the widgets. */
export function useDashboard(): DashboardValue {
  const value = useContext(DashboardContext)
  if (!value) throw new Error('useDashboard must be used inside DashboardProvider')
  return value
}
