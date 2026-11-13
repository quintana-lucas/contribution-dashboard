import { createContext, useContext } from 'react'
import type { Contributions } from '../../api/contributions'
import type { Activity, Period, RepoEntry, RepoSelection } from '../../api/dashboard'
import type { Kpis } from '../../api/kpis'
import type { TeamStatsRow } from '../../api/teamStats'

export type DashboardStatus = 'loading' | 'error' | 'ready'

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
  /** Overview KPI figures for the current selection, period and team. */
  kpis: () => Kpis
  /** Selected team logins in their original casing; [] while the team is not chosen. */
  teamMembers: string[]
  /** One row per team member for the current selection and period (unsorted). */
  teamStats: () => TeamStatsRow[]
  /** The member picked in the Team table (in memory only), or null. */
  selectedMember: string | null
  setSelectedMember: (login: string | null) => void
}

export const DashboardContext = createContext<DashboardValue | null>(null)

/** The single shared read interface for the widgets. */
export function useDashboard(): DashboardValue {
  const value = useContext(DashboardContext)
  if (!value) throw new Error('useDashboard must be used inside DashboardProvider')
  return value
}
