import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  getRepoData as defaultGetRepoData,
  getTeam as defaultGetTeam,
  listRepos as defaultListRepos,
} from '../../api/client'
import type {
  RepoDataResult,
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
import type { Period, RepoEntry, RepoLoadError, RepoSelection } from '../../api/dashboard'
import type { DamagedRepo, LinkedRepo } from '../../api/types'
import { kpis as kpisPure } from '../../api/kpis'
import { memberDetail as memberDetailPure } from '../../api/memberDetail'
import { prActivity as prActivityPure } from '../../api/prActivity'
import { reviewsPerPerson } from '../../api/reviews'
import { teamStats as teamStatsPure } from '../../api/teamStats'
import { waitingForReview } from '../../api/waiting'
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
  /** Repos the team endpoint reports as damaged (#58). */
  damagedRepos: DamagedRepo[]
}

const FILE_ERROR_KIND: Record<'invalid_json' | 'unreadable', RepoLoadError> = {
  invalid_json: 'corrupt',
  unreadable: 'unreadable',
}

/** One repo's entry. A failure here never rejects: it becomes that entry's own `error`. */
async function loadEntry(linked: LinkedRepo, get: typeof defaultGetRepoData): Promise<RepoEntry> {
  if (linked.fileError) return failedEntry(linked.repo, FILE_ERROR_KIND[linked.fileError])
  if (linked.syncedAt === null) return { repo: linked.repo, syncedAt: null, data: null }
  let result: RepoDataResult
  try {
    result = await get(linked.repo)
  } catch {
    return failedEntry(linked.repo, 'request_failed')
  }
  if (result.ok) return { repo: linked.repo, syncedAt: linked.syncedAt, data: result.data }
  if (result.error === 'not_synced') return { repo: linked.repo, syncedAt: null, data: null }
  if (result.error === 'invalid_json' || result.error === 'unreadable') {
    return failedEntry(linked.repo, FILE_ERROR_KIND[result.error])
  }
  // Add new per-repo error kinds by mapping them here.
  return failedEntry(linked.repo, 'request_failed')
}

function failedEntry(repo: string, error: RepoLoadError): RepoEntry {
  return { repo, syncedAt: null, data: null, error }
}

// No DashboardProvider.module.css: this component renders no DOM of its own.
export default function DashboardProvider({
  children,
  listRepos = defaultListRepos,
  getRepoData = defaultGetRepoData,
  getTeam = defaultGetTeam,
  now = () => new Date(),
}: DashboardDeps & { children: ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading', entries: [], team: null, teamMembers: [], damagedRepos: [] })
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
    const failed: Loaded = { status: 'error', entries: [], team: null, teamMembers: [], damagedRepos: [] }
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
      // All repos load at once; map keeps the original order whatever the arrival order.
      const entries = await Promise.all(res.repos.map((linked) => loadEntry(linked, get)))
      return { status: 'ready', entries, team: teamSet, teamMembers, damagedRepos: teamRes.damagedRepos ?? [] }
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

  const { status, entries, team, teamMembers, damagedRepos } = loaded
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
      subline: toolbarSubline(entries, selection, period, nowDate, team, damagedRepos),
      contributions: () => contributionsPerPerson(entries, selection, period, nowDate, team),
      reviewsGiven: () => reviewsPerPerson(entries, selection, period, nowDate, team),
      waiting: () => waitingForReview(entries, selection, nowDate, team),
      prActivity: () => prActivityPure(entries, selection, period, nowDate, team),
      kpis: () => kpisPure(entries, selection, period, nowDate, team),
      teamMembers,
      teamStats: () => teamStatsPure(entries, selection, period, nowDate, teamMembers),
      memberDetail: () =>
        selectedMember === null ? null : memberDetailPure(entries, selection, period, nowDate, selectedMember),
      selectedMember,
      setSelectedMember,
    }),
    // nowDate changes every render; recompute on state changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status, entries, team, teamMembers, damagedRepos, selection, period, reload, selectedMember],
  )

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}
