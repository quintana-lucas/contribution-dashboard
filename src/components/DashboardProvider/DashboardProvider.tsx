import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  getRepoData as defaultGetRepoData,
  getTeam as defaultGetTeam,
  listRepos as defaultListRepos,
} from '../../api/client'
import type {
  addRepo as AddRepo,
  getTokenStatus as GetTokenStatus,
  removeRepo as RemoveRepo,
  saveTeam as SaveTeam,
  syncRepo as SyncRepo,
} from '../../api/client'
import { contributionsPerPerson } from '../../api/contributions'
import {
  selectActivity as selectActivityPure,
  toolbarSubline,
} from '../../api/dashboard'
import type { Period, RepoEntry, RepoSelection } from '../../api/dashboard'
import { teamStats as teamStatsPure } from '../../api/teamStats'
import { DashboardContext } from './context'
import type { DashboardStatus, DashboardValue } from './context'

export interface DashboardDeps {
  listRepos?: typeof defaultListRepos
  getRepoData?: typeof defaultGetRepoData
  getTeam?: typeof defaultGetTeam
  now?: () => Date
  // Settings deps: unused by the provider, forwarded by App to SettingsDialog.
  addRepo?: typeof AddRepo
  removeRepo?: typeof RemoveRepo
  syncRepo?: typeof SyncRepo
  getTokenStatus?: typeof GetTokenStatus
  saveTeam?: typeof SaveTeam
}

interface Loaded {
  status: DashboardStatus
  entries: RepoEntry[]
  /** Lowercase selected logins, or null while the team has never been chosen. */
  team: ReadonlySet<string> | null
  /** Selected logins in original casing, deduplicated case-insensitively. */
  teamMembers: string[]
}

// No DashboardProvider.module.css: this component renders no DOM of its own.
export default function DashboardProvider({
  children,
  listRepos = defaultListRepos,
  getRepoData = defaultGetRepoData,
  getTeam = defaultGetTeam,
  now = () => new Date(),
}: DashboardDeps & { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading', entries: [], team: null, teamMembers: [] })
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [selection, setSelection] = useState<RepoSelection>('all')
  const [period, setPeriod] = useState<Period>(30)

  const latest = useRef({ listRepos, getRepoData, getTeam })
  useEffect(() => {
    latest.current = { listRepos, getRepoData, getTeam }
  })
  const live = useRef(true)
  // Only the latest load may apply its result.
  const loadId = useRef(0)

  const runLoad = useCallback(async () => {
    const id = ++loadId.current
    const { listRepos: list, getRepoData: get, getTeam: team } = latest.current
    const failed: Loaded = { status: 'error', entries: [], team: null, teamMembers: [] }
    async function load(): Promise<Loaded> {
      const [res, teamRes] = await Promise.all([list(), team()])
      if (!res.ok || !teamRes.ok) return failed
      const teamSet = teamRes.selected === null ? null : new Set(teamRes.selected.map((l) => l.toLowerCase()))
      const seen = new Set<string>()
      const teamMembers = (teamRes.selected ?? []).filter((l) => {
        const key = l.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
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
          return failed
        }
      }
      return { status: 'ready', entries, team: teamSet, teamMembers }
    }
    const result = await load()
    if (!live.current || id !== loadId.current) return
    setLoaded(result)
    // Clear the selected member when they are no longer in the team.
    setSelectedMember((sel) => (sel !== null && result.team?.has(sel.toLowerCase()) ? sel : null))
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
    setLoaded((prev) => ({ ...prev, status: 'loading' }))
    void runLoad()
  }, [runLoad])

  const { status, entries, team, teamMembers } = loaded
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
      teamChosen: team !== null,
      selectActivity: () => selectActivityPure(entries, selection, period, nowDate, team),
      subline: toolbarSubline(entries, selection, period, nowDate, team),
      contributions: () => contributionsPerPerson(entries, selection, period, nowDate, team),
      teamMembers,
      teamStats: () => teamStatsPure(entries, selection, period, nowDate, teamMembers),
      selectedMember,
      setSelectedMember,
    }),
    // nowDate changes every render; recompute on state changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, entries, team, teamMembers, selection, period, reload, selectedMember],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}
