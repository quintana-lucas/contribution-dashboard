import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AddRepoResult,
  ListReposResult,
  RemoveRepoResult,
  SyncResult,
  TokenStatusResult,
} from '../../api/client'
import type { LinkedRepo } from '../../api/types'
import AddRepoForm from '../AddRepoForm'
import RepoRow from '../RepoRow'
import styles from './RepositoriesPanel.module.css'

export interface RepositoriesPanelProps {
  listRepos: () => Promise<ListReposResult>
  addRepo: (input: string) => Promise<AddRepoResult>
  removeRepo: (repo: string) => Promise<RemoveRepoResult>
  syncRepo: (repo: string) => Promise<SyncResult>
  getTokenStatus: () => Promise<TokenStatusResult>
  now: () => Date
  /** An add, remove or sync succeeded. */
  onChanged: () => void
}

type LoadState = 'loading' | 'ready' | 'error'
type TokenState = 'checking' | 'yes' | 'no' | 'error'

const TOKEN_TEXT: Record<TokenState, string> = {
  checking: 'Checking token…',
  yes: 'Token configured.',
  no: 'No token configured. Set GITHUB_TOKEN in .env and restart the server.',
  error: 'Could not check the token status.',
}

export default function RepositoriesPanel({
  listRepos,
  addRepo,
  removeRepo,
  syncRepo,
  getTokenStatus,
  now,
  onChanged,
}: RepositoriesPanelProps) {
  const [repos, setRepos] = useState<LinkedRepo[]>([])
  const [load, setLoad] = useState<LoadState>('loading')
  const [token, setToken] = useState<TokenState>('checking')
  const [removed, setRemoved] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)
  // Where focus goes once the removed row is gone: a repo name, or null for the field.
  const pendingFocus = useRef<{ repo: string | null } | null>(null)

  // Callers may pass inline functions; keep the latest without refetching on every render.
  const latest = useRef({ listRepos, getTokenStatus })
  useEffect(() => {
    latest.current = { listRepos, getTokenStatus }
  })
  const live = useRef(true)

  // Only the latest list request may apply its response.
  const requestId = useRef(0)

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    const res = await latest.current.listRepos()
    if (!live.current || id !== requestId.current) return
    if (res.ok) {
      setRepos(res.repos)
      setLoad('ready')
    } else {
      setLoad('error')
    }
  }, [])

  useEffect(() => {
    live.current = true
    void refresh()
    void latest.current.getTokenStatus().then((res) => {
      if (!live.current) return
      setToken(!res.ok ? 'error' : res.configured ? 'yes' : 'no')
    })
    return () => {
      live.current = false
    }
  }, [refresh])

  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return
    pendingFocus.current = null
    if (target.repo !== null) {
      const buttons = rootRef.current?.querySelectorAll<HTMLButtonElement>('button[data-remove]')
      const hit = Array.from(buttons ?? []).find(
        (b) => b.getAttribute('aria-label') === `Remove ${target.repo}`,
      )
      if (hit) {
        hit.focus()
        return
      }
    }
    fieldRef.current?.focus()
  }, [repos])

  const handleRemoved = (repo: string) => {
    const i = repos.findIndex((r) => r.repo === repo)
    pendingFocus.current = { repo: i >= 0 ? (repos[i + 1]?.repo ?? null) : null }
    // Drop any in-flight list response: it may still contain the removed repo.
    requestId.current++
    setLoad('ready')
    setRepos((list) => list.filter((r) => r.repo !== repo))
    setRemoved(`Removed ${repo}.`)
    onChanged()
  }

  const handleAdded = () => {
    setRemoved('')
    onChanged()
    void refresh()
  }

  const handleSynced = () => {
    onChanged()
    void refresh()
  }

  const date = now()

  return (
    <div ref={rootRef}>
      <p role="status" className={styles.token}>
        {TOKEN_TEXT[token]}
      </p>
      <p className={styles.token}>This app only reads from GitHub.</p>
      <AddRepoForm ref={fieldRef} addRepo={addRepo} onAdded={handleAdded} />
      <h3 className={styles.heading}>Linked repositories</h3>
      {load === 'loading' && <p role="status">Loading repositories…</p>}
      {load === 'error' && (
        <div>
          <p role="alert">
            Could not load repositories. Check that the local server is running, then reopen Settings.
          </p>
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              setLoad('loading')
              void refresh()
            }}
          >
            Retry
          </button>
        </div>
      )}
      {load === 'ready' && repos.length === 0 && <p role="status">No repositories linked yet.</p>}
      {load === 'ready' && repos.length > 0 && (
        <ul className={styles.list}>
          {repos.map((repo) => (
            <RepoRow
              key={repo.repo}
              repo={repo}
              now={date}
              syncRepo={syncRepo}
              removeRepo={removeRepo}
              onSynced={handleSynced}
              onRemoved={handleRemoved}
            />
          ))}
        </ul>
      )}
      <p role="status" className={styles.removed}>
        {removed}
      </p>
    </div>
  )
}
