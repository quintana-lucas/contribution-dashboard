import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getRepoData as defaultGetRepoData, listRepos as defaultListRepos } from '../../api/client'
import {
  selectActivity as selectActivityPure,
  toolbarSubline,
} from '../../api/dashboard'
import type { Period, RepoEntry, RepoSelection } from '../../api/dashboard'
import { DashboardContext } from './context'
import type { DashboardStatus, DashboardValue } from './context'

export interface DashboardDeps {
  listRepos?: typeof defaultListRepos
  getRepoData?: typeof defaultGetRepoData
  now?: () => Date
}

interface Loaded {
  status: DashboardStatus
  entries: RepoEntry[]
}

export default function DashboardProvider({
  children,
  listRepos = defaultListRepos,
  getRepoData = defaultGetRepoData,
  now = () => new Date(),
}: DashboardDeps & { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading', entries: [] })
  const [selection, setSelection] = useState<RepoSelection>('all')
  const [period, setPeriod] = useState<Period>(30)

  // Loads once on mount; selection and period changes never refetch.
  useEffect(() => {
    let cancelled = false
    async function load() {
      const list = await listRepos()
      if (!list.ok) return { status: 'error' as const, entries: [] }
      const entries: RepoEntry[] = []
      for (const linked of list.repos) {
        if (linked.syncedAt === null) {
          entries.push({ repo: linked.repo, syncedAt: null, data: null })
          continue
        }
        const result = await getRepoData(linked.repo)
        if (result.ok) {
          entries.push({ repo: linked.repo, syncedAt: linked.syncedAt, data: result.data })
        } else if (result.error === 'not_synced') {
          entries.push({ repo: linked.repo, syncedAt: null, data: null })
        } else {
          return { status: 'error' as const, entries: [] }
        }
      }
      return { status: 'ready' as const, entries }
    }
    load().then((result) => {
      if (!cancelled) setLoaded(result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { status, entries } = loaded
  const nowDate = now()
  const value = useMemo<DashboardValue>(
    () => ({
      status,
      entries,
      selection,
      setSelection,
      period,
      setPeriod,
      selectActivity: () => selectActivityPure(entries, selection, period, nowDate),
      subline: toolbarSubline(entries, selection, period, nowDate),
    }),
    // nowDate changes every render; recompute on state changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, entries, selection, period],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}
