import { createContext, useContext } from 'react'
import type { Activity, Period, RepoEntry, RepoSelection } from '../../api/dashboard'

export type DashboardStatus = 'loading' | 'error' | 'ready'

export interface DashboardValue {
  status: DashboardStatus
  entries: RepoEntry[]
  selection: RepoSelection
  setSelection: (selection: RepoSelection) => void
  period: Period
  setPeriod: (period: Period) => void
  /** In-period activity for the current selection and period. */
  selectActivity: () => Activity
  subline: string
}

export const DashboardContext = createContext<DashboardValue | null>(null)

/** The single shared read interface for the widgets. */
export function useDashboard(): DashboardValue {
  const value = useContext(DashboardContext)
  if (!value) throw new Error('useDashboard must be used inside DashboardProvider')
  return value
}
