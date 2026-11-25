import type { RefObject } from 'react'
import type { StartSyncError } from '../../api/client'
import { useDashboard } from '../DashboardProvider'
import styles from './SyncAlert.module.css'

// Fixed reasons keyed by the server's code; raw server or GitHub text is never shown.
const REASONS: Record<string, string> = {
  unauthorized: 'GitHub rejected the token. Update GITHUB_TOKEN and restart.',
  not_found: 'not found, or the token has no access.',
  forbidden: 'access denied. Grant the token read access to Pull requests and Metadata.',
  rate_limited: 'GitHub rate limit reached. Wait a few minutes, then sync again.',
  network: 'could not reach GitHub. Check your connection.',
  bad_response: 'unexpected response from GitHub. Try again later.',
  write_failed: 'could not write the local data file.',
}
const reasonFor = (code?: string) => (code && REASONS[code]) || REASONS.bad_response

const ERROR_TEXT: Record<StartSyncError, string> = {
  missing_token:
    'No GitHub token configured. Copy .env.example to .env, set GITHUB_TOKEN, ' +
    'see the README "GitHub token" section, then restart.',
  request_failed:
    'Could not start the sync. Check that the local server is running, then try again.',
  already_running: 'A sync is already running.',
  no_repos: 'No repositories are linked. Add repositories in Settings.',
  config_invalid: 'The local configuration could not be read. Check the data folder, then try again.',
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

type Props = {
  /** Focus goes here after Dismiss. */
  syncRef: RefObject<HTMLElement | null>
  /** Fallback when Sync now is not rendered. */
  settingsRef: RefObject<HTMLElement | null>
}

export default function SyncAlert({ syncRef, settingsRef }: Props) {
  const { syncState, dismissSync } = useDashboard()

  if (!syncState || syncState.status === 'running') return null

  const onDismiss = () => {
    dismissSync()
    ;(syncRef.current ?? settingsRef.current)?.focus()
  }

  const dismiss = (
    <button type="button" className={styles.dismiss} aria-label="Dismiss sync result" onClick={onDismiss}>
      Dismiss
    </button>
  )

  if (syncState.status === 'error') {
    return (
      <div className={styles.strip} data-tone="bad" role="alert">
        <div className={styles.message}>
          <p className={styles.line}>{ERROR_TEXT[syncState.error]}</p>
        </div>
        {dismiss}
      </div>
    )
  }

  const { results, total } = syncState.run
  const failed = results.filter((r) => !r.ok)
  const okCount = results.length - failed.length

  if (failed.length === 0) {
    return (
      <div className={styles.strip} data-tone="good" role="status">
        <div className={styles.message}>
          <p className={styles.summary}>
            {`Synced ${okCount} ${plural(okCount, 'repository', 'repositories')}.`}
          </p>
        </div>
        {dismiss}
      </div>
    )
  }

  const of = Math.max(total, results.length)
  const summary =
    okCount === 0
      ? of === 1
        ? `Could not sync ${failed[0].repo}.`
        : 'Could not sync any repository.'
      : `Synced ${okCount} of ${of} repositories. ${failed.length} failed:`
  return (
    <div className={styles.strip} data-tone={okCount === 0 ? 'bad' : 'caution'} role="alert">
      <div className={styles.message}>
        <p className={styles.summary}>{summary}</p>
        <ul className={styles.failures}>
          {failed.map((r) => (
            <li key={r.repo}>{`${r.repo}: ${reasonFor(r.code)}`}</li>
          ))}
        </ul>
        <p className={styles.line}>Previously stored data is kept.</p>
      </div>
      {dismiss}
    </div>
  )
}
