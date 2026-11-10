import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { syncText } from '../../api/dashboard'
import type { RemoveRepoResult, SyncResult } from '../../api/client'
import type { LinkedRepo } from '../../api/types'
import styles from './RepoRow.module.css'

interface RepoRowProps {
  repo: LinkedRepo
  now: Date
  syncRepo: (repo: string) => Promise<SyncResult>
  removeRepo: (repo: string) => Promise<RemoveRepoResult>
  /** A sync succeeded; the parent refetches the list. */
  onSynced: () => void
  /** The repo was unlinked; the parent drops the row. */
  onRemoved: (repo: string) => void
}

function peopleText(n: number): string {
  return n === 1 ? '1 person' : `${n} people`
}

function rowDetails(repo: LinkedRepo, now: Date): string {
  if (repo.syncedAt === null) return 'Not synced yet'
  const parts: string[] = []
  if (repo.baseBranch !== null) parts.push(`Base branch ${repo.baseBranch}`)
  if (repo.people !== null) parts.push(peopleText(repo.people))
  parts.push(syncText([{ repo: repo.repo, syncedAt: repo.syncedAt, data: null }], repo.repo, now))
  return parts.join(' · ')
}

type Mode = 'idle' | 'confirm' | 'removing'

export default function RepoRow({ repo, now, syncRepo, removeRepo, onSynced, onRemoved }: RepoRowProps) {
  const name = repo.repo
  const [mode, setMode] = useState<Mode>('idle')
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const removeRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)

  useEffect(() => {
    if (mode === 'confirm') cancelRef.current?.focus()
    else if (mode === 'idle' && restoreFocus.current) {
      restoreFocus.current = false
      removeRef.current?.focus()
    }
  }, [mode])

  const sync = async () => {
    if (syncing || mode !== 'idle') return
    setSyncing(true)
    setMessage('')
    const res = await syncRepo(name)
    setSyncing(false)
    if (res.ok) {
      setMessage(`Synced just now. ${res.people === 1 ? '1 person' : `${res.people} people`} found.`)
      onSynced()
    } else {
      setMessage('Sync failed. Try again.')
    }
  }

  const confirmRemove = async () => {
    setMode('removing')
    setMessage('')
    const res = await removeRepo(name)
    if (res.ok) {
      onRemoved(name)
    } else {
      restoreFocus.current = true
      setMode('idle')
      setMessage(`Could not remove ${name}. Try again.`)
    }
  }

  const cancel = () => {
    restoreFocus.current = true
    setMode('idle')
  }

  const onConfirmKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && mode === 'confirm') {
      // Cancel the confirm first; the modal must stay open.
      e.stopPropagation()
      cancel()
    }
  }

  return (
    <li className={styles.row}>
      <span className={styles.name}>{name}</span>
      {mode === 'idle' ? (
        <>
          <span className={styles.details}>{rowDetails(repo, now)}</span>
          <span className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              aria-label={`Sync ${name}`}
              aria-disabled={syncing}
              onClick={sync}
            >
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
            <button
              ref={removeRef}
              type="button"
              className={styles.button}
              data-remove=""
              aria-label={`Remove ${name}`}
              aria-disabled={syncing}
              onClick={() => {
                if (!syncing) setMode('confirm')
              }}
            >
              Remove
            </button>
          </span>
        </>
      ) : (
        <div className={styles.confirm} onKeyDown={onConfirmKeyDown}>
          <p className={styles.confirmText}>
            {`Stop reading ${name}? This only stops this app from reading it and deletes its local data. Nothing is deleted on GitHub.`}
          </p>
          <span className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              aria-disabled={mode === 'removing'}
              onClick={() => {
                if (mode === 'confirm') void confirmRemove()
              }}
            >
              {mode === 'removing' ? 'Removing…' : 'Remove repository'}
            </button>
            <button
              ref={cancelRef}
              type="button"
              className={styles.button}
              aria-disabled={mode === 'removing'}
              onClick={() => {
                if (mode === 'confirm') cancel()
              }}
            >
              Cancel
            </button>
          </span>
        </div>
      )}
      <span role="status" className={styles.message}>
        {message}
      </span>
    </li>
  )
}
