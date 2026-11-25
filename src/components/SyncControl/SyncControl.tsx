import type { Ref } from 'react'
import type { SyncRunState } from '../../api/client'
import { useDashboard } from '../DashboardProvider'
import Skeleton from '../Skeleton'
import styles from './SyncControl.module.css'

function progressText(run: SyncRunState): string {
  if (!run.current || run.index < 1) return 'Starting sync…'
  return `Syncing ${run.current}, ${run.index} of ${run.total}`
}

interface SyncControlProps {
  /** Ref to the Sync button, used as the focus target after dismissing the result. */
  syncRef?: Ref<HTMLButtonElement>
}

// Rendered into the Header's actions slot: the button and, while running, the progress line.
// The progress line takes a full row of the wrapping controls, so it sits below them.
export default function SyncControl({ syncRef }: SyncControlProps) {
  const { status, entries, syncState, syncRunning, startSync } = useDashboard()

  if (status === 'loading') {
    return <Skeleton shape="block" width={104} height={44} />
  }
  // No linked repos or a load error: Sync is not rendered.
  if (status !== 'ready' || entries.length === 0) return null

  return (
    <>
      <button
        ref={syncRef}
        type="button"
        className={styles.sync}
        aria-disabled={syncRunning}
        onClick={() => {
          if (!syncRunning) startSync()
        }}
      >
        {syncRunning ? 'Syncing…' : 'Sync now'}
      </button>
      {syncState?.status === 'running' && (
        <p className={styles.progress} role="status">
          {progressText(syncState.run)}
        </p>
      )}
    </>
  )
}
