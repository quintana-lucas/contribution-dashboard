import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  getRepoData as defaultGetRepoData,
  listRepos as defaultListRepos,
} from '../../api/client'
import type {
  addRepo as AddRepo,
  getTokenStatus as GetTokenStatus,
  removeRepo as RemoveRepo,
  syncRepo as SyncRepo,
} from '../../api/client'
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
  // Settings deps: unused by the provider, forwarded by App to SettingsDialog.
  addRepo?: typeof AddRepo
  removeRepo?: typeof RemoveRepo
  syncRepo?: typeof SyncRepo
  getTokenStatus?: typeof GetTokenStatus
}

interface Loaded {
  status: DashboardStatus
  entries: RepoEntry[]
}

// No DashboardProvider.module.css: this component renders no DOM of its own.
export default function DashboardProvider({
  children,
  listRepos = defaultListRepos,
  getRepoData = defaultGetRepoData,
  now = () => new Date(),
}: DashboardDeps & { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading', entries: [] })
  const [selection, setSelection] = useState<RepoSelection>('all')
  const [period, setPeriod] = useState<Period>(30)

  const latest = useRef({ listRepos, getRepoData })
  useEffect(() => {
    latest.current = { listRepos, getRepoData }
  })
  const live = useRef(true)
  // Only the latest load may apply its result.
  const loadId = useRef(0)

  const runLoad = useCallback(async () => {
    const id = ++loadId.current
    const { listRepos: list, getRepoData: get } = latest.current
    async function load(): Promise<Loaded> {
      const res = await list()
      if (!res.ok) return { status: 'error', entries: [] }
      const entries: RepoEntry[] = []
      for (const linked of res.repos) {
        if (linked.syncedAt === null) {
          entries.push({ repo: linked.repo, syncedAt: null, data: null })
          continue
        }
        const result = await get(linked.repo)
        if (result.ok) {
          entries.push({ repo: linked.repo, syncedAt: linked.syncedAt, data: result.data })
        } else if (result.error === 'not_synced') {
          entries.push({ repo: linked.repo, syncedAt: null, data: null })
        } else {
          return { status: 'error', entries: [] }
        }
      }
      return { status: 'ready', entries }
    }
    const result = await load()
    if (!live.current || id !== loadId.current) return
    setLoaded(result)
    // Keep the selection while its repo still exists; otherwise go back to all.
    setSelection((sel) =>
      sel === 'all' || result.entries.some((e) => e.repo === sel) ? sel : 'all',
    )
  }, [])

  // Loads on mount; selection and period changes never refetch.
  useEffect(() => {
    live.current = true
    void runLoad()
    return () => {
      live.current = false
    }
  }, [runLoad])

  const reload = useCallback(() => {
    setLoaded((prev) => ({ status: 'loading', entries: prev.entries }))
    void runLoad()
  }, [runLoad])

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
      reload,
      selectActivity: () => selectActivityPure(entries, selection, period, nowDate),
      subline: toolbarSubline(entries, selection, period, nowDate),
    }),
    // nowDate changes every render; recompute on state changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, entries, selection, period, reload],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}
