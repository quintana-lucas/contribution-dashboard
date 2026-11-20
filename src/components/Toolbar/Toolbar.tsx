import { useRef } from 'react'
import type { StartSyncError, SyncRunState } from '../../api/client'
import type { Period } from '../../api/dashboard'
import { useDashboard } from '../DashboardProvider'
import Skeleton from '../Skeleton'
import styles from './Toolbar.module.css'

const PERIODS: Period[] = [7, 30, 90]

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

function progressText(run: SyncRunState): string {
  if (!run.current || run.index < 1) return 'Starting sync…'
  return `Syncing ${run.current}, ${run.index} of ${run.total}`
}

export default function Toolbar() {
  const {
    status,
    entries,
    selection,
    setSelection,
    period,
    setPeriod,
    subline,
    syncState,
    syncRunning,
    startSync,
    dismissSync,
  } = useDashboard()
  const syncButtonRef = useRef<HTMLButtonElement>(null)

  const onDismiss = () => {
    dismissSync()
    syncButtonRef.current?.focus()
  }

  const renderResult = () => {
    if (!syncState || syncState.status === 'running') return null
    const dismiss = (
      <button type="button" className={styles.dismiss} aria-label="Dismiss sync result" onClick={onDismiss}>
        Dismiss
      </button>
    )
    if (syncState.status === 'error') {
      return (
        <div className={styles.result} role="alert">
          <p className={styles.resultLine}>{ERROR_TEXT[syncState.error]}</p>
          {dismiss}
        </div>
      )
    }
    const { results, total } = syncState.run
    const failed = results.filter((r) => !r.ok)
    const okCount = results.length - failed.length
    if (failed.length === 0) {
      return (
        <div className={styles.result} role="status">
          <p className={styles.resultLine}>
            {`Synced ${okCount} ${plural(okCount, 'repository', 'repositories')}.`}
          </p>
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
      <div className={styles.result} role="alert">
        <p className={styles.summary}>{summary}</p>
        <ul className={styles.failures}>
          {failed.map((r) => (
            <li key={r.repo}>{`${r.repo}: ${reasonFor(r.code)}`}</li>
          ))}
        </ul>
        <p className={styles.resultLine}>Previously stored data is kept.</p>
        {dismiss}
      </div>
    )
  }

  // No linked repos: the toolbar is hidden, not disabled (AC4).
  if (status === 'ready' && entries.length === 0) return null

  if (status === 'loading') {
    // Placeholders match the loaded controls' sizes so nothing shifts on arrival.
    return (
      <div className={styles.toolbar} role="group" aria-label="Dashboard filters" aria-busy="true">
        <div className={styles.controls}>
          <div className={styles.field}>
            <Skeleton width={80} height={20} />
            <Skeleton shape="block" width={220} height={44} />
          </div>
          <div className={styles.field}>
            <Skeleton width={60} height={20} />
            <Skeleton shape="block" width={276} height={44} />
          </div>
          <Skeleton shape="block" className={styles.sync} width={104} height={44} />
        </div>
        <div className={styles.subline}>
          <Skeleton width={320} height={20} />
        </div>
      </div>
    )
  }

  if (status !== 'ready') {
    return (
      <div className={styles.toolbar} role="group" aria-label="Dashboard filters">
        <p className={styles.subline} role="status" data-state={status}>
          Could not load repository data. Check that the local server is running, then reload the page.
        </p>
      </div>
    )
  }

  return (
    <div className={styles.toolbar} role="group" aria-label="Dashboard filters">
      <div className={styles.controls}>
        <div className={styles.field}>
          <label htmlFor="toolbar-repo" className={styles.label}>
            Repository
          </label>
          <select
            id="toolbar-repo"
            className={styles.select}
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
          >
            <option value="all">All repositories</option>
            {entries.map((e) => (
              <option key={e.repo} value={e.repo}>
                {e.repo}
              </option>
            ))}
          </select>
        </div>
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Period</legend>
          <div className={styles.segments}>
            {PERIODS.map((p) => (
              <label key={p} className={styles.segment}>
                <input
                  type="radio"
                  name="toolbar-period"
                  className={styles.radio}
                  value={p}
                  checked={period === p}
                  onChange={() => setPeriod(p)}
                />
                {p} days
              </label>
            ))}
          </div>
        </fieldset>
        <button
          ref={syncButtonRef}
          type="button"
          className={styles.sync}
          aria-disabled={syncRunning}
          onClick={() => {
            if (!syncRunning) startSync()
          }}
        >
          {syncRunning ? 'Syncing…' : 'Sync now'}
        </button>
      </div>
      <p className={styles.subline} role="status">
        {subline}
      </p>
      {syncState?.status === 'running' && (
        <p className={styles.subline} role="status">
          {progressText(syncState.run)}
        </p>
      )}
      {renderResult()}
    </div>
  )
}
