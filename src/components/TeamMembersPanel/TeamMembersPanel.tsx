import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { GetTeamResult, TeamSaveInput } from '../../api/client'
import { isValidLogin, normalizeLogin } from '../../api/team'
import type { Candidate } from '../../api/team'
import styles from './TeamMembersPanel.module.css'

export interface TeamMembersPanelProps {
  getTeam: () => Promise<GetTeamResult>
  saveTeam: (team: TeamSaveInput) => Promise<{ ok: boolean }>
  /** A save succeeded. */
  onChanged: () => void
}

type LoadState = 'loading' | 'ready' | 'error'

interface Team {
  selected: string[]
  added: string[]
}

const SAVE_ERROR = 'Could not save the selection. Try again.'
const EMPTY_ERROR = 'Enter a GitHub login'
const MALFORMED_ERROR =
  'Not a valid GitHub login. Use letters, numbers and single hyphens, up to 39 characters.'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function details(c: Candidate | undefined): string {
  if (!c || c.pullRequests + c.reviews === 0) return 'No activity yet'
  return [plural(c.pullRequests, 'pull request', 'pull requests'), plural(c.reviews, 'review', 'reviews'), ...c.repos].join(', ')
}

export default function TeamMembersPanel({ getTeam, saveTeam, onChanged }: TeamMembersPanelProps) {
  const id = useId()
  const [load, setLoad] = useState<LoadState>('loading')
  const [cands, setCands] = useState<Candidate[]>([])
  const [team, setTeam] = useState<Team>({ selected: [], added: [] })
  const [saveError, setSaveError] = useState(false)
  const [value, setValue] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [result, setResult] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const live = useRef(true)
  const teamRef = useRef<Team>(team)

  // Callers may pass inline functions; keep the latest without refetching on every render.
  const latest = useRef({ getTeam, saveTeam, onChanged })
  useEffect(() => {
    latest.current = { getTeam, saveTeam, onChanged }
  })

  const commit = (next: Team) => {
    teamRef.current = next
    setTeam(next)
  }

  /** Applies `next` at once, saves it, and rolls back to the previous team on failure. */
  const persist = useCallback(async (next: Team, prev: Team): Promise<boolean> => {
    commit(next)
    setSaveError(false)
    const res = await latest.current.saveTeam(next)
    if (!live.current) return res.ok
    if (res.ok) {
      latest.current.onChanged()
    } else {
      commit(prev)
      setSaveError(true)
    }
    return res.ok
  }, [])

  const fetchTeam = useCallback(async () => {
    const res = await latest.current.getTeam()
    if (!live.current) return
    if (!res.ok) {
      setLoad('error')
      return
    }
    setCands(res.candidates)
    const firstSetup = res.selected === null
    const selected = res.selected ?? res.candidates.map((c) => c.login)
    commit({ selected, added: res.added })
    setLoad('ready')
    if (firstSetup && res.candidates.length > 0) {
      // Opening the tab is enough to choose everyone; save once so setup is complete.
      const saved = await latest.current.saveTeam({ selected, added: res.added })
      if (!live.current) return
      if (saved.ok) latest.current.onChanged()
      else setSaveError(true)
    }
  }, [])

  useEffect(() => {
    live.current = true
    void fetchTeam()
    return () => {
      live.current = false
    }
  }, [fetchTeam])

  const byKey = new Map(cands.map((c) => [c.login.toLowerCase(), c]))
  const logins: string[] = []
  const seen = new Set<string>()
  for (const l of [...cands.map((c) => c.login), ...team.added, ...team.selected]) {
    const k = l.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    logins.push(l)
  }
  const selectedKeys = new Set(team.selected.map((l) => l.toLowerCase()))
  const selectedCount = logins.filter((l) => selectedKeys.has(l.toLowerCase())).length

  const toggle = (login: string) => {
    const prev = teamRef.current
    const k = login.toLowerCase()
    const on = prev.selected.some((l) => l.toLowerCase() === k)
    const selected = on ? prev.selected.filter((l) => l.toLowerCase() !== k) : [...prev.selected, login]
    void persist({ ...prev, selected }, prev)
  }

  const setAll = (all: boolean) => {
    const prev = teamRef.current
    void persist({ ...prev, selected: all ? [...logins] : [] }, prev)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setResult('')
    const login = normalizeLogin(value)
    if (login === '') {
      setFieldError(EMPTY_ERROR)
      return
    }
    if (!isValidLogin(login)) {
      setFieldError(MALFORMED_ERROR)
      return
    }
    setFieldError(null)
    const prev = teamRef.current
    const k = login.toLowerCase()
    const existing = logins.find((l) => l.toLowerCase() === k)
    if (existing) {
      setValue('')
      setResult(`${existing} is already in the list.`)
      if (!selectedKeys.has(k)) await persist({ ...prev, selected: [...prev.selected, existing] }, prev)
      inputRef.current?.focus()
      return
    }
    setValue('')
    const ok = await persist({ selected: [...prev.selected, login], added: [...prev.added, login] }, prev)
    if (ok) setResult(`Added ${login}.`)
    else setValue(value)
    inputRef.current?.focus()
  }

  if (load === 'loading') return <p role="status">Loading team members...</p>
  if (load === 'error') {
    return (
      <div>
        <p role="alert">Could not load team members. Check that the local server is running, then try again.</p>
        <button
          type="button"
          className={styles.button}
          onClick={() => {
            setLoad('loading')
            void fetchTeam()
          }}
        >
          Retry
        </button>
      </div>
    )
  }
  if (cands.length === 0) {
    return <p role="status">No team members to choose from yet. Sync a repository first, then come back here.</p>
  }

  const inputId = `${id}-input`
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div>
      <div className={styles.summary}>
        <p role="status" className={styles.count}>
          {selectedCount} of {logins.length} selected
        </p>
        <button type="button" className={styles.button} aria-label="Select all team members" onClick={() => setAll(true)}>
          Select all
        </button>
        <button type="button" className={styles.button} aria-label="Clear team selection" onClick={() => setAll(false)}>
          Clear
        </button>
      </div>
      <ul className={styles.list} aria-label="Team members">
        {logins.map((login, i) => {
          const detailId = `${id}-d${i}`
          return (
            <li key={login.toLowerCase()} className={styles.row}>
              <input
                id={`${id}-c${i}`}
                type="checkbox"
                className={styles.checkbox}
                checked={selectedKeys.has(login.toLowerCase())}
                onChange={() => toggle(login)}
                aria-describedby={detailId}
              />
              <label htmlFor={`${id}-c${i}`} className={styles.login}>
                {login}
              </label>
              <span id={detailId} className={styles.details}>
                {details(byKey.get(login.toLowerCase()))}
              </span>
            </li>
          )
        })}
      </ul>
      {saveError && (
        <p role="alert" className={styles.error}>
          {SAVE_ERROR}
        </p>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <label htmlFor={inputId} className={styles.label}>
          GitHub login
        </label>
        <div className={styles.formRow}>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className={styles.input}
            placeholder="login"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
          />
          <button type="submit" className={styles.add}>
            Add
          </button>
        </div>
        <p id={hintId} className={styles.hint}>
          Add someone with no activity yet. Letters, numbers and hyphens only.
        </p>
        {fieldError && (
          <p id={errorId} role="alert" className={styles.error}>
            {fieldError}
          </p>
        )}
        <p role="status" className={styles.hint}>
          {result}
        </p>
      </form>
    </div>
  )
}
